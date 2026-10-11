import "server-only"

import {
  STAFF_EMPLOYMENT_STATUS_LABELS,
  STAFF_LEFT_STATUSES,
  staffName,
} from "@/features/staff/constants"
import {
  createStaffSchema,
  endStaffAssignmentSchema,
  staffAssignmentSchema,
  staffBulkSchema,
  staffEmploymentChangeSchema,
  staffLinkUserSchema,
  staffQualificationSchema,
  staffVerificationSchema,
  updateStaffSchema,
} from "@/features/staff/schemas"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { AddressType } from "@/lib/generated/prisma/enums"
import type { Prisma } from "@/lib/generated/prisma/client"
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

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma
type AddressValues = ReturnType<typeof updateStaffSchema.parse>["permanentAddress"]
type EmploymentValues = ReturnType<typeof createStaffSchema.parse>["employment"]

function invalid(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

const today = () => toDate(new Date().toISOString().slice(0, 10))
const ACCOUNT_LINKED = "This account is already linked to another staff profile."

// ------------------------------------------------------------------ access

async function findStaff(db: Db, ctx: Ctx, id: string) {
  const staff = await db.staff.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!staff) throw new NotFoundError("Staff member not found.")
  return staff
}

// The department of the viewer's own staff profile (for staff.view_department).
async function ownDepartmentId(ctx: Ctx) {
  const own = await prisma.staff.findFirst({
    where: { organizationId: ctx.organization.id, userId: ctx.user.id, archivedAt: null },
    select: { departmentId: true },
  })
  return own?.departmentId ?? null
}

// Which staff records the viewer may list: everyone (staff.view), their own
// department (staff.view_department), or none. Self-access is per profile.
export async function staffListScope(ctx: Ctx): Promise<Prisma.StaffWhereInput | null> {
  if (hasPermission(ctx, "staff.view")) return {}
  if (hasPermission(ctx, "staff.view_department")) {
    const departmentId = await ownDepartmentId(ctx)
    return departmentId ? { departmentId } : null
  }
  return null
}

// What the viewer may see on a profile. Unknown, foreign and out-of-scope
// IDs are all a 404, so record IDs can't be probed.
export async function staffAccess(ctx: Ctx, staffId: string) {
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, organizationId: ctx.organization.id },
    select: { id: true, userId: true, departmentId: true },
  })
  const isSelf = Boolean(staff?.userId && staff.userId === ctx.user.id)
  let listed = Boolean(staff) && hasPermission(ctx, "staff.view")
  if (staff && !listed && hasPermission(ctx, "staff.view_department")) {
    const departmentId = await ownDepartmentId(ctx)
    listed = Boolean(departmentId && departmentId === staff.departmentId)
  }
  if (!staff || (!isSelf && !listed)) throw new NotFoundError("Staff member not found.")
  return {
    staff,
    isSelf,
    sensitive: isSelf || hasPermission(ctx, "staff.sensitive.view"),
    employment: isSelf || hasPermission(ctx, "staff.employment.view"),
    // Private HR fields (notes, reason for leaving) are never shown to the
    // staff member themselves.
    restricted: hasPermission(ctx, "staff.employment.view"),
    documents: isSelf || hasPermission(ctx, "staff.documents.view"),
  }
}

export async function checkStaffEmployeeId(ctx: Ctx, employeeId: string, excludeId?: string) {
  return { available: !(await isEmployeeIdTaken(ctx.organization.id, employeeId, { staffId: excludeId })) }
}

// ------------------------------------------------------------------ helpers

function addressData(a: AddressValues) {
  return {
    province: a.province, district: a.district, municipality: a.municipality,
    wardNumber: a.wardNumber, tole: a.tole, street: a.street, postalCode: a.postalCode,
  }
}

