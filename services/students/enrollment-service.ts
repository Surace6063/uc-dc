import "server-only"

import {
  canTransitionEnrollment,
  ENROLLMENT_STATUS_LABELS,
  OPEN_ENROLLMENT_STATUSES,
} from "@/features/students/constants"
import {
  correctEnrollmentSchema,
  enrollmentSchema,
  enrollmentStatusSchema,
  progressEnrollmentSchema,
} from "@/features/students/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { EnrollmentType } from "@/lib/generated/prisma/enums"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"
import { getStudentSettings } from "@/services/academics/structure-service"

type Ctx = Pick<AuthContext, "organization" | "user">

export type PlacementInput = {
  academicYearId: string
  educationLevelId: string
  programId: string | null
  classId: string
  sectionId: string | null
  batchId: string | null
  rollNumber: string | null
}

function invalid(prefix: string, field: string, message: string): never {
  throw new ValidationError({ [`${prefix}${field}`]: [message] })
}

// Checks every reference in a placement against the caller's organisation
// and against each other (level ↔ program ↔ class ↔ section). The client's
// level/program are only accepted if they match the class; the stored values
// always come from the class itself.
export async function validatePlacement(
  tx: TransactionClient,
  ctx: Ctx,
  input: PlacementInput,
  prefix = "enrollment."
) {
  const organizationId = ctx.organization.id

  const [year, academicClass] = await Promise.all([
    tx.academicYear.findFirst({ where: { id: input.academicYearId, organizationId } }),
    tx.academicClass.findFirst({
      where: { id: input.classId, organizationId },
      include: { educationLevel: true, program: true },
    }),
  ])
  if (!year) invalid(prefix, "academicYearId", "Choose a valid academic year.")
  if (year.status === "ARCHIVED") invalid(prefix, "academicYearId", "This academic year is archived.")
  if (!academicClass) invalid(prefix, "classId", "Choose a valid class.")
  if (!academicClass.isActive) invalid(prefix, "classId", "This class is inactive.")
  if (academicClass.educationLevelId !== input.educationLevelId) {
    invalid(prefix, "classId", "This class doesn't belong to the selected education level.")
  }
  if (!academicClass.educationLevel.isActive) {
    invalid(prefix, "educationLevelId", "This education level is inactive.")
  }
  if ((academicClass.programId ?? null) !== (input.programId ?? null)) {
    invalid(prefix, "classId", "This class doesn't belong to the selected program.")
  }
  if (academicClass.program && !academicClass.program.isActive) {
    invalid(prefix, "programId", "This program is inactive.")
  }

  if (input.sectionId) {
    const section = await tx.section.findFirst({
      where: { id: input.sectionId, organizationId, classId: academicClass.id },
    })
    if (!section) invalid(prefix, "sectionId", "Choose a section of the selected class.")
    if (!section.isActive) invalid(prefix, "sectionId", "This section is inactive.")
  }

  if (input.batchId) {
    const batch = await tx.batch.findFirst({ where: { id: input.batchId, organizationId } })
    if (!batch) invalid(prefix, "batchId", "Choose a valid batch.")
    if (batch.programId && batch.programId !== academicClass.programId) {
      invalid(prefix, "batchId", "This batch belongs to a different program.")
    }
  }

  return {
    academicYearId: year.id,
    educationLevelId: academicClass.educationLevelId,
    programId: academicClass.programId,
    classId: academicClass.id,
    sectionId: input.sectionId,
    batchId: input.batchId,
  }
}

// Next free numeric roll number among active placements of a class/section.
async function nextRollNumber(
  tx: TransactionClient,
  organizationId: string,
  placement: { academicYearId: string; classId: string; sectionId: string | null }
) {
  // Serialise automatic numbering per class/section for the rest of this
  // transaction, so simultaneous admissions don't pick the same number.
  const key = `roll:${placement.academicYearId}:${placement.classId}:${placement.sectionId ?? "-"}`
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
  const rows = await tx.enrollment.findMany({
    where: {
      organizationId,
      academicYearId: placement.academicYearId,
      classId: placement.classId,
      sectionId: placement.sectionId,
      status: "ACTIVE",
      rollNumber: { not: null },
    },
    select: { rollNumber: true },
  })
  const max = rows.reduce((m, r) => {
    const n = Number(r.rollNumber)
    return Number.isInteger(n) && n > m ? n : m
  }, 0)
  return String(max + 1)
}

