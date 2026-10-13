import "server-only"

import { yesNoToBoolean } from "@/features/students/schemas"
import {
  EMPLOYMENT_STATUS_LABELS,
  LEFT_STATUSES,
  teacherName,
} from "@/features/teachers/constants"
import {
  certificationSchema,
  createTeacherSchema,
  employmentChangeSchema,
  linkUserSchema,
  qualificationSchema,
  teacherBulkSchema,
  updateTeacherSchema,
  verificationSchema,
} from "@/features/teachers/schemas"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { AddressType } from "@/lib/generated/prisma/enums"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { removeFiles } from "@/lib/supabase/storage"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"
import {
  EMPLOYEE_ID_CONSTRAINTS,
  EMPLOYEE_ID_TAKEN,
  isEmployeeIdTaken,
  resolveEmployeeId,
} from "@/services/employees/employee-id"
import {
  createAssignmentInTx,
  endAllAssignments,
  translateAssignmentConflict,
} from "@/services/teachers/assignment-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma
type AddressValues = ReturnType<typeof updateTeacherSchema.parse>["permanentAddress"]
type EmploymentValues = ReturnType<typeof createTeacherSchema.parse>["employment"]

function invalid(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

const today = () => toDate(new Date().toISOString().slice(0, 10))

// ------------------------------------------------------------------ access

async function findTeacher(db: Db, ctx: Ctx, id: string) {
  const teacher = await db.teacher.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!teacher) throw new NotFoundError("Teacher not found.")
  return teacher
}

// What the viewer may see on a profile. Staff with teachers.view see the
// basic profile; a teacher always sees their own record in full (except
// verification controls). Unknown/foreign IDs are a 404 either way.
export async function teacherAccess(ctx: Ctx, teacherId: string) {
  const teacher = await prisma.teacher.findFirst({
    where: { id: teacherId, organizationId: ctx.organization.id },
    select: { id: true, userId: true, departmentId: true },
  })
  const isSelf = Boolean(teacher?.userId && teacher.userId === ctx.user.id)
  if (!teacher || (!isSelf && !hasPermission(ctx, "teachers.view"))) throw new NotFoundError("Teacher not found.")
  return {
    teacher,
    isSelf,
    sensitive: isSelf || hasPermission(ctx, "teachers.sensitive.view"),
    employment: isSelf || hasPermission(ctx, "teachers.employment.view"),
    documents: isSelf || hasPermission(ctx, "teachers.documents.view"),
  }
}

// ------------------------------------------------------------- employee IDs

// Employee IDs are shared with non-teaching staff (see employee-id.ts).
export async function checkEmployeeId(ctx: Ctx, employeeId: string, excludeId?: string) {
  return { available: !(await isEmployeeIdTaken(ctx.organization.id, employeeId, { teacherId: excludeId })) }
}

// ------------------------------------------------------------------ helpers

function addressData(a: AddressValues) {
  return {
    province: a.province, district: a.district, municipality: a.municipality,
    wardNumber: a.wardNumber, tole: a.tole, street: a.street, postalCode: a.postalCode,
  }
}

async function writeAddresses(tx: TransactionClient, teacherId: string, permanent: AddressValues, temporary: AddressValues, same: boolean) {
  const entries: [AddressType, AddressValues][] = [["PERMANENT", permanent], ["TEMPORARY", same ? permanent : temporary]]
  for (const [type, address] of entries) {
    const data = addressData(address)
    if (Object.values(data).every((v) => v === null)) {
      await tx.teacherAddress.deleteMany({ where: { teacherId, type } })
    } else {
      await tx.teacherAddress.upsert({
        where: { teacherId_type: { teacherId, type } },
        create: { teacherId, type, ...data },
        update: data,
      })
    }
  }
}