async function writeAddresses(tx: TransactionClient, staffId: string, permanent: AddressValues, temporary: AddressValues, same: boolean) {
  const entries: [AddressType, AddressValues][] = [["PERMANENT", permanent], ["TEMPORARY", same ? permanent : temporary]]
  for (const [type, address] of entries) {
    const data = addressData(address)
    if (Object.values(data).every((v) => v === null)) {
      await tx.staffAddress.deleteMany({ where: { staffId, type } })
    } else {
      await tx.staffAddress.upsert({
        where: { staffId_type: { staffId, type } },
        create: { staffId, type, ...data },
        update: data,
      })
    }
  }
}

// Designation, department and manager must belong to this organisation. New
// choices must be active; an unchanged inactive one may stay. Designations
// limited to teachers can't be given to staff.
async function checkEmploymentRefs(
  tx: TransactionClient,
  ctx: Ctx,
  input: EmploymentValues,
  current: { id: string; designationId: string | null; departmentId: string | null } | null,
  prefix = "employment."
) {
  const organizationId = ctx.organization.id
  const [designation, department] = await Promise.all([
    input.designationId ? tx.designation.findFirst({ where: { id: input.designationId, organizationId } }) : null,
    input.departmentId ? tx.department.findFirst({ where: { id: input.departmentId, organizationId } }) : null,
  ])
  if (input.designationId) {
    if (!designation || designation.scope === "TEACHING") invalid(`${prefix}designationId`, "Choose a valid staff designation.")
    if (!designation.isActive && designation.id !== current?.designationId) invalid(`${prefix}designationId`, "This designation is inactive.")
  }
  if (input.departmentId) {
    if (!department) invalid(`${prefix}departmentId`, "Choose a valid department.")
    if (!department.isActive && department.id !== current?.departmentId) invalid(`${prefix}departmentId`, "This department is inactive.")
  }
  if (input.reportingToId) {
    if (input.reportingToId === current?.id) invalid(`${prefix}reportingToId`, "Someone can't report to themselves.")
    const manager = await tx.staff.findFirst({ where: { id: input.reportingToId, organizationId }, select: { id: true, reportingToId: true } })
    if (!manager) invalid(`${prefix}reportingToId`, "Choose a valid manager.")
    if (current && manager.reportingToId === current.id) invalid(`${prefix}reportingToId`, "That person already reports to this staff member.")
  }
  return { designationName: designation?.name ?? null, departmentName: department?.name ?? null }
}

function employmentData(input: EmploymentValues) {
  return {
    dateOfJoining: toDate(input.dateOfJoining),
    employmentType: input.employmentType,
    employmentStatus: input.employmentStatus,
    designationId: input.designationId,
    departmentId: input.departmentId,
    reportingToId: input.reportingToId,
    contractStartDate: toDate(input.contractStartDate),
    contractEndDate: toDate(input.contractEndDate),
    onProbation: input.onProbation,
    probationStartDate: input.onProbation ? toDate(input.probationStartDate) : null,
    probationEndDate: input.onProbation ? toDate(input.probationEndDate) : null,
    resignationDate: toDate(input.resignationDate),
    lastWorkingDate: toDate(input.lastWorkingDate),
    terminationDate: toDate(input.terminationDate),
    leavingReason: input.leavingReason,
    employmentNotes: input.employmentNotes,
  }
}

// The login account must be a member of this same organisation, so a staff
// profile can never be tied to someone outside it.
async function checkLinkableUser(tx: Db, ctx: Ctx, userId: string, staffId?: string, field = "userId") {
  const member = await tx.organizationMember.findUnique({
    where: { userId_organizationId: { userId, organizationId: ctx.organization.id } },
    select: { id: true },
  })
  if (!member) invalid(field, "Choose a member of your organisation.")
  const linked = await tx.staff.findFirst({
    where: { organizationId: ctx.organization.id, userId, ...(staffId && { id: { not: staffId } }) },
    select: { id: true },
  })
  if (linked) invalid(field, ACCOUNT_LINKED)
}

