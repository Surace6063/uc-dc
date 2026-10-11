// End-to-end staff service tests against the configured database. Creates
// two throwaway organisations and test users, and deletes them afterwards;
// no existing data is read or changed.
//
//   npm run test:integration
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import { parseStaffFilters } from "@/features/staff/filters"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import {
  addSuggestedStaffStructure,
  deleteDepartment,
  reassignDepartmentStaff,
  saveDepartment,
  saveStaffDesignation,
  saveStaffDocumentType,
} from "@/services/staff/config-service"
import { staffDocumentUrl } from "@/services/staff/document-service"
import { exportStaffCsv } from "@/services/staff/export-service"
import { commitStaffImport, previewStaffImport } from "@/services/staff/import-service"
import { getStaffStats, listStaff } from "@/services/staff/staff-query"
import {
  addStaffAssignment,
  archiveStaff,
  bulkStaffAction,
  changeStaffEmployment,
  createStaff,
  deleteStaff,
  endStaffAssignment,
  getStaffProfile,
  linkStaffUser,
  restoreStaff,
  saveStaffQualification,
  updateStaff,
  verifyStaffRecord,
} from "@/services/staff/staff-service"
import { createTeacher } from "@/services/teachers/teacher-service"

const run = randomUUID().slice(0, 8)
const users: { id: string; email: string }[] = []
let ctxA: AuthContext
let ctxB: AuthContext
const ids = {} as Record<string, string>

function ctxFor(org: { id: string; name: string; slug: string }, userId: string, permissions: readonly PermissionKey[] = PERMISSION_KEYS): AuthContext {
  return {
    user: { id: userId, authUserId: randomUUID(), email: "s@example.com", name: "Test", avatarUrl: null, isPlatformAdmin: false },
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
    data: { authUserId: randomUUID(), email: `test-staff-${label}-${run}@example.com`, name: `Test ${label}` },
    select: { id: true, email: true },
  })
  users.push(user)
  return user
}

async function addMember(ctx: AuthContext, userId: string) {
  const roleRow = await prisma.role.create({ data: { organizationId: ctx.organization.id, name: `R ${randomUUID().slice(0, 6)}`, slug: `r-${randomUUID().slice(0, 8)}` } })
  await prisma.organizationMember.create({ data: { userId, organizationId: ctx.organization.id, roleId: roleRow.id } })
}

function staffInput(overrides: Record<string, unknown> = {}) {
  const { personal, employment, ...rest } = overrides as { personal?: object; employment?: object }
  return {
    employeeId: "",
    personal: { firstName: "Sita", lastName: "Thapa", gender: "FEMALE", dateOfBirth: "1992-05-06", ...personal },
    contact: { email: `sita-${randomUUID().slice(0, 6)}@example.com`, phone: "9851000000", emergencyContactName: "Ram Thapa" },
    permanentAddress: { province: "3", district: "Kathmandu", municipality: "Kathmandu Metropolitan City", wardNumber: "4" },
    sameAsPermanent: true,
    temporaryAddress: {},
    employment: {
      dateOfJoining: "2024-04-15", employmentType: "FULL_TIME", employmentStatus: "ACTIVE",
      departmentId: ids.finance, designationId: ids.accountant, onProbation: false, ...employment,
    },
    qualifications: [],
    assignments: [],
    userId: "",
    ...rest,
  }
}

const isoDay = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)

before(async () => {
  const actor = await makeUser("actor")
  const orgA = await prisma.organization.create({ data: { name: `Staff School ${run}`, slug: `test-sa-${run}`, type: "SCHOOL" } })
  const orgB = await prisma.organization.create({ data: { name: `Staff College ${run}`, slug: `test-sb-${run}`, type: "COLLEGE" } })
  ctxA = ctxFor(orgA, actor.id)
  ctxB = ctxFor(orgB, actor.id)
  await addMember(ctxA, actor.id)
})

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [`test-sa-${run}`, `test-sb-${run}`] } } })
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
  await prisma.$disconnect()
})

