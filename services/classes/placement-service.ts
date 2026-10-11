import "server-only"

import { orderForRollNumbers, ROLL_ORDERS } from "@/features/classes/constants"
import {
  enrollStudentsSchema,
  moveStudentsSchema,
  promotionSchema,
  renumberRollsSchema,
} from "@/features/classes/schemas"
import {
  canTransitionEnrollment,
  ENROLLMENT_STATUS_LABELS,
  fullName,
  OPEN_ENROLLMENT_STATUSES,
} from "@/features/students/constants"
import type { AuthContext } from "@/lib/authorization/context"
import { AppError, ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { EnrollmentType } from "@/lib/generated/prisma/enums"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { getStudentSettings } from "@/services/academics/structure-service"
import { audit } from "@/services/audit/audit-service"
import {
  assertSeatsAvailable,
  createEnrollment,
  progressEnrollment,
  translateEnrollmentConflict,
  withRollRetry,
} from "@/services/students/enrollment-service"

// Placing students within classes and sections: roll numbers, section moves,
// enrolling existing students, and end-of-year progression. Every change goes
// through the enrollment rules of the students module (organisation checks,
// one open placement per year, roll-number uniqueness, optional capacity),
// and progression closes placements instead of rewriting them.
type Ctx = Pick<AuthContext, "organization" | "user">

function fieldError(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

const openStatuses = [...OPEN_ENROLLMENT_STATUSES]

// A readable reason for one failed row of a bulk operation.
export function failureReason(error: unknown) {
  if (error instanceof ValidationError) {
    return Object.values(error.fieldErrors).flat().find((m): m is string => !!m) ?? error.message
  }
  if (error instanceof AppError) return error.message
  console.error(error)
  return "Unexpected error."
}

// Same advisory-lock key as automatic roll numbering on admission, so the two
// never hand out numbers in the same class/section at the same time.
async function lockRollGroup(tx: TransactionClient, yearId: string, classId: string, sectionId: string | null) {
  const key = `roll:${yearId}:${classId}:${sectionId ?? "-"}`
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
}

async function requireYear(db: TransactionClient | typeof prisma, ctx: Ctx, id: string, field = "academicYearId") {
  const year = await db.academicYear.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!year) fieldError(field, "Choose a valid academic year.")
  if (year.status === "ARCHIVED") throw new ConflictError(`${year.name} is archived.`)
  return year
}

async function requireClass(db: TransactionClient | typeof prisma, ctx: Ctx, id: string) {
  const academicClass = await db.academicClass.findFirst({
    where: { id, organizationId: ctx.organization.id },
    select: { id: true, name: true, educationLevelId: true, programId: true, isActive: true, archivedAt: true },
  })
  if (!academicClass) throw new NotFoundError("Class not found.")
  return academicClass
}

// ------------------------------------------------------------ roll numbers

// Re-assigns roll numbers 1..n in the chosen order. Each section is numbered
// on its own (roll numbers are unique per section); "whole class" numbers
// every section, and students without a section, separately.
export async function renumberRolls(ctx: Ctx, raw: unknown) {
  const input = renumberRollsSchema.parse(raw)
  const organizationId = ctx.organization.id

  return prisma.$transaction(async (tx) => {
    await requireYear(tx, ctx, input.academicYearId)
    const academicClass = await requireClass(tx, ctx, input.classId)
    let sectionName: string | null = null
    if (input.sectionId && input.sectionId !== "none") {
      const section = await tx.section.findFirst({
        where: { id: input.sectionId, organizationId, classId: academicClass.id },
        select: { name: true },
      })
      if (!section) fieldError("sectionId", "Choose a section of this class.")
      sectionName = section.name
    }

    const enrollments = await tx.enrollment.findMany({
      where: {
        organizationId,
        academicYearId: input.academicYearId,
        classId: academicClass.id,
        status: { in: openStatuses },
        ...(input.sectionId ? { sectionId: input.sectionId === "none" ? null : input.sectionId } : {}),
      },
      select: {
        id: true, sectionId: true, rollNumber: true,
        student: { select: { admissionNumber: true, firstName: true, middleName: true, lastName: true, gender: true } },
      },
    })

    const groups = new Map<string | null, typeof enrollments>()
    for (const e of enrollments) groups.set(e.sectionId, [...(groups.get(e.sectionId) ?? []), e])

    for (const [sectionId, rows] of groups) {
      await lockRollGroup(tx, input.academicYearId, academicClass.id, sectionId)
      const ordered = orderForRollNumbers(
        rows.map((r) => ({ ...r.student, id: r.id, rollNumber: r.rollNumber })),
        input.order
      )
      const ids = ordered.map((r) => r.id)
      // Clear first: unique indexes are checked row by row, so numbering in
      // place would collide when two students swap numbers.
      await tx.enrollment.updateMany({ where: { id: { in: ids }, organizationId }, data: { rollNumber: null } })
      const rolls = ordered.map((_, i) => String(i + 1))
      await tx.$executeRaw`
        UPDATE enrollments AS e
        SET roll_number = v.roll, updated_at = now()
        FROM unnest(${ids}::uuid[], ${rolls}::text[]) AS v(id, roll)
        WHERE e.id = v.id AND e.organization_id = ${organizationId}::uuid`
    }

    const scope = sectionName
      ? `section ${sectionName}`
      : input.sectionId === "none"
        ? "students without a section"
        : "all sections"
    await audit(tx, ctx, {
      action: "class.roll_numbers", entityType: "class", entityId: academicClass.id,
      summary: `Renumbered ${enrollments.length} roll numbers in ${academicClass.name} (${scope}) — ${ROLL_ORDERS[input.order].toLowerCase()}`,
      metadata: {
        academicYearId: input.academicYearId,
        sectionId: input.sectionId,
        order: input.order,
        before: enrollments.map((e) => ({ enrollmentId: e.id, rollNumber: e.rollNumber })),
      },
    })
    return { renumbered: enrollments.length }
  })
}

// ----------------------------------------------------------- section moves

// Moves students between sections of their class in the same year. This
// corrects the placement (same class and year), so the enrollment is updated
// in place and the old section is kept in the audit log. Students moving in
// get the next free roll numbers there (automatic numbering) or none.
export async function moveStudents(ctx: Ctx, raw: unknown) {
  const input = moveStudentsSchema.parse(raw)
  const organizationId = ctx.organization.id

  return prisma.$transaction(async (tx) => {
    await requireYear(tx, ctx, input.academicYearId)
    const academicClass = await requireClass(tx, ctx, input.classId)

    let target: { id: string; name: string } | null = null
    if (input.targetSectionId) {
      const section = await tx.section.findFirst({
        where: { id: input.targetSectionId, organizationId, classId: academicClass.id },
        select: { id: true, name: true, isActive: true },
      })
      if (!section) fieldError("targetSectionId", "Choose a section of this class.")
      if (!section.isActive) fieldError("targetSectionId", "This section is inactive or archived.")
      target = section
    }
    const targetId = target?.id ?? null

    const selected = await tx.enrollment.findMany({
      where: {
        id: { in: input.enrollmentIds },
        organizationId,
        academicYearId: input.academicYearId,
        classId: academicClass.id,
        status: { in: openStatuses },
      },
      select: {
        id: true, studentId: true, sectionId: true, rollNumber: true, status: true,
        section: { select: { name: true } },
      },
    })
    if (selected.length !== new Set(input.enrollmentIds).size) {
      throw new ConflictError("Some selected students are no longer enrolled in this class. Refresh and try again.")
    }
    const moving = selected.filter((e) => e.sectionId !== targetId)
    if (moving.length === 0) return { moved: 0 }

    await assertSeatsAvailable(
      tx,
      organizationId,
      { academicYearId: input.academicYearId, classId: academicClass.id, sectionId: targetId },
      moving.filter((e) => e.status === "ACTIVE").length,
      { field: "targetSectionId" }
    )

    await lockRollGroup(tx, input.academicYearId, academicClass.id, targetId)
    const occupants = await tx.enrollment.findMany({
      where: {
        organizationId,
        academicYearId: input.academicYearId,
        classId: academicClass.id,
        sectionId: targetId,
        status: { in: openStatuses },
      },
      select: { rollNumber: true },
    })
    const settings = await getStudentSettings(tx, organizationId)
    let next = occupants.reduce((max, o) => {
      const n = Number(o.rollNumber)
      return Number.isInteger(n) && n > max ? n : max
    }, 0)
    // Keep the movers' existing relative order when appending them.
    const ordered = [...moving].sort(
      (a, b) => (Number(a.rollNumber) || Infinity) - (Number(b.rollNumber) || Infinity)
    )
    for (const e of ordered) {
      const rollNumber = settings.rollNumberMode === "AUTOMATIC" ? String(++next) : null
      await tx.enrollment.update({ where: { id: e.id }, data: { sectionId: targetId, rollNumber } })
    }

    const label = target ? `section ${target.name}` : "no section"
    await audit(
      tx,
      ctx,
      ordered.map((e) => ({
        action: "enrollment.correct",
        entityType: "student",
        entityId: e.studentId,
        summary: `Moved from ${e.section ? `section ${e.section.name}` : "no section"} to ${label} in ${academicClass.name}`,
        metadata: {
          enrollmentId: e.id,
          before: { sectionId: e.sectionId, rollNumber: e.rollNumber },
          after: { sectionId: targetId },
        },
      }))
    )
    return { moved: moving.length }
  })
}

// --------------------------------------------------------- enroll students

export type BulkOutcome = { succeeded: number; failed: { id: string; name: string; reason: string }[] }

// Enrolls existing students (with no open placement that year) into a class
// and optional section. Each student is enrolled in its own transaction, so
// one problem (already enrolled, section full) doesn't block the others.
export async function enrollStudents(ctx: Ctx, raw: unknown): Promise<BulkOutcome> {
  const input = enrollStudentsSchema.parse(raw)
  const organizationId = ctx.organization.id
  await requireYear(prisma, ctx, input.academicYearId)
  const academicClass = await requireClass(prisma, ctx, input.classId)
  if (academicClass.archivedAt) throw new ConflictError("This class is archived.")
  const section = input.sectionId
    ? await prisma.section.findFirst({
        where: { id: input.sectionId, organizationId, classId: academicClass.id },
        select: { name: true },
      })
    : null
  if (input.sectionId && !section) fieldError("sectionId", "Choose a section of this class.")

  const students = await prisma.student.findMany({
    where: { id: { in: input.studentIds }, organizationId },
    select: { id: true, firstName: true, middleName: true, lastName: true, status: true, archivedAt: true },
  })
  const result: BulkOutcome = { succeeded: 0, failed: [] }
  const where = `${academicClass.name}${section ? ` ${section.name}` : ""}`

  for (const id of new Set(input.studentIds)) {
    const student = students.find((s) => s.id === id)
    if (!student) {
      result.failed.push({ id, name: "Unknown student", reason: "Not found." })
      continue
    }
    const name = fullName(student)
    if (student.archivedAt || student.status !== "ACTIVE") {
      result.failed.push({ id, name, reason: student.archivedAt ? "Archived." : `Student is ${student.status.toLowerCase()}.` })
      continue
    }
    try {
      await withRollRetry(() =>
        prisma.$transaction(async (tx) => {
          const enrollment = await createEnrollment(
            tx,
            ctx,
            student.id,
            {
              academicYearId: input.academicYearId,
              educationLevelId: academicClass.educationLevelId,
              programId: academicClass.programId,
              classId: academicClass.id,
              sectionId: input.sectionId,
              batchId: null,
              rollNumber: null,
              enrollmentDate: input.enrollmentDate,
              enrollmentType: input.enrollmentType,
            },
            { prefix: "" }
          )
          await audit(tx, ctx, {
            action: "enrollment.create", entityType: "student", entityId: student.id,
            summary: `Enrolled in ${where}`, metadata: { enrollmentId: enrollment.id },
          })
        })
      ).catch((error) => translateEnrollmentConflict(error, ""))
      result.succeeded++
    } catch (error) {
      result.failed.push({ id, name, reason: failureReason(error) })
    }
  }
  return result
}

// --------------------------------------------------------------- promotion

const NEXT_TYPE: Record<"PROMOTED" | "DETAINED" | "TRANSFERRED", EnrollmentType> = {
  PROMOTED: "PROMOTION",
  DETAINED: "REPEAT",
  TRANSFERRED: "TRANSFER",
}

export type PromotionRow = {
  enrollmentId: string
  name: string
  admissionNumber: string
  rollNumber: string | null
  fromSection: string | null
  toSection: string | null
  problems: string[]
  warnings: string[]
}

// Works out, for every selected student, where they would go and what would
// stop them. Used for the preview and again (fresh) when confirming.
async function planPromotion(ctx: Ctx, raw: unknown) {
  const input = promotionSchema.parse(raw)
  const organizationId = ctx.organization.id
  const fromYear = await requireYear(prisma, ctx, input.fromYearId, "fromYearId")
  const fromClass = await requireClass(prisma, ctx, input.classId)
  const creates = input.outcome !== "COMPLETED"

  const toYear = creates ? await requireYear(prisma, ctx, input.toYearId!, "toYearId") : null
  const toClassId = input.outcome === "DETAINED" ? fromClass.id : input.toClassId
  const toClass = creates
    ? await prisma.academicClass.findFirst({
        where: { id: toClassId!, organizationId },
        select: {
          id: true, name: true, educationLevelId: true, programId: true, isActive: true, archivedAt: true, capacity: true,
          sections: {
            where: { archivedAt: null, isActive: true },
            select: { id: true, name: true, capacity: true },
          },
        },
      })
    : null
  if (creates) {
    if (!toClass) fieldError("toClassId", "Choose a valid class.")
    if (!toClass.isActive || toClass.archivedAt) fieldError("toClassId", "That class is inactive or archived.")
    if (input.outcome === "DETAINED" && toYear!.id === fromYear.id) {
      fieldError("toYearId", "Students repeating the class move into a later academic year.")
    }
    if (input.outcome === "TRANSFERRED" && toClass.id === fromClass.id && toYear!.id === fromYear.id) {
      fieldError("toClassId", "Choose a different class, or move students between sections instead.")
    }
    if (toYear!.startDate < fromYear.startDate) {
      fieldError("toYearId", "The new placement can't be in an earlier academic year.")
    }
  }
  let pickedSection: { id: string; name: string; capacity: number | null } | null = null
  if (creates && input.sectionMode === "pick") {
    pickedSection = toClass!.sections.find((s) => s.id === input.toSectionId) ?? null
    if (!pickedSection) fieldError("toSectionId", "Choose an active section of the new class.")
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { id: { in: input.enrollmentIds }, organizationId, academicYearId: fromYear.id, classId: fromClass.id },
    select: {
      id: true, studentId: true, status: true, rollNumber: true, batchId: true,
      section: { select: { name: true } },
      student: { select: { firstName: true, middleName: true, lastName: true, admissionNumber: true, archivedAt: true } },
    },
  })
  // Students who already have another open placement in the destination year.
  const taken = creates
    ? new Set(
        (
          await prisma.enrollment.findMany({
            where: {
              organizationId,
              academicYearId: toYear!.id,
              studentId: { in: enrollments.map((e) => e.studentId) },
              status: { in: openStatuses },
              id: { notIn: enrollments.map((e) => e.id) },
            },
            select: { studentId: true },
          })
        ).map((e) => e.studentId)
      )
    : new Set<string>()

  // Seats, when the organisation enforces capacity: what's there plus what
  // this batch adds, per destination section.
  const settings = await getStudentSettings(prisma, organizationId)
  const seated = new Map<string, number>()
  if (creates && settings.enforceSectionCapacity) {
    const rows = await prisma.enrollment.groupBy({
      by: ["sectionId"],
      where: { organizationId, academicYearId: toYear!.id, classId: toClass!.id, status: "ACTIVE" },
      _count: { _all: true },
    })
    for (const r of rows) seated.set(r.sectionId ?? "", r._count._all)
  }

  const rows: (PromotionRow & { studentId: string; batchId: string | null; toSectionId: string | null })[] = []
  for (const id of new Set(input.enrollmentIds)) {
    const e = enrollments.find((x) => x.id === id)
    if (!e) {
      rows.push({
        enrollmentId: id, studentId: "", batchId: null, name: "Unknown", admissionNumber: "", rollNumber: null,
        fromSection: null, toSection: null, toSectionId: null,
        problems: ["Not enrolled in this class and year."], warnings: [],
      })
      continue
    }
    const problems: string[] = []
    const warnings: string[] = []
    if (!canTransitionEnrollment(e.status, input.outcome)) {
      problems.push(
        `A ${ENROLLMENT_STATUS_LABELS[e.status].toLowerCase()} placement can't be marked ${ENROLLMENT_STATUS_LABELS[input.outcome].toLowerCase()}.`
      )
    }
    if (e.student.archivedAt) problems.push("The student is archived.")
    if (taken.has(e.studentId)) problems.push(`Already has an open placement in ${toYear!.name}.`)

    let toSection: { id: string; name: string; capacity: number | null } | null = null
    if (creates) {
      if (input.sectionMode === "pick") toSection = pickedSection
      else if (input.sectionMode === "same" && e.section) {
        toSection = toClass!.sections.find((s) => s.name.toLowerCase() === e.section!.name.toLowerCase()) ?? null
        if (!toSection) warnings.push(`${toClass!.name} has no section ${e.section.name}; placed without a section.`)
      }
      if (settings.enforceSectionCapacity && problems.length === 0) {
        const capacity = toSection ? toSection.capacity : toClass!.capacity
        const key = toSection?.id ?? ""
        const count = (seated.get(key) ?? 0) + 1
        if (capacity && count > capacity) problems.push(`${toSection ? `Section ${toSection.name}` : toClass!.name} would be over capacity.`)
        else seated.set(key, count)
      }
    }
    rows.push({
      enrollmentId: e.id,
      studentId: e.studentId,
      batchId: e.batchId,
      name: fullName(e.student),
      admissionNumber: e.student.admissionNumber,
      rollNumber: e.rollNumber,
      fromSection: e.section?.name ?? null,
      toSection: toSection?.name ?? null,
      toSectionId: toSection?.id ?? null,
      problems,
      warnings,
    })
  }

  return { input, fromYear, fromClass, toYear, toClass, rows }
}