async function checkAssignmentDepartment(tx: Db, ctx: Ctx, departmentId: string | null, field = "departmentId") {
  if (!departmentId) return null
  const department = await tx.department.findFirst({ where: { id: departmentId, organizationId: ctx.organization.id } })
  if (!department) invalid(field, "Choose a valid department.")
  return department
}

function translateErrors(error: unknown): never {
  if (isUniqueViolation(error, ...EMPLOYEE_ID_CONSTRAINTS)) invalid("employeeId", EMPLOYEE_ID_TAKEN)
  if (isUniqueViolation(error, "user_id")) invalid("userId", ACCOUNT_LINKED)
  throw error
}

// ------------------------------------------------------------------ create

export async function createStaff(ctx: Ctx, raw: unknown) {
  const input = createStaffSchema.parse(raw)
  const organizationId = ctx.organization.id
  if (input.assignments.length && !hasPermission(ctx, "staff.assignments.manage")) {
    throw new ForbiddenError("You don't have permission to assign responsibilities.")
  }
  if (input.userId && !hasPermission(ctx, "members.view")) {
    throw new ForbiddenError("You don't have permission to link login accounts.")
  }
  // Restricted details are only written by roles that may read them.
  const sensitive = hasPermission(ctx, "staff.sensitive.view")
  const employeeId = await resolveEmployeeId(organizationId, input.employeeId)

  return prisma
    .$transaction(async (tx) => {
      const refs = await checkEmploymentRefs(tx, ctx, input.employment, null)
      if (input.userId) await checkLinkableUser(tx, ctx, input.userId)

      const staff = await tx.staff.create({
        data: {
          organizationId,
          employeeId,
          userId: input.userId,
          ...input.personal,
          dateOfBirth: sensitive ? toDate(input.personal.dateOfBirth) : null,
          email: input.contact.email,
          phone: input.contact.phone,
          alternatePhone: input.contact.alternatePhone,
          ...(sensitive && {
            emergencyContactName: input.contact.emergencyContactName,
            emergencyContactPhone: input.contact.emergencyContactPhone,
            emergencyContactRelationship: input.contact.emergencyContactRelationship,
          }),
          ...employmentData(input.employment),
          createdById: ctx.user.id,
        },
      })
      if (sensitive) await writeAddresses(tx, staff.id, input.permanentAddress, input.temporaryAddress, input.sameAsPermanent)
      await tx.staffEmploymentRecord.create({
        data: {
          organizationId, staffId: staff.id, effectiveDate: staff.dateOfJoining,
          employmentType: staff.employmentType, employmentStatus: staff.employmentStatus,
          ...refs, contractStartDate: staff.contractStartDate, contractEndDate: staff.contractEndDate,
          onProbation: staff.onProbation, note: "Joined", changedById: ctx.user.id,
        },
      })
      if (input.qualifications.length) {
        await tx.staffQualification.createMany({
          data: input.qualifications.map((q) => ({ ...q, expiryDate: toDate(q.expiryDate), organizationId, staffId: staff.id })),
        })
      }
      for (const [i, a] of input.assignments.entries()) {
        await checkAssignmentDepartment(tx, ctx, a.departmentId, `assignments.${i}.departmentId`)
        await tx.staffAssignment.create({
          data: {
            organizationId, staffId: staff.id, title: a.title, departmentId: a.departmentId,
            startDate: toDate(a.startDate), notes: a.notes, assignedById: ctx.user.id,
          },
        })
      }
      await audit(tx, ctx, {
        action: "staff.create", entityType: "staff", entityId: staff.id,
        summary: `Added ${staffName(staff)} (${employeeId})`,
        metadata: {
          qualifications: input.qualifications.length,
          responsibilities: input.assignments.length,
          linkedUser: Boolean(input.userId),
        },
      })
      return { id: staff.id, employeeId }
    })
    .catch(translateErrors)
}

// ------------------------------------------------------------------ update