describe("departments and designations", () => {
  it("adds the suggested structure once, without duplicates", async () => {
    const first = await addSuggestedStaffStructure(ctxA)
    assert.ok(first.departments >= 10 && first.designations >= 10)
    const again = await addSuggestedStaffStructure(ctxA)
    assert.deepEqual(again, { departments: 0, designations: 0 })
    ids.finance = (await prisma.department.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, code: "FIN" } })).id
    ids.library = (await prisma.department.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, code: "LIB" } })).id
    const accountant = await prisma.designation.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, name: "Accountant" } })
    assert.equal(accountant.scope, "NON_TEACHING")
    assert.equal(accountant.departmentId, ids.finance)
    ids.accountant = accountant.id
    ids.librarian = (await prisma.designation.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, name: "Librarian" } })).id
  })

  it("keeps configuration per organisation", async () => {
    const dept = await saveDepartment(ctxB, null, { name: "Administration", code: "ADMIN", isActive: true })
    ids.adminB = dept.id
    ids.clerkB = (await saveStaffDesignation(ctxB, null, { name: "Clerk", scope: "NON_TEACHING", isActive: true })).id
    await rejects(saveStaffDesignation(ctxA, null, { name: "Cashier", scope: "NON_TEACHING", departmentId: ids.adminB, isActive: true }), ValidationError, "departmentId")
    ids.teachingOnly = (await saveStaffDesignation(ctxA, null, { name: "Senior Teacher", scope: "TEACHING", isActive: true })).id
    ids.requiredDoc = (await saveStaffDocumentType(ctxA, null, { name: "Appointment letter", isRequired: true, isActive: true })).id
  })
})

