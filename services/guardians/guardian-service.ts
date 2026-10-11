import "server-only"

import { RELATIONSHIP_LABELS } from "@/features/guardians/constants"
import {
  createGuardianSchema,
  guardianBulkSchema,
  guardianDuplicateCheckSchema,
  linkSettingsSchema,
  linkStudentsSchema,
  updateGuardianSchema,
} from "@/features/guardians/schemas"
import { fullName as studentName } from "@/features/students/constants"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { Prisma } from "@/lib/generated/prisma/client"
import type { AddressType } from "@/lib/generated/prisma/enums"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { removeFiles } from "@/lib/supabase/storage"
import { toDate } from "@/lib/validation"
import { audit, type AuditEntry } from "@/services/audit/audit-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma
type Profile = ReturnType<typeof updateGuardianSchema.parse>["profile"]
type AddressValues = Profile["permanentAddress"]
type LinkValues = ReturnType<typeof linkSettingsSchema.parse>

// Every lookup is by (id, organisation): a guardian or student of another
// organisation is indistinguishable from one that doesn't exist.

function invalid(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

const CODE_TAKEN = "This guardian ID is already used in your organisation."

export async function findGuardian(db: Db, ctx: Pick<Ctx, "organization">, id: string) {
  const guardian = await db.guardian.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!guardian) throw new NotFoundError("Guardian not found.")
  return guardian
}

async function editableGuardian(db: Db, ctx: Ctx, id: string) {
  const guardian = await findGuardian(db, ctx, id)
  if (guardian.archivedAt) throw new ConflictError("Restore this guardian before editing.")
  return guardian
}

// ------------------------------------------------------------- guardian IDs

// Hands out the next guardian ID like a database sequence: one atomic
// UPDATE ... RETURNING per attempt, so concurrent creates never share a
// number. IDs already taken by hand are skipped; the unique index is the
// final guard. Pass the transaction when called inside one.
export async function nextGuardianCode(db: Db, organizationId: string) {
  await db.studentSettings.createMany({ data: [{ organizationId }], skipDuplicates: true })
  for (let attempt = 0; attempt < 50; attempt++) {
    const settings = await db.studentSettings.update({
      where: { organizationId },
      data: { nextGuardianSequence: { increment: 1 } },
    })
    const sequence = settings.nextGuardianSequence - 1
    const candidate = `${settings.guardianCodePrefix}${String(sequence).padStart(settings.admissionNumberPadding, "0")}`
    const taken = await db.guardian.findFirst({
      where: { organizationId, guardianCode: { equals: candidate, mode: "insensitive" } },
      select: { id: true },
    })
    if (!taken) return candidate
  }
  throw new ConflictError("Couldn't generate a free guardian ID. Check the numbering settings.")
}