// Designation, department and manager must belong to this organisation.
async function checkEmploymentRefs(tx: TransactionClient, ctx: Ctx, input: EmploymentValues, teacherId?: string, prefix = "employment.") {
  const organizationId = ctx.organization.id
  const [designation, department] = await Promise.all([
    input.designationId ? tx.designation.findFirst({ where: { id: input.designationId, organizationId, scope: { not: "NON_TEACHING" } } }) : null,
    input.departmentId ? tx.faculty.findFirst({ where: { id: input.departmentId, organizationId } }) : null,
  ])
  if (input.designationId && !designation) invalid(`${prefix}designationId`, "Choose a valid designation.")
  if (input.departmentId && !department) invalid(`${prefix}departmentId`, "Choose a valid department.")
  if (input.reportingToId) {
    if (input.reportingToId === teacherId) invalid(`${prefix}reportingToId`, "A teacher can't report to themselves.")
    const manager = await tx.teacher.findFirst({ where: { id: input.reportingToId, organizationId }, select: { id: true } })
    if (!manager) invalid(`${prefix}reportingToId`, "Choose a valid manager.")
  }
  return { designationName: designation?.name ?? null, departmentName: department?.name ?? null }
}

function employmentData(input: EmploymentValues) {
  return {
    dateOfJoining: toDate(input.dateOfJoining),
    employmentType: input.employmentType,
    employmentStatus: input.employmentStatus,
    designationId: input.designationId,
    academicRank: input.academicRank,
    departmentId: input.departmentId,
    reportingToId: input.reportingToId,
    contractStartDate: toDate(input.contractStartDate),
    contractEndDate: toDate(input.contractEndDate),
    onProbation: input.onProbation,
    probationEndDate: input.onProbation ? toDate(input.probationEndDate) : null,
    employmentNotes: input.employmentNotes,
    fullTimeElsewhere: yesNoToBoolean(input.fullTimeElsewhere),
  }
}

// The login account must be a member of this same organisation, so a
// teacher profile can never be tied to someone outside it.
async function checkLinkableUser(tx: Db, ctx: Ctx, userId: string, teacherId?: string, field = "userId") {
  const member = await tx.organizationMember.findUnique({
    where: { userId_organizationId: { userId, organizationId: ctx.organization.id } },
    select: { id: true },
  })
  if (!member) invalid(field, "Choose a member of your organisation.")
  const linked = await tx.teacher.findFirst({
    where: { organizationId: ctx.organization.id, userId, ...(teacherId && { id: { not: teacherId } }) },
    select: { id: true },
  })
  if (linked) invalid(field, "This account is already linked to another teacher.")
}

// ------------------------------------------------------------------ create

export async function createTeacher(ctx: Ctx, raw: unknown) {
  const input = createTeacherSchema.parse(raw)
  const organizationId = ctx.organization.id
  if (input.assignments.length && !hasPermission(ctx, "teachers.assignments.manage")) {
    throw new ForbiddenError("You don't have permission to create teaching assignments.")
  }
  const employeeId = await resolveEmployeeId(organizationId, input.employeeId)

  return prisma
    .$transaction(async (tx) => {
      const refs = await checkEmploymentRefs(tx, ctx, input.employment)
      if (input.userId) await checkLinkableUser(tx, ctx, input.userId)

      const teacher = await tx.teacher.create({
        data: {
          organizationId,
          employeeId,
          userId: input.userId,
          ...input.personal,
          dateOfBirth: toDate(input.personal.dateOfBirth),
          ...input.contact,
          ...employmentData(input.employment),
          createdById: ctx.user.id,
        },
      })
      await writeAddresses(tx, teacher.id, input.permanentAddress, input.temporaryAddress, input.sameAsPermanent)
      await tx.teacherEmploymentRecord.create({
        data: {
          organizationId, teacherId: teacher.id, effectiveDate: teacher.dateOfJoining,
          employmentType: teacher.employmentType, employmentStatus: teacher.employmentStatus,
          academicRank: teacher.academicRank, ...refs, contractStartDate: teacher.contractStartDate, contractEndDate: teacher.contractEndDate,
          onProbation: teacher.onProbation, note: "Joined", changedById: ctx.user.id,
        },
      })
      if (input.qualifications.length) {
        await tx.teacherQualification.createMany({
          data: input.qualifications.map((q) => ({ ...q, organizationId, teacherId: teacher.id })),
        })
      }
      if (input.certifications.length) {
        await tx.teacherCertification.createMany({
          data: input.certifications.map((c) => ({
            ...c, issueDate: toDate(c.issueDate), expiryDate: toDate(c.expiryDate), organizationId, teacherId: teacher.id,
          })),
        })
      }
      for (const [i, assignment] of input.assignments.entries()) {
        await createAssignmentInTx(tx, ctx, teacher, assignment, `assignments.${i}.`)
      }
      await audit(tx, ctx, {
        action: "teacher.create", entityType: "teacher", entityId: teacher.id,
        summary: `Added ${teacherName(teacher)} (${employeeId})`,
        metadata: {
          qualifications: input.qualifications.length,
          certifications: input.certifications.length,
          assignments: input.assignments.length,
          linkedUser: Boolean(input.userId),
        },
      })
      return { id: teacher.id, employeeId }
    })
    .catch((error) => {
      if (isUniqueViolation(error, ...EMPLOYEE_ID_CONSTRAINTS)) invalid("employeeId", EMPLOYEE_ID_TAKEN)
      if (isUniqueViolation(error, "user_id")) invalid("userId", "This account is already linked to another teacher.")
      return translateAssignmentConflict(error)
    })
}

