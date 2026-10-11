// End-to-end guardian service tests against the configured database. Creates
// two throwaway organisations, students and users, and deletes them
// afterwards; no existing data is read or changed.
//
//   npm run test:integration
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import { parseGuardianFilters } from "@/features/guardians/filters"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import { exportGuardiansCsv } from "@/services/guardians/export-service"
import { getGuardianStats, listGuardians } from "@/services/guardians/guardian-query"
import {
  archiveGuardian,
  bulkGuardianAction,
  createGuardian,
  deleteGuardian,
  getGuardianProfile,
  linkStudents,
  restoreGuardian,
  unlinkStudent,
  updateGuardian,
  updateStudentLink,
} from "@/services/guardians/guardian-service"
import { commitGuardianImport, previewGuardianImport } from "@/services/guardians/import-service"
import {
  acceptGuardianInvitation,
  findInvitation,
  inviteGuardian,
  revokeInvitation,
  setPortalAccess,
  unlinkGuardianAccount,
} from "@/services/guardians/invitation-service"
import { resolveGuardianRecipients } from "@/services/guardians/notification-service"
import {
  getPortalChildOverview,
  listPortalChildren,
  requireGuardianStudentAccess,
  updatePortalPreferences,
} from "@/services/guardians/portal-service"
import { assertCanViewStudent, unlinkGuardian } from "@/services/students/student-service"

const run = randomUUID().slice(0, 8)
const users: { id: string; email: string }[] = []
let ctxA: AuthContext
let ctxB: AuthContext
const ids = {} as Record<string, string>

function ctxFor(org: { id: string; name: string; slug: string }, userId: string, permissions: readonly PermissionKey[] = PERMISSION_KEYS): AuthContext {
  return {
    user: { id: userId, authUserId: randomUUID(), email: "g@example.com", name: "Test", avatarUrl: null, isPlatformAdmin: false },
    organization: { ...org, type: "SCHOOL" },
    membership: { id: randomUUID() },
    role: { id: randomUUID(), name: "Owner", slug: "owner" },
    permissions,
  }
}

async function rejects<T extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => T, field?: string) {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof type, `expected ${type.name}, got ${(error as Error)?.constructor?.name}: ${(error as Error)?.message} ${JSON.stringify((error as unknown as ValidationError).fieldErrors ?? "")}`)
    if (field) {
      assert.ok(error instanceof ValidationError && error.fieldErrors[field], `expected an error on ${field}, got ${JSON.stringify((error as unknown as ValidationError).fieldErrors)}`)
    }
    return
  }
  assert.fail(`expected ${type.name}`)
}

async function makeUser(label: string) {
  const user = await prisma.user.create({
    data: { authUserId: randomUUID(), email: `test-guardian-${label}-${run}@example.com`, name: `Test ${label}` },
    select: { id: true, email: true },
  })
  users.push(user)
  return user
}

async function makeStudent(ctx: AuthContext, first: string, admissionNumber: string) {
  const s = await prisma.student.create({
    data: { organizationId: ctx.organization.id, admissionNumber, firstName: first, lastName: "Shrestha", admissionDate: new Date("2024-04-14") },
  })
  return s.id
}

const profile = (overrides: Record<string, unknown> = {}) => ({
  fullName: "Hari Shrestha",
  phone: "9841000001",
  email: `hari-${run}@example.com`,
  dateOfBirth: "1980-01-01",
  permanentAddress: { province: "3", district: "Kathmandu", municipality: "Kathmandu Metropolitan City", wardNumber: "4" },
  sameAsPermanent: true,
  temporaryAddress: {},
  ...overrides,
})
const link = (studentId: string, overrides: Record<string, unknown> = {}) => ({
  studentId,
  relationship: "FATHER",
  isPrimary: false,
  isEmergencyContact: true,
  canPickupStudent: true,
  receivesAcademicNotifications: true,
  receivesAttendanceNotifications: true,
  receivesBillingNotifications: false,
  receivesGeneralAnnouncements: true,
  canAccessStudentPortalData: false,
  ...overrides,
})

