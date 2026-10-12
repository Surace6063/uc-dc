// End-to-end service tests against the configured database. Each run creates
// two throwaway organisations (random slugs) and one test user, and deletes
// them afterwards; no existing data is read or changed.
//
//   npm run test:integration
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import { parseStudentFilters } from "@/features/students/filters"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import * as structure from "@/services/academics/structure-service"
import { documentDownloadUrl } from "@/services/students/document-service"
import {
  addEnrollment,
  correctEnrollment,
  progressEnrollment,
} from "@/services/students/enrollment-service"
import { exportStudentsCsv } from "@/services/students/export-service"
import { commitImport, previewImport } from "@/services/students/import-service"
import { listStudents, getStudentStats } from "@/services/students/student-query"
import {
  addGuardian,
  archiveStudent,
  assertCanViewStudent,
  bulkStudentAction,
  changeStudentStatus,
  createStudent,
  deleteStudent,
  getStudentProfile,
  restoreStudent,
  updateStudent,
} from "@/services/students/student-service"

type Ctx = AuthContext

const run = randomUUID().slice(0, 8)
let user: { id: string; email: string }
let ctxA: Ctx
let ctxB: Ctx
const ids = {} as Record<string, string>

function ctxFor(org: { id: string; name: string; slug: string }, permissions: readonly PermissionKey[] = PERMISSION_KEYS): Ctx {
  return {
    user: { id: user.id, authUserId: randomUUID(), email: user.email, name: "Test", avatarUrl: null, isPlatformAdmin: false },
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
    assert.ok(error instanceof type, `expected ${type.name}, got ${(error as Error)?.constructor?.name}: ${(error as Error)?.message}`)
    if (field) {
      assert.ok(error instanceof ValidationError && error.fieldErrors[field], `expected an error on ${field}, got ${JSON.stringify((error as unknown as ValidationError).fieldErrors)}`)
    }
    return error as T
  }
  assert.fail(`expected ${type.name}`)
}

function admission(overrides: Record<string, unknown> = {}) {
  const { personal, admission: adm, enrollment, ...rest } = overrides as {
    personal?: object
    admission?: object
    enrollment?: object | null
  }
  return {
    personal: { firstName: "Aarav", lastName: "Shrestha", dateOfBirth: "2014-05-01", gender: "MALE", ...personal },
    admission: { admissionNumber: "", admissionDate: "2026-04-14", admissionType: "NEW", ...adm },
    permanentAddress: { province: "3", district: "Kathmandu", municipality: "Kathmandu Metropolitan City", wardNumber: "10" },
    sameAsPermanent: true,
    temporaryAddress: {},
    guardians: [
      {
        fullName: "Hari Shrestha", phone: "9800000001", relationship: "FATHER", isPrimary: true,
        isEmergencyContact: true, receivesAcademicNotifications: true, receivesBillingNotifications: true,
      },
    ],
    enroll: enrollment !== null,
    enrollment:
      enrollment === null
        ? null
        : {
            academicYearId: ids.yearA, educationLevelId: ids.basicA, programId: "", classId: ids.grade1A,
            sectionId: ids.sectionA, batchId: "", rollNumber: "", enrollmentDate: "", enrollmentType: "NEW_ADMISSION",
            ...enrollment,
          },
    ...rest,
  }
}

before(async () => {
  user = await prisma.user.create({
    data: { authUserId: randomUUID(), email: `test-${run}@example.com`, name: "Integration Test" },
    select: { id: true, email: true },
  })
  const orgA = await prisma.organization.create({ data: { name: `Test School ${run}`, slug: `test-a-${run}`, type: "SCHOOL" } })
  const orgB = await prisma.organization.create({ data: { name: `Test College ${run}`, slug: `test-b-${run}`, type: "COLLEGE" } })
  ctxA = ctxFor(orgA)
  ctxB = ctxFor(orgB)
})

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [`test-a-${run}`, `test-b-${run}`] } } })
  await prisma.user.deleteMany({ where: { id: user.id } })
  await prisma.$disconnect()
})

