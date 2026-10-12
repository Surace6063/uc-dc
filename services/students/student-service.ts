import "server-only"

import {
  canTransitionStudent,
  ENROLLMENT_STATUS_ON_EXIT,
  fullName,
  OPEN_ENROLLMENT_STATUSES,
  STUDENT_STATUS_LABELS,
} from "@/features/students/constants"
import {
  bulkActionSchema,
  createStudentSchema,
  duplicateCheckSchema,
  guardianEntrySchema,
  studentStatusSchema,
  updateGuardianSchema,
  updateStudentSchema,
  yesNoToBoolean,
} from "@/features/students/schemas"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { Prisma } from "@/lib/generated/prisma/client"
import type { AddressType, StudentStatus } from "@/lib/generated/prisma/enums"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { removeFiles } from "@/lib/supabase/storage"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"
import { getStudentSettings } from "@/services/academics/structure-service"
import { nextGuardianCode } from "@/services/guardians/guardian-service"
import {
  createEnrollment,
  translateEnrollmentConflict,
  withRollRetry,
} from "@/services/students/enrollment-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type AddressValues = ReturnType<typeof updateStudentSchema.parse>["permanentAddress"]

function invalid(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

const ADMISSION_TAKEN = "This admission number is already used in your organisation."

// ------------------------------------------------------------ access checks

async function findStudent(db: TransactionClient | typeof prisma, ctx: Ctx, id: string) {
  const student = await db.student.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!student) throw new NotFoundError("Student not found.")
  return student
}

// Staff with students.view see any student of their organisation. Without it,
// a user may only see the student record linked to their own account.
// Guardians don't use the staff-facing profile (it lists other guardians,
// status history and internal details); they see a curated view in the
// parent portal, which applies its own per-link checks (portal-service).
export async function assertCanViewStudent(ctx: Ctx, studentId: string) {
  const where: Prisma.StudentWhereInput = { id: studentId, organizationId: ctx.organization.id }
  if (!hasPermission(ctx, "students.view")) where.userId = ctx.user.id
  const student = await prisma.student.findFirst({ where, select: { id: true } })
  if (!student) throw new NotFoundError("Student not found.")
  return student
}

// ---------------------------------------------------------- admission numbers

// Hands out the next number, like a database sequence: each call is one
// atomic UPDATE ... RETURNING (auto-committed, so the row lock is held only
// for that statement), so concurrent admissions never get the same number.
// A failed admission leaves a gap, which is expected. Numbers already taken
// by hand are skipped; the unique constraint is the final guard.
async function generateAdmissionNumber(organizationId: string) {
  await prisma.studentSettings.createMany({ data: [{ organizationId }], skipDuplicates: true })
  for (let attempt = 0; attempt < 50; attempt++) {
    const settings = await prisma.studentSettings.update({
      where: { organizationId },
      data: { nextAdmissionSequence: { increment: 1 } },
    })
    const sequence = settings.nextAdmissionSequence - 1
    const candidate = `${settings.admissionNumberPrefix}${String(sequence).padStart(settings.admissionNumberPadding, "0")}`
    const taken = await prisma.student.findFirst({
      where: { organizationId, admissionNumber: { equals: candidate, mode: "insensitive" } },
      select: { id: true },
    })
    if (!taken) return candidate
  }
  throw new ConflictError("Couldn't generate a free admission number. Check the numbering settings.")
}

// A requested number must be free; otherwise one is generated when the
// organisation uses automatic numbering. Runs before the admission
// transaction so that transaction stays short.
async function resolveAdmissionNumber(
  organizationId: string,
  requested: string | null,
  field = "admission.admissionNumber"
) {
  if (requested) {
    const taken = await prisma.student.findFirst({
      where: { organizationId, admissionNumber: { equals: requested, mode: "insensitive" } },
      select: { id: true },
    })
    if (taken) invalid(field, ADMISSION_TAKEN)
    return requested
  }
  const settings = await getStudentSettings(prisma, organizationId)
  if (settings.admissionNumberMode === "MANUAL") invalid(field, "Enter the admission number.")
  return generateAdmissionNumber(organizationId)
}