before(async () => {
  const actor = await makeUser("actor")
  const orgA = await prisma.organization.create({ data: { name: `Guardian School ${run}`, slug: `test-ga-${run}`, type: "SCHOOL" } })
  const orgB = await prisma.organization.create({ data: { name: `Guardian College ${run}`, slug: `test-gb-${run}`, type: "COLLEGE" } })
  ctxA = ctxFor(orgA, actor.id)
  ctxB = ctxFor(orgB, actor.id)
  await prisma.role.create({ data: { organizationId: orgA.id, name: "Parent", slug: "parent", isSystem: true } })
  ids.aarav = await makeStudent(ctxA, "Aarav", "ADM-1")
  ids.anu = await makeStudent(ctxA, "Anu", "ADM-2")
  ids.bikash = await makeStudent(ctxA, "Bikash", "ADM-3")
  ids.foreign = await makeStudent(ctxB, "Foreign", "ADM-1")
})

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [`test-ga-${run}`, `test-gb-${run}`] } } })
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
})

describe("guardian profiles and links", () => {
  it("creates a guardian linked to two students with a generated ID", async () => {
    const created = await createGuardian(ctxA, {
      profile: profile(),
      links: [link(ids.aarav, { isPrimary: true }), link(ids.anu, { relationship: "LEGAL_GUARDIAN" })],
    })
    ids.hari = created.id
    assert.match(created.guardianCode, /^GRD-\d{5}$/)
    const g = await getGuardianProfile(ctxA, ids.hari)
    assert.equal(g.childCount, 2)
    assert.deepEqual(g.students.map((l) => l.relationship).sort(), ["FATHER", "LEGAL_GUARDIAN"])
    assert.equal(g.userId, null, "a profile never creates an account")
    assert.equal(g.portalStatus, "NONE")
    assert.equal(g.sensitive?.addresses.length, 2, "same-as-permanent writes both addresses")
  })

  it("links several guardians to one student and keeps one primary", async () => {
    const mother = await createGuardian(ctxA, { profile: profile({ fullName: "Sita Shrestha", phone: "9841000002", email: "" }), links: [] })
    ids.sita = mother.id
    await linkStudents(ctxA, ids.sita, { links: [link(ids.aarav, { relationship: "MOTHER", isPrimary: true })] })
    const links = await prisma.studentGuardian.findMany({ where: { studentId: ids.aarav } })
    assert.equal(links.length, 2)
    assert.deepEqual(links.filter((l) => l.isPrimary).map((l) => l.guardianId), [ids.sita], "new primary replaces the old one")
  })

  it("rejects linking the same student twice", async () => {
    await rejects(linkStudents(ctxA, ids.hari, { links: [link(ids.aarav)] }), ValidationError, "links.0.studentId")
  })

  it("never links across organisations or reveals other organisations' records", async () => {
    await rejects(linkStudents(ctxA, ids.hari, { links: [link(ids.foreign)] }), ValidationError, "links.0.studentId")
    await rejects(createGuardian(ctxB, { profile: profile({ phone: "9841000099" }), links: [link(ids.aarav)] }), ValidationError, "links.0.studentId")
    await rejects(getGuardianProfile(ctxB, ids.hari), NotFoundError)
    await rejects(updateGuardian(ctxB, ids.hari, { profile: profile() }), NotFoundError)
    await rejects(archiveGuardian(ctxB, ids.hari), NotFoundError)
    await rejects(inviteGuardian(ctxB, ids.hari, { email: "x@example.com" }), NotFoundError)
    const listB = await listGuardians(ctxB, parseGuardianFilters({ view: "all" }))
    assert.ok(!listB.rows.some((r) => r.id === ids.hari))
  })

  it("rejects a guardian ID already used in the organisation", async () => {
    const hari = await prisma.guardian.findUniqueOrThrow({ where: { id: ids.hari } })
    await rejects(createGuardian(ctxA, { profile: profile({ guardianCode: hari.guardianCode!.toLowerCase(), phone: "9841000003" }), links: [] }), ValidationError, "profile.guardianCode")
    // Another organisation may use the same ID.
    const other = await createGuardian(ctxB, { profile: profile({ guardianCode: hari.guardianCode, phone: "9841000004" }), links: [] })
    assert.equal(other.guardianCode, hari.guardianCode)
  })

  it("only writes date of birth and addresses for roles allowed to see them", async () => {
    const limited = ctxFor(ctxA.organization, ctxA.user.id, ["parents.view", "parents.update"])
    await updateGuardian(limited, ids.hari, { profile: profile({ dateOfBirth: "1999-09-09", permanentAddress: {}, occupation: "Teacher" }) })
    const g = await prisma.guardian.findUniqueOrThrow({ where: { id: ids.hari }, include: { addresses: true } })
    assert.equal(g.occupation, "Teacher")
    assert.equal(g.dateOfBirth?.toISOString().slice(0, 10), "1980-01-01")
    assert.equal(g.addresses.length, 2)
    const profileView = await getGuardianProfile(limited, ids.hari)
    assert.equal(profileView.sensitive, null)
    assert.deepEqual(profileView.students, [], "linked students need students.view")
  })

  it("records access changes when a link is updated", async () => {
    await updateStudentLink(ctxA, ids.hari, ids.aarav, link(ids.aarav, { canAccessStudentPortalData: true }))
    const entry = await prisma.auditLog.findFirst({ where: { entityId: ids.hari, action: "guardian.link_update" }, orderBy: { createdAt: "desc" } })
    assert.match(entry!.summary, /granted parent portal access/)
  })
})