async function assertCodeFree(db: Db, organizationId: string, code: string, excludeId?: string) {
  const taken = await db.guardian.findFirst({
    where: {
      organizationId,
      guardianCode: { equals: code, mode: "insensitive" },
      ...(excludeId && { id: { not: excludeId } }),
    },
    select: { id: true },
  })
  if (taken) invalid("profile.guardianCode", CODE_TAKEN)
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

const isEmptyAddress = (address: AddressValues) => Object.values(addressData(address)).every((v) => v === null)

async function writeAddresses(tx: TransactionClient, guardianId: string, profile: Profile) {
  const entries: [AddressType, AddressValues][] = [
    ["PERMANENT", profile.permanentAddress],
    ["TEMPORARY", profile.sameAsPermanent ? profile.permanentAddress : profile.temporaryAddress],
  ]
  for (const [type, address] of entries) {
    if (isEmptyAddress(address)) {
      await tx.guardianAddress.deleteMany({ where: { guardianId, type } })
    } else {
      await tx.guardianAddress.upsert({
        where: { guardianId_type: { guardianId, type } },
        create: { guardianId, type, ...addressData(address) },
        update: addressData(address),
      })
    }
  }
}

// Date of birth and home addresses are written only by roles allowed to
// read them; for everyone else the stored values are left untouched.
function profileData(ctx: Ctx, profile: Profile) {
  const sensitive = hasPermission(ctx, "parents.sensitive.view")
  return {
    fullName: profile.fullName,
    gender: profile.gender,
    nationality: profile.nationality,
    phone: profile.phone,
    alternatePhone: profile.alternatePhone,
    email: profile.email,
    preferredContactMethod: profile.preferredContactMethod,
    preferredLanguage: profile.preferredLanguage,
    occupation: profile.occupation,
    workplace: profile.workplace,
    address: profile.address,
    ...(sensitive && { dateOfBirth: toDate(profile.dateOfBirth) }),
  }
}

function linkData(link: LinkValues) {
  return {
    relationship: link.relationship,
    isPrimary: link.isPrimary,
    isEmergencyContact: link.isEmergencyContact,
    canPickupStudent: link.canPickupStudent,
    receivesAcademicNotifications: link.receivesAcademicNotifications,
    receivesAttendanceNotifications: link.receivesAttendanceNotifications,
    receivesBillingNotifications: link.receivesBillingNotifications,
    receivesGeneralAnnouncements: link.receivesGeneralAnnouncements,
    canAccessStudentPortalData: link.canAccessStudentPortalData,
    notes: link.notes,
  }
}

// Students must belong to this organisation and not be archived. Unknown and
// foreign IDs get the same message.
async function linkableStudents(tx: TransactionClient, ctx: Ctx, links: { studentId: string }[], field: string) {
  const students = await tx.student.findMany({
    where: { id: { in: links.map((l) => l.studentId) }, organizationId: ctx.organization.id },
    select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, archivedAt: true },
  })
  const byId = new Map(students.map((s) => [s.id, s]))
  links.forEach((link, i) => {
    const student = byId.get(link.studentId)
    if (!student) invalid(`${field}.${i}.studentId`, "Choose a valid student.")
    if (student.archivedAt) invalid(`${field}.${i}.studentId`, `${studentName(student)} is archived. Restore the student first.`)
  })
  return byId
}

async function createLinks(
  tx: TransactionClient,
  ctx: Ctx,
  guardian: { id: string; fullName: string },
  links: (LinkValues & { studentId: string })[],
  field: string
) {
  const organizationId = ctx.organization.id
  const students = await linkableStudents(tx, ctx, links, field)
  const existing = await tx.studentGuardian.findMany({
    where: { guardianId: guardian.id, studentId: { in: links.map((l) => l.studentId) } },
    select: { studentId: true },
  })
  const entries: AuditEntry[] = []
  for (const [i, link] of links.entries()) {
    const student = students.get(link.studentId)!
    if (existing.some((e) => e.studentId === link.studentId)) {
      invalid(`${field}.${i}.studentId`, `Already linked to ${studentName(student)}.`)
    }
    // The partial unique index keeps one primary per student even under races.
    if (link.isPrimary) {
      await tx.studentGuardian.updateMany({ where: { studentId: link.studentId, organizationId }, data: { isPrimary: false } })
    }
    await tx.studentGuardian.create({
      data: { organizationId, studentId: link.studentId, guardianId: guardian.id, ...linkData(link) },
    })
    const relation = RELATIONSHIP_LABELS[link.relationship].toLowerCase()
    entries.push(
      {
        action: "guardian.link", entityType: "guardian", entityId: guardian.id,
        summary: `Linked to ${studentName(student)} (${student.admissionNumber}) as ${relation}`,
        metadata: { studentId: student.id, portalAccess: link.canAccessStudentPortalData },
      },
      {
        action: "guardian.link", entityType: "student", entityId: student.id,
        summary: `Linked guardian ${guardian.fullName} (${relation})`,
        metadata: { guardianId: guardian.id },
      }
    )
  }
  await audit(tx, ctx, entries)
}

function translateErrors(error: unknown): never {
  if (isUniqueViolation(error, "guardian_code")) invalid("profile.guardianCode", CODE_TAKEN)
  if (isUniqueViolation(error, "student_guardians_one_primary_key")) {
    throw new ConflictError("Another guardian became the primary contact at the same time. Please try again.")
  }
  if (isUniqueViolation(error, "student_guardians_pkey")) throw new ConflictError("This guardian is already linked to that student.")
  throw error
}