// ------------------------------------------------------------------ helpers

function addressData(address: AddressValues) {
  return {
    province: address.province,
    district: address.district,
    municipality: address.municipality,
    wardNumber: address.wardNumber,
    tole: address.tole,
    street: address.street,
    postalCode: address.postalCode,
  }
}

function isEmptyAddress(address: AddressValues) {
  return Object.values(addressData(address)).every((v) => v === null)
}

async function writeAddresses(
  tx: TransactionClient,
  studentId: string,
  permanent: AddressValues,
  temporary: AddressValues,
  sameAsPermanent: boolean
) {
  const entries: [AddressType, AddressValues][] = [
    ["PERMANENT", permanent],
    ["TEMPORARY", sameAsPermanent ? permanent : temporary],
  ]
  for (const [type, address] of entries) {
    if (isEmptyAddress(address)) {
      await tx.studentAddress.deleteMany({ where: { studentId, type } })
    } else {
      await tx.studentAddress.upsert({
        where: { studentId_type: { studentId, type } },
        create: { studentId, type, ...addressData(address) },
        update: addressData(address),
      })
    }
  }
}

// Medical notes and disability are only written by roles allowed to read
// them; for everyone else they're left as they are.
function personalData(ctx: Ctx, personal: ReturnType<typeof updateStudentSchema.parse>["personal"]) {
  const { medicalNotes, disabilityType, economicallyDisadvantaged, firstGenerationLearner, remoteArea, ...rest } = personal
  return {
    ...rest,
    dateOfBirth: toDate(rest.dateOfBirth),
    economicallyDisadvantaged: yesNoToBoolean(economicallyDisadvantaged),
    firstGenerationLearner: yesNoToBoolean(firstGenerationLearner),
    remoteArea: yesNoToBoolean(remoteArea),
    ...(hasPermission(ctx, "students.sensitive.view") && { medicalNotes, disabilityType }),
  }
}

function admissionData(admission: ReturnType<typeof updateStudentSchema.parse>["admission"]) {
  return {
    admissionDate: toDate(admission.admissionDate),
    admissionType: admission.admissionType,
    previousSchool: admission.previousSchool,
    previousQualification: admission.previousQualification,
    previousResult: admission.previousResult,
    entranceScore: admission.entranceScore,
    scholarshipCategory: admission.scholarshipCategory,
  }
}

type GuardianEntry = ReturnType<typeof guardianEntrySchema.parse>

// Links an existing guardian of this organisation, or creates one. A new
// guardian whose phone matches an existing guardian with the same name is
// reused rather than duplicated (siblings admitted separately).
async function linkGuardian(
  tx: TransactionClient,
  ctx: Ctx,
  studentId: string,
  entry: GuardianEntry,
  field: string
) {
  const organizationId = ctx.organization.id
  let guardianId = entry.guardianId

  if (guardianId) {
    const existing = await tx.guardian.findFirst({ where: { id: guardianId, organizationId }, select: { id: true } })
    if (!existing) invalid(`${field}.guardianId`, "Choose a valid guardian.")
  } else {
    const match = entry.phone
      ? await tx.guardian.findFirst({
          where: {
            organizationId,
            phone: entry.phone,
            fullName: { equals: entry.fullName!, mode: "insensitive" },
          },
          select: { id: true },
        })
      : null
    guardianId =
      match?.id ??
      (
        await tx.guardian.create({
          data: {
            organizationId,
            guardianCode: await nextGuardianCode(tx, organizationId),
            createdById: ctx.user.id,
            fullName: entry.fullName!,
            phone: entry.phone,
            alternatePhone: entry.alternatePhone,
            email: entry.email,
            occupation: entry.occupation,
            address: entry.address,
          },
          select: { id: true },
        })
      ).id
  }

  const already = await tx.studentGuardian.findUnique({
    where: { studentId_guardianId: { studentId, guardianId } },
  })
  if (already) invalid(`${field}.guardianId`, "This guardian is already linked to the student.")

  if (entry.isPrimary) {
    await tx.studentGuardian.updateMany({ where: { studentId, organizationId }, data: { isPrimary: false } })
  }
  await tx.studentGuardian.create({
    data: {
      organizationId,
      studentId,
      guardianId,
      relationship: entry.relationship,
      isPrimary: entry.isPrimary,
      isEmergencyContact: entry.isEmergencyContact,
      receivesAcademicNotifications: entry.receivesAcademicNotifications,
      receivesBillingNotifications: entry.receivesBillingNotifications,
    },
  })
  return guardianId
}