describe("education structure", () => {
  it("creates levels from presets, programs, classes, sections and years", async () => {
    await structure.applyEducationPreset(ctxA, { presetKey: "basic", createClasses: true, createPrograms: false })
    const basic = await prisma.educationLevel.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, code: "BASIC" } })
    ids.basicA = basic.id
    const classes = await prisma.academicClass.findMany({ where: { educationLevelId: basic.id }, orderBy: { sequence: "asc" } })
    assert.equal(classes.length, 8)
    ids.grade1A = classes[0].id
    ids.grade2A = classes[1].id

    ids.sectionA = (await structure.saveSection(ctxA, null, { classId: ids.grade1A, name: "A", isActive: true })).id
    ids.sectionB = (await structure.saveSection(ctxA, null, { classId: ids.grade1A, name: "B", isActive: true })).id
    ids.section2A = (await structure.saveSection(ctxA, null, { classId: ids.grade2A, name: "A", isActive: true })).id

    ids.yearA = (await structure.saveAcademicYear(ctxA, null, { name: "2083", startDate: "2026-04-14", endDate: "2027-04-13", status: "ACTIVE", isCurrent: true })).id
    ids.nextYearA = (await structure.saveAcademicYear(ctxA, null, { name: "2084", startDate: "2027-04-14", endDate: "2028-04-12", status: "PLANNED", isCurrent: false })).id

    // A +2 level with programs in the same organisation.
    await structure.applyEducationPreset(ctxA, { presetKey: "higher_secondary", createClasses: false, createPrograms: true })
    const hs = await prisma.educationLevel.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, code: "HSEB" } })
    ids.hsA = hs.id
    const science = await prisma.program.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, code: "SCI" } })
    ids.scienceA = science.id
    const generated = await structure.generateClasses(ctxA, { educationLevelId: hs.id, programId: science.id, kind: "GRADE", count: 2, startAt: 11 })
    assert.equal(generated.created, 2)
    ids.grade11SciA = (await prisma.academicClass.findFirstOrThrow({ where: { programId: science.id, name: "Grade 11" } })).id
  })

  it("keeps only one current academic year", async () => {
    await structure.setCurrentAcademicYear(ctxA, ids.nextYearA)
    const current = await prisma.academicYear.findMany({ where: { organizationId: ctxA.organization.id, isCurrent: true } })
    assert.deepEqual(current.map((y) => y.id), [ids.nextYearA])
    await structure.setCurrentAcademicYear(ctxA, ids.yearA)
  })

  it("requires programs exactly when the level uses them", async () => {
    await rejects(structure.saveAcademicClass(ctxA, null, { educationLevelId: ids.hsA, programId: "", name: "X", kind: "GRADE", isActive: true }), ValidationError, "programId")
    await rejects(structure.saveAcademicClass(ctxA, null, { educationLevelId: ids.basicA, programId: ids.scienceA, name: "X", kind: "GRADE", isActive: true }), ValidationError, "programId")
  })

  it("refuses references to another organisation's structure", async () => {
    await rejects(structure.saveSection(ctxB, null, { classId: ids.grade1A, name: "Z", isActive: true }), ValidationError, "classId")
    await rejects(structure.saveProgram(ctxB, null, { educationLevelId: ids.hsA, name: "X", code: "X", isActive: true }), ValidationError, "educationLevelId")
    await rejects(structure.deleteAcademicClass(ctxB, ids.grade1A), NotFoundError)
  })

  it("sets up organisation B with its own structure", async () => {
    await structure.applyEducationPreset(ctxB, { presetKey: "bachelor", createClasses: false, createPrograms: true })
    const bca = await prisma.program.findFirstOrThrow({ where: { organizationId: ctxB.organization.id, code: "BCA" } })
    const level = await prisma.educationLevel.findFirstOrThrow({ where: { organizationId: ctxB.organization.id } })
    await structure.generateClasses(ctxB, { educationLevelId: level.id, programId: bca.id, kind: "SEMESTER", count: 8 })
    ids.bachB = level.id
    ids.bcaB = bca.id
    ids.sem1B = (await prisma.academicClass.findFirstOrThrow({ where: { programId: bca.id, name: "Semester 1" } })).id
    ids.yearB = (await structure.saveAcademicYear(ctxB, null, { name: "2083", startDate: "2026-04-14", endDate: "2027-04-13", status: "ACTIVE", isCurrent: true })).id
  })
})

