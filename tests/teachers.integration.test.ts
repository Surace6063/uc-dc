// End-to-end teacher service tests against the configured database. Creates
// two throwaway organisations and test users, and deletes them afterwards.
//
//   npm run test:integration
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import { parseTeacherFilters } from "@/features/teachers/filters"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import * as structure from "@/services/academics/structure-service"
import { teacherDocumentUrl } from "@/services/teachers/document-service"
import { exportTeachersCsv } from "@/services/teachers/export-service"
import { commitTeacherImport, previewTeacherImport } from "@/services/teachers/import-service"
import { addAssignment, endAssignment, updateAssignment } from "@/services/teachers/assignment-service"
import { getTeacherStats, listTeachers } from "@/services/teachers/teacher-query"
import {
  archiveTeacher,
  bulkTeacherAction,
  changeEmployment,
  createTeacher,
  deleteTeacher,
  getTeacherProfile,
  linkUser,
  restoreTeacher,
  saveQualification,
  updateTeacher,
  verifyRecord,
} from "@/services/teachers/teacher-service"

const run = randomUUID().slice(0, 8)
const users: { id: string; email: string }[] = []
let ctxA: AuthContext
let ctxB: AuthContext
const ids = {} as Record<string, string>

function ctxFor(org: { id: string; name: string; slug: string }, userId: string, permissions: readonly PermissionKey[] = PERMISSION_KEYS): AuthContext {
  return {
    user: { id: userId, authUserId: randomUUID(), email: "t@example.com", name: "Test", avatarUrl: null, isPlatformAdmin: false },
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
    data: { authUserId: randomUUID(), email: `test-${label}-${run}@example.com`, name: `Test ${label}` },
    select: { id: true, email: true },
  })
  users.push(user)
  return user
}

function teacherInput(overrides: Record<string, unknown> = {}) {
  const { personal, employment, ...rest } = overrides as { personal?: object; employment?: object }
  return {
    employeeId: "",
    personal: { firstName: "Bimala", lastName: "Karki", gender: "FEMALE", dateOfBirth: "1990-02-03", ...personal },
    contact: { email: `bimala-${randomUUID().slice(0, 6)}@example.com`, phone: "9841000000" },
    permanentAddress: { province: "3", district: "Lalitpur", municipality: "Lalitpur Metropolitan City" },
    sameAsPermanent: true,
    temporaryAddress: {},
    employment: {
      dateOfJoining: "2024-04-15", employmentType: "FULL_TIME", employmentStatus: "ACTIVE",
      designationId: ids.designation, departmentId: ids.science, onProbation: false, ...employment,
    },
    qualifications: [],
    certifications: [],
    assignments: [],
    userId: "",
    ...rest,
  }
}

const assignment = (overrides: Record<string, unknown> = {}) => ({
  academicYearId: ids.year, educationLevelId: "", programId: "", classId: ids.grade8, sectionId: ids.grade8A,
  subjectId: ids.math, batchId: "", role: "SUBJECT_TEACHER", startDate: "2026-04-20", weeklyPeriods: "6", ...overrides,
})