describe("guardian list", () => {
  it("filters, searches and paginates on the server", async () => {
    const several = await listGuardians(ctxA, parseGuardianFilters({ children: "2+" }))
    assert.deepEqual(several.rows.map((r) => r.id), [ids.hari])
    const none = await listGuardians(ctxA, parseGuardianFilters({ children: "0" }))
    assert.ok(none.rows.every((r) => r.childCount === 0))
    const byPhone = await listGuardians(ctxA, parseGuardianFilters({ q: "9841000002" }))
    assert.deepEqual(byPhone.rows.map((r) => r.id), [ids.sita])
    const byStudent = await listGuardians(ctxA, parseGuardianFilters({ q: "ADM-2" }))
    assert.deepEqual(byStudent.rows.map((r) => r.id), [ids.hari])
    const mothers = await listGuardians(ctxA, parseGuardianFilters({ relationship: "MOTHER" }))
    assert.deepEqual(mothers.rows.map((r) => r.id), [ids.sita])
    const page = await listGuardians(ctxA, parseGuardianFilters({ pageSize: "10", sort: "children", dir: "desc" }))
    assert.equal(page.rows[0].id, ids.hari)
    assert.equal(page.total, (await listGuardians(ctxA, parseGuardianFilters({}))).total)
    const primary = page.rows.find((r) => r.id === ids.sita)!
    assert.equal(primary.primaryFor, 1)
  })

  it("exports only the caller's organisation, without restricted columns for limited roles", async () => {
    const limited = ctxFor(ctxA.organization, ctxA.user.id, ["parents.view", "parents.export"])
    const text = await new Response(await exportGuardiansCsv(limited, parseGuardianFilters({}), {})).text()
    assert.match(text, /Hari Shrestha/)
    assert.doesNotMatch(text, /Date of birth|Students \(relationship\)|Aarav/)
    const textB = await new Response(await exportGuardiansCsv(ctxB, parseGuardianFilters({}), {})).text()
    assert.doesNotMatch(textB, /9841000001/)
  })
})