export async function updateStaff(ctx: Ctx, staffId: string, raw: unknown) {
  const input = updateStaffSchema.parse(raw)
  const organizationId = ctx.organization.id
  const existing = await findStaff(prisma, ctx, staffId)
  if (existing.archivedAt) throw new ConflictError("Restore this staff member before editing.")
  const employeeId =
    input.employeeId && input.employeeId !== existing.employeeId
      ? await resolveEmployeeId(organizationId, input.employeeId, { staffId })
      : existing.employeeId
  const sensitive = hasPermission(ctx, "staff.sensitive.view")

  return prisma
    .$transaction(async (tx) => {
      await tx.staff.update({
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
      if (sensitive) await writeAddresses(tx, staffId, input.permanentAddress, input.temporaryAddress, input.sameAsPermanent)
      await audit(tx, ctx, {
        action: "staff.update", entityType: "staff", entityId: staffId,
        summary:
          employeeId !== existing.employeeId
            ? `Updated details; employee ID ${existing.employeeId} → ${employeeId}`
            : "Updated staff details",
      })
      return { id: staffId }
    })
    .catch(translateErrors)
}

// Updates the current employment and appends a history row. Leaving
// (resigned, terminated, …) ends active responsibilities.
export async function changeStaffEmployment(ctx: Ctx, staffId: string, raw: unknown) {
  const input = staffEmploymentChangeSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const existing = await findStaff(tx, ctx, staffId)
    if (existing.archivedAt) throw new ConflictError("Restore this staff member before changing employment.")
    const refs = await checkEmploymentRefs(tx, ctx, input, existing, "")
    const updated = await tx.staff.update({ where: { id: staffId }, data: employmentData(input) })
    await tx.staffEmploymentRecord.create({
      data: {
        organizationId: ctx.organization.id, staffId, effectiveDate: toDate(input.effectiveDate),
        employmentType: updated.employmentType, employmentStatus: updated.employmentStatus, ...refs,
        contractStartDate: updated.contractStartDate, contractEndDate: updated.contractEndDate,
        onProbation: updated.onProbation, note: input.changeNote, changedById: ctx.user.id,
      },
    })
    let ended = 0
    const leaving = STAFF_LEFT_STATUSES.includes(updated.employmentStatus) && !STAFF_LEFT_STATUSES.includes(existing.employmentStatus)
    if (leaving) {
      ended = await endActiveAssignments(tx, ctx, staffId, toDate(input.lastWorkingDate ?? input.effectiveDate), STAFF_EMPLOYMENT_STATUS_LABELS[updated.employmentStatus])
    }
    const changes = [
      existing.employmentStatus !== updated.employmentStatus &&
        `status ${STAFF_EMPLOYMENT_STATUS_LABELS[existing.employmentStatus]} → ${STAFF_EMPLOYMENT_STATUS_LABELS[updated.employmentStatus]}`,
      existing.departmentId !== updated.departmentId && `department → ${refs.departmentName ?? "none"}`,
      existing.designationId !== updated.designationId && `designation → ${refs.designationName ?? "none"}`,
      existing.contractEndDate?.getTime() !== updated.contractEndDate?.getTime() && "contract dates",
    ].filter(Boolean)
    await audit(tx, ctx, {
      action: "staff.employment", entityType: "staff", entityId: staffId,
      summary: `Employment updated${changes.length ? `: ${changes.join(", ")}` : ""}${ended ? `; ended ${ended} responsibility(ies)` : ""}`,
      metadata: { note: input.changeNote, endedAssignments: ended },
    })
    return { endedAssignments: ended }
  })
}

export async function linkStaffUser(ctx: Ctx, staffId: string, raw: unknown) {
  const { userId } = staffLinkUserSchema.parse(raw)
  return prisma
    .$transaction(async (tx) => {
      const staff = await findStaff(tx, ctx, staffId)
      if (userId) await checkLinkableUser(tx, ctx, userId, staffId)
      await tx.staff.update({ where: { id: staff.id }, data: { userId } })
      await audit(tx, ctx, {
        action: userId ? "staff.link_user" : "staff.unlink_user", entityType: "staff", entityId: staffId,
        summary: userId ? "Linked a login account" : "Unlinked the login account",
        metadata: { userId, previousUserId: staff.userId },
      })
    })
    .catch(translateErrors)
}