describe("creating staff", () => {
  it("creates a profile with employment history, qualifications and a responsibility, but no account", async () => {
    const created = await createStaff(ctxA, staffInput({
      qualifications: [
        { kind: "ACADEMIC", level: "BACHELOR", title: "BBS", specialization: "Accounting", completionYear: "2015" },
        { kind: "CERTIFICATION", title: "CA Inter", awardingBody: "ICAN" },
      ],
      assignments: [{ title: "Exam fee collection", departmentId: ids.finance, startDate: "2024-05-01" }],
    }))
    ids.s1 = created.id
    assert.match(created.employeeId, /^EMP-\d{4}$/)
    const p = await getStaffProfile(ctxA, created.id)
    assert.equal(p.qualifications.length, 2)
    assert.equal(p.assignments.length, 1)
    assert.equal(p.employment?.employmentRecords.length, 1)
    assert.equal(p.employment?.employmentRecords[0].departmentName, "Finance and Accounts")
    assert.equal(p.sensitive?.addresses.length, 2)
    assert.equal(p.userId, null, "a profile never creates a login account")
    const audit = await prisma.auditLog.count({ where: { organizationId: ctxA.organization.id, entityId: created.id, action: "staff.create" } })
    assert.equal(audit, 1)
  })

  it("shares one employee ID sequence with teachers", async () => {
    const teacher = await createTeacher(ctxA, {
      employeeId: "", personal: { firstName: "Bimala", lastName: "Karki" }, contact: {}, permanentAddress: {}, sameAsPermanent: true,
      temporaryAddress: {}, employment: { dateOfJoining: "2024-04-15", employmentType: "FULL_TIME", employmentStatus: "ACTIVE", onProbation: false },
      qualifications: [], certifications: [], assignments: [], userId: "",
    })
    ids.teacherA = teacher.id
    const staff = await createStaff(ctxA, staffInput({ personal: { firstName: "Hari", lastName: "Shrestha" } }))
    ids.s2 = staff.id
    const s1 = await prisma.staff.findUniqueOrThrow({ where: { id: ids.s1 } })
    const nums = [s1.employeeId, teacher.employeeId, staff.employeeId].map((e) => Number(e.replace(/\D/g, "")))
    assert.deepEqual(nums, [nums[0], nums[0] + 1, nums[0] + 2], "one sequence across both tables")
    // A teacher's ID can't be reused for staff, and vice versa (case-insensitive).
    await rejects(createStaff(ctxA, staffInput({ employeeId: teacher.employeeId.toLowerCase() })), ValidationError, "employeeId")
    await rejects(updateStaff(ctxA, ids.s2, { ...staffInput(), employeeId: s1.employeeId }), ValidationError, "employeeId")
  })

  it("generates unique employee IDs under concurrency", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => createStaff(ctxA, staffInput({ personal: { firstName: `Concurrent${i}`, lastName: "Test" } }))))
    assert.equal(new Set(results.map((r) => r.employeeId)).size, 4)
  })

  it("allows the same employee ID in another organisation", async () => {
    const s1 = await prisma.staff.findUniqueOrThrow({ where: { id: ids.s1 } })
    const b = await createStaff(ctxB, staffInput({ employeeId: s1.employeeId, employment: { departmentId: ids.adminB, designationId: ids.clerkB } }))
    ids.b1 = b.id
    assert.equal(b.employeeId, s1.employeeId)
  })

  it("rejects references from elsewhere and teaching-only designations", async () => {
    await rejects(createStaff(ctxA, staffInput({ employment: { departmentId: ids.adminB } })), ValidationError, "employment.departmentId")
    await rejects(createStaff(ctxA, staffInput({ employment: { designationId: ids.clerkB } })), ValidationError, "employment.designationId")
    await rejects(createStaff(ctxA, staffInput({ employment: { designationId: ids.teachingOnly } })), ValidationError, "employment.designationId")
    await rejects(createStaff(ctxA, staffInput({ employment: { reportingToId: ids.b1 } })), ValidationError, "employment.reportingToId")
    const outsider = await makeUser("outsider")
    await rejects(createStaff(ctxA, staffInput({ userId: outsider.id })), ValidationError, "userId")
  })

  it("only lets permitted roles write restricted details or responsibilities", async () => {
    const clerk = ctxFor(ctxA.organization, ctxA.user.id, ["staff.view", "staff.create"])
    await rejects(createStaff(clerk, staffInput({ assignments: [{ title: "Library", startDate: "2024-05-01" }] })), ForbiddenError)
    const created = await createStaff(clerk, staffInput({ personal: { firstName: "Gopal", lastName: "Rai", dateOfBirth: "1980-01-01" } }))
    const row = await prisma.staff.findUniqueOrThrow({ where: { id: created.id }, include: { addresses: true } })
    assert.equal(row.dateOfBirth, null, "date of birth needs staff.sensitive.view")
    assert.equal(row.emergencyContactName, null)
    assert.equal(row.addresses.length, 0)
    ids.s3 = created.id
  })
})

