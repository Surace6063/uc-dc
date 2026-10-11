import "server-only"

import { ASSIGNABLE_STATUSES, assignmentSummary, teacherName } from "@/features/teachers/constants"
import {
  assignmentSchema,
  assignmentUpdateSchema,
  endAssignmentSchema,
} from "@/features/teachers/schemas"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma
type AssignmentValues = ReturnType<typeof assignmentSchema.parse>

function invalid(prefix: string, field: string, message: string): never {
  throw new ValidationError({ [`${prefix}${field}`]: [message] })
}

const CLASS_TEACHER_TAKEN = "This class/section already has an active class teacher this year."

// ---------------------------------------------------------- authorisation

// Full assignment managers can manage anyone in the organisation. Department
// heads (teachers.assignments.manage_department) only teachers in the same
// department as their own linked teacher profile.
export async function assertCanManageAssignments(db: Db, ctx: Ctx, teacher: { departmentId: string | null }) {
  if (hasPermission(ctx, "teachers.assignments.manage")) return
  if (hasPermission(ctx, "teachers.assignments.manage_department")) {
    const own = await db.teacher.findFirst({
      where: { organizationId: ctx.organization.id, userId: ctx.user.id, archivedAt: null },
      select: { departmentId: true },
    })
    if (own?.departmentId && own.departmentId === teacher.departmentId) return
    throw new ForbiddenError("You can only manage assignments for teachers in your own department.")
  }
  throw new ForbiddenError()
}

// ------------------------------------------------------------- validation

// Resolves and checks every reference against the caller's organisation and
// against each other. Level and program are derived from the class (or the
// program) on the server; the client's values are only accepted if they agree.
export async function resolveAssignment(tx: Db, ctx: Ctx, input: AssignmentValues, prefix = "") {
  const organizationId = ctx.organization.id
  const year = await tx.academicYear.findFirst({ where: { id: input.academicYearId, organizationId } })
  if (!year) invalid(prefix, "academicYearId", "Choose a valid academic year.")
  if (year.status === "ARCHIVED") invalid(prefix, "academicYearId", "This academic year is archived.")

  let levelId = input.educationLevelId
  let programId = input.programId

  if (input.classId) {
    const academicClass = await tx.academicClass.findFirst({ where: { id: input.classId, organizationId } })
    if (!academicClass) invalid(prefix, "classId", "Choose a valid class.")
    if (!academicClass.isActive) invalid(prefix, "classId", "This class is inactive.")
    if (levelId && levelId !== academicClass.educationLevelId) {
      invalid(prefix, "classId", "This class doesn't belong to the selected level.")
    }
    if (programId && programId !== academicClass.programId) {
      invalid(prefix, "classId", "This class doesn't belong to the selected program.")
    }
    levelId = academicClass.educationLevelId
    programId = academicClass.programId
  } else if (programId) {
    const program = await tx.program.findFirst({ where: { id: programId, organizationId } })
    if (!program) invalid(prefix, "programId", "Choose a valid program.")
    if (levelId && levelId !== program.educationLevelId) {
      invalid(prefix, "programId", "This program belongs to a different level.")
    }
    levelId = program.educationLevelId
  } else if (levelId) {
    const level = await tx.educationLevel.findFirst({ where: { id: levelId, organizationId } })
    if (!level) invalid(prefix, "educationLevelId", "Choose a valid education level.")
  }

  if (input.sectionId) {
    const section = await tx.section.findFirst({
      where: { id: input.sectionId, organizationId, classId: input.classId ?? undefined },
    })
    if (!section || !input.classId) invalid(prefix, "sectionId", "Choose a section of the selected class.")
  }

  if (input.subjectId) {
    const subject = await tx.subject.findFirst({ where: { id: input.subjectId, organizationId } })
    if (!subject) invalid(prefix, "subjectId", "Choose a valid subject.")
    if (!subject.isActive) invalid(prefix, "subjectId", "This subject is inactive.")
    if (subject.educationLevelId && levelId && subject.educationLevelId !== levelId) {
      invalid(prefix, "subjectId", "This subject belongs to a different level.")
    }
    if (subject.programId && programId && subject.programId !== programId) {
      invalid(prefix, "subjectId", "This subject belongs to a different program.")
    }
    // A subject specific to a level/program places the assignment there.
    levelId ??= subject.educationLevelId
    programId ??= subject.programId
  }

  if (input.batchId) {
    const batch = await tx.batch.findFirst({ where: { id: input.batchId, organizationId } })
    if (!batch) invalid(prefix, "batchId", "Choose a valid batch.")
    if (batch.programId && programId && batch.programId !== programId) {
      invalid(prefix, "batchId", "This batch belongs to a different program.")
    }
  }

  return {
    academicYearId: year.id,
    educationLevelId: levelId,
    programId,
    classId: input.classId,
    sectionId: input.sectionId,
    subjectId: input.subjectId,
    batchId: input.batchId,
  }
}

