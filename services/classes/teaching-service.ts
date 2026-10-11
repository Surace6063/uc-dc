import "server-only"

import { classTeacherSchema, subjectTeacherSchema } from "@/features/classes/schemas"
import { assignmentSchema } from "@/features/teachers/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { prisma } from "@/lib/prisma"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"
import { findActiveOffering } from "@/services/subjects/offering-service"
import {
  addAssignment,
  assertCanManageAssignments,
  createAssignmentInTx,
  translateAssignmentConflict,
} from "@/services/teachers/assignment-service"

// Class teachers and subject teachers for a class or section, recorded as
// ordinary teaching assignments (year-scoped, with start and end dates), so
// the teacher's own profile shows the same history.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

function fieldError(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

// Makes a teacher the class teacher of a class/section for a year. An
// existing class teacher's assignment is ended the day the new one starts,
// so the history of who looked after the class is kept.
export async function setClassTeacher(ctx: Ctx, raw: unknown) {
  const input = classTeacherSchema.parse(raw)
  const organizationId = ctx.organization.id

  return prisma
    .$transaction(async (tx) => {
      const academicClass = await tx.academicClass.findFirst({
        where: { id: input.classId, organizationId },
        select: { id: true, name: true },
      })
      if (!academicClass) throw new NotFoundError("Class not found.")
      const teacher = await tx.teacher.findFirst({
        where: { id: input.teacherId, organizationId },
        select: { id: true, firstName: true, lastName: true, departmentId: true, employmentStatus: true, archivedAt: true },
      })
      if (!teacher) fieldError("teacherId", "Choose a valid teacher.")
      await assertCanManageAssignments(tx, ctx, teacher)

      const current = await tx.teacherAssignment.findFirst({
        where: {
          organizationId,
          academicYearId: input.academicYearId,
          classId: academicClass.id,
          sectionId: input.sectionId,
          role: "CLASS_TEACHER",
          status: "ACTIVE",
        },
        select: { id: true, teacherId: true, startDate: true, teacher: { select: { departmentId: true } } },
      })
      if (current?.teacherId === teacher.id) fieldError("teacherId", "This teacher is already the class teacher.")
      if (current) {
        await assertCanManageAssignments(tx, ctx, current.teacher)
        if (input.startDate < current.startDate.toISOString().slice(0, 10)) {
          fieldError("startDate", "The new class teacher can't start before the current one did.")
        }
        await tx.teacherAssignment.update({
          where: { id: current.id },
          data: { status: "ENDED", endDate: toDate(input.startDate), endReason: "Replaced as class teacher" },
        })
      }

      const assignment = await createAssignmentInTx(
        tx,
        ctx,
        teacher,
        assignmentSchema.parse({
          academicYearId: input.academicYearId,
          classId: academicClass.id,
          sectionId: input.sectionId,
          role: "CLASS_TEACHER",
          startDate: input.startDate,
        })
      )
      const where = `${academicClass.name}${assignment.section ? ` ${assignment.section.name}` : ""}`
      await audit(tx, ctx, [
        {
          action: "assignment.create", entityType: "teacher", entityId: teacher.id,
          summary: `Made class teacher of ${where}`, metadata: { assignmentId: assignment.id },
        },
        ...(current
          ? [{
              action: "assignment.end", entityType: "teacher", entityId: current.teacherId,
              summary: `Replaced as class teacher of ${where}`, metadata: { assignmentId: current.id },
            }]
          : []),
      ])
      return { id: assignment.id }
    })
    .catch((error) => translateAssignmentConflict(error, ""))
}

// A subject teacher for a class (all sections) or one section, for a subject
// offered to the class that year. Validation of the class, section, subject
// and teacher is the teacher module's.
export async function addSubjectTeacher(ctx: Ctx, raw: unknown) {
  const input = subjectTeacherSchema.parse(raw)
  // Only subjects the class studies that year, in the sections that take them.
  const offering = await findActiveOffering(prisma, ctx.organization.id, {
    academicYearId: input.academicYearId,
    classId: input.classId,
    subjectId: input.subjectId,
  })
  if (!offering) fieldError("subjectId", "This class doesn't study this subject this year. Add it under Subjects → Class subjects first.")
  if (input.sectionId && offering.sections.length && !offering.sections.some((s) => s.sectionId === input.sectionId)) {
    fieldError("sectionId", "This subject isn't taught in that section.")
  }
  return addAssignment(ctx, input.teacherId, {
    academicYearId: input.academicYearId,
    classId: input.classId,
    sectionId: input.sectionId,
    subjectId: input.subjectId,
    role: "SUBJECT_TEACHER",
    startDate: input.startDate,
    weeklyPeriods: input.weeklyPeriods,
  })
}