// Organisation members who could be linked (not yet linked to other staff).
export async function listLinkableStaffUsers(ctx: Ctx, staffId?: string) {
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId: ctx.organization.id,
      user: { staffProfiles: { none: { organizationId: ctx.organization.id, ...(staffId && { id: { not: staffId } }) } } },
    },
    orderBy: { user: { name: "asc" } },
    take: 200,
    select: { user: { select: { id: true, name: true, email: true } }, role: { select: { name: true } } },
  })
  return members.map((m) => ({ id: m.user.id, name: m.user.name ?? m.user.email, email: m.user.email, role: m.role.name }))
}

// ---------------------------------------------------------- qualifications

async function editableStaff(tx: Db, ctx: Ctx, staffId: string) {
  const staff = await findStaff(tx, ctx, staffId)
  if (staff.archivedAt) throw new ConflictError("Restore this staff member before editing.")
  return staff
}

// A linked document must be this staff member's own.
async function checkDocument(tx: Db, ctx: Ctx, staffId: string, documentId: string | null | undefined) {
  if (!documentId) return null
  const doc = await tx.staffDocument.findFirst({ where: { id: documentId, staffId, organizationId: ctx.organization.id }, select: { id: true } })
  if (!doc) invalid("documentId", "Choose one of this staff member's documents.")
  return doc.id
}

export async function saveStaffQualification(ctx: Ctx, staffId: string, qualificationId: string | null, raw: unknown) {
  const { documentId, ...rest } = (raw ?? {}) as { documentId?: string | null }
  const input = staffQualificationSchema.parse(rest)
  const data = { ...input, expiryDate: toDate(input.expiryDate) }
  return prisma.$transaction(async (tx) => {
    await editableStaff(tx, ctx, staffId)
    const docId = await checkDocument(tx, ctx, staffId, documentId)
    if (qualificationId) {
      const existing = await tx.staffQualification.findFirst({ where: { id: qualificationId, staffId, organizationId: ctx.organization.id } })
      if (!existing) throw new NotFoundError("Qualification not found.")
      // Changing a verified record sends it back for verification.
      await tx.staffQualification.update({
        where: { id: qualificationId },
        data: { ...data, documentId: docId, verificationStatus: "PENDING", verifiedAt: null, verifiedById: null },
      })
    } else {
      await tx.staffQualification.create({ data: { ...data, documentId: docId, organizationId: ctx.organization.id, staffId } })
    }
    await audit(tx, ctx, {
      action: qualificationId ? "staff_qualification.update" : "staff_qualification.create", entityType: "staff", entityId: staffId,
      summary: `${qualificationId ? "Updated" : "Added"} ${input.kind === "ACADEMIC" ? "qualification" : input.kind.toLowerCase()} ${input.title}`,
    })
  })
}

export async function deleteStaffQualification(ctx: Ctx, staffId: string, qualificationId: string) {
  return prisma.$transaction(async (tx) => {
    await editableStaff(tx, ctx, staffId)
    const existing = await tx.staffQualification.findFirst({ where: { id: qualificationId, staffId, organizationId: ctx.organization.id } })
    if (!existing) throw new NotFoundError("Qualification not found.")
    await tx.staffQualification.delete({ where: { id: qualificationId } })
    await audit(tx, ctx, { action: "staff_qualification.delete", entityType: "staff", entityId: staffId, summary: `Removed ${existing.title}` })
  })
}