describe("employment history", () => {
  it("records department, designation and contract changes without overwriting history", async () => {
    await changeStaffEmployment(ctxA, ids.s2, {
      dateOfJoining: "2024-04-15", employmentType: "CONTRACT", employmentStatus: "ACTIVE",
      departmentId: ids.library, designationId: ids.librarian, onProbation: true, probationStartDate: "2026-01-01", probationEndDate: "2026-06-30",
      contractStartDate: "2026-01-01", contractEndDate: isoDay(30), effectiveDate: "2026-01-01", changeNote: "Transferred to library",
    })
    const p = await getStaffProfile(ctxA, ids.s2)
    assert.equal(p.department?.id, ids.library)
    assert.equal(p.employment?.employmentRecords.length, 2)
    const departments = p.employment!.employmentRecords.map((r) => r.departmentName)
    assert.deepEqual(departments, ["Library", "Finance and Accounts"])
  })

  it("ends responsibilities when someone leaves and blocks new ones", async () => {
    await addStaffAssignment(ctxA, ids.s2, { title: "Reading room supervision", departmentId: ids.library, startDate: "2026-01-05" })
    const result = await changeStaffEmployment(ctxA, ids.s2, {
      dateOfJoining: "2024-04-15", employmentType: "CONTRACT", employmentStatus: "RESIGNED",
      departmentId: ids.library, designationId: ids.librarian, onProbation: false,
      contractStartDate: "2026-01-01", contractEndDate: isoDay(30), resignationDate: "2026-08-01", lastWorkingDate: "2026-08-31",
      leavingReason: "Higher studies", effectiveDate: "2026-08-31",
    })
    assert.equal(result.endedAssignments, 1)
    await rejects(addStaffAssignment(ctxA, ids.s2, { title: "Another", startDate: "2026-09-01" }), ConflictError)
    const p = await getStaffProfile(ctxA, ids.s2)
    assert.equal(p.employmentStatus, "RESIGNED")
    assert.equal(p.archivedAt, null, "leaving is not archiving")
    assert.equal(p.employment?.leavingReason, "Higher studies")
  })

  it("hides restricted employment and personal details by permission", async () => {
    const viewer = ctxFor(ctxA.organization, ctxA.user.id, ["staff.view"])
    const p = await getStaffProfile(viewer, ids.s2)
    assert.equal(p.employment, null)
    assert.equal(p.sensitive, null)
    const accountant = ctxFor(ctxA.organization, ctxA.user.id, ["staff.view", "staff.employment.view"])
    const q = await getStaffProfile(accountant, ids.s2)
    assert.ok(q.employment)
    assert.equal(q.sensitive, null)
  })
})

describe("qualifications, verification and documents", () => {
  it("re-queues edited records for verification and stops self-verification", async () => {
    const p = await getStaffProfile(ctxA, ids.s1)
    const q = p.qualifications.find((x) => x.kind === "ACADEMIC")!
    await verifyStaffRecord(ctxA, ids.s1, "qualification", q.id, { status: "VERIFIED" })
    await saveStaffQualification(ctxA, ids.s1, q.id, { kind: "ACADEMIC", level: "MASTER", title: "MBS" })
    const edited = await prisma.staffQualification.findUniqueOrThrow({ where: { id: q.id } })
    assert.equal(edited.verificationStatus, "PENDING")
    const self = await makeUser("self")
    await prisma.staff.update({ where: { id: ids.s1 }, data: { userId: self.id } })
    await rejects(verifyStaffRecord(ctxFor(ctxA.organization, self.id), ids.s1, "qualification", q.id, { status: "VERIFIED" }), ForbiddenError)
    await prisma.staff.update({ where: { id: ids.s1 }, data: { userId: null } })
    // Records of another staff member can't be touched through this one.
    await rejects(verifyStaffRecord(ctxA, ids.s2, "qualification", q.id, { status: "VERIFIED" }), NotFoundError)
  })

  it("refuses document access across organisations and without permission", async () => {
    const doc = await prisma.staffDocument.create({
      data: {
        organizationId: ctxA.organization.id, staffId: ids.s1, category: "CONTRACT", title: "Contract", fileName: "c.pdf",
        mimeType: "application/pdf", sizeBytes: 10, storagePath: `${ctxA.organization.id}/staff/${ids.s1}/documents/${randomUUID()}.pdf`,
        requirementId: ids.requiredDoc,
      },
    })
    ids.doc = doc.id
    await rejects(staffDocumentUrl(ctxB, ids.s1, doc.id), NotFoundError)
    await rejects(staffDocumentUrl(ctxFor(ctxA.organization, ctxA.user.id, ["staff.view"]), ids.s1, doc.id), NotFoundError)
  })
})