// ------------------------------------------------------------------ create

export async function createGuardian(ctx: Ctx, raw: unknown) {
  const input = createGuardianSchema.parse(raw)
  const organizationId = ctx.organization.id
  const sensitive = hasPermission(ctx, "parents.sensitive.view")

  // Resolve the ID first (outside the transaction, like admission numbers).
  let guardianCode = input.profile.guardianCode
  if (guardianCode) await assertCodeFree(prisma, organizationId, guardianCode)
  else guardianCode = await nextGuardianCode(prisma, organizationId)

  return prisma
    .$transaction(async (tx) => {
      const guardian = await tx.guardian.create({
        data: { organizationId, guardianCode, ...profileData(ctx, input.profile), createdById: ctx.user.id },
        select: { id: true, fullName: true, guardianCode: true },
      })
      if (sensitive) await writeAddresses(tx, guardian.id, input.profile)
      await audit(tx, ctx, {
        action: "guardian.create", entityType: "guardian", entityId: guardian.id,
        summary: `Added guardian ${guardian.fullName} (${guardianCode})`,
        metadata: { students: input.links.length },
      })
      if (input.links.length) await createLinks(tx, ctx, guardian, input.links, "links")
      return { id: guardian.id, guardianCode: guardian.guardianCode! }
    })
    .catch(translateErrors)
}