// ------------------------------------------------------------------ create

export async function createStudent(ctx: Ctx, raw: unknown) {
  const input = createStudentSchema.parse(raw)
  const organizationId = ctx.organization.id

  const admissionNumber = await resolveAdmissionNumber(organizationId, input.admission.admissionNumber)

  return withRollRetry(() =>
    prisma.$transaction(async (tx) => {

      const student = await tx.student.create({
        data: {
          organizationId,
          admissionNumber,
          ...personalData(ctx, input.personal),
          ...admissionData(input.admission),
          createdById: ctx.user.id,
        },
      })

      await writeAddresses(tx, student.id, input.permanentAddress, input.temporaryAddress, input.sameAsPermanent)

      // The first guardian becomes primary if none was chosen.
      const guardians = input.guardians.map((g, i) => ({
        ...g,
        isPrimary: g.isPrimary || (i === 0 && !input.guardians.some((x) => x.isPrimary)),
      }))
      for (const [i, guardian] of guardians.entries()) {
        await linkGuardian(tx, ctx, student.id, guardian, `guardians.${i}`)
      }

      let enrollmentId: string | null = null
      if (input.enroll && input.enrollment) {
        const enrollment = await createEnrollment(tx, ctx, student.id, {
          ...input.enrollment,
          enrollmentDate: input.enrollment.enrollmentDate ?? input.admission.admissionDate,
        })
        enrollmentId = enrollment.id
      }

      await tx.studentStatusHistory.create({
        data: {
          organizationId,
          studentId: student.id,
          action: "CREATED",
          toStatus: "ACTIVE",
          changedById: ctx.user.id,
        },
      })
      await audit(tx, ctx, {
        action: "student.create", entityType: "student", entityId: student.id,
        summary: `Admitted ${fullName(student)} (${admissionNumber})`,
        metadata: { enrollmentId, guardians: guardians.length },
      })
      return { id: student.id, admissionNumber }
    })
  ).catch((error) => {
    if (isUniqueViolation(error, "admission_number")) invalid("admission.admissionNumber", ADMISSION_TAKEN)
    return translateEnrollmentConflict(error)
  })
}

// Possible duplicates shown before saving: same admission number, same name
// and date of birth, or same name and phone.
export async function findPossibleDuplicates(ctx: Ctx, raw: unknown) {
  const input = duplicateCheckSchema.parse(raw)
  const organizationId = ctx.organization.id
  const sameName: Prisma.StudentWhereInput = {
    firstName: { equals: input.firstName, mode: "insensitive" },
    lastName: { equals: input.lastName, mode: "insensitive" },
  }
  const or: Prisma.StudentWhereInput[] = []
  if (input.admissionNumber) {
    or.push({ admissionNumber: { equals: input.admissionNumber, mode: "insensitive" } })
  }
  if (input.firstName && input.lastName) {
    if (input.dateOfBirth) or.push({ ...sameName, dateOfBirth: toDate(input.dateOfBirth) })
    if (input.phone) {
      or.push({
        ...sameName,
        OR: [{ phone: input.phone }, { guardians: { some: { guardian: { phone: input.phone } } } }],
      })
    }
  }
  if (or.length === 0) return []
  const rows = await prisma.student.findMany({
    where: { organizationId, OR: or, ...(input.excludeId && { id: { not: input.excludeId } }) },
    take: 5,
    select: {
      id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true,
      dateOfBirth: true, archivedAt: true,
    },
  })
  return rows.map((r) => ({
    id: r.id,
    name: fullName(r),
    admissionNumber: r.admissionNumber,
    dateOfBirth: r.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    archived: r.archivedAt !== null,
    sameAdmissionNumber:
      !!input.admissionNumber && r.admissionNumber.toLowerCase() === input.admissionNumber.toLowerCase(),
  }))
}