export async function previewPromotion(ctx: Ctx, raw: unknown) {
  const plan = await planPromotion(ctx, raw)
  return {
    toClass: plan.toClass?.name ?? null,
    toYear: plan.toYear?.name ?? null,
    rows: plan.rows.map(
      (r): PromotionRow => ({
        enrollmentId: r.enrollmentId,
        name: r.name,
        admissionNumber: r.admissionNumber,
        rollNumber: r.rollNumber,
        fromSection: r.fromSection,
        toSection: r.toSection,
        problems: r.problems,
        warnings: r.warnings,
      })
    ),
  }
}

// Closes each selected placement with the chosen outcome and, except for
// completion, opens the linked next placement (through the same service as
// the student profile). Students with problems are skipped, not guessed at.
export async function promoteStudents(ctx: Ctx, raw: unknown) {
  const plan = await planPromotion(ctx, raw)
  const { input, toYear, toClass, fromClass } = plan
  const result: BulkOutcome & { skipped: number } = { succeeded: 0, failed: [], skipped: 0 }

  for (const row of plan.rows) {
    if (row.problems.length) {
      result.skipped++
      result.failed.push({ id: row.enrollmentId, name: row.name, reason: row.problems[0] })
      continue
    }
    try {
      await progressEnrollment(ctx, row.enrollmentId, {
        outcome: input.outcome,
        endedOn: input.endedOn,
        reason: input.reason,
        createNext: input.outcome !== "COMPLETED",
        next:
          input.outcome === "COMPLETED"
            ? null
            : {
                academicYearId: toYear!.id,
                educationLevelId: toClass!.educationLevelId,
                programId: toClass!.programId ?? "",
                classId: toClass!.id,
                sectionId: row.toSectionId ?? "",
                // A batch is an intake group; it follows students within their program.
                batchId: toClass!.programId && toClass!.programId === fromClass.programId ? (row.batchId ?? "") : "",
                rollNumber: "",
                enrollmentDate: input.enrollmentDate ?? toYear!.startDate.toISOString().slice(0, 10),
                enrollmentType: NEXT_TYPE[input.outcome],
              },
      })
      result.succeeded++
    } catch (error) {
      result.failed.push({ id: row.enrollmentId, name: row.name, reason: failureReason(error) })
    }
  }

  await audit(prisma, ctx, {
    action: "class.progression", entityType: "class", entityId: fromClass.id,
    summary: `${ENROLLMENT_STATUS_LABELS[input.outcome]} ${result.succeeded} students from ${fromClass.name} (${plan.fromYear.name})${toClass ? ` to ${toClass.name} (${toYear!.name})` : ""}; ${result.failed.length} not changed`,
  })
  return result
}