before(async () => {
  const actor = await makeUser("actor")
  const orgA = await prisma.organization.create({ data: { name: `Teacher School ${run}`, slug: `test-ta-${run}`, type: "SCHOOL" } })
  const orgB = await prisma.organization.create({ data: { name: `Teacher College ${run}`, slug: `test-tb-${run}`, type: "COLLEGE" } })
  ctxA = ctxFor(orgA, actor.id)
  ctxB = ctxFor(orgB, actor.id)

  // Structure for A: Basic (Grades 1–8 with sections) and +2 with programs.
  await structure.applyEducationPreset(ctxA, { presetKey: "basic", createClasses: true, createPrograms: false })
  await structure.applyEducationPreset(ctxA, { presetKey: "higher_secondary", createClasses: false, createPrograms: true })
  const basic = await prisma.educationLevel.findFirstOrThrow({ where: { organizationId: orgA.id, code: "BASIC" } })
  const hs = await prisma.educationLevel.findFirstOrThrow({ where: { organizationId: orgA.id, code: "HSEB" } })
  const mgmt = await prisma.program.findFirstOrThrow({ where: { organizationId: orgA.id, code: "MGMT" } })
  await structure.generateClasses(ctxA, { educationLevelId: hs.id, programId: mgmt.id, kind: "GRADE", count: 2, startAt: 11 })
  ids.basic = basic.id
  ids.hs = hs.id
  ids.mgmt = mgmt.id
  ids.grade8 = (await prisma.academicClass.findFirstOrThrow({ where: { educationLevelId: basic.id, name: "Grade 8" } })).id
  ids.grade7 = (await prisma.academicClass.findFirstOrThrow({ where: { educationLevelId: basic.id, name: "Grade 7" } })).id
  ids.grade11 = (await prisma.academicClass.findFirstOrThrow({ where: { programId: mgmt.id, name: "Grade 11" } })).id
  ids.grade8A = (await structure.saveSection(ctxA, null, { classId: ids.grade8, name: "A", isActive: true })).id
  ids.grade7A = (await structure.saveSection(ctxA, null, { classId: ids.grade7, name: "A", isActive: true })).id
  ids.year = (await structure.saveAcademicYear(ctxA, null, { name: "2083", startDate: "2026-04-14", endDate: "2027-04-13", status: "ACTIVE", isCurrent: true })).id
  ids.math = (await structure.saveSubject(ctxA, null, { name: "Mathematics", code: "MATH", educationLevelId: basic.id, isActive: true })).id
  ids.accounts = (await structure.saveSubject(ctxA, null, { name: "Accountancy", code: "ACC", programId: mgmt.id, isActive: true })).id
  ids.designation = (await structure.saveDesignation(ctxA, null, { name: "Teacher", isActive: true })).id
  ids.science = (await structure.saveFaculty(ctxA, null, { name: "Science Department", code: "SCI", isActive: true })).id
  ids.commerce = (await structure.saveFaculty(ctxA, null, { name: "Commerce Department", code: "COM", isActive: true })).id
  ids.cvReq = (await structure.saveDocumentRequirement(ctxA, null, { audience: "TEACHER", name: "CV", isRequired: true, isActive: true })).id

  // B gets its own designation and year.
  ids.yearB = (await structure.saveAcademicYear(ctxB, null, { name: "2083", startDate: "2026-04-14", endDate: "2027-04-13", status: "ACTIVE", isCurrent: true })).id
  ids.designationB = (await structure.saveDesignation(ctxB, null, { name: "Lecturer", isActive: true })).id
})

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [`test-ta-${run}`, `test-tb-${run}`] } } })
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
  await prisma.$disconnect()
})

describe("creating teachers", () => {
  it("creates a profile with employment history, qualifications, certifications and an assignment", async () => {
    const created = await createTeacher(ctxA, teacherInput({
      qualifications: [{ level: "MASTER", title: "M.Ed. Mathematics", specialization: "Mathematics", institutionName: "Tribhuvan University", completionYear: "2015" }],
      certifications: [{ name: "Teacher Professional Development", issuingOrganization: "CEHRD", issueDate: "2020-01-10" }],
      assignments: [assignment()],
    }))
    ids.t1 = created.id
    assert.match(created.employeeId, /^EMP-\d{4}$/)
    const p = await getTeacherProfile(ctxA, created.id)
    assert.equal(p.qualifications.length, 1)
    assert.equal(p.certifications.length, 1)
    assert.equal(p.assignments.length, 1)
    assert.equal(p.assignments[0].educationLevelId, ids.basic, "level derived from the class")
    assert.equal(p.employment?.employmentRecords.length, 1)
    assert.equal(p.sensitive?.addresses.length, 2)
  })

  it("generates unique employee IDs under concurrency", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createTeacher(ctxA, teacherInput({ personal: { firstName: `Parallel${i}`, lastName: "Teacher" } })))
    )
    assert.equal(new Set(results.map((r) => r.employeeId)).size, 5)
  })

  it("rejects duplicate employee IDs in an organisation but allows them across organisations", async () => {
    await createTeacher(ctxA, teacherInput({ employeeId: "T-100" }))
    await rejects(createTeacher(ctxA, teacherInput({ employeeId: "t-100" })), ValidationError, "employeeId")
    const other = await createTeacher(ctxB, teacherInput({ employeeId: "T-100", employment: { designationId: ids.designationB, departmentId: "" } }))
    ids.tB = other.id
  })

  it("rejects designations, departments and accounts from elsewhere", async () => {
    await rejects(createTeacher(ctxB, teacherInput({ employment: { designationId: ids.designation, departmentId: "" } })), ValidationError, "employment.designationId")
    const outsider = await makeUser("outsider")
    await rejects(createTeacher(ctxA, teacherInput({ userId: outsider.id })), ValidationError, "userId")
  })
})