// ------------------------------------------------------------------ update

export async function updateStudent(ctx: Ctx, studentId: string, raw: unknown) {
  const input = updateStudentSchema.parse(raw)
  const organizationId = ctx.organization.id

  return prisma
    .$transaction(async (tx) => {
      const existing = await findStudent(tx, ctx, studentId)
      if (existing.archivedAt) throw new ConflictError("Restore this student before editing.")

      const requested = input.admission.admissionNumber
      let admissionNumber = existing.admissionNumber
      if (requested && requested !== existing.admissionNumber) {
        const taken = await tx.student.findFirst({
          where: {
            organizationId,
            admissionNumber: { equals: requested, mode: "insensitive" },
            id: { not: studentId },
          },
          select: { id: true },
        })
        if (taken) invalid("admission.admissionNumber", ADMISSION_TAKEN)
        admissionNumber = requested
      }

      const student = await tx.student.update({
        where: { id: existing.id },
        data: {
          ...personalData(ctx, input.personal),
          admissionNumber,
          ...admissionData(input.admission),
        },
      })
      await writeAddresses(tx, studentId, input.permanentAddress, input.temporaryAddress, input.sameAsPermanent)
      await audit(tx, ctx, {
        action: "student.update", entityType: "student", entityId: studentId,
        summary:
          admissionNumber !== existing.admissionNumber
            ? `Updated details; admission number ${existing.admissionNumber} → ${admissionNumber}`
            : "Updated student details",
      })
      return { id: student.id }
    })
    .catch((error) => {
      if (isUniqueViolation(error, "admission_number")) invalid("admission.admissionNumber", ADMISSION_TAKEN)
      throw error
    })
}

// ----------------------------------------------------------------- guardians

export async function addGuardian(ctx: Ctx, studentId: string, raw: unknown) {
  const entry = guardianEntrySchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const student = await findStudent(tx, ctx, studentId)
    if (student.archivedAt) throw new ConflictError("Restore this student before editing.")
    const guardianId = await linkGuardian(tx, ctx, studentId, entry, "guardian")
    await audit(tx, ctx, {
      action: "guardian.link", entityType: "student", entityId: studentId,
      summary: entry.guardianId ? "Linked an existing guardian" : `Added guardian ${entry.fullName}`,
      metadata: { guardianId },
    })
    return { guardianId }
  })
}

// Updates the guardian's own details (shared by siblings) and this link.
export async function updateGuardian(ctx: Ctx, studentId: string, guardianId: string, raw: unknown) {
  const input = updateGuardianSchema.parse(raw)
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const link = await tx.studentGuardian.findFirst({ where: { studentId, guardianId, organizationId } })
    if (!link) throw new NotFoundError("Guardian not found.")
    const { relationship, isPrimary, isEmergencyContact, receivesAcademicNotifications, receivesBillingNotifications, ...details } = input
    await tx.guardian.update({ where: { id: guardianId }, data: details })
    if (isPrimary && !link.isPrimary) {
      await tx.studentGuardian.updateMany({ where: { studentId, organizationId }, data: { isPrimary: false } })
    }
    await tx.studentGuardian.update({
      where: { studentId_guardianId: { studentId, guardianId } },
      data: { relationship, isPrimary, isEmergencyContact, receivesAcademicNotifications, receivesBillingNotifications },
    })
    await audit(tx, ctx, {
      action: "guardian.update", entityType: "student", entityId: studentId,
      summary: `Updated guardian ${details.fullName}`, metadata: { guardianId },
    })
  })
}