describe("access scope", () => {
  it("hides other organisations' staff", async () => {
    await rejects(getStaffProfile(ctxB, ids.s1), NotFoundError)
    const list = await listStaff(ctxB, parseStaffFilters({ view: "all" }))
    assert.deepEqual(list.rows.map((r) => r.id), [ids.b1])
  })

  it("lets a staff member see only their own profile, and department heads their department", async () => {
    const member = await makeUser("member")
    await addMember(ctxA, member.id)
    await linkStaffUser(ctxA, ids.s3, { userId: member.id })
    const self = ctxFor(ctxA.organization, member.id, ["dashboard.view"])
    const own = await getStaffProfile(self, ids.s3)
    assert.ok(own.access.isSelf)
    assert.equal(own.employment?.employmentNotes, null, "private HR notes stay hidden from the person")
    await rejects(getStaffProfile(self, ids.s1), NotFoundError)
    assert.equal((await listStaff(self, parseStaffFilters({}))).total, 0)

    // s3 is in Finance; as a department head they see Finance only.
    const head = ctxFor(ctxA.organization, member.id, ["staff.view_department"])
    const visible = await listStaff(head, parseStaffFilters({ pageSize: "100" }))
    assert.ok(visible.rows.length > 0)
    assert.ok(visible.rows.every((r) => r.department?.name === "Finance and Accounts"))
    await rejects(getStaffProfile(head, ids.s2), NotFoundError, undefined)
    await rejects(linkStaffUser(ctxA, ids.s1, { userId: member.id }), ValidationError, "userId")
  })

  it("never acts on foreign IDs in bulk operations", async () => {
    const result = await bulkStaffAction(ctxA, { action: "archive", ids: [ids.b1] })
    assert.equal(result.succeeded, 0)
    assert.equal(result.failed[0].reason, "Not found.")
    assert.equal((await prisma.staff.findUniqueOrThrow({ where: { id: ids.b1 } })).archivedAt, null)
  })
})