describe("admission and CRUD", () => {
  it("admits a student with an initial enrollment, generated numbers and guardian", async () => {
    const created = await createStudent(ctxA, admission())
    ids.student1 = created.id
    assert.match(created.admissionNumber, /^ADM-\d{5}$/)
    const profile = await getStudentProfile(ctxA, created.id)
    assert.equal(profile.enrollments.length, 1)
    const e = profile.enrollments[0]
    assert.equal(e.status, "ACTIVE")
    assert.equal(e.educationLevelId, ids.basicA)
    assert.equal(e.class.id, ids.grade1A)
    assert.equal(e.rollNumber, "1")
    assert.equal(profile.guardians.length, 1)
    assert.ok(profile.guardians[0].isPrimary)
    assert.equal(profile.addresses.length, 2) // temporary copied from permanent
  })

  it("generates unique admission numbers under concurrency", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createStudent(ctxA, admission({ personal: { firstName: `Concurrent${i}`, lastName: "Test", dateOfBirth: "" }, guardians: [] })))
    )
    const numbers = results.map((r) => r.admissionNumber)
    assert.equal(new Set(numbers).size, 5)
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: { in: results.map((r) => r.id) } },
      select: { rollNumber: true },
    })
    assert.equal(new Set(enrollments.map((e) => e.rollNumber)).size, 5, "automatic roll numbers are unique too")
  })

  it("rejects a duplicate admission number in the same organisation", async () => {
    await createStudent(ctxA, admission({ admission: { admissionNumber: "MAN-001" }, enrollment: null, guardians: [] }))
    await rejects(createStudent(ctxA, admission({ admission: { admissionNumber: "man-001" }, enrollment: null, guardians: [] })), ValidationError, "admission.admissionNumber")
  })

  it("allows the same admission number in a different organisation", async () => {
    const created = await createStudent(ctxB, admission({
      admission: { admissionNumber: "MAN-001" },
      enrollment: { academicYearId: ids.yearB, educationLevelId: ids.bachB, programId: ids.bcaB, classId: ids.sem1B, sectionId: "" },
      guardians: [],
    }))
    ids.studentB = created.id
    assert.equal(created.admissionNumber, "MAN-001")
  })

  it("updates student details and addresses", async () => {
    await updateStudent(ctxA, ids.student1, {
      personal: { firstName: "Aarav", middleName: "Kumar", lastName: "Shrestha", dateOfBirth: "2014-05-01", email: "AARAV@EXAMPLE.COM" },
      admission: { admissionNumber: "", admissionDate: "2026-04-14", admissionType: "NEW" },
      permanentAddress: { province: "4", district: "Kaski", municipality: "Pokhara", wardNumber: "5" },
      sameAsPermanent: false,
      temporaryAddress: { province: "3", district: "Lalitpur" },
    })
    const s = await getStudentProfile(ctxA, ids.student1)
    assert.equal(s.middleName, "Kumar")
    assert.equal(s.email, "aarav@example.com")
    assert.equal(s.addresses.find((a) => a.type === "PERMANENT")?.district, "Kaski")
    assert.equal(s.addresses.find((a) => a.type === "TEMPORARY")?.district, "Lalitpur")
  })

  it("links one guardian to siblings instead of duplicating", async () => {
    const sibling = await createStudent(ctxA, admission({ personal: { firstName: "Anu", lastName: "Shrestha", gender: "FEMALE" } }))
    ids.sibling = sibling.id
    const guardians = await prisma.guardian.findMany({ where: { organizationId: ctxA.organization.id, phone: "9800000001" } })
    assert.equal(guardians.length, 1, "same name + phone reuses the guardian")
    ids.guardian = guardians[0].id
    // Explicitly link an existing guardian as a second contact.
    const other = await createStudent(ctxA, admission({ personal: { firstName: "Bina", lastName: "Rai" }, guardians: [], enrollment: null }))
    await addGuardian(ctxA, other.id, {
      guardianId: ids.guardian, relationship: "UNCLE", isPrimary: true, isEmergencyContact: false,
      receivesAcademicNotifications: true, receivesBillingNotifications: false,
    })
    assert.equal(await prisma.studentGuardian.count({ where: { guardianId: ids.guardian } }), 3)
    // Another organisation can't link this guardian.
    await rejects(
      addGuardian(ctxB, ids.studentB, {
        guardianId: ids.guardian, relationship: "UNCLE", isPrimary: false, isEmergencyContact: false,
        receivesAcademicNotifications: true, receivesBillingNotifications: false,
      }),
      ValidationError,
      "guardian.guardianId"
    )
  })

  it("archives and restores without losing history", async () => {
    await archiveStudent(ctxA, ids.sibling, "Test")
    await rejects(archiveStudent(ctxA, ids.sibling), ConflictError)
    let s = await getStudentProfile(ctxA, ids.sibling)
    assert.ok(s.archivedAt)
    assert.equal(s.status, "ACTIVE", "archiving is separate from lifecycle status")
    await restoreStudent(ctxA, ids.sibling)
    s = await getStudentProfile(ctxA, ids.sibling)
    assert.equal(s.archivedAt, null)
    assert.deepEqual(s.statusHistory.map((h) => h.action).sort(), ["ARCHIVED", "CREATED", "RESTORED"])
    assert.equal(s.enrollments.length, 1)
  })
})