// Removes the link only. The guardian profile is kept (with any account,
// invitations and history); unlinked guardians can be archived or deleted
// from the guardians module.
export async function unlinkGuardian(ctx: Ctx, studentId: string, guardianId: string) {
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const link = await tx.studentGuardian.findFirst({
      where: { studentId, guardianId, organizationId },
      include: { guardian: { select: { fullName: true } } },
    })
    if (!link) throw new NotFoundError("Guardian not found.")
    await tx.studentGuardian.delete({ where: { studentId_guardianId: { studentId, guardianId } } })
    await audit(tx, ctx, {
      action: "guardian.unlink", entityType: "student", entityId: studentId,
      summary: `Removed guardian ${link.guardian.fullName}`, metadata: { guardianId },
    })
  })
}

// Guardian search for "link existing guardian" (siblings).
export async function searchGuardians(ctx: Ctx, query: string) {
  const q = query.trim().slice(0, 60)
  if (q.length < 2) return []
  const rows = await prisma.guardian.findMany({
    where: {
      organizationId: ctx.organization.id,
      OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
    },
    take: 8,
    orderBy: { fullName: "asc" },
    select: {
      id: true, fullName: true, phone: true, email: true,
      students: {
        take: 3,
        select: { student: { select: { firstName: true, lastName: true } } },
      },
    },
  })
  return rows.map((g) => ({
    id: g.id,
    fullName: g.fullName,
    phone: g.phone,
    email: g.email,
    children: g.students.map((s) => `${s.student.firstName} ${s.student.lastName}`),
  }))
}

// ------------------------------------------------------- lifecycle and archive

async function applyStatus(
  tx: TransactionClient,
  ctx: Ctx,
  student: { id: string; status: StudentStatus; firstName: string; lastName: string },
  status: StudentStatus,
  reason: string | null
) {
  const organizationId = ctx.organization.id
  await tx.student.update({ where: { id: student.id }, data: { status } })
  // Leaving closes open placements; readmission needs a new enrollment.
  const closeAs = ENROLLMENT_STATUS_ON_EXIT[status]
  if (closeAs) {
    await tx.enrollment.updateMany({
      where: { organizationId, studentId: student.id, status: { in: [...OPEN_ENROLLMENT_STATUSES] } },
      data: { status: closeAs, endedOn: toDate(new Date().toISOString().slice(0, 10)), statusReason: reason },
    })
  }
  await tx.studentStatusHistory.create({
    data: {
      organizationId, studentId: student.id, action: "STATUS_CHANGED",
      fromStatus: student.status, toStatus: status, reason, changedById: ctx.user.id,
    },
  })
  await audit(tx, ctx, {
    action: "student.status", entityType: "student", entityId: student.id,
    summary: `Status changed from ${STUDENT_STATUS_LABELS[student.status]} to ${STUDENT_STATUS_LABELS[status]}`,
    metadata: { reason },
  })
}

export async function changeStudentStatus(ctx: Ctx, studentId: string, raw: unknown) {
  const input = studentStatusSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const student = await findStudent(tx, ctx, studentId)
    if (student.archivedAt) throw new ConflictError("Restore this student first.")
    if (!canTransitionStudent(student.status, input.status)) {
      throw new ConflictError(
        `A ${STUDENT_STATUS_LABELS[student.status].toLowerCase()} student can't be changed to ${STUDENT_STATUS_LABELS[input.status].toLowerCase()}.`
      )
    }
    await applyStatus(tx, ctx, student, input.status, input.reason)
  })
}

export async function archiveStudent(ctx: Ctx, studentId: string, reason: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const student = await findStudent(tx, ctx, studentId)
    if (student.archivedAt) throw new ConflictError("This student is already archived.")
    await archiveRows(tx, ctx, [student], reason)
  })
}