describe("list, filters, stats and export", () => {
  it("filters on the server and counts consistently", async () => {
    const all = await listStaff(ctxA, parseStaffFilters({ pageSize: "100" }))
    const finance = await listStaff(ctxA, parseStaffFilters({ department: ids.finance, pageSize: "100" }))
    assert.ok(finance.total < all.total)
    assert.ok(finance.rows.every((r) => r.department?.name === "Finance and Accounts"))
    const search = await listStaff(ctxA, parseStaffFilters({ q: "hari library" }))
    assert.deepEqual(search.rows.map((r) => r.id), [ids.s2], "matches name and department together")
    const certified = await listStaff(ctxA, parseStaffFilters({ certification: "has" }))
    assert.deepEqual(certified.rows.map((r) => r.id), [ids.s1])
    const expiring = await listStaff(ctxA, parseStaffFilters({ contractExpiring: "1" }))
    assert.equal(expiring.total, 0, "resigned staff aren't expiring contracts")
    const missingDocs = await listStaff(ctxA, parseStaffFilters({ documents: "missing", pageSize: "100" }))
    assert.ok(!missingDocs.rows.some((r) => r.id === ids.s1), "s1 has the required document")
    const resigned = await listStaff(ctxA, parseStaffFilters({ status: "RESIGNED" }))
    assert.deepEqual(resigned.rows.map((r) => r.id), [ids.s2])
  })

  it("ignores restricted filters for roles that can't see those fields", async () => {
    const viewer = ctxFor(ctxA.organization, ctxA.user.id, ["staff.view"])
    const unfiltered = await listStaff(viewer, parseStaffFilters({}))
    const byContract = await listStaff(viewer, parseStaffFilters({ contractEndFrom: "2099-01-01" }))
    const byDistrict = await listStaff(viewer, parseStaffFilters({ province: "1" }))
    assert.equal(byContract.total, unfiltered.total)
    assert.equal(byDistrict.total, unfiltered.total)
    assert.equal(unfiltered.rows[0].contractEndDate, null, "contract dates aren't selected")
    const admin = await listStaff(ctxA, parseStaffFilters({ province: "1" }))
    assert.equal(admin.total, 0, "everyone lives in Bagmati")
  })

  it("paginates and sorts with a stable order", async () => {
    const all = await listStaff(ctxA, parseStaffFilters({ pageSize: "100", sort: "employeeId" }))
    const seen: string[] = []
    for (let page = 1; page <= Math.ceil(all.total / 10); page++) {
      const p = await listStaff(ctxA, parseStaffFilters({ pageSize: "10", page: String(page), sort: "employeeId" }))
      seen.push(...p.rows.map((r) => r.id))
    }
    assert.deepEqual(seen, all.rows.map((r) => r.id))
  })

  it("counts each person once in the summary", async () => {
    const stats = await getStaffStats(ctxA)
    const list = await listStaff(ctxA, parseStaffFilters({}))
    assert.equal(stats.total, list.total)
    assert.ok(stats.byDepartment.reduce((n, d) => n + d.count, 0) <= stats.total)
  })

  it("exports the filtered rows without restricted columns by default", async () => {
    const read = async (stream: ReadableStream<Uint8Array>) => new Response(stream).text()
    const viewer = ctxFor(ctxA.organization, ctxA.user.id, ["staff.view", "staff.export"])
    const text = await read(await exportStaffCsv(viewer, parseStaffFilters({ department: ids.finance }), {}))
    const lines = text.trim().split("\r\n")
    const header = lines[0]
    assert.ok(!/Date of birth|Contract|district|Reason|Notes/i.test(header))
    const finance = await listStaff(viewer, parseStaffFilters({ department: ids.finance, pageSize: "100" }))
    assert.equal(lines.length - 1, finance.total)
    const full = await read(await exportStaffCsv(ctxA, parseStaffFilters({}), { ids: [ids.s1, ids.b1] }))
    assert.ok(full.split("\r\n")[0].includes("Contract end date"))
    assert.equal(full.trim().split("\r\n").length - 1, 1, "foreign IDs are ignored")
  })
})

describe("departments in use", () => {
  it("won't deactivate or delete a department with staff until they are moved", async () => {
    await rejects(saveDepartment(ctxA, ids.finance, { name: "Finance and Accounts", code: "FIN", isActive: false }), ValidationError, "isActive")
    await rejects(deleteDepartment(ctxA, ids.finance), ConflictError)
    const target = await saveDepartment(ctxA, null, { name: "Accounts Office", code: "ACC", isActive: true })
    const moved = await reassignDepartmentStaff(ctxA, ids.finance, { toDepartmentId: target.id, effectiveDate: "2026-10-01" })
    assert.ok(moved.moved > 0)
    await saveDepartment(ctxA, ids.finance, { name: "Finance and Accounts", code: "FIN", isActive: false })
    const p = await getStaffProfile(ctxA, ids.s1)
    assert.equal(p.department?.id, target.id)
    assert.equal(p.employment?.employmentRecords[0].note, "Moved from Finance and Accounts")
    await rejects(deleteDepartment(ctxA, ids.finance), ConflictError, undefined)
  })
})