describe("teaching assignments", () => {
  it("validates against the education structure", async () => {
    await rejects(addAssignment(ctxA, ids.t1, assignment({ sectionId: ids.grade7A })), ValidationError, "sectionId")
    await rejects(addAssignment(ctxA, ids.t1, assignment({ classId: ids.grade11, sectionId: "", subjectId: ids.math })), ValidationError, "subjectId")
    await rejects(addAssignment(ctxA, ids.t1, assignment({ classId: ids.grade8, sectionId: "", programId: ids.mgmt })), ValidationError, "classId")
    await rejects(addAssignment(ctxB, ids.tB, assignment({ academicYearId: ids.yearB })), ValidationError, "classId")
    await rejects(addAssignment(ctxA, ids.t1, assignment()), ValidationError, "classId") // exact duplicate
  })

  it("supports program-level and subject-only assignments (+2 and visiting lecturers)", async () => {
    await addAssignment(ctxA, ids.t1, assignment({ classId: ids.grade11, sectionId: "", subjectId: ids.accounts }))
    await addAssignment(ctxA, ids.t1, assignment({ classId: "", sectionId: "", programId: ids.mgmt, subjectId: ids.accounts }))
    const p = await getTeacherProfile(ctxA, ids.t1)
    const programWide = p.assignments.find((a) => a.programId === ids.mgmt && !a.classId)
    assert.equal(programWide?.educationLevelId, ids.hs)
  })

  it("lets several teachers teach the same subject but allows one class teacher per section", async () => {
    const t2 = await createTeacher(ctxA, teacherInput({ personal: { firstName: "Hari", lastName: "Thapa" } }))
    ids.t2 = t2.id
    await addAssignment(ctxA, ids.t2, assignment())
    await addAssignment(ctxA, ids.t1, assignment({ role: "CLASS_TEACHER", subjectId: "" }))
    await rejects(addAssignment(ctxA, ids.t2, assignment({ role: "CLASS_TEACHER", subjectId: "" })), ValidationError, "classId")
  })

  it("never edits what is taught; ending keeps history", async () => {
    const p = await getTeacherProfile(ctxA, ids.t2)
    const a = p.assignments[0]
    await updateAssignment(ctxA, a.id, { role: "SUBJECT_TEACHER", startDate: "2026-04-21", weeklyPeriods: "8" })
    await endAssignment(ctxA, a.id, { endDate: "2026-09-01", endReason: "Timetable change" })
    await rejects(endAssignment(ctxA, a.id, { endDate: "2026-09-02" }), ConflictError)
    const after = await getTeacherProfile(ctxA, ids.t2)
    const ended = after.assignments.find((x) => x.id === a.id)!
    assert.equal(ended.status, "ENDED")
    assert.equal(ended.classId, ids.grade8, "placement unchanged")
    assert.equal(ended.weeklyPeriods, 8)
  })

  it("limits department heads to their own department", async () => {
    const head = await makeUser("head")
    await prisma.teacher.update({ where: { id: ids.t1 }, data: { userId: head.id } })
    const headCtx = ctxFor(ctxA.organization, head.id, ["teachers.view", "teachers.assignments.manage_department"])
    // t2 is in Science (same as t1): allowed.
    await addAssignment(headCtx, ids.t2, assignment({ classId: ids.grade7, sectionId: ids.grade7A }))
    const commerce = await createTeacher(ctxA, teacherInput({ personal: { firstName: "Gita", lastName: "Rai" }, employment: { departmentId: ids.commerce } }))
    await rejects(addAssignment(headCtx, commerce.id, assignment({ classId: ids.grade7, sectionId: ids.grade7A })), ForbiddenError)
    const noRights = ctxFor(ctxA.organization, head.id, ["teachers.view"])
    await rejects(addAssignment(noRights, ids.t2, assignment({ classId: ids.grade7, sectionId: "" })), ForbiddenError)
    await prisma.teacher.update({ where: { id: ids.t1 }, data: { userId: null } })
  })
})

describe("employment history", () => {
  it("records each change and ends assignments when a teacher leaves", async () => {
    const before = await getTeacherProfile(ctxA, ids.t2)
    const active = before.assignments.filter((a) => a.status === "ACTIVE").length
    assert.ok(active > 0)
    const result = await changeEmployment(ctxA, ids.t2, {
      dateOfJoining: "2024-04-15", employmentType: "FULL_TIME", employmentStatus: "RESIGNED",
      designationId: ids.designation, departmentId: ids.science, onProbation: false,
      effectiveDate: "2026-12-31", changeNote: "Moved abroad",
    })
    assert.equal(result.endedAssignments, active)
    const after = await getTeacherProfile(ctxA, ids.t2)
    assert.equal(after.employmentStatus, "RESIGNED")
    assert.equal(after.employment?.employmentRecords.length, 2)
    assert.equal(after.employment?.employmentRecords[0].note, "Moved abroad")
    assert.ok(after.assignments.every((a) => a.status !== "ACTIVE"))
    await rejects(addAssignment(ctxA, ids.t2, assignment({ classId: ids.grade7, sectionId: "" })), ConflictError)
  })
})