// When the organisation enforces capacity, refuses placing `incoming` more
// active students in a section (its capacity) or a sectionless class (the
// class capacity). Serialised per class so two placements can't both take
// the last seat.
export async function assertSeatsAvailable(
  tx: TransactionClient,
  organizationId: string,
  placement: { academicYearId: string; classId: string; sectionId: string | null },
  incoming: number,
  options: { prefix?: string; field?: string; force?: boolean } = {}
) {
  if (incoming <= 0) return
  if (!options.force) {
    const settings = await getStudentSettings(tx, organizationId)
    if (!settings.enforceSectionCapacity) return
  }
  const [section, academicClass] = await Promise.all([
    placement.sectionId
      ? tx.section.findFirst({
          where: { id: placement.sectionId, organizationId },
          select: { name: true, capacity: true },
        })
      : null,
    tx.academicClass.findFirst({
      where: { id: placement.classId, organizationId },
      select: { name: true, capacity: true },
    }),
  ])
  const capacity = placement.sectionId ? section?.capacity : academicClass?.capacity
  if (!capacity) return

  const key = `seats:${placement.academicYearId}:${placement.classId}`
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
  const seated = await tx.enrollment.count({
    where: {
      organizationId,
      academicYearId: placement.academicYearId,
      classId: placement.classId,
      sectionId: placement.sectionId,
      status: "ACTIVE",
    },
  })
  if (seated + incoming > capacity) {
    const where = placement.sectionId ? `Section ${section?.name}` : (academicClass?.name ?? "This class")
    const free = Math.max(0, capacity - seated)
    invalid(
      options.prefix ?? "",
      options.field ?? (placement.sectionId ? "sectionId" : "classId"),
      `${where} is full (${seated} of ${capacity} seats taken${free ? `, ${free} free` : ""}).`
    )
  }
}

const ROLL_TAKEN = "This roll number is already used in this class/section."
const ALREADY_ENROLLED = "The student already has an active enrollment in this academic year."

export function translateEnrollmentConflict(error: unknown, prefix = "enrollment."): never {
  if (isUniqueViolation(error, "enrollments_roll_number_key", "enrollments_roll_number_no_section_key", "roll_number")) {
    invalid(prefix, "rollNumber", ROLL_TAKEN)
  }
  if (isUniqueViolation(error, "enrollments_one_active_per_year_key")) {
    invalid(prefix, "academicYearId", ALREADY_ENROLLED)
  }
  throw error
}

// Creates a placement inside the caller's transaction.
export async function createEnrollment(
  tx: TransactionClient,
  ctx: Ctx,
  studentId: string,
  input: PlacementInput & { enrollmentDate: string | null; enrollmentType: EnrollmentType },
  options: { prefix?: string; previousEnrollmentId?: string } = {}
) {
  const prefix = options.prefix ?? "enrollment."
  const organizationId = ctx.organization.id
  const placement = await validatePlacement(tx, ctx, input, prefix)

  const open = await tx.enrollment.findFirst({
    where: {
      organizationId,
      studentId,
      academicYearId: placement.academicYearId,
      status: { in: [...OPEN_ENROLLMENT_STATUSES] },
    },
    select: { id: true },
  })
  if (open) invalid(prefix, "academicYearId", ALREADY_ENROLLED)
  await assertSeatsAvailable(tx, organizationId, placement, 1, { prefix })

  let rollNumber = input.rollNumber
  if (!rollNumber) {
    const settings = await getStudentSettings(tx, organizationId)
    if (settings.rollNumberMode === "AUTOMATIC") {
      rollNumber = await nextRollNumber(tx, organizationId, placement)
    }
  } else {
    const taken = await tx.enrollment.findFirst({
      where: {
        organizationId,
        academicYearId: placement.academicYearId,
        classId: placement.classId,
        sectionId: placement.sectionId,
        status: "ACTIVE",
        rollNumber,
      },
      select: { id: true },
    })
    if (taken) invalid(prefix, "rollNumber", ROLL_TAKEN)
  }

  return tx.enrollment.create({
    data: {
      ...placement,
      organizationId,
      studentId,
      rollNumber,
      enrollmentDate: toDate(input.enrollmentDate) ?? new Date(new Date().toISOString().slice(0, 10)),
      enrollmentType: input.enrollmentType,
      previousEnrollmentId: options.previousEnrollmentId ?? null,
      createdById: ctx.user.id,
    },
  })
}