export async function restoreStudent(ctx: Ctx, studentId: string) {
  return prisma.$transaction(async (tx) => {
    const student = await findStudent(tx, ctx, studentId)
    if (!student.archivedAt) throw new ConflictError("This student isn't archived.")
    await restoreRows(tx, ctx, [student])
  })
}

type Row = { id: string; firstName: string; lastName: string; status: StudentStatus }

async function archiveRows(tx: TransactionClient, ctx: Ctx, rows: Row[], reason: string | null) {
  const organizationId = ctx.organization.id
  const ids = rows.map((r) => r.id)
  // archivedAt: null in the filter makes a concurrent double-archive a no-op.
  await tx.student.updateMany({
    where: { id: { in: ids }, organizationId, archivedAt: null },
    data: { archivedAt: new Date(), archivedById: ctx.user.id },
  })
  await tx.studentStatusHistory.createMany({
    data: rows.map((r) => ({
      organizationId, studentId: r.id, action: "ARCHIVED" as const, reason, changedById: ctx.user.id,
    })),
  })
  await audit(
    tx,
    ctx,
    rows.map((r) => ({
      action: "student.archive", entityType: "student", entityId: r.id,
      summary: `Archived ${r.firstName} ${r.lastName}`,
    }))
  )
}

async function restoreRows(tx: TransactionClient, ctx: Ctx, rows: Row[]) {
  const organizationId = ctx.organization.id
  await tx.student.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, organizationId, archivedAt: { not: null } },
    data: { archivedAt: null, archivedById: null },
  })
  await tx.studentStatusHistory.createMany({
    data: rows.map((r) => ({
      organizationId, studentId: r.id, action: "RESTORED" as const, changedById: ctx.user.id,
    })),
  })
  await audit(
    tx,
    ctx,
    rows.map((r) => ({
      action: "student.restore", entityType: "student", entityId: r.id,
      summary: `Restored ${r.firstName} ${r.lastName}`,
    }))
  )
}

export type BulkResult = { succeeded: number; failed: { id: string; name?: string; reason: string }[] }

// Bulk operations re-check every ID against the caller's organisation; IDs
// that don't resolve are reported as failures, never acted on.
export async function bulkStudentAction(ctx: Ctx, raw: unknown): Promise<BulkResult> {
  const input = bulkActionSchema.parse(raw)
  const ids = [...new Set(input.ids)]
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.student.findMany({
        where: { id: { in: ids }, organizationId: ctx.organization.id },
        select: { id: true, firstName: true, lastName: true, status: true, archivedAt: true },
      })
      const found = new Set(rows.map((r) => r.id))
      const failed: BulkResult["failed"] = ids
        .filter((id) => !found.has(id))
        .map((id) => ({ id, reason: "Not found." }))

      if (input.action === "archive" || input.action === "restore") {
        const archiving = input.action === "archive"
        const eligible = rows.filter((r) => (archiving ? !r.archivedAt : r.archivedAt))
        for (const r of rows) {
          if (!eligible.includes(r)) {
            failed.push({
              id: r.id, name: `${r.firstName} ${r.lastName}`,
              reason: archiving ? "Already archived." : "Not archived.",
            })
          }
        }
        if (eligible.length) {
          if (archiving) await archiveRows(tx, ctx, eligible, null)
          else await restoreRows(tx, ctx, eligible)
        }
        return { succeeded: eligible.length, failed }
      }

      let succeeded = 0
      for (const r of rows) {
        const name = `${r.firstName} ${r.lastName}`
        if (r.archivedAt) {
          failed.push({ id: r.id, name, reason: "Archived; restore first." })
        } else if (r.status === input.status) {
          failed.push({ id: r.id, name, reason: `Already ${STUDENT_STATUS_LABELS[r.status].toLowerCase()}.` })
        } else if (!canTransitionStudent(r.status, input.status)) {
          failed.push({
            id: r.id, name,
            reason: `Can't change from ${STUDENT_STATUS_LABELS[r.status].toLowerCase()}.`,
          })
        } else {
          await applyStatus(tx, ctx, r, input.status, input.reason)
          succeeded++
        }
      }
      return { succeeded, failed }
    },
    { timeout: 30_000 }
  )
}