// ------------------------------------------------------------------ update

export async function updateTeacher(ctx: Ctx, teacherId: string, raw: unknown) {
  const input = updateTeacherSchema.parse(raw)
  const organizationId = ctx.organization.id
  const existing = await findTeacher(prisma, ctx, teacherId)
  if (existing.archivedAt) throw new ConflictError("Restore this teacher before editing.")
  const employeeId =
    input.employeeId && input.employeeId !== existing.employeeId
      ? await resolveEmployeeId(organizationId, input.employeeId, { teacherId })
      : existing.employeeId
  // Sensitive fields are only written by roles that can read them.
  const sensitive = hasPermission(ctx, "teachers.sensitive.view")

  return prisma
    .$transaction(async (tx) => {
      await tx.teacher.update({
        where: { id: existing.id },
        data: {
          employeeId,
          firstName: input.personal.firstName,
          middleName: input.personal.middleName,
          lastName: input.personal.lastName,
          nameNepali: input.personal.nameNepali,
          gender: input.personal.gender,
          nationality: input.personal.nationality,
          email: input.contact.email,
          phone: input.contact.phone,
          alternatePhone: input.contact.alternatePhone,
          ...(sensitive && {
            dateOfBirth: toDate(input.personal.dateOfBirth),
            emergencyContactName: input.contact.emergencyContactName,
            emergencyContactPhone: input.contact.emergencyContactPhone,
            emergencyContactRelationship: input.contact.emergencyContactRelationship,
          }),
        },
      })
      if (sensitive) {
        await writeAddresses(tx, teacherId, input.permanentAddress, input.temporaryAddress, input.sameAsPermanent)
      }
      await audit(tx, ctx, {
        action: "teacher.update", entityType: "teacher", entityId: teacherId,
        summary:
          employeeId !== existing.employeeId
            ? `Updated details; employee ID ${existing.employeeId} → ${employeeId}`
            : "Updated teacher details",
      })
      return { id: teacherId }
    })
    .catch((error) => {
      if (isUniqueViolation(error, ...EMPLOYEE_ID_CONSTRAINTS)) invalid("employeeId", EMPLOYEE_ID_TAKEN)
      throw error
    })
}