// Verification of qualifications and documents. Nobody verifies their own.
export async function verifyStaffRecord(ctx: Ctx, staffId: string, kind: "qualification" | "document", recordId: string, raw: unknown) {
  const { status } = staffVerificationSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const staff = await findStaff(tx, ctx, staffId)
    if (staff.userId === ctx.user.id) throw new ForbiddenError("You can't verify your own records.")
    const where = { id: recordId, staffId, organizationId: ctx.organization.id }
    const data = {
      verificationStatus: status,
      verifiedAt: status === "PENDING" ? null : new Date(),
      verifiedById: status === "PENDING" ? null : ctx.user.id,
    }
    const { count } =
      kind === "qualification"
        ? await tx.staffQualification.updateMany({ where, data })
        : await tx.staffDocument.updateMany({ where, data })
    if (count === 0) throw new NotFoundError("Record not found.")
    await audit(tx, ctx, {
      action: `staff_${kind}.verify`, entityType: "staff", entityId: staffId,
      summary: `Marked a ${kind} as ${status.toLowerCase()}`, metadata: { recordId, status },
    })
  })
}

// --------------------------------------------------------- responsibilities

async function endActiveAssignments(tx: TransactionClient, ctx: Ctx, staffId: string, endDate: Date, reason: string) {
  const { count } = await tx.staffAssignment.updateMany({
    where: { staffId, organizationId: ctx.organization.id, status: "ACTIVE" },
    data: { status: "ENDED", endDate, endReason: reason },
  })
  return count
}

export async function addStaffAssignment(ctx: Ctx, staffId: string, raw: unknown) {
  const input = staffAssignmentSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const staff = await editableStaff(tx, ctx, staffId)
    if (STAFF_LEFT_STATUSES.includes(staff.employmentStatus)) {
      throw new ConflictError("This person has left; responsibilities can't be added.")
    }
    await checkAssignmentDepartment(tx, ctx, input.departmentId)
    const assignment = await tx.staffAssignment.create({
      data: {
        organizationId: ctx.organization.id, staffId, title: input.title, departmentId: input.departmentId,
        startDate: toDate(input.startDate), notes: input.notes, assignedById: ctx.user.id,
      },
    })
    await audit(tx, ctx, {
      action: "staff_assignment.create", entityType: "staff", entityId: staffId,
      summary: `Assigned responsibility: ${input.title}`, metadata: { assignmentId: assignment.id },
    })
    return { id: assignment.id }
  })
}

async function findAssignment(tx: Db, ctx: Ctx, staffId: string, assignmentId: string) {
  const assignment = await tx.staffAssignment.findFirst({ where: { id: assignmentId, staffId, organizationId: ctx.organization.id } })
  if (!assignment) throw new NotFoundError("Responsibility not found.")
  return assignment
}

export async function updateStaffAssignment(ctx: Ctx, staffId: string, assignmentId: string, raw: unknown) {
  const input = staffAssignmentSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    await editableStaff(tx, ctx, staffId)
    const existing = await findAssignment(tx, ctx, staffId, assignmentId)
    if (existing.status !== "ACTIVE") throw new ConflictError("Only active responsibilities can be edited.")
    await checkAssignmentDepartment(tx, ctx, input.departmentId)
    await tx.staffAssignment.update({
      where: { id: assignmentId },
      data: { title: input.title, departmentId: input.departmentId, startDate: toDate(input.startDate), notes: input.notes },
    })
    await audit(tx, ctx, { action: "staff_assignment.update", entityType: "staff", entityId: staffId, summary: `Updated responsibility: ${input.title}` })
  })
}

// Ending keeps the row as history; cancelling marks one created by mistake.
export async function endStaffAssignment(ctx: Ctx, staffId: string, assignmentId: string, raw: unknown, cancel: boolean) {
  const input = endStaffAssignmentSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const existing = await findAssignment(tx, ctx, staffId, assignmentId)
    if (existing.status !== "ACTIVE") throw new ConflictError("This responsibility has already ended.")
    const endDate = toDate(input.endDate)
    if (endDate < existing.startDate) invalid("endDate", "The end date can't be before the start date.")
    await tx.staffAssignment.update({
      where: { id: assignmentId },
      data: { status: cancel ? "CANCELLED" : "ENDED", endDate, endReason: input.endReason },
    })
    await audit(tx, ctx, {
      action: cancel ? "staff_assignment.cancel" : "staff_assignment.end", entityType: "staff", entityId: staffId,
      summary: `${cancel ? "Cancelled" : "Ended"} responsibility: ${existing.title}`,
    })
  })
}