describe("archive and delete", () => {
  it("archives (ending responsibilities), restores, and keeps the account", async () => {
    await archiveStaff(ctxA, ids.s1)
    const p = await getStaffProfile(ctxA, ids.s1)
    assert.ok(p.archivedAt)
    assert.equal(p.employmentStatus, "ACTIVE", "archiving doesn't change employment status")
    assert.ok(p.assignments.every((a) => a.status !== "ACTIVE"))
    await rejects(archiveStaff(ctxA, ids.s1), ConflictError)
    const listed = await listStaff(ctxA, parseStaffFilters({ pageSize: "100" }))
    assert.ok(!listed.rows.some((r) => r.id === ids.s1))
    await restoreStaff(ctxA, ids.s1)
  })

  it("only deletes archived profiles without history, and never the login account", async () => {
    // s3 was moved between departments, so it has employment history.
    await archiveStaff(ctxA, ids.s3)
    await rejects(deleteStaff(ctxA, ids.s3), ConflictError)
    // A profile created by mistake: no history beyond joining.
    const mistake = await createStaff(ctxA, staffInput({ personal: { firstName: "Mistake", lastName: "Entry" }, employment: { departmentId: ids.library, designationId: ids.librarian } }))
    const account = await makeUser("mistake")
    await addMember(ctxA, account.id)
    await linkStaffUser(ctxA, mistake.id, { userId: account.id })
    await rejects(deleteStaff(ctxA, mistake.id), ConflictError, undefined)
    await archiveStaff(ctxA, mistake.id)
    await deleteStaff(ctxA, mistake.id)
    assert.equal(await prisma.staff.count({ where: { id: mistake.id } }), 0)
    assert.equal(await prisma.user.count({ where: { id: account.id } }), 1, "the login account is kept")
    await archiveStaff(ctxA, ids.s2)
    await rejects(deleteStaff(ctxA, ids.s2), ConflictError, undefined)
    // Ended history stays and can't be ended twice.
    const ended = await prisma.staffAssignment.findFirstOrThrow({ where: { staffId: ids.s1 } })
    await rejects(endStaffAssignment(ctxA, ids.s1, ended.id, { endDate: "2026-10-02" }, false), ConflictError)
  })
})

describe("CSV import", () => {
  const header = "employee_id,first_name,last_name,gender,date_of_joining,employment_type,department,designation,qualification_level,qualification_title,permanent_province,permanent_district"

  it("validates rows, maps departments and designations, and imports only valid rows", async () => {
    const s2 = await prisma.staff.findUniqueOrThrow({ where: { id: ids.s2 } })
    const csv = [
      header,
      ",Kamala,Gurung,female,2025-01-10,contract,LIB,Librarian,bachelor,BLISc,Bagmati,Lalitpur",
      `${s2.employeeId},Dup,Id,male,2025-01-10,,LIB,,,,,`,
      ",Bad,Dept,male,2025-01-10,,NOPE,,,,,",
      ",No,Date,male,,,LIB,,,,,",
      ",Wrong,District,male,2025-01-10,,LIB,,,,Bagmati,Kaski",
      ",Teach,Title,male,2025-01-10,,LIB,Senior Teacher,,,,",
    ].join("\n")
    const preview = await previewStaffImport(ctxA, { csv, firstLine: 2 })
    const errors = preview.rows.map((r) => r.errors.length > 0)
    assert.deepEqual(errors, [false, true, true, true, true, true])
    const result = await commitStaffImport(ctxA, { csv, firstLine: 2 })
    assert.equal(result.created, 1)
    const kamala = await prisma.staff.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, firstName: "Kamala" }, include: { qualifications: true } })
    assert.equal(kamala.departmentId, ids.library)
    assert.equal(kamala.userId, null, "imports never link accounts")
    assert.equal(kamala.qualifications.length, 1)
  })

  it("rejects files missing required columns", async () => {
    await rejects(previewStaffImport(ctxA, { csv: "first_name\nA", firstLine: 2 }), ValidationError)
  })
})

describe("database guarantees", () => {
  it("enforces shared employee IDs in the database itself", async () => {
    const teacher = await prisma.teacher.findUniqueOrThrow({ where: { id: ids.teacherA } })
    // Bypassing the service: the trigger still refuses a teacher's ID for staff.
    await assert.rejects(
      prisma.staff.create({
        data: { organizationId: ctxA.organization.id, employeeId: teacher.employeeId.toUpperCase(), firstName: "X", lastName: "Y", dateOfJoining: new Date("2025-01-01") },
      }),
      /employee|unique/i
    )
  })
})