// Employment changes update the current record and append a history row.
// Leaving (resigned, retired, …) ends the teacher's active assignments.
export async function changeEmployment(ctx: Ctx, teacherId: string, raw: unknown) {
  const input = employmentChangeSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const existing = await findTeacher(tx, ctx, teacherId)
    if (existing.archivedAt) throw new ConflictError("Restore this teacher before changing employment.")
    const refs = await checkEmploymentRefs(tx, ctx, input, teacherId, "")
    const updated = await tx.teacher.update({ where: { id: teacherId }, data: employmentData(input) })
    await tx.teacherEmploymentRecord.create({
      data: {
        organizationId: ctx.organization.id, teacherId, effectiveDate: toDate(input.effectiveDate),
        employmentType: updated.employmentType, employmentStatus: updated.employmentStatus, academicRank: updated.academicRank, ...refs,
        contractStartDate: updated.contractStartDate, contractEndDate: updated.contractEndDate,
        onProbation: updated.onProbation, note: input.changeNote, changedById: ctx.user.id,
      },
    })
    let ended = 0
    const leaving = LEFT_STATUSES.includes(updated.employmentStatus) && !LEFT_STATUSES.includes(existing.employmentStatus)
    if (leaving) {
      ended = await endAllAssignments(tx, ctx, teacherId, toDate(input.effectiveDate), EMPLOYMENT_STATUS_LABELS[updated.employmentStatus])
    }
    await audit(tx, ctx, {
      action: "teacher.employment", entityType: "teacher", entityId: teacherId,
      summary:
        existing.employmentStatus !== updated.employmentStatus
          ? `Employment status ${EMPLOYMENT_STATUS_LABELS[existing.employmentStatus]} → ${EMPLOYMENT_STATUS_LABELS[updated.employmentStatus]}${ended ? `; ended ${ended} assignment(s)` : ""}`
          : "Updated employment details",
      metadata: { note: input.changeNote, endedAssignments: ended },
    })
    return { endedAssignments: ended }
  })
}

export async function linkUser(ctx: Ctx, teacherId: string, raw: unknown) {
  const { userId } = linkUserSchema.parse(raw)
  return prisma
    .$transaction(async (tx) => {
      const teacher = await findTeacher(tx, ctx, teacherId)
      if (userId) await checkLinkableUser(tx, ctx, userId, teacherId)
      await tx.teacher.update({ where: { id: teacher.id }, data: { userId } })
      await audit(tx, ctx, {
        action: userId ? "teacher.link_user" : "teacher.unlink_user", entityType: "teacher", entityId: teacherId,
        summary: userId ? "Linked a login account" : "Unlinked the login account",
        metadata: { userId, previousUserId: teacher.userId },
      })
    })
    .catch((error) => {
      if (isUniqueViolation(error, "user_id")) invalid("userId", "This account is already linked to another teacher.")
      throw error
    })
}

// Organisation members who could be linked (not yet linked to another teacher).
export async function listLinkableUsers(ctx: Ctx, teacherId?: string) {
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId: ctx.organization.id,
      user: { teacherProfiles: { none: { organizationId: ctx.organization.id, ...(teacherId && { id: { not: teacherId } }) } } },
    },
    orderBy: { user: { name: "asc" } },
    take: 200,
    select: { user: { select: { id: true, name: true, email: true } }, role: { select: { name: true } } },
  })
  return members.map((m) => ({ id: m.user.id, name: m.user.name ?? m.user.email, email: m.user.email, role: m.role.name }))
}

// ------------------------------------------------ qualifications & certifications

async function editableTeacher(tx: Db, ctx: Ctx, teacherId: string) {
  const teacher = await findTeacher(tx, ctx, teacherId)
  if (teacher.archivedAt) throw new ConflictError("Restore this teacher before editing.")
  return teacher
}

// A linked document must be this teacher's own.
async function checkDocument(tx: Db, ctx: Ctx, teacherId: string, documentId: string | null | undefined) {
  if (!documentId) return null
  const doc = await tx.teacherDocument.findFirst({ where: { id: documentId, teacherId, organizationId: ctx.organization.id }, select: { id: true } })
  if (!doc) invalid("documentId", "Choose one of this teacher's documents.")
  return doc.id
}