describe("access and privacy", () => {
  it("hides other organisations' teachers", async () => {
    await rejects(getTeacherProfile(ctxB, ids.t1), NotFoundError)
    await rejects(updateTeacher(ctxB, ids.t1, teacherInput()), NotFoundError)
    await rejects(archiveTeacher(ctxB, ids.t1), NotFoundError)
    await rejects(teacherDocumentUrl(ctxB, ids.t1, randomUUID()), NotFoundError)
    const result = await bulkTeacherAction(ctxB, { action: "archive", ids: [ids.t1] })
    assert.equal(result.succeeded, 0)
    assert.equal((await prisma.teacher.findUniqueOrThrow({ where: { id: ids.t1 } })).archivedAt, null)
  })

  it("removes restricted fields on the server", async () => {
    const colleague = ctxFor(ctxA.organization, ctxA.user.id, ["teachers.view"])
    const p = await getTeacherProfile(colleague, ids.t1)
    assert.equal(p.sensitive, null)
    assert.equal(p.employment, null)
    assert.ok(!("dateOfBirth" in p))
  })

  it("lets a teacher see only their own profile without teachers.view", async () => {
    const self = await makeUser("self")
    await prisma.organizationMember.create({
      data: { userId: self.id, organizationId: ctxA.organization.id, roleId: (await prisma.role.create({ data: { organizationId: ctxA.organization.id, name: "T", slug: `t-${run}` } })).id },
    })
    await linkUser(ctxA, ids.t1, { userId: self.id })
    const selfCtx = ctxFor(ctxA.organization, self.id, ["dashboard.view"])
    const own = await getTeacherProfile(selfCtx, ids.t1)
    assert.ok(own.sensitive && own.employment, "own record is fully visible")
    await rejects(getTeacherProfile(selfCtx, ids.t2), NotFoundError)
    // Nobody verifies their own records.
    const q = own.qualifications[0]
    await rejects(verifyRecord(ctxFor(ctxA.organization, self.id), ids.t1, "qualification", q.id, { status: "VERIFIED" }), ForbiddenError)
    await verifyRecord(ctxA, ids.t1, "qualification", q.id, { status: "VERIFIED" })
    // The same account can't be linked to a second teacher.
    await rejects(linkUser(ctxA, ids.t2, { userId: self.id }), ValidationError, "userId")
    // Editing a verified qualification sends it back for verification.
    await saveQualification(ctxA, ids.t1, q.id, { level: "MASTER", title: "M.Ed. Mathematics Education" })
    assert.equal((await prisma.teacherQualification.findUniqueOrThrow({ where: { id: q.id } })).verificationStatus, "PENDING")
  })
})

describe("list, filters and export", () => {
  it("filters on the server and counts teachers once", async () => {
    const byDept = await listTeachers(ctxA, parseTeacherFilters({ department: ids.commerce }))
    assert.equal(byDept.total, 1)
    const bySubject = await listTeachers(ctxA, parseTeacherFilters({ subject: ids.accounts }))
    assert.deepEqual(bySubject.rows.map((r) => r.id), [ids.t1])
    const masters = await listTeachers(ctxA, parseTeacherFilters({ qualLevel: "MASTER" }))
    assert.deepEqual(masters.rows.map((r) => r.id), [ids.t1])
    const resigned = await listTeachers(ctxA, parseTeacherFilters({ status: "RESIGNED" }))
    assert.deepEqual(resigned.rows.map((r) => r.id), [ids.t2])
    const search = await listTeachers(ctxA, parseTeacherFilters({ q: "hari thapa" }))
    assert.deepEqual(search.rows.map((r) => r.id), [ids.t2])

    const all = await listTeachers(ctxA, parseTeacherFilters({ pageSize: "100" }))
    const stats = await getTeacherStats(ctxA, all.yearId)
    assert.equal(stats.total, all.total)
    const assigned = await listTeachers(ctxA, parseTeacherFilters({ assigned: "yes" }))
    assert.equal(stats.assigned, assigned.total)
    const missingDocs = await listTeachers(ctxA, parseTeacherFilters({ documents: "missing" }))
    assert.equal(missingDocs.total, all.total, "nobody has uploaded the required CV")
  })

  it("paginates and sorts consistently", async () => {
    const all = await listTeachers(ctxA, parseTeacherFilters({ pageSize: "100", sort: "employeeId" }))
    const seen: string[] = []
    for (let page = 1; page <= Math.ceil(all.total / 10); page++) {
      seen.push(...(await listTeachers(ctxA, parseTeacherFilters({ pageSize: "10", page: String(page), sort: "employeeId" }))).rows.map((r) => r.id))
    }
    assert.deepEqual(seen, all.rows.map((r) => r.id))
  })

  it("exports the filtered rows with restricted columns only when allowed", async () => {
    const filters = parseTeacherFilters({ department: ids.science })
    const list = await listTeachers(ctxA, filters)
    const text = await new Response(await exportTeachersCsv(ctxA, filters, {})).text()
    const lines = text.trim().split("\r\n")
    assert.equal(lines.length - 1, list.total)
    assert.ok(lines[0].includes("Date of birth"))
    const limited = ctxFor(ctxA.organization, ctxA.user.id, ["teachers.view", "teachers.export"])
    const header = (await new Response(await exportTeachersCsv(limited, filters, {})).text()).split("\r\n")[0]
    assert.ok(!header.includes("Date of birth") && !header.includes("Contract end date"))
    assert.ok(!/salary/i.test(text))
    const foreign = await new Response(await exportTeachersCsv(ctxB, parseTeacherFilters({}), { ids: [ids.t1] })).text()
    assert.equal(foreign.trim().split("\r\n").length, 1, "only the header")
  })
})