describe("invitations and parent portal", () => {
  it("requires portal access on at least one link before inviting", async () => {
    await rejects(inviteGuardian(ctxA, ids.sita, { email: "sita@example.com" }), ConflictError)
  })

  it("invites, then accepts only with the invited email, once", async () => {
    const parent = await makeUser("parent")
    ids.parentUser = parent.id
    const first = await inviteGuardian(ctxA, ids.hari, { email: parent.email })
    const second = await inviteGuardian(ctxA, ids.hari, { email: parent.email })
    assert.equal((await findInvitation(first.token)).state, "revoked", "a resend invalidates the old link")
    assert.equal((await findInvitation(second.token)).state, "pending")
    assert.equal((await findInvitation("x".repeat(43))).state, "invalid")
    const stats = await getGuardianStats(ctxA)
    assert.equal(stats.pendingInvitations, 1)
    assert.equal((await listGuardians(ctxA, parseGuardianFilters({ invitation: "pending" }))).rows.length, 1)

    const stranger = await makeUser("stranger")
    await rejects(acceptGuardianInvitation(stranger, second.token), ForbiddenError)
    await acceptGuardianInvitation(parent, second.token)
    const g = await prisma.guardian.findUniqueOrThrow({ where: { id: ids.hari } })
    assert.equal(g.userId, parent.id)
    assert.equal(g.portalStatus, "ACTIVE")
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: parent.id, organizationId: ctxA.organization.id } },
      include: { role: true },
    })
    assert.equal(membership?.role.slug, "parent")
    await rejects(acceptGuardianInvitation(parent, second.token), ConflictError)
    await rejects(inviteGuardian(ctxA, ids.hari, { email: parent.email }), ConflictError)
  })

  it("shows a guardian only the children their links allow", async () => {
    const parent = ctxFor(ctxA.organization, ids.parentUser, ["dashboard.view"])
    const children = await listPortalChildren(parent)
    assert.deepEqual(children.map((c) => c.id), [ids.aarav], "Anu's link doesn't allow portal access")
    await requireGuardianStudentAccess(parent, ids.aarav)
    await rejects(requireGuardianStudentAccess(parent, ids.anu), NotFoundError)
    await rejects(requireGuardianStudentAccess(parent, ids.bikash), NotFoundError)
    await rejects(requireGuardianStudentAccess(parent, ids.foreign), NotFoundError)
    await rejects(requireGuardianStudentAccess(parent, ids.aarav, "financial"), NotFoundError)
    const overview = await getPortalChildOverview(parent, ids.aarav)
    assert.equal(overview.student.admissionNumber, "ADM-1")
    assert.ok(!("medicalNotes" in overview.student))
    // The staff-facing student profile is not for guardians.
    await rejects(assertCanViewStudent(parent, ids.aarav), NotFoundError)
    // Same user in another organisation: nothing.
    assert.deepEqual(await listPortalChildren(ctxFor(ctxB.organization, ids.parentUser, ["dashboard.view"])), [])
  })

  it("lets guardians change their own notices but not other links", async () => {
    const parent = ctxFor(ctxA.organization, ids.parentUser, ["dashboard.view"])
    const child = (studentId: string) => ({ studentId, receivesAcademicNotifications: true, receivesAttendanceNotifications: false, receivesGeneralAnnouncements: true })
    await updatePortalPreferences(parent, { preferredContactMethod: "SMS", children: [child(ids.aarav)] })
    const updated = await prisma.studentGuardian.findUniqueOrThrow({ where: { studentId_guardianId: { studentId: ids.aarav, guardianId: ids.hari } } })
    assert.equal(updated.receivesAttendanceNotifications, false)
    await rejects(updatePortalPreferences(parent, { children: [child(ids.anu)] }), ValidationError)
  })

  it("blocks the portal when access is disabled or the guardian archived", async () => {
    const parent = ctxFor(ctxA.organization, ids.parentUser, ["dashboard.view"])
    await setPortalAccess(ctxA, ids.hari, { enabled: false })
    assert.deepEqual(await listPortalChildren(parent), [])
    await rejects(requireGuardianStudentAccess(parent, ids.aarav), NotFoundError)
    await setPortalAccess(ctxA, ids.hari, { enabled: true })
    assert.equal((await listPortalChildren(parent)).length, 1)
    await archiveGuardian(ctxA, ids.hari)
    assert.deepEqual(await listPortalChildren(parent), [])
    await restoreGuardian(ctxA, ids.hari)
    assert.equal((await listPortalChildren(parent)).length, 1)
  })

  it("revokes invitations and unlinks accounts without deleting users", async () => {
    await updateStudentLink(ctxA, ids.sita, ids.aarav, link(ids.aarav, { relationship: "MOTHER", isPrimary: true, canAccessStudentPortalData: true }))
    const invite = await inviteGuardian(ctxA, ids.sita, { email: "sita.portal@example.com" })
    await revokeInvitation(ctxA, ids.sita)
    assert.equal((await findInvitation(invite.token)).state, "revoked")
    assert.equal((await prisma.guardian.findUniqueOrThrow({ where: { id: ids.sita } })).portalStatus, "NONE")

    await unlinkGuardianAccount(ctxA, ids.hari)
    const g = await prisma.guardian.findUniqueOrThrow({ where: { id: ids.hari } })
    assert.equal(g.userId, null)
    assert.ok(await prisma.user.findUnique({ where: { id: ids.parentUser } }), "the user account is kept")
  })
})