// ------------------------------------------------------- archive & delete

type Row = { id: string; firstName: string; lastName: string }

// Archiving hides a profile; employment status (resigned, …) is unchanged and
// the linked login account is untouched. Active responsibilities end.
async function archiveRows(tx: TransactionClient, ctx: Ctx, rows: Row[]) {
  for (const r of rows) await endActiveAssignments(tx, ctx, r.id, today(), "Profile archived")
  await tx.staff.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, organizationId: ctx.organization.id, archivedAt: null },
    data: { archivedAt: new Date(), archivedById: ctx.user.id },
  })
  await audit(tx, ctx, rows.map((r) => ({ action: "staff.archive", entityType: "staff", entityId: r.id, summary: `Archived ${staffName(r)}` })))
}

async function restoreRows(tx: TransactionClient, ctx: Ctx, rows: Row[]) {
  await tx.staff.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, organizationId: ctx.organization.id, archivedAt: { not: null } },
    data: { archivedAt: null, archivedById: null },
  })
  await audit(tx, ctx, rows.map((r) => ({ action: "staff.restore", entityType: "staff", entityId: r.id, summary: `Restored ${staffName(r)}` })))
}

export async function archiveStaff(ctx: Ctx, staffId: string) {
  return prisma.$transaction(async (tx) => {
    const staff = await findStaff(tx, ctx, staffId)
    if (staff.archivedAt) throw new ConflictError("This staff member is already archived.")
    await archiveRows(tx, ctx, [staff])
  })
}

export async function restoreStaff(ctx: Ctx, staffId: string) {
  return prisma.$transaction(async (tx) => {
    const staff = await findStaff(tx, ctx, staffId)
    if (!staff.archivedAt) throw new ConflictError("This staff member isn't archived.")
    await restoreRows(tx, ctx, [staff])
  })
}

export type StaffBulkResult = { succeeded: number; failed: { id: string; name?: string; reason: string }[] }

// Every ID is re-resolved inside the caller's organisation; others fail.
export async function bulkStaffAction(ctx: Ctx, raw: unknown): Promise<StaffBulkResult> {
  const input = staffBulkSchema.parse(raw)
  const ids = [...new Set(input.ids)]
  return prisma.$transaction(async (tx) => {
    const rows = await tx.staff.findMany({
      where: { id: { in: ids }, organizationId: ctx.organization.id },
      select: { id: true, firstName: true, lastName: true, archivedAt: true },
    })
    const found = new Set(rows.map((r) => r.id))
    const failed: StaffBulkResult["failed"] = ids.filter((id) => !found.has(id)).map((id) => ({ id, reason: "Not found." }))
    const archiving = input.action === "archive"
    const eligible = rows.filter((r) => (archiving ? !r.archivedAt : r.archivedAt))
    for (const r of rows) {
      if (!eligible.includes(r)) failed.push({ id: r.id, name: staffName(r), reason: archiving ? "Already archived." : "Not archived." })
    }
    if (eligible.length) {
      if (archiving) await archiveRows(tx, ctx, eligible)
      else await restoreRows(tx, ctx, eligible)
    }
    return { succeeded: eligible.length, failed }
  })
}