describe("tenant isolation", () => {
  it("hides other organisations' students", async () => {
    await rejects(getStudentProfile(ctxB, ids.student1), NotFoundError)
    await rejects(updateStudent(ctxB, ids.student1, admission()), NotFoundError)
    await rejects(archiveStudent(ctxB, ids.student1), NotFoundError)
    await rejects(deleteStudent(ctxB, ids.student1), NotFoundError)
    const list = await listStudents(ctxB, parseStudentFilters({ year: "all", q: "Aarav" }))
    assert.equal(list.rows.some((r) => r.id === ids.student1), false)
  })

  it("never acts on foreign IDs in bulk operations", async () => {
    const result = await bulkStudentAction(ctxB, { action: "archive", ids: [ids.student1, ids.studentB] })
    assert.equal(result.succeeded, 1)
    assert.deepEqual(result.failed.map((f) => f.id), [ids.student1])
    const s = await prisma.student.findUniqueOrThrow({ where: { id: ids.student1 } })
    assert.equal(s.archivedAt, null)
    await bulkStudentAction(ctxB, { action: "restore", ids: [ids.studentB] })
  })

  it("rejects placements that point into another organisation", async () => {
    await rejects(createStudent(ctxB, admission({
      enrollment: { academicYearId: ids.yearB, educationLevelId: ids.basicA, classId: ids.grade1A, sectionId: "" },
    })), ValidationError, "enrollment.classId")
    await rejects(createStudent(ctxB, admission({
      enrollment: { academicYearId: ids.yearA, educationLevelId: ids.bachB, programId: ids.bcaB, classId: ids.sem1B, sectionId: "" },
    })), ValidationError, "enrollment.academicYearId")
    await rejects(addEnrollment(ctxB, ids.student1, { academicYearId: ids.yearA, educationLevelId: ids.basicA, classId: ids.grade1A, enrollmentType: "NEW_ADMISSION" }), NotFoundError)
  })

  it("refuses document access across organisations", async () => {
    const doc = await prisma.studentDocument.create({
      data: {
        organizationId: ctxA.organization.id, studentId: ids.student1, title: "Birth certificate",
        fileName: "bc.pdf", mimeType: "application/pdf", sizeBytes: 10, storagePath: `${ctxA.organization.id}/test/${run}.pdf`,
      },
    })
    await rejects(documentDownloadUrl(ctxB, ids.student1, doc.id), NotFoundError)
    await rejects(documentDownloadUrl(ctxB, ids.studentB, doc.id), NotFoundError)
    await prisma.studentDocument.delete({ where: { id: doc.id } })
  })
})

describe("invalid relationships", () => {
  it("rejects a section of a different class", async () => {
    await rejects(createStudent(ctxA, admission({ enrollment: { sectionId: ids.section2A } })), ValidationError, "enrollment.sectionId")
  })

  it("rejects a class that doesn't match the chosen level or program", async () => {
    await rejects(createStudent(ctxA, admission({ enrollment: { educationLevelId: ids.hsA, programId: ids.scienceA } })), ValidationError, "enrollment.classId")
    await rejects(createStudent(ctxA, admission({ enrollment: { classId: ids.grade11SciA } })), ValidationError, "enrollment.classId")
  })

  it("rejects a taken roll number and a second active enrollment in a year", async () => {
    await rejects(createStudent(ctxA, admission({ personal: { firstName: "Roll", lastName: "Clash" }, enrollment: { rollNumber: "1" } })), ValidationError, "enrollment.rollNumber")
    await rejects(addEnrollment(ctxA, ids.student1, {
      academicYearId: ids.yearA, educationLevelId: ids.basicA, classId: ids.grade2A, enrollmentType: "NEW_ADMISSION",
    }), ValidationError, "academicYearId")
  })

  it("enforces one active enrollment per year in the database itself", async () => {
    await assert.rejects(
      prisma.enrollment.create({
        data: {
          organizationId: ctxA.organization.id, studentId: ids.student1, academicYearId: ids.yearA,
          educationLevelId: ids.basicA, classId: ids.grade2A, enrollmentDate: new Date(), status: "ACTIVE",
        },
      }),
      (error: { code?: string }) => error.code === "P2002"
    )
  })

  it("rejects a cross-tenant enrollment even when written directly", async () => {
    await assert.rejects(
      prisma.enrollment.create({
        data: {
          organizationId: ctxB.organization.id, studentId: ids.studentB, academicYearId: ids.yearB,
          educationLevelId: ids.basicA, classId: ids.grade1A, enrollmentDate: new Date(), status: "CANCELLED",
        },
      }),
      (error: { code?: string }) => error.code === "P2003"
    )
  })
})