export async function saveQualification(ctx: Ctx, teacherId: string, qualificationId: string | null, raw: unknown) {
  const { documentId, ...rest } = raw as { documentId?: string | null }
  const input = qualificationSchema.parse(rest)
  return prisma.$transaction(async (tx) => {
    await editableTeacher(tx, ctx, teacherId)
    const docId = await checkDocument(tx, ctx, teacherId, documentId)
    if (qualificationId) {
      const existing = await tx.teacherQualification.findFirst({ where: { id: qualificationId, teacherId, organizationId: ctx.organization.id } })
      if (!existing) throw new NotFoundError("Qualification not found.")
      // Changing a verified record sends it back for verification.
      await tx.teacherQualification.update({
        where: { id: qualificationId },
        data: { ...input, documentId: docId, verificationStatus: "PENDING", verifiedAt: null, verifiedById: null },
      })
    } else {
      await tx.teacherQualification.create({ data: { ...input, documentId: docId, organizationId: ctx.organization.id, teacherId } })
    }
    await audit(tx, ctx, {
      action: qualificationId ? "qualification.update" : "qualification.create", entityType: "teacher", entityId: teacherId,
      summary: `${qualificationId ? "Updated" : "Added"} qualification ${input.title}`,
    })
  })
}

export async function deleteQualification(ctx: Ctx, teacherId: string, qualificationId: string) {
  return prisma.$transaction(async (tx) => {
    await editableTeacher(tx, ctx, teacherId)
    const existing = await tx.teacherQualification.findFirst({ where: { id: qualificationId, teacherId, organizationId: ctx.organization.id } })
    if (!existing) throw new NotFoundError("Qualification not found.")
    await tx.teacherQualification.delete({ where: { id: qualificationId } })
    await audit(tx, ctx, { action: "qualification.delete", entityType: "teacher", entityId: teacherId, summary: `Removed qualification ${existing.title}` })
  })
}

export async function saveCertification(ctx: Ctx, teacherId: string, certificationId: string | null, raw: unknown) {
  const { documentId, ...rest } = raw as { documentId?: string | null }
  const input = certificationSchema.parse(rest)
  const data = { ...input, issueDate: toDate(input.issueDate), expiryDate: toDate(input.expiryDate) }
  return prisma.$transaction(async (tx) => {
    await editableTeacher(tx, ctx, teacherId)
    const docId = await checkDocument(tx, ctx, teacherId, documentId)
    if (certificationId) {
      const existing = await tx.teacherCertification.findFirst({ where: { id: certificationId, teacherId, organizationId: ctx.organization.id } })
      if (!existing) throw new NotFoundError("Certification not found.")
      await tx.teacherCertification.update({
        where: { id: certificationId },
        data: { ...data, documentId: docId, verificationStatus: "PENDING", verifiedAt: null, verifiedById: null },
      })
    } else {
      await tx.teacherCertification.create({ data: { ...data, documentId: docId, organizationId: ctx.organization.id, teacherId } })
    }
    await audit(tx, ctx, {
      action: certificationId ? "certification.update" : "certification.create", entityType: "teacher", entityId: teacherId,
      summary: `${certificationId ? "Updated" : "Added"} certification ${input.name}`,
    })
  })
}

export async function deleteCertification(ctx: Ctx, teacherId: string, certificationId: string) {
  return prisma.$transaction(async (tx) => {
    await editableTeacher(tx, ctx, teacherId)
    const existing = await tx.teacherCertification.findFirst({ where: { id: certificationId, teacherId, organizationId: ctx.organization.id } })
    if (!existing) throw new NotFoundError("Certification not found.")
    await tx.teacherCertification.delete({ where: { id: certificationId } })
    await audit(tx, ctx, { action: "certification.delete", entityType: "teacher", entityId: teacherId, summary: `Removed certification ${existing.name}` })
  })
}