// Creates one assignment inside the caller's transaction.
export async function createAssignmentInTx(
  tx: TransactionClient,
  ctx: Ctx,
  teacher: { id: string; employmentStatus: string; archivedAt: Date | null },
  input: AssignmentValues,
  prefix = ""
) {
  if (teacher.archivedAt) throw new ConflictError("Restore this teacher before assigning classes.")
  if (!(ASSIGNABLE_STATUSES as readonly string[]).includes(teacher.employmentStatus)) {
    throw new ConflictError("Only active or on-leave teachers can receive new assignments.")
  }
  const placement = await resolveAssignment(tx, ctx, input, prefix)

  // Serialise per teacher so two identical requests can't both pass the check.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`assign:${teacher.id}`}, 0))`
  const duplicate = await tx.teacherAssignment.findFirst({
    where: { organizationId: ctx.organization.id, teacherId: teacher.id, status: "ACTIVE", role: input.role, ...placement },
    select: { id: true },
  })
  if (duplicate) invalid(prefix, "classId", "This teacher already has this exact assignment.")

  return tx.teacherAssignment.create({
    data: {
      ...placement,
      organizationId: ctx.organization.id,
      teacherId: teacher.id,
      role: input.role,
      startDate: toDate(input.startDate),
      weeklyPeriods: input.weeklyPeriods,
      notes: input.notes,
      assignedById: ctx.user.id,
    },
    include: {
      class: { select: { name: true } },
      section: { select: { name: true } },
      program: { select: { code: true } },
      subject: { select: { name: true } },
      educationLevel: { select: { name: true } },
    },
  })
}

export function translateAssignmentConflict(error: unknown, prefix = ""): never {
  if (isUniqueViolation(error, "teacher_assignments_class_teacher")) invalid(prefix, "classId", CLASS_TEACHER_TAKEN)
  throw error
}

async function findTeacher(db: Db, ctx: Ctx, teacherId: string) {
  const teacher = await db.teacher.findFirst({
    where: { id: teacherId, organizationId: ctx.organization.id },
    select: { id: true, firstName: true, lastName: true, departmentId: true, employmentStatus: true, archivedAt: true },
  })
  if (!teacher) throw new NotFoundError("Teacher not found.")
  return teacher
}

async function findAssignment(db: Db, ctx: Ctx, assignmentId: string) {
  const assignment = await db.teacherAssignment.findFirst({
    where: { id: assignmentId, organizationId: ctx.organization.id },
    include: {
      teacher: { select: { id: true, firstName: true, lastName: true, departmentId: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
      program: { select: { code: true } },
      subject: { select: { name: true } },
      educationLevel: { select: { name: true } },
    },
  })
  if (!assignment) throw new NotFoundError("Assignment not found.")
  return assignment
}

// ---------------------------------------------------------------- actions

export async function addAssignment(ctx: Ctx, teacherId: string, raw: unknown) {
  const input = assignmentSchema.parse(raw)
  return prisma
    .$transaction(async (tx) => {
      const teacher = await findTeacher(tx, ctx, teacherId)
      await assertCanManageAssignments(tx, ctx, teacher)
      const assignment = await createAssignmentInTx(tx, ctx, teacher, input)
      await audit(tx, ctx, {
        action: "assignment.create", entityType: "teacher", entityId: teacher.id,
        summary: `Assigned ${assignmentSummary(assignment)}`, metadata: { assignmentId: assignment.id },
      })
      return { id: assignment.id }
    })
    .catch((error) => translateAssignmentConflict(error))
}

// Role, dates, periods and notes only: what is taught never changes in place.
export async function updateAssignment(ctx: Ctx, assignmentId: string, raw: unknown) {
  const input = assignmentUpdateSchema.parse(raw)
  return prisma
    .$transaction(async (tx) => {
      const assignment = await findAssignment(tx, ctx, assignmentId)
      await assertCanManageAssignments(tx, ctx, assignment.teacher)
      if (assignment.status !== "ACTIVE") throw new ConflictError("Only active assignments can be edited.")
      if (input.role === "CLASS_TEACHER" && !assignment.classId) {
        invalid("", "role", "A class teacher needs a class.")
      }
      await tx.teacherAssignment.update({
        where: { id: assignment.id },
        data: { role: input.role, startDate: toDate(input.startDate), weeklyPeriods: input.weeklyPeriods, notes: input.notes },
      })
      await audit(tx, ctx, {
        action: "assignment.update", entityType: "teacher", entityId: assignment.teacherId,
        summary: `Updated assignment ${assignmentSummary(assignment)}`,
        metadata: { assignmentId, before: { role: assignment.role, weeklyPeriods: assignment.weeklyPeriods }, after: input },
      })
    })
    .catch((error) => translateAssignmentConflict(error))
}

// Ends (completed teaching) or cancels (created by mistake) an assignment.
export async function endAssignment(ctx: Ctx, assignmentId: string, raw: unknown, cancel = false) {
  const input = endAssignmentSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const assignment = await findAssignment(tx, ctx, assignmentId)
    await assertCanManageAssignments(tx, ctx, assignment.teacher)
    if (assignment.status !== "ACTIVE") throw new ConflictError("This assignment has already ended.")
    if (input.endDate < assignment.startDate.toISOString().slice(0, 10)) {
      invalid("", "endDate", "The end date can't be before the start date.")
    }
    await tx.teacherAssignment.update({
      where: { id: assignment.id },
      data: { status: cancel ? "CANCELLED" : "ENDED", endDate: toDate(input.endDate), endReason: input.endReason },
    })
    await audit(tx, ctx, {
      action: cancel ? "assignment.cancel" : "assignment.end", entityType: "teacher", entityId: assignment.teacherId,
      summary: `${cancel ? "Cancelled" : "Ended"} assignment ${assignmentSummary(assignment)} for ${teacherName(assignment.teacher)}`,
      metadata: { assignmentId, reason: input.endReason },
    })
  })
}

// Ends every active assignment of a teacher (leaving, archiving).
export async function endAllAssignments(tx: TransactionClient, ctx: Ctx, teacherId: string, endDate: Date, reason: string) {
  const { count } = await tx.teacherAssignment.updateMany({
    where: { organizationId: ctx.organization.id, teacherId, status: "ACTIVE" },
    data: { status: "ENDED", endDate, endReason: reason },
  })
  return count
}