describe("progression preserves history", () => {
  it("promotes to the next class and year as a new enrollment", async () => {
    const before = await getStudentProfile(ctxA, ids.student1)
    const current = before.enrollments[0]
    await correctEnrollment(ctxA, current.id, { sectionId: ids.sectionB, rollNumber: "42", enrollmentDate: "2026-04-15" })
    const result = await progressEnrollment(ctxA, current.id, {
      outcome: "PROMOTED", endedOn: "2027-04-10", createNext: true,
      next: { academicYearId: ids.nextYearA, educationLevelId: ids.basicA, classId: ids.grade2A, sectionId: ids.section2A, enrollmentType: "PROMOTION" },
    })
    const after = await getStudentProfile(ctxA, ids.student1)
    assert.equal(after.enrollments.length, 2)
    const old = after.enrollments.find((e) => e.id === current.id)!
    assert.equal(old.status, "PROMOTED")
    assert.equal(old.class.id, ids.grade1A, "the old placement is not rewritten")
    assert.equal(old.section?.id, ids.sectionB)
    assert.equal(old.rollNumber, "42")
    const next = after.enrollments.find((e) => e.id === result.next)!
    assert.equal(next.status, "ACTIVE")
    assert.equal(next.previousEnrollmentId, current.id)
    // Closed placements can't be progressed again.
    await rejects(progressEnrollment(ctxA, current.id, { outcome: "PROMOTED", endedOn: "2027-04-10", createNext: false }), ConflictError)
  })

  it("closes open enrollments when a student withdraws", async () => {
    const s = await createStudent(ctxA, admission({ personal: { firstName: "Leaving", lastName: "Student" }, guardians: [] }))
    await changeStudentStatus(ctxA, s.id, { status: "WITHDRAWN", reason: "Moved" })
    const p = await getStudentProfile(ctxA, s.id)
    assert.equal(p.status, "WITHDRAWN")
    assert.equal(p.enrollments[0].status, "WITHDRAWN")
    await rejects(changeStudentStatus(ctxA, s.id, { status: "GRADUATED" }), ConflictError)
  })
})