// Verification of qualifications, certifications and documents. Nobody
// verifies their own records.
export async function verifyRecord(
  ctx: Ctx,
  teacherId: string,
  kind: "qualification" | "certification" | "document",
  recordId: string,
  raw: unknown
) {
  const { status } = verificationSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const teacher = await findTeacher(tx, ctx, teacherId)
    if (teacher.userId === ctx.user.id) throw new ForbiddenError("You can't verify your own records.")
    const where = { id: recordId, teacherId, organizationId: ctx.organization.id }
    const data = {
      verificationStatus: status,
      verifiedAt: status === "PENDING" ? null : new Date(),
      verifiedById: status === "PENDING" ? null : ctx.user.id,
    }
    const { count } =
      kind === "qualification"
        ? await tx.teacherQualification.updateMany({ where, data })
        : kind === "certification"
          ? await tx.teacherCertification.updateMany({ where, data })
          : await tx.teacherDocument.updateMany({ where, data })
    if (count === 0) throw new NotFoundError("Record not found.")
    await audit(tx, ctx, {
      action: `${kind}.verify`, entityType: "teacher", entityId: teacherId,
      summary: `Marked a ${kind} as ${status.toLowerCase()}`, metadata: { recordId, status },
    })
  })
}

// ------------------------------------------------------- archive & delete

type Row = { id: string; firstName: string; lastName: string }

// Archiving hides a profile; employment status (resigned, …) is unchanged.
// Active assignments end so class rosters never point at archived teachers.
async function archiveRows(tx: TransactionClient, ctx: Ctx, rows: Row[]) {
  for (const r of rows) await endAllAssignments(tx, ctx, r.id, today(), "Teacher archived")
  await tx.teacher.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, organizationId: ctx.organization.id, archivedAt: null },
    data: { archivedAt: new Date(), archivedById: ctx.user.id },
  })
  await audit(tx, ctx, rows.map((r) => ({
    action: "teacher.archive", entityType: "teacher", entityId: r.id, summary: `Archived ${teacherName(r)}`,
  })))
}

async function restoreRows(tx: TransactionClient, ctx: Ctx, rows: Row[]) {
  await tx.teacher.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, organizationId: ctx.organization.id, archivedAt: { not: null } },
    data: { archivedAt: null, archivedById: null },
  })
  await audit(tx, ctx, rows.map((r) => ({
    action: "teacher.restore", entityType: "teacher", entityId: r.id, summary: `Restored ${teacherName(r)}`,
  })))
}

export async function archiveTeacher(ctx: Ctx, teacherId: string) {
  return prisma.$transaction(async (tx) => {
    const teacher = await findTeacher(tx, ctx, teacherId)
    if (teacher.archivedAt) throw new ConflictError("This teacher is already archived.")
    await archiveRows(tx, ctx, [teacher])
  })
}

export async function restoreTeacher(ctx: Ctx, teacherId: string) {
  return prisma.$transaction(async (tx) => {
    const teacher = await findTeacher(tx, ctx, teacherId)
    if (!teacher.archivedAt) throw new ConflictError("This teacher isn't archived.")
    await restoreRows(tx, ctx, [teacher])
  })
}

export type TeacherBulkResult = { succeeded: number; failed: { id: string; name?: string; reason: string }[] }

// Every ID is re-resolved inside the caller's organisation; others fail.
export async function bulkTeacherAction(ctx: Ctx, raw: unknown): Promise<TeacherBulkResult> {
  const input = teacherBulkSchema.parse(raw)
  const ids = [...new Set(input.ids)]
  return prisma.$transaction(async (tx) => {
    const rows = await tx.teacher.findMany({
      where: { id: { in: ids }, organizationId: ctx.organization.id },
      select: { id: true, firstName: true, lastName: true, archivedAt: true },
    })
    const found = new Set(rows.map((r) => r.id))
    const failed: TeacherBulkResult["failed"] = ids.filter((id) => !found.has(id)).map((id) => ({ id, reason: "Not found." }))
    const archiving = input.action === "archive"
    const eligible = rows.filter((r) => (archiving ? !r.archivedAt : r.archivedAt))
    for (const r of rows) {
      if (!eligible.includes(r)) failed.push({ id: r.id, name: teacherName(r), reason: archiving ? "Already archived." : "Not archived." })
    }
    if (eligible.length) {
      if (archiving) await archiveRows(tx, ctx, eligible)
      else await restoreRows(tx, ctx, eligible)
    }
    return { succeeded: eligible.length, failed }
  })
}