// Retries a whole transaction when a concurrent request took the same
// automatic roll number between our read and our insert.
export async function withRollRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (error) {
      const rollClash = isUniqueViolation(
        error,
        "enrollments_roll_number_key",
        "enrollments_roll_number_no_section_key",
        "roll_number"
      )
      if (!rollClash || i >= attempts) throw error
    }
  }
}

async function findEnrollment(tx: TransactionClient, ctx: Ctx, enrollmentId: string) {
  const enrollment = await tx.enrollment.findFirst({
    where: { id: enrollmentId, organizationId: ctx.organization.id },
    include: { class: { select: { name: true } }, academicYear: { select: { name: true } } },
  })
  if (!enrollment) throw new NotFoundError("Enrollment not found.")
  return enrollment
}

// ------------------------------------------------------------------ actions

// Enrolls a student who has no open placement in that year.
export async function addEnrollment(ctx: Ctx, studentId: string, raw: unknown) {
  const input = enrollmentSchema.parse(raw)
  return withRollRetry(() =>
    prisma
      .$transaction(async (tx) => {
        const student = await tx.student.findFirst({
          where: { id: studentId, organizationId: ctx.organization.id },
          select: { id: true, archivedAt: true },
        })
        if (!student) throw new NotFoundError("Student not found.")
        if (student.archivedAt) throw new ConflictError("Restore this student before enrolling them.")
        const enrollment = await createEnrollment(tx, ctx, studentId, input, { prefix: "" })
        await audit(tx, ctx, {
          action: "enrollment.create", entityType: "student", entityId: studentId,
          summary: "Enrolled in a new academic placement",
          metadata: { enrollmentId: enrollment.id },
        })
        return enrollment
      })
  ).catch((error) => translateEnrollmentConflict(error, ""))
}

// Fixes details of an open placement without changing which class/year it
// is: section, roll number, batch and date. Old values go to the audit log.
export async function correctEnrollment(ctx: Ctx, enrollmentId: string, raw: unknown) {
  const input = correctEnrollmentSchema.parse(raw)
  return prisma
    .$transaction(async (tx) => {
      const enrollment = await findEnrollment(tx, ctx, enrollmentId)
      if (!OPEN_ENROLLMENT_STATUSES.includes(enrollment.status)) {
        throw new ConflictError("Only an active or on-hold enrollment can be corrected.")
      }
      await validatePlacement(
        tx,
        ctx,
        {
          academicYearId: enrollment.academicYearId,
          educationLevelId: enrollment.educationLevelId,
          programId: enrollment.programId,
          classId: enrollment.classId,
          sectionId: input.sectionId,
          batchId: input.batchId,
          rollNumber: input.rollNumber,
        },
        ""
      )
      if (enrollment.status === "ACTIVE" && input.sectionId !== enrollment.sectionId) {
        await assertSeatsAvailable(
          tx,
          ctx.organization.id,
          { academicYearId: enrollment.academicYearId, classId: enrollment.classId, sectionId: input.sectionId },
          1
        )
      }
      if (input.rollNumber && enrollment.status === "ACTIVE") {
        const taken = await tx.enrollment.findFirst({
          where: {
            organizationId: ctx.organization.id,
            academicYearId: enrollment.academicYearId,
            classId: enrollment.classId,
            sectionId: input.sectionId,
            status: "ACTIVE",
            rollNumber: input.rollNumber,
            id: { not: enrollment.id },
          },
          select: { id: true },
        })
        if (taken) invalid("", "rollNumber", ROLL_TAKEN)
      }
      const updated = await tx.enrollment.update({
        where: { id: enrollment.id },
        data: {
          sectionId: input.sectionId,
          batchId: input.batchId,
          rollNumber: input.rollNumber,
          enrollmentDate: toDate(input.enrollmentDate),
        },
      })
      await audit(tx, ctx, {
        action: "enrollment.correct", entityType: "student", entityId: enrollment.studentId,
        summary: `Corrected enrollment details (${enrollment.class.name}, ${enrollment.academicYear.name})`,
        metadata: {
          enrollmentId: enrollment.id,
          before: {
            sectionId: enrollment.sectionId,
            batchId: enrollment.batchId,
            rollNumber: enrollment.rollNumber,
            enrollmentDate: enrollment.enrollmentDate.toISOString().slice(0, 10),
          },
          after: input,
        },
      })
      return updated
    })
    .catch((error) => translateEnrollmentConflict(error, ""))
}