describe("list, filters, pagination and export", () => {
  it("filters by academic context and status", async () => {
    const inYear = await listStudents(ctxA, parseStudentFilters({ year: ids.yearA }))
    const grade1 = await listStudents(ctxA, parseStudentFilters({ year: ids.yearA, level: ids.basicA, class: ids.grade1A }))
    assert.ok(grade1.total > 0 && grade1.total <= inYear.total)
    assert.ok(grade1.rows.every((r) => r.enrollments[0]?.class.id === ids.grade1A))

    const withdrawn = await listStudents(ctxA, parseStudentFilters({ year: "all", status: "WITHDRAWN" }))
    assert.equal(withdrawn.total, 1)

    const bca = await listStudents(ctxB, parseStudentFilters({ year: ids.yearB, program: ids.bcaB }))
    assert.deepEqual(bca.rows.map((r) => r.id), [ids.studentB])

    const nextYear = await listStudents(ctxA, parseStudentFilters({ year: ids.nextYearA, class: ids.grade2A }))
    assert.deepEqual(nextYear.rows.map((r) => r.id), [ids.student1])

    const search = await listStudents(ctxA, parseStudentFilters({ year: "all", q: "hari 9800000001" }))
    assert.ok(search.rows.some((r) => r.id === ids.sibling), "searches guardian name and phone")
  })

  it("defaults to the current academic year", async () => {
    const byDefault = await listStudents(ctxA, parseStudentFilters({}))
    assert.equal(byDefault.yearId, ids.yearA)
  })

  it("paginates and sorts on the server consistently with the count", async () => {
    const all = await listStudents(ctxA, parseStudentFilters({ year: "all", pageSize: "100" }))
    const seen: string[] = []
    for (let page = 1; page <= Math.ceil(all.total / 10); page++) {
      const p = await listStudents(ctxA, parseStudentFilters({ year: "all", pageSize: "10", page: String(page) }))
      seen.push(...p.rows.map((r) => r.id))
    }
    assert.equal(seen.length, all.total)
    assert.equal(new Set(seen).size, all.total, "no row appears on two pages")

    const asc = await listStudents(ctxA, parseStudentFilters({ year: "all", sort: "admissionNumber", dir: "asc", pageSize: "100" }))
    const numbers = asc.rows.map((r) => r.admissionNumber)
    assert.deepEqual(numbers, [...numbers].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    const desc = await listStudents(ctxA, parseStudentFilters({ year: "all", sort: "admissionNumber", dir: "desc", pageSize: "100" }))
    assert.deepEqual(desc.rows.map((r) => r.id), [...asc.rows.map((r) => r.id)].reverse())
  })

  it("exports exactly the filtered rows, without restricted fields by default", async () => {
    const filters = parseStudentFilters({ year: ids.yearA, class: ids.grade1A })
    const list = await listStudents(ctxA, filters)
    const text = await new Response(await exportStudentsCsv(ctxA, filters, {})).text()
    const lines = text.trim().split("\r\n")
    assert.equal(lines.length - 1, list.total)
    assert.ok(lines[0].includes("Medical notes"))

    const limited = { ...ctxA, permissions: PERMISSION_KEYS.filter((k) => k !== "students.sensitive.view") }
    const restricted = await new Response(await exportStudentsCsv(limited, filters, {})).text()
    assert.ok(!restricted.split("\r\n")[0].includes("Medical notes"))

    const selected = await new Response(await exportStudentsCsv(ctxA, parseStudentFilters({ year: "all" }), { ids: [ids.student1, ids.studentB] })).text()
    assert.equal(selected.trim().split("\r\n").length - 1, 1, "foreign IDs are ignored")
  })

  it("counts students once in summary statistics", async () => {
    const stats = await getStudentStats(ctxA, ids.yearA)
    const list = await listStudents(ctxA, parseStudentFilters({ year: ids.yearA }))
    assert.equal(stats.total, list.total)
    assert.ok(stats.byLevel.every((l) => l.count <= stats.total))
    // Gender cards agree with the gender filter on the same year.
    const male = await listStudents(ctxA, parseStudentFilters({ year: ids.yearA, gender: "MALE" }))
    const female = await listStudents(ctxA, parseStudentFilters({ year: ids.yearA, gender: "FEMALE" }))
    assert.equal(stats.male, male.total)
    assert.equal(stats.female, female.total)
    assert.ok(stats.male + stats.female <= stats.total)
  })

  it("filters by created date range", async () => {
    const all = await listStudents(ctxA, parseStudentFilters({ year: "all", pageSize: "100" }))
    const today = new Date().toISOString().slice(0, 10)
    const createdToday = await listStudents(ctxA, parseStudentFilters({ year: "all", pageSize: "100", createdFrom: today, createdTo: today }))
    assert.equal(createdToday.total, all.total, "every test student was created today")
    const future = await listStudents(ctxA, parseStudentFilters({ year: "all", createdFrom: "2099-01-01" }))
    assert.equal(future.total, 0)
  })

  it("applies the blood group filter only for roles allowed to see it", async () => {
    await prisma.student.update({ where: { id: ids.student1 }, data: { bloodGroup: "AB-" } })
    const filters = parseStudentFilters({ year: "all", bloodGroup: "AB-" })
    const allowed = await listStudents(ctxA, filters)
    assert.deepEqual(allowed.rows.map((r) => r.id), [ids.student1])
    // Without students.sensitive.view the filter is ignored, so it can't be
    // used to find out who has which blood group.
    const teacher = ctxFor(ctxA.organization, ["students.view"])
    const ignored = await listStudents(teacher, filters)
    const unfiltered = await listStudents(teacher, parseStudentFilters({ year: "all" }))
    assert.equal(ignored.total, unfiltered.total)
    await prisma.student.update({ where: { id: ids.student1 }, data: { bloodGroup: null } })
  })
})

describe("permissions and record-level access", () => {
  it("lets a user without students.view see only their linked record", async () => {
    const studentRole = ctxFor(ctxA.organization, ["dashboard.view"])
    await rejects(assertCanViewStudent(studentRole, ids.student1), NotFoundError)
    await prisma.student.update({ where: { id: ids.student1 }, data: { userId: user.id } })
    await assertCanViewStudent(studentRole, ids.student1)
    await rejects(assertCanViewStudent(studentRole, ids.sibling), NotFoundError)
    await prisma.student.update({ where: { id: ids.student1 }, data: { userId: null } })
  })

  it("hides medical notes without the sensitive permission", async () => {
    await prisma.student.update({ where: { id: ids.student1 }, data: { medicalNotes: "Asthma" } })
    assert.equal((await getStudentProfile(ctxA, ids.student1)).medicalNotes, "Asthma")
    const teacher = ctxFor(ctxA.organization, ["students.view"])
    assert.equal((await getStudentProfile(teacher, ids.student1)).medicalNotes, undefined)
  })
})

describe("deletion rules", () => {
  it("only deletes archived records without academic history", async () => {
    const mistake = await createStudent(ctxA, admission({ personal: { firstName: "Mistake", lastName: "Entry" } }))
    await rejects(deleteStudent(ctxA, mistake.id), ConflictError)
    await archiveStudent(ctxA, mistake.id)
    await deleteStudent(ctxA, mistake.id)
    assert.equal(await prisma.student.count({ where: { id: mistake.id } }), 0)

    await archiveStudent(ctxA, ids.student1)
    await rejects(deleteStudent(ctxA, ids.student1), ConflictError) // promoted history
    await restoreStudent(ctxA, ids.student1)
  })

  it("blocks deleting structure that is in use", async () => {
    await rejects(structure.deleteAcademicClass(ctxA, ids.grade1A), ConflictError)
    await rejects(structure.deleteAcademicYear(ctxA, ids.yearA), ConflictError)
  })
})

describe("CSV import", () => {
  const header = "first_name,last_name,admission_number,admission_date,date_of_birth,gender,academic_year,education_level,class,section,guardian_name,guardian_phone,guardian_relationship,permanent_province,permanent_district\r\n"

  it("validates rows and reports each problem", async () => {
    const csv =
      header +
      "Sita,Gurung,IMP-1,2026-04-20,2015-01-02,female,2083,BASIC,Grade 1,A,Ram Gurung,9811111111,father,Gandaki,Kaski\r\n" +
      "Bad,Date,IMP-2,20-04-2026,,,2083,BASIC,Grade 1,,,,,,\r\n" +
      "Unknown,Class,IMP-3,2026-04-20,,,2083,BASIC,Grade 13,,,,,,\r\n" +
      "Dup,Number,IMP-1,2026-04-20,,,,,,,,,,,\r\n" +
      "Wrong,District,IMP-4,2026-04-20,,,,,,,,,,Koshi,Kathmandu\r\n" +
      "Foreign,Class,IMP-5,2026-04-20,,,2083,BACH,Semester 1,,,,,,\r\n" +
      "Bad,Gender,IMP-6,2026-04-20,,robot,,,,,,,,,\r\n"
    const preview = await previewImport(ctxA, { csv, firstLine: 2 })
    assert.equal(preview.rows.length, 7)
    assert.deepEqual(preview.rows.map((r) => r.errors.length > 0), [false, true, true, true, true, true, true])
    assert.ok(preview.rows[2].errors.some((e) => e.includes("Unknown class")))
    assert.ok(preview.rows[3].errors.some((e) => e.includes("repeats line 2")))
    assert.ok(preview.rows[5].errors.some((e) => e.includes("Unknown education level")), "another org's level code isn't visible")
    assert.equal(preview.rows[0].line, 2)

    const result = await commitImport(ctxA, { csv, firstLine: 2 })
    assert.equal(result.created, 1)
    assert.equal(result.failed, 6)
    const sita = await prisma.student.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, admissionNumber: "IMP-1" }, include: { enrollments: true } })
    assert.equal(sita.enrollments[0].classId, ids.grade1A)
    assert.equal(sita.enrollments[0].sectionId, ids.sectionA)

    // Re-importing the same file never duplicates rows with admission numbers.
    const again = await commitImport(ctxA, { csv, firstLine: 2 })
    assert.equal(again.created, 0)
  })

  it("rejects files missing required columns", async () => {
    await rejects(previewImport(ctxA, { csv: "first_name\r\nA\r\n" }), ValidationError, "file")
  })
})