// Permanent deletion is for profiles created by mistake: archived first,
// with no employment changes, responsibilities, verified records or reports.
// The linked login account is never touched. Attendance, leave and payroll
// modules add their own checks here when they exist.
export async function getStaffDeletionBlockers(db: Db, ctx: Ctx, staffId: string) {
  const staff = await findStaff(db, ctx, staffId)
  const organizationId = ctx.organization.id
  const blockers: string[] = []
  if (!staff.archivedAt) blockers.push("Archive the staff member first.")
  const [history, assignments, verified, reports] = await Promise.all([
    db.staffEmploymentRecord.count({ where: { staffId, organizationId } }),
    db.staffAssignment.count({ where: { staffId, organizationId, status: { not: "CANCELLED" } } }),
    Promise.all([
      db.staffQualification.count({ where: { staffId, organizationId, verificationStatus: "VERIFIED" } }),
      db.staffDocument.count({ where: { staffId, organizationId, verificationStatus: "VERIFIED" } }),
    ]).then(([q, d]) => q + d),
    db.staff.count({ where: { reportingToId: staffId } }),
  ])
  if (history > 1) blockers.push("The profile has employment history.")
  if (assignments > 0) blockers.push("The profile has responsibility history.")
  if (verified > 0) blockers.push("The profile has verified qualifications or documents.")
  if (reports > 0) blockers.push("Other staff report to this person.")
  return { staff, blockers }
}

export async function deleteStaff(ctx: Ctx, staffId: string) {
  const paths = await prisma.$transaction(async (tx) => {
    const { staff, blockers } = await getStaffDeletionBlockers(tx, ctx, staffId)
    if (blockers.length) throw new ConflictError(blockers.join(" "))
    const organizationId = ctx.organization.id
    const documents = await tx.staffDocument.findMany({ where: { staffId, organizationId }, select: { storagePath: true } })
    await tx.staffAssignment.deleteMany({ where: { staffId, organizationId } })
    // Addresses, history, qualifications and documents cascade.
    await tx.staff.deleteMany({ where: { id: staffId, organizationId } })
    await audit(tx, ctx, {
      action: "staff.delete", entityType: "staff", entityId: null,
      summary: `Permanently deleted ${staffName(staff)} (${staff.employeeId})`, metadata: { staffId },
    })
    return [...documents.map((d) => d.storagePath), ...(staff.profileImagePath ? [staff.profileImagePath] : [])]
  })
  // Files go only after the database change has committed.
  await removeFiles(paths)
}

// ------------------------------------------------------------------ profile

export async function getStaffProfile(ctx: Ctx, staffId: string) {
  const access = await staffAccess(ctx, staffId)
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, organizationId: ctx.organization.id },
    include: {
      designation: { select: { id: true, name: true, category: true } },
      department: { select: { id: true, name: true, code: true } },
      reportingTo: { select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true } },
      user: { select: { id: true, name: true, email: true } },
      addresses: true,
      qualifications: {
        orderBy: [{ kind: "asc" }, { completionYear: "desc" }, { createdAt: "desc" }],
        include: { document: { select: { id: true, title: true } } },
      },
      employmentRecords: { orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }] },
      assignments: {
        orderBy: [{ status: "asc" }, { startDate: "desc" }],
        include: { department: { select: { id: true, name: true } } },
      },
    },
  })
  if (!staff) throw new NotFoundError("Staff member not found.")

  // Field-level restrictions: removed on the server, not just hidden in the UI.
  const {
    dateOfBirth, addresses, emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
    contractStartDate, contractEndDate, onProbation, probationStartDate, probationEndDate,
    resignationDate, lastWorkingDate, terminationDate, leavingReason, employmentNotes, employmentRecords, reportingTo,
    ...rest
  } = staff
  return {
    ...rest,
    access,
    sensitive: access.sensitive
      ? { dateOfBirth, addresses, emergencyContactName, emergencyContactPhone, emergencyContactRelationship }
      : null,
    employment: access.employment
      ? {
          contractStartDate, contractEndDate, onProbation, probationStartDate, probationEndDate,
          resignationDate, lastWorkingDate, terminationDate, employmentRecords, reportingTo,
          leavingReason: access.restricted ? leavingReason : null,
          employmentNotes: access.restricted ? employmentNotes : null,
        }
      : null,
  }
}

export type StaffProfile = Awaited<ReturnType<typeof getStaffProfile>>