describe("notifications", () => {
  it("resolves one recipient per guardian and respects preferences", async () => {
    const general = await resolveGuardianRecipients(ctxA, { studentIds: [ids.aarav, ids.anu], category: "general" })
    const hari = general.find((r) => r.guardianId === ids.hari)!
    assert.deepEqual(hari.studentIds.sort(), [ids.aarav, ids.anu].sort())
    assert.equal(general.filter((r) => r.guardianId === ids.hari).length, 1)
    const attendance = await resolveGuardianRecipients(ctxA, { studentIds: [ids.aarav], category: "attendance" })
    assert.ok(!attendance.some((r) => r.guardianId === ids.hari), "Hari opted out of attendance alerts for Aarav")
    assert.deepEqual(await resolveGuardianRecipients(ctxB, { studentIds: [ids.aarav], category: "general" }), [])
  })
})

describe("archiving and deletion", () => {
  it("removes a link without deleting the guardian or the student", async () => {
    await unlinkStudent(ctxA, ids.hari, ids.anu)
    assert.ok(await prisma.guardian.findUnique({ where: { id: ids.hari } }))
    assert.ok(await prisma.student.findUnique({ where: { id: ids.anu } }))
  })

  it("keeps the guardian when unlinked from the student profile too", async () => {
    await unlinkGuardian(ctxA, ids.aarav, ids.sita)
    const sita = await prisma.guardian.findUnique({ where: { id: ids.sita } })
    assert.ok(sita, "previously an unlinked guardian without an account was deleted")
  })

  it("only deletes archived guardians without links or accounts", async () => {
    await rejects(deleteGuardian(ctxA, ids.sita), ConflictError)
    const result = await bulkGuardianAction(ctxA, { action: "archive", ids: [ids.sita, ids.foreign] })
    assert.equal(result.succeeded, 1)
    assert.equal(result.failed[0].reason, "Not found.")
    await rejects(deleteGuardian(ctxB, ids.sita), NotFoundError)
    await deleteGuardian(ctxA, ids.sita)
    assert.equal(await prisma.guardian.findUnique({ where: { id: ids.sita } }), null)
    await archiveGuardian(ctxA, ids.hari)
    await rejects(deleteGuardian(ctxA, ids.hari), ConflictError)
  })
})

describe("import", () => {
  const header = "full_name,phone,email,student_admission_number,relationship,is_primary,portal_access\r\n"

  it("previews row-level problems and never matches students by name", async () => {
    const csv = header + [
      "Gita Thapa,9800000011,,ADM-3,mother,yes,no",
      "Gita Thapa,9800000011,,ADM-2,mother,no,no",
      "Nobody,9800000012,,ADM-404,father,no,no",
      "Bad Phone,abc,,,,,",
      "Ram Thapa,9800000013,,Bikash Shrestha,father,no,no",
    ].join("\r\n")
    const { rows } = await previewGuardianImport(ctxA, { csv, firstLine: 2 })
    assert.deepEqual(rows[0].errors, [])
    assert.match(rows[1].placement!, /Same new guardian as line 2/)
    assert.match(rows[2].errors.join(), /No student with admission number/)
    assert.match(rows[3].errors.join(), /valid phone/)
    assert.match(rows[4].errors.join(), /No student with admission number/)
  })

  it("creates a guardian once for several children and reports partial success", async () => {
    const csv = header + [
      "Gita Thapa,9800000011,,ADM-3,mother,yes,no",
      "Gita Thapa,9800000011,,ADM-2,mother,no,no",
      "Nobody,9800000012,,ADM-404,father,no,no",
    ].join("\r\n")
    const result = await commitGuardianImport(ctxA, { csv, firstLine: 2 })
    assert.equal(result.created, 2)
    assert.equal(result.failed, 1)
    const gitas = await prisma.guardian.findMany({ where: { organizationId: ctxA.organization.id, fullName: "Gita Thapa" }, include: { _count: { select: { students: true } } } })
    assert.equal(gitas.length, 1)
    assert.equal(gitas[0]._count.students, 2)
    // Re-importing the same file links nothing twice.
    const again = await commitGuardianImport(ctxA, { csv, firstLine: 2 })
    assert.equal(again.created, 0)
  })
})