// Possible duplicates shown before saving: the same phone, the same email, or
// the same name. Advisory only; two guardians can share a family phone.
export async function findGuardianDuplicates(ctx: Ctx, raw: unknown) {
  const input = guardianDuplicateCheckSchema.parse(raw)
  const or: Prisma.GuardianWhereInput[] = []
  const digits = input.phone?.replace(/\D/g, "")
  if (input.phone && digits && digits.length >= 6) or.push({ phone: input.phone }, { alternatePhone: input.phone })
  if (input.email) or.push({ email: { equals: input.email, mode: "insensitive" } })
  if (input.fullName.length >= 3) or.push({ fullName: { equals: input.fullName, mode: "insensitive" } })
  if (or.length === 0) return []
  const rows = await prisma.guardian.findMany({
    where: { organizationId: ctx.organization.id, OR: or, ...(input.excludeId && { id: { not: input.excludeId } }) },
    take: 5,
    orderBy: { fullName: "asc" },
    select: {
      id: true, guardianCode: true, fullName: true, phone: true, email: true, archivedAt: true,
      _count: { select: { students: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    guardianCode: r.guardianCode,
    fullName: r.fullName,
    phone: r.phone,
    email: r.email,
    archived: r.archivedAt !== null,
    children: r._count.students,
  }))
}

// ------------------------------------------------------------------ update

export async function updateGuardian(ctx: Ctx, guardianId: string, raw: unknown) {
  const { profile } = updateGuardianSchema.parse(raw)
  const organizationId = ctx.organization.id
  return prisma
    .$transaction(async (tx) => {
      const existing = await editableGuardian(tx, ctx, guardianId)
      // A blank ID field keeps the current ID rather than clearing it.
      const guardianCode = profile.guardianCode ?? existing.guardianCode
      if (guardianCode && guardianCode !== existing.guardianCode) {
        await assertCodeFree(tx, organizationId, guardianCode, guardianId)
      }
      await tx.guardian.update({ where: { id: existing.id }, data: { ...profileData(ctx, profile), guardianCode } })
      if (hasPermission(ctx, "parents.sensitive.view")) await writeAddresses(tx, guardianId, profile)
      await audit(tx, ctx, {
        action: "guardian.update", entityType: "guardian", entityId: guardianId,
        summary:
          guardianCode !== existing.guardianCode
            ? `Updated details; guardian ID ${existing.guardianCode ?? "none"} → ${guardianCode}`
            : "Updated guardian details",
      })
      return { id: guardianId }
    })
    .catch(translateErrors)
}

// ------------------------------------------------------------ student links

export async function linkStudents(ctx: Ctx, guardianId: string, raw: unknown) {
  const { links } = linkStudentsSchema.parse(raw)
  return prisma
    .$transaction(async (tx) => {
      const guardian = await editableGuardian(tx, ctx, guardianId)
      await createLinks(tx, ctx, guardian, links, "links")
      return { linked: links.length }
    })
    .catch(translateErrors)
}

const FLAG_LABELS: Partial<Record<keyof LinkValues, string>> = {
  isPrimary: "primary contact",
  isEmergencyContact: "emergency contact",
  canPickupStudent: "pick-up permission",
  canAccessStudentPortalData: "parent portal access",
  receivesBillingNotifications: "fee notices",
}

export async function updateStudentLink(ctx: Ctx, guardianId: string, studentId: string, raw: unknown) {
  const input = linkSettingsSchema.parse(raw)
  const organizationId = ctx.organization.id
  return prisma
    .$transaction(async (tx) => {
      const guardian = await editableGuardian(tx, ctx, guardianId)
      const link = await tx.studentGuardian.findFirst({
        where: { guardianId, studentId, organizationId },
        include: { student: { select: { firstName: true, middleName: true, lastName: true, archivedAt: true } } },
      })
      if (!link) throw new NotFoundError("This guardian isn't linked to that student.")
      if (input.isPrimary && !link.isPrimary) {
        await tx.studentGuardian.updateMany({ where: { studentId, organizationId }, data: { isPrimary: false } })
      }
      await tx.studentGuardian.update({
        where: { studentId_guardianId: { studentId, guardianId } },
        data: linkData(input),
      })
      // Access-related changes are spelled out in the audit trail.
      const changes = (Object.keys(FLAG_LABELS) as (keyof LinkValues)[])
        .filter((key) => link[key as keyof typeof link] !== input[key])
        .map((key) => `${input[key] ? "granted" : "removed"} ${FLAG_LABELS[key]}`)
      if (link.relationship !== input.relationship) changes.push(`relationship → ${RELATIONSHIP_LABELS[input.relationship].toLowerCase()}`)
      const summary = `Updated link to ${studentName(link.student)}${changes.length ? `: ${changes.join(", ")}` : ""}`
      await audit(tx, ctx, [
        { action: "guardian.link_update", entityType: "guardian", entityId: guardianId, summary, metadata: { studentId } },
        {
          action: "guardian.link_update", entityType: "student", entityId: studentId,
          summary: `Updated guardian ${guardian.fullName}${changes.length ? `: ${changes.join(", ")}` : ""}`,
          metadata: { guardianId },
        },
      ])
    })
    .catch(translateErrors)
}

// Removes only the link. The guardian and the student both stay, with their
// history; an unlinked guardian can be archived or deleted separately.
export async function unlinkStudent(ctx: Ctx, guardianId: string, studentId: string) {
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const guardian = await findGuardian(tx, ctx, guardianId)
    const link = await tx.studentGuardian.findFirst({
      where: { guardianId, studentId, organizationId },
      include: { student: { select: { firstName: true, middleName: true, lastName: true, admissionNumber: true } } },
    })
    if (!link) throw new NotFoundError("This guardian isn't linked to that student.")
    await tx.studentGuardian.deleteMany({ where: { guardianId, studentId, organizationId } })
    await audit(tx, ctx, [
      {
        action: "guardian.unlink", entityType: "guardian", entityId: guardianId,
        summary: `Removed link to ${studentName(link.student)} (${link.student.admissionNumber})`,
        metadata: { studentId, hadPortalAccess: link.canAccessStudentPortalData },
      },
      {
        action: "guardian.unlink", entityType: "student", entityId: studentId,
        summary: `Removed guardian ${guardian.fullName}`, metadata: { guardianId },
      },
    ])
  })
}