// ------------------------------------------------------------------ delete

// Permanent deletion is for records created by mistake: the student must be
// archived first and have no academic history beyond one enrollment that is
// still open or was cancelled. Anything else must stay archived. Future
// modules (attendance, exams, fees) should add their own checks here.
export async function getDeletionBlockers(db: TransactionClient | typeof prisma, ctx: Ctx, studentId: string) {
  const student = await findStudent(db, ctx, studentId)
  const blockers: string[] = []
  if (!student.archivedAt) blockers.push("Archive the student first.")
  const enrollments = await db.enrollment.findMany({
    where: { studentId, organizationId: ctx.organization.id },
    select: { status: true },
  })
  const historical = enrollments.filter((e) => !["ACTIVE", "ON_HOLD", "CANCELLED"].includes(e.status))
  if (enrollments.length > 1 || historical.length > 0) {
    blockers.push("The student has academic history (promotions, completions or transfers).")
  }
  return { student, blockers }
}

export async function deleteStudent(ctx: Ctx, studentId: string) {
  const organizationId = ctx.organization.id
  const storagePaths = await prisma.$transaction(async (tx) => {
    const { student, blockers } = await getDeletionBlockers(tx, ctx, studentId)
    if (blockers.length) throw new ConflictError(blockers.join(" "))

    const documents = await tx.studentDocument.findMany({
      where: { studentId, organizationId },
      select: { storagePath: true },
    })
    await tx.enrollment.deleteMany({ where: { studentId, organizationId } })
    // Addresses, guardian links, documents and status history cascade.
    // Guardian profiles are kept; they may have other children or history.
    await tx.student.deleteMany({ where: { id: studentId, organizationId } })
    await audit(tx, ctx, {
      action: "student.delete", entityType: "student", entityId: null,
      summary: `Permanently deleted ${fullName(student)} (${student.admissionNumber})`,
      metadata: { studentId },
    })
    return [
      ...documents.map((d) => d.storagePath),
      ...(student.profileImagePath ? [student.profileImagePath] : []),
    ]
  })
  // Files go only after the database change has committed.
  await removeFiles(storagePaths)
}

// ------------------------------------------------------------------ profile

export async function getStudentProfile(ctx: Ctx, studentId: string) {
  await assertCanViewStudent(ctx, studentId)
  const student = await prisma.student.findFirst({
    where: { id: studentId, organizationId: ctx.organization.id },
    include: {
      addresses: true,
      guardians: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: {
          guardian: {
            include: { _count: { select: { students: true } } },
          },
        },
      },
      enrollments: {
        orderBy: [{ enrollmentDate: "desc" }, { createdAt: "desc" }],
        include: {
          academicYear: { select: { id: true, name: true, status: true } },
          educationLevel: { select: { id: true, name: true } },
          program: { select: { id: true, name: true, code: true } },
          class: { select: { id: true, name: true, sequence: true } },
          section: { select: { id: true, name: true } },
          batch: { select: { id: true, name: true } },
        },
      },
      statusHistory: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  })
  if (!student) throw new NotFoundError("Student not found.")
  const { medicalNotes, disabilityType, entranceScore, ...rest } = student
  const sensitive = hasPermission(ctx, "students.sensitive.view")
  return {
    ...rest,
    // Restricted fields: dropped unless the role may read them.
    medicalNotes: sensitive ? medicalNotes : undefined,
    disabilityType: sensitive ? disabilityType : undefined,
    // Plain number (a Prisma Decimal can't be passed to client components).
    entranceScore: entranceScore === null ? null : Number(entranceScore),
  }
}

export type StudentProfile = Awaited<ReturnType<typeof getStudentProfile>>