describe("UGC background fields", () => {
  const background = {
    casteEthnicity: "MADHESI", disabilityType: "VISUAL",
    economicallyDisadvantaged: "yes", firstGenerationLearner: "no", remoteArea: "",
  }
  const admissionDetails = { previousQualification: "HIGHER_SECONDARY", previousResult: "GPA 3.20", entranceScore: "72.5", scholarshipCategory: "MERIT" }

  it("saves and shows background and admission details, keeping unrecorded as null", async () => {
    const created = await createStudent(ctxA, admission({ personal: { firstName: "Ugc", lastName: "Full", ...background }, admission: admissionDetails, guardians: [], enrollment: null }))
    ids.ugc = created.id
    const s = await prisma.student.findUniqueOrThrow({ where: { id: created.id } })
    assert.equal(s.casteEthnicity, "MADHESI")
    assert.equal(s.disabilityType, "VISUAL")
    assert.deepEqual([s.economicallyDisadvantaged, s.firstGenerationLearner, s.remoteArea], [true, false, null])
    assert.equal(s.previousQualification, "HIGHER_SECONDARY")
    assert.equal(s.entranceScore?.toString(), "72.5")
    assert.equal(s.scholarshipCategory, "MERIT")

    const profile = await getStudentProfile(ctxA, created.id)
    assert.equal(profile.disabilityType, "VISUAL")
    assert.equal(profile.entranceScore, 72.5)
  })

  it("keeps disability restricted like medical notes", async () => {
    const limited = ctxFor(ctxA.organization, ["students.view", "students.create", "students.update"])
    assert.equal((await getStudentProfile(limited, ids.ugc)).disabilityType, undefined)

    // Without sensitive access, a submitted disability is ignored on create
    // and left unchanged on update.
    const created = await createStudent(limited, admission({ personal: { firstName: "Ugc", lastName: "Limited", disabilityType: "PHYSICAL" }, guardians: [], enrollment: null }))
    assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: created.id } })).disabilityType, null)
    await updateStudent(limited, ids.ugc, {
      personal: { firstName: "Ugc", lastName: "Full", ...background, disabilityType: "" },
      admission: { admissionNumber: "", admissionDate: "2026-04-14", admissionType: "NEW", ...admissionDetails },
      permanentAddress: {}, sameAsPermanent: true, temporaryAddress: {},
    })
    assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: ids.ugc } })).disabilityType, "VISUAL")
  })

  it("filters the list by background, and by disability only with sensitive access", async () => {
    const madhesi = await listStudents(ctxA, parseStudentFilters({ year: "all", caste: "MADHESI" }))
    assert.deepEqual(madhesi.rows.map((r) => r.id), [ids.ugc])
    const merit = await listStudents(ctxA, parseStudentFilters({ year: "all", scholarship: "MERIT" }))
    assert.deepEqual(merit.rows.map((r) => r.id), [ids.ugc])
    const poor = await listStudents(ctxA, parseStudentFilters({ year: "all", equity: "economicallyDisadvantaged" }))
    assert.deepEqual(poor.rows.map((r) => r.id), [ids.ugc])
    const unrecorded = await listStudents(ctxA, parseStudentFilters({ year: "all", caste: "unrecorded", pageSize: "100" }))
    assert.ok(unrecorded.total > 0 && !unrecorded.rows.some((r) => r.id === ids.ugc))

    const disabled = await listStudents(ctxA, parseStudentFilters({ year: "all", disability: "has" }))
    assert.deepEqual(disabled.rows.map((r) => r.id), [ids.ugc])
    const limited = ctxFor(ctxA.organization, ["students.view"])
    const all = await listStudents(limited, parseStudentFilters({ year: "all" }))
    assert.equal((await listStudents(limited, parseStudentFilters({ year: "all", disability: "has" }))).total, all.total, "ignored without sensitive access")
  })

  it("imports and exports the new columns", async () => {
    const csv =
      "first_name,last_name,admission_number,admission_date,caste_ethnicity,economically_disadvantaged,remote_area,scholarship,previous_qualification,entrance_score,disability\r\n" +
      "Imp,Ugc,UGC-1,2026-04-20,adivasi janajati,Yes,n,need based,+2,65,none\r\n" +
      "Bad,Flag,UGC-2,2026-04-20,,maybe,,,,,\r\n"
    const preview = await previewImport(ctxA, { csv, firstLine: 2 })
    assert.deepEqual(preview.rows.map((r) => r.errors), [[], ["Invalid economically disadvantaged “maybe” (use yes or no)."]])
    await commitImport(ctxA, { csv, firstLine: 2 })
    const s = await prisma.student.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, admissionNumber: "UGC-1" } })
    assert.deepEqual(
      [s.casteEthnicity, s.economicallyDisadvantaged, s.remoteArea, s.scholarshipCategory, s.previousQualification, s.entranceScore?.toString(), s.disabilityType],
      ["ADIVASI_JANAJATI", true, false, "NEED_BASED", "HIGHER_SECONDARY", "65", "NONE"]
    )

    const filters = parseStudentFilters({ year: "all", caste: "MADHESI" })
    const full = await new Response(await exportStudentsCsv(ctxA, filters, {})).text()
    assert.match(full.split("\r\n")[0], /Caste \/ ethnicity.*Disability/)
    assert.match(full, /Madhesi/)
    assert.match(full, /Visual/)
    const limited = await new Response(await exportStudentsCsv(ctxFor(ctxA.organization, ["students.view", "students.export"]), filters, {})).text()
    assert.doesNotMatch(limited.split("\r\n")[0], /Disability/)
    assert.doesNotMatch(limited, /Visual/)
  })
})