// Student picker for linking: name or admission number, with the current
// class so people can tell students with similar names apart.
export async function searchStudentsForLinking(ctx: Ctx, query: string, guardianId?: string) {
  const q = query.trim().slice(0, 60)
  if (q.length < 2) return []
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 4)
  const rows = await prisma.student.findMany({
    where: {
      organizationId: ctx.organization.id,
      archivedAt: null,
      AND: terms.map((term) => ({
        OR: [
          { firstName: { contains: term, mode: "insensitive" as const } },
          { middleName: { contains: term, mode: "insensitive" as const } },
          { lastName: { contains: term, mode: "insensitive" as const } },
          { admissionNumber: { contains: term, mode: "insensitive" as const } },
        ],
      })),
    },
    take: 10,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, status: true,
      enrollments: {
        where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
        orderBy: { enrollmentDate: "desc" },
        take: 1,
        select: { class: { select: { name: true } }, section: { select: { name: true } }, academicYear: { select: { name: true } } },
      },
      guardians: guardianId ? { where: { guardianId }, select: { guardianId: true } } : false,
      _count: { select: { guardians: true } },
    },
  })
  return rows.map((s) => {
    const e = s.enrollments[0]
    return {
      id: s.id,
      name: studentName(s),
      admissionNumber: s.admissionNumber,
      status: s.status,
      placement: e ? [e.class.name, e.section && `Section ${e.section.name}`, e.academicYear.name].filter(Boolean).join(" · ") : null,
      guardianCount: s._count.guardians,
      alreadyLinked: Array.isArray(s.guardians) && s.guardians.length > 0,
    }
  })
}

// ------------------------------------------------------- archive and delete

type Row = { id: string; fullName: string }

// Archiving hides the profile, blocks the parent portal and cancels any open
// invitation. Links to students, the linked account and its organisation
// membership are kept, so restoring brings everything back.
async function archiveRows(tx: TransactionClient, ctx: Ctx, rows: Row[]) {
  const organizationId = ctx.organization.id
  const ids = rows.map((r) => r.id)
  await tx.guardian.updateMany({
    where: { id: { in: ids }, organizationId, archivedAt: null },
    data: { archivedAt: new Date(), archivedById: ctx.user.id },
  })
  await tx.guardianInvitation.updateMany({
    where: { guardianId: { in: ids }, organizationId, status: "PENDING" },
    data: { status: "REVOKED", revokedAt: new Date(), revokedById: ctx.user.id },
  })
  await tx.guardian.updateMany({ where: { id: { in: ids }, organizationId, portalStatus: "INVITED" }, data: { portalStatus: "NONE" } })
  await audit(tx, ctx, rows.map((r) => ({
    action: "guardian.archive", entityType: "guardian", entityId: r.id, summary: `Archived ${r.fullName}`,
  })))
}

async function restoreRows(tx: TransactionClient, ctx: Ctx, rows: Row[]) {
  await tx.guardian.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, organizationId: ctx.organization.id, archivedAt: { not: null } },
    data: { archivedAt: null, archivedById: null },
  })
  await audit(tx, ctx, rows.map((r) => ({
    action: "guardian.restore", entityType: "guardian", entityId: r.id, summary: `Restored ${r.fullName}`,
  })))
}

export async function archiveGuardian(ctx: Ctx, guardianId: string) {
  return prisma.$transaction(async (tx) => {
    const guardian = await findGuardian(tx, ctx, guardianId)
    if (guardian.archivedAt) throw new ConflictError("This guardian is already archived.")
    await archiveRows(tx, ctx, [guardian])
  })
}

export async function restoreGuardian(ctx: Ctx, guardianId: string) {
  return prisma.$transaction(async (tx) => {
    const guardian = await findGuardian(tx, ctx, guardianId)
    if (!guardian.archivedAt) throw new ConflictError("This guardian isn't archived.")
    await restoreRows(tx, ctx, [guardian])
  })
}

export type BulkResult = { succeeded: number; failed: { id: string; name?: string; reason: string }[] }