// Permanent deletion is for profiles created by mistake: archived first, and
// no teaching history (only cancelled assignments). The linked login account
// is never touched. Future modules (attendance, exams) add checks here.
export async function getTeacherDeletionBlockers(db: Db, ctx: Ctx, teacherId: string) {
  const teacher = await findTeacher(db, ctx, teacherId)
  const blockers: string[] = []
  if (!teacher.archivedAt) blockers.push("Archive the teacher first.")
  const history = await db.teacherAssignment.count({
    where: { teacherId, organizationId: ctx.organization.id, status: { not: "CANCELLED" } },
  })
  if (history > 0) blockers.push("The teacher has teaching assignment history.")
  const reports = await db.teacher.count({ where: { reportingToId: teacherId } })
  if (reports > 0) blockers.push("Other teachers report to this teacher.")
  return { teacher, blockers }
}

export async function deleteTeacher(ctx: Ctx, teacherId: string) {
  const paths = await prisma.$transaction(async (tx) => {
    const { teacher, blockers } = await getTeacherDeletionBlockers(tx, ctx, teacherId)
    if (blockers.length) throw new ConflictError(blockers.join(" "))
    const documents = await tx.teacherDocument.findMany({
      where: { teacherId, organizationId: ctx.organization.id },
      select: { storagePath: true },
    })
    await tx.teacherAssignment.deleteMany({ where: { teacherId, organizationId: ctx.organization.id } })
    // Addresses, history, qualifications, certifications and documents cascade.
    await tx.teacher.deleteMany({ where: { id: teacherId, organizationId: ctx.organization.id } })
    await audit(tx, ctx, {
      action: "teacher.delete", entityType: "teacher", entityId: null,
      summary: `Permanently deleted ${teacherName(teacher)} (${teacher.employeeId})`, metadata: { teacherId },
    })
    return [...documents.map((d) => d.storagePath), ...(teacher.profileImagePath ? [teacher.profileImagePath] : [])]
  })
  // Files go only after the database change has committed.
  await removeFiles(paths)
}

// ------------------------------------------------------------------ profile

export async function getTeacherProfile(ctx: Ctx, teacherId: string) {
  const access = await teacherAccess(ctx, teacherId)
  const teacher = await prisma.teacher.findFirst({
    where: { id: teacherId, organizationId: ctx.organization.id },
    include: {
      designation: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      reportingTo: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      user: { select: { id: true, name: true, email: true } },
      addresses: true,
      qualifications: {
        orderBy: [{ completionYear: "desc" }, { createdAt: "desc" }],
        include: { document: { select: { id: true, title: true } } },
      },
      certifications: {
        orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
        include: { document: { select: { id: true, title: true } } },
      },
      employmentRecords: { orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }] },
      assignments: {
        orderBy: [{ status: "asc" }, { startDate: "desc" }],
        include: {
          academicYear: { select: { id: true, name: true, isCurrent: true } },
          educationLevel: { select: { id: true, name: true } },
          program: { select: { id: true, name: true, code: true } },
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, code: true } },
          batch: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!teacher) throw new NotFoundError("Teacher not found.")

  // Field-level restrictions: removed on the server, not just hidden in the UI.
  const {
    dateOfBirth, addresses, emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
    contractStartDate, contractEndDate, onProbation, probationEndDate, employmentNotes, employmentRecords, reportingTo, fullTimeElsewhere,
    ...rest
  } = teacher
  return {
    ...rest,
    access,
    sensitive: access.sensitive
      ? { dateOfBirth, addresses, emergencyContactName, emergencyContactPhone, emergencyContactRelationship }
      : null,
    employment: access.employment
      ? { contractStartDate, contractEndDate, onProbation, probationEndDate, employmentNotes, employmentRecords, reportingTo, fullTimeElsewhere }
      : null,
  }
}

export type TeacherProfile = Awaited<ReturnType<typeof getTeacherProfile>>