// Promotion, detention, completion or transfer: closes the current placement
// and optionally opens the next one, linked to it. History is never rewritten.
export async function progressEnrollment(ctx: Ctx, enrollmentId: string, raw: unknown) {
  const input = progressEnrollmentSchema.parse(raw)
  return withRollRetry(() =>
    prisma
      .$transaction(async (tx) => {
        const current = await findEnrollment(tx, ctx, enrollmentId)
        if (!canTransitionEnrollment(current.status, input.outcome)) {
          throw new ConflictError(
            `A ${ENROLLMENT_STATUS_LABELS[current.status].toLowerCase()} enrollment can't be marked ${ENROLLMENT_STATUS_LABELS[input.outcome].toLowerCase()}.`
          )
        }
        const student = await tx.student.findFirst({
          where: { id: current.studentId, organizationId: ctx.organization.id },
          select: { archivedAt: true },
        })
        if (student?.archivedAt) throw new ConflictError("Restore this student first.")

        await tx.enrollment.update({
          where: { id: current.id },
          data: { status: input.outcome, endedOn: toDate(input.endedOn), statusReason: input.reason },
        })

        let next = null
        if (input.createNext && input.next) {
          next = await createEnrollment(tx, ctx, current.studentId, input.next, {
            prefix: "next.",
            previousEnrollmentId: current.id,
          })
        }

        await audit(tx, ctx, {
          action: `enrollment.${input.outcome.toLowerCase()}`, entityType: "student", entityId: current.studentId,
          summary: `${ENROLLMENT_STATUS_LABELS[input.outcome]} from ${current.class.name} (${current.academicYear.name})${next ? " and enrolled in the next placement" : ""}`,
          metadata: { fromEnrollmentId: current.id, toEnrollmentId: next?.id ?? null },
        })
        return { closed: current.id, next: next?.id ?? null }
      })
  ).catch((error) => translateEnrollmentConflict(error, "next."))
}

export async function changeEnrollmentStatus(ctx: Ctx, enrollmentId: string, raw: unknown) {
  const input = enrollmentStatusSchema.parse(raw)
  return prisma
    .$transaction(async (tx) => {
      const enrollment = await findEnrollment(tx, ctx, enrollmentId)
      if (!canTransitionEnrollment(enrollment.status, input.status)) {
        throw new ConflictError(
          `Can't change a ${ENROLLMENT_STATUS_LABELS[enrollment.status].toLowerCase()} enrollment to ${ENROLLMENT_STATUS_LABELS[input.status].toLowerCase()}.`
        )
      }
      const reopening = input.status === "ACTIVE"
      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: {
          status: input.status,
          statusReason: input.reason,
          endedOn: reopening || input.status === "ON_HOLD" ? null : toDate(new Date().toISOString().slice(0, 10)),
        },
      })
      await audit(tx, ctx, {
        action: "enrollment.status", entityType: "student", entityId: enrollment.studentId,
        summary: `Enrollment in ${enrollment.class.name} (${enrollment.academicYear.name}) changed from ${ENROLLMENT_STATUS_LABELS[enrollment.status]} to ${ENROLLMENT_STATUS_LABELS[input.status]}`,
        metadata: { enrollmentId: enrollment.id, reason: input.reason },
      })
    })
    .catch((error) => translateEnrollmentConflict(error, ""))
}