// Every ID is re-checked against the caller's organisation; IDs that don't
// resolve are reported as failures, never acted on.
export async function bulkGuardianAction(ctx: Ctx, raw: unknown): Promise<BulkResult> {
  const input = guardianBulkSchema.parse(raw)
  const ids = [...new Set(input.ids)]
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.guardian.findMany({
        where: { id: { in: ids }, organizationId: ctx.organization.id },
        select: { id: true, fullName: true, archivedAt: true },
      })
      const found = new Set(rows.map((r) => r.id))
      const failed: BulkResult["failed"] = ids.filter((id) => !found.has(id)).map((id) => ({ id, reason: "Not found." }))
      const archiving = input.action === "archive"
      const eligible = rows.filter((r) => (archiving ? !r.archivedAt : r.archivedAt))
      for (const r of rows) {
        if (!eligible.includes(r)) failed.push({ id: r.id, name: r.fullName, reason: archiving ? "Already archived." : "Not archived." })
      }
      if (eligible.length) {
        if (archiving) await archiveRows(tx, ctx, eligible)
        else await restoreRows(tx, ctx, eligible)
      }
      return { succeeded: eligible.length, failed }
    },
    { timeout: 30_000 }
  )
}

// Permanent deletion is for records created by mistake. Anything that is (or
// was) connected to a student or an account stays archived instead. Future
// modules (fees, messages) should add their own checks here.
export async function getGuardianDeletionBlockers(db: Db, ctx: Ctx, guardianId: string) {
  const guardian = await findGuardian(db, ctx, guardianId)
  const blockers: string[] = []
  if (!guardian.archivedAt) blockers.push("Archive the guardian first.")
  const links = await db.studentGuardian.count({ where: { guardianId, organizationId: ctx.organization.id } })
  if (links > 0) blockers.push(`Still linked to ${links} student${links === 1 ? "" : "s"}; remove the links first.`)
  if (guardian.userId) blockers.push("A login account is linked; unlink it first.")
  return { guardian, blockers }
}

export async function deleteGuardian(ctx: Ctx, guardianId: string) {
  const photo = await prisma.$transaction(async (tx) => {
    const { guardian, blockers } = await getGuardianDeletionBlockers(tx, ctx, guardianId)
    if (blockers.length) throw new ConflictError(blockers.join(" "))
    // Addresses and invitations cascade. The User account is never touched.
    await tx.guardian.deleteMany({ where: { id: guardianId, organizationId: ctx.organization.id, userId: null, students: { none: {} } } })
    await audit(tx, ctx, {
      action: "guardian.delete", entityType: "guardian", entityId: null,
      summary: `Permanently deleted guardian ${guardian.fullName} (${guardian.guardianCode ?? "no ID"})`,
      metadata: { guardianId },
    })
    return guardian.profileImagePath
  })
  // Files go only after the database change has committed.
  if (photo) await removeFiles([photo])
}

// ------------------------------------------------------------------ profile

export async function getGuardianProfile(ctx: Ctx, guardianId: string) {
  const sensitive = hasPermission(ctx, "parents.sensitive.view")
  const canSeeStudents = hasPermission(ctx, "students.view")
  const guardian = await prisma.guardian.findFirst({
    where: { id: guardianId, organizationId: ctx.organization.id },
    include: {
      addresses: sensitive,
      user: { select: { id: true, email: true, name: true } },
      invitations: {
        orderBy: { createdAt: "desc" },
        take: 10,
        // Never the token hash.
        select: { id: true, email: true, status: true, expiresAt: true, createdAt: true, acceptedAt: true, revokedAt: true },
      },
      students: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: {
          student: {
            select: {
              id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, status: true,
              archivedAt: true, profileImagePath: true,
              enrollments: {
                orderBy: [{ enrollmentDate: "desc" }, { createdAt: "desc" }],
                take: 1,
                select: {
                  status: true, rollNumber: true,
                  academicYear: { select: { name: true } },
                  educationLevel: { select: { name: true } },
                  program: { select: { name: true } },
                  class: { select: { name: true } },
                  section: { select: { name: true } },
                  batch: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!guardian) throw new NotFoundError("Guardian not found.")
  const { dateOfBirth, addresses, students, ...rest } = guardian
  return {
    ...rest,
    childCount: students.length,
    // Which students a guardian is linked to is student information.
    students: canSeeStudents ? students : [],
    // Restricted fields: dropped unless the role may read them.
    sensitive: sensitive ? { dateOfBirth, addresses: addresses ?? [] } : null,
  }
}

export type GuardianProfile = Awaited<ReturnType<typeof getGuardianProfile>>