describe("archive and delete", () => {
  it("archives (ending assignments), restores, and only deletes profiles without history", async () => {
    await archiveTeacher(ctxA, ids.t1)
    const archived = await getTeacherProfile(ctxA, ids.t1)
    assert.ok(archived.archivedAt)
    assert.ok(archived.assignments.every((a) => a.status !== "ACTIVE"))
    await rejects(deleteTeacher(ctxA, ids.t1), ConflictError)
    await restoreTeacher(ctxA, ids.t1)

    const mistake = await createTeacher(ctxA, teacherInput({ personal: { firstName: "Mistake", lastName: "Entry" } }))
    await rejects(deleteTeacher(ctxA, mistake.id), ConflictError)
    await archiveTeacher(ctxA, mistake.id)
    await deleteTeacher(ctxA, mistake.id)
    assert.equal(await prisma.teacher.count({ where: { id: mistake.id } }), 0)
    // The linked login account is never deleted.
    assert.equal(await prisma.user.count({ where: { id: { in: users.map((u) => u.id) } } }), users.length)
  })

  it("blocks deleting a designation or subject that is in use", async () => {
    await rejects(structure.deleteDesignation(ctxA, ids.designation), ConflictError)
    await rejects(structure.deleteSubject(ctxA, ids.math), ConflictError)
  })
})

describe("CSV import", () => {
  const header = "employee_id,first_name,last_name,date_of_joining,designation,department,qualification_level,qualification_title,email\r\n"

  it("validates rows, maps designations/departments and imports only valid rows", async () => {
    const csv =
      header +
      "IMP-1,Sita,Gurung,2025-04-15,Teacher,SCI,master,M.Sc. Physics,sita@example.com\r\n" +
      "IMP-2,Unknown,Designation,2025-04-15,Principal Lecturer,,,,\r\n" +
      "IMP-1,Dup,Id,2025-04-15,,,,,\r\n" +
      "IMP-3,Bad,Date,15-04-2025,,,,,\r\n" +
      "IMP-4,No,Level,2025-04-15,,,,B.Ed.,\r\n" +
      "IMP-5,Foreign,Dept,2025-04-15,Lecturer,,,,\r\n"
    const preview = await previewTeacherImport(ctxA, { csv, firstLine: 2 })
    assert.deepEqual(preview.rows.map((r) => r.errors.length > 0), [false, true, true, true, true, true])
    assert.ok(preview.rows[5].errors.some((e) => e.includes("Unknown designation")), "another org's designation isn't visible")
    const result = await commitTeacherImport(ctxA, { csv, firstLine: 2 })
    assert.equal(result.created, 1)
    const sita = await prisma.teacher.findFirstOrThrow({
      where: { organizationId: ctxA.organization.id, employeeId: "IMP-1" },
      include: { qualifications: true, assignments: true },
    })
    assert.equal(sita.departmentId, ids.science)
    assert.equal(sita.qualifications[0].level, "MASTER")
    assert.equal(sita.assignments.length, 0)
    assert.equal(sita.userId, null)
    assert.equal((await commitTeacherImport(ctxA, { csv, firstLine: 2 })).created, 0, "re-import doesn't duplicate")
  })
})
