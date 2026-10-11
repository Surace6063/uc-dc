// End-to-end class & section tests against the configured database. Each run
// creates two throwaway organisations (random slugs) and one test user and
// deletes them afterwards; no existing data is read or changed.
//
//   npm run test:integration
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import { parseClassFilters } from "@/features/classes/filters"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import * as structure from "@/services/academics/structure-service"
import { listClasses, listSections } from "@/services/classes/class-query"
import {
  getClassDetail,
  getClassHistory,
  saveClass,
  saveClassSection,
  searchEnrollableStudents,
  setClassesArchived,
  setSectionArchived,
} from "@/services/classes/class-service"
import { commitClassImport, previewClassImport } from "@/services/classes/import-service"
import {
  enrollStudents,
  moveStudents,
  previewPromotion,
  promoteStudents,
  renumberRolls,
} from "@/services/classes/placement-service"
import { setClassTeacher } from "@/services/classes/teaching-service"

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
      assert.ok(
        error instanceof ValidationError && error.fieldErrors[field],
        `expected an error on ${field}, got ${JSON.stringify((error as unknown as ValidationError).fieldErrors)}`
      )
    }
    return error as T
  }
  assert.fail(`expected ${type.name}`)
}

const classInput = (overrides: Record<string, unknown> = {}) => ({
  educationLevelId: ids.basic, programId: "", name: "Grade 6 Day", localName: "", code: "", description: "",
  kind: "GRADE", sequence: 6, capacity: "", isActive: true, sections: "", sectionCapacity: "",
  ...overrides,
})

async function student(ctx: Ctx, firstName: string, gender: "MALE" | "FEMALE") {
  const s = await prisma.student.create({
    data: {
      organizationId: ctx.organization.id,
      admissionNumber: `T-${randomUUID().slice(0, 8)}`,
      firstName,
      lastName: "Test",
      gender,
      admissionDate: new Date("2026-04-14T00:00:00Z"),
    },
  })
  return s.id
}

async function teacher(ctx: Ctx, firstName: string, departmentId: string | null = null) {
  const t = await prisma.teacher.create({
    data: {
      organizationId: ctx.organization.id,
      employeeId: `E-${randomUUID().slice(0, 8)}`,
      firstName,
      lastName: "Teacher",
      dateOfJoining: new Date("2024-04-15T00:00:00Z"),
      departmentId,
    },
  })
  return t.id
}

const openEnrollments = (classId: string, yearId: string) =>
  prisma.enrollment.findMany({
    where: { classId, academicYearId: yearId, status: { in: ["ACTIVE", "ON_HOLD"] } },
    include: { student: { select: { firstName: true } } },
  })

before(async () => {
  user = await prisma.user.create({
    data: { authUserId: randomUUID(), email: `classes-${run}@example.com`, name: "Integration Test" },
    select: { id: true, email: true },
  })
  const orgA = await prisma.organization.create({ data: { name: `Class School ${run}`, slug: `cls-a-${run}`, type: "SCHOOL" } })
  const orgB = await prisma.organization.create({ data: { name: `Class College ${run}`, slug: `cls-b-${run}`, type: "COLLEGE" } })
  ctxA = ctxFor(orgA)
  ctxB = ctxFor(orgB)

  await structure.applyEducationPreset(ctxA, { presetKey: "basic", createClasses: true, createPrograms: false })
  const basic = await prisma.educationLevel.findFirstOrThrow({ where: { organizationId: orgA.id, code: "BASIC" } })
  ids.basic = basic.id
  const classes = await prisma.academicClass.findMany({ where: { organizationId: orgA.id }, select: { id: true, name: true } })
  ids.grade1 = classes.find((c) => c.name === "Grade 1")!.id
  ids.grade2 = classes.find((c) => c.name === "Grade 2")!.id

  ids.year = (
    await structure.saveAcademicYear(ctxA, null, {
      name: `2082/83-${run}`, startDate: "2025-04-14", endDate: "2026-04-13", status: "ACTIVE", isCurrent: true,
    })
  ).id
  ids.nextYear = (
    await structure.saveAcademicYear(ctxA, null, {
      name: `2083/84-${run}`, startDate: "2026-04-14", endDate: "2027-04-13", status: "PLANNED", isCurrent: false,
    })
  ).id

  await structure.applyEducationPreset(ctxB, { presetKey: "basic", createClasses: true, createPrograms: false })
  ids.basicB = (await prisma.educationLevel.findFirstOrThrow({ where: { organizationId: orgB.id, code: "BASIC" } })).id
  ids.yearB = (
    await structure.saveAcademicYear(ctxB, null, {
      name: "2082/83", startDate: "2025-04-14", endDate: "2026-04-13", status: "ACTIVE", isCurrent: true,
    })
  ).id
})

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [`cls-a-${run}`, `cls-b-${run}`] } } })
  await prisma.user.deleteMany({ where: { id: user.id } })
  await prisma.$disconnect()
})

describe("classes and sections", () => {
  it("creates a class with its first sections", async () => {
    const created = await saveClass(ctxA, null, classInput({ code: "g6", sections: "A, B", sectionCapacity: 40 }))
    ids.grade6 = created.id
    const detail = await getClassDetail(ctxA, created.id, ids.year, { includeStudents: true })
    assert.equal(detail?.academicClass.code, "G6")
    assert.deepEqual(detail?.academicClass.sections.map((s) => [s.name, s.capacity]), [["A", 40], ["B", 40]])
  })

  it("prevents duplicate class names and codes", async () => {
    await rejects(saveClass(ctxA, null, classInput({ name: "grade 6 day" })), ValidationError, "name")
    await rejects(saveClass(ctxA, null, classInput({ name: "Grade 6 Morning", code: "G6" })), ValidationError, "code")
    // The same code is fine in another organisation.
    await saveClass(ctxB, null, classInput({ educationLevelId: ids.basicB, code: "G6" }))
  })

  it("rejects programs on levels without programs", async () => {
    const program = await prisma.program.create({
      data: { organizationId: ctxA.organization.id, educationLevelId: ids.basic, name: "Bogus", code: `BG${run}` },
    })
    await rejects(saveClass(ctxA, null, classInput({ name: "Grade 6X", programId: program.id })), ValidationError, "programId")
    await prisma.program.delete({ where: { id: program.id } })
  })

  it("prevents duplicate section names within a class", async () => {
    const detail = await getClassDetail(ctxA, ids.grade6, null, { includeStudents: false })
    ids.g6a = detail!.academicClass.sections[0].id
    ids.g6b = detail!.academicClass.sections[1].id
    await rejects(
      saveClassSection(ctxA, null, { classId: ids.grade6, name: "a", isActive: true }),
      ValidationError,
      "name"
    )
    ids.g6c = (await saveClassSection(ctxA, null, { classId: ids.grade6, name: "C", capacity: 3, isActive: true })).id
  })

  it("keeps organisations apart", async () => {
    await rejects(saveClass(ctxB, null, classInput({ name: "Sneaky" })), ValidationError, "educationLevelId")
    assert.equal(await getClassDetail(ctxB, ids.grade6, ids.yearB, { includeStudents: true }), null)
    await rejects(saveClassSection(ctxB, null, { classId: ids.grade6, name: "Z", isActive: true }), ValidationError, "classId")
    const archived = await setClassesArchived(ctxB, [ids.grade6], true)
    assert.equal(archived.succeeded, 0)
    await rejects(setSectionArchived(ctxB, ids.g6a, true), NotFoundError)
    const list = await listClasses(ctxB, parseClassFilters({ pageSize: "100" }), ids.yearB)
    assert.ok(!list.rows.some((r) => r.id === ids.grade6))
  })
})

describe("placing students", () => {
  it("enrolls students with automatic roll numbers and refuses duplicates", async () => {
    ids.s1 = await student(ctxA, "Sita", "FEMALE")
    ids.s2 = await student(ctxA, "Aarav", "MALE")
    ids.s3 = await student(ctxA, "Bimala", "FEMALE")
    const found = await searchEnrollableStudents(ctxA, ids.year, "")
    assert.ok([ids.s1, ids.s2, ids.s3].every((id) => found.some((s) => s.id === id)))

    const result = await enrollStudents(ctxA, {
      academicYearId: ids.year, classId: ids.grade6, sectionId: ids.g6a,
      studentIds: [ids.s1, ids.s2, ids.s3], enrollmentType: "NEW_ADMISSION",
    })
    assert.equal(result.succeeded, 3)
    const rows = await openEnrollments(ids.grade6, ids.year)
    assert.deepEqual(rows.map((r) => r.rollNumber).sort(), ["1", "2", "3"])

    const again = await enrollStudents(ctxA, {
      academicYearId: ids.year, classId: ids.grade1, studentIds: [ids.s1], enrollmentType: "NEW_ADMISSION",
    })
    assert.equal(again.succeeded, 0)
    assert.match(again.failed[0].reason, /already has an active enrollment/i)
  })

  it("never enrolls another organisation's students", async () => {
    const outsider = await student(ctxB, "Outsider", "MALE")
    const result = await enrollStudents(ctxA, {
      academicYearId: ids.year, classId: ids.grade6, studentIds: [outsider], enrollmentType: "NEW_ADMISSION",
    })
    assert.equal(result.succeeded, 0)
    await rejects(
      enrollStudents(ctxB, { academicYearId: ids.yearB, classId: ids.grade6, studentIds: [outsider], enrollmentType: "NEW_ADMISSION" }),
      NotFoundError
    )
  })

  it("renumbers roll numbers alphabetically within the section", async () => {
    await renumberRolls(ctxA, { academicYearId: ids.year, classId: ids.grade6, sectionId: ids.g6a, order: "FIRST_NAME" })
    const rows = await openEnrollments(ids.grade6, ids.year)
    const byName = Object.fromEntries(rows.map((r) => [r.student.firstName, r.rollNumber]))
    assert.deepEqual(byName, { Aarav: "1", Bimala: "2", Sita: "3" })
  })

  it("moves students between sections and keeps roll numbers unique", async () => {
    const rows = await openEnrollments(ids.grade6, ids.year)
    const sita = rows.find((r) => r.student.firstName === "Sita")!
    await moveStudents(ctxA, { academicYearId: ids.year, classId: ids.grade6, enrollmentIds: [sita.id], targetSectionId: ids.g6b })
    const moved = await prisma.enrollment.findUniqueOrThrow({ where: { id: sita.id } })
    assert.equal(moved.sectionId, ids.g6b)
    assert.equal(moved.rollNumber, "1")
    // A section of another class is refused.
    const grade1 = await saveClassSection(ctxA, null, { classId: ids.grade1, name: "A", isActive: true })
    await rejects(
      moveStudents(ctxA, { academicYearId: ids.year, classId: ids.grade6, enrollmentIds: [sita.id], targetSectionId: grade1.id }),
      ValidationError,
      "targetSectionId"
    )
  })

  it("enforces capacity only when the organisation turns it on", async () => {
    const s4 = await student(ctxA, "Dipak", "MALE")
    const s5 = await student(ctxA, "Elina", "FEMALE")
    const s6 = await student(ctxA, "Ganesh", "MALE")
    const s7 = await student(ctxA, "Hira", "FEMALE")
    // Off (default): section C (capacity 3) can take 4.
    const off = await enrollStudents(ctxA, {
      academicYearId: ids.year, classId: ids.grade6, sectionId: ids.g6c, studentIds: [s4, s5, s6, s7], enrollmentType: "NEW_ADMISSION",
    })
    assert.equal(off.succeeded, 4)
    await prisma.enrollment.updateMany({ where: { studentId: s7 }, data: { status: "CANCELLED" } })

    await structure.saveStudentSettings(ctxA, {
      admissionNumberMode: "AUTOMATIC", admissionNumberPrefix: "ADM-", admissionNumberPadding: 5,
      nextAdmissionSequence: 1, rollNumberMode: "AUTOMATIC", enforceSectionCapacity: true,
    })
    const on = await enrollStudents(ctxA, {
      academicYearId: ids.year, classId: ids.grade6, sectionId: ids.g6c, studentIds: [s7], enrollmentType: "NEW_ADMISSION",
    })
    assert.equal(on.succeeded, 0)
    assert.match(on.failed[0].reason, /full/i)
    const sita = (await openEnrollments(ids.grade6, ids.year)).find((r) => r.student.firstName === "Sita")!
    await rejects(
      moveStudents(ctxA, { academicYearId: ids.year, classId: ids.grade6, enrollmentIds: [sita.id], targetSectionId: ids.g6c }),
      ValidationError,
      "targetSectionId"
    )
    await structure.saveStudentSettings(ctxA, {
      admissionNumberMode: "AUTOMATIC", admissionNumberPrefix: "ADM-", admissionNumberPadding: 5,
      nextAdmissionSequence: 1, rollNumberMode: "AUTOMATIC", enforceSectionCapacity: false,
    })
  })
})

describe("teachers", () => {
  it("replaces a class teacher and keeps the previous assignment as history", async () => {
    ids.t1 = await teacher(ctxA, "Ram")
    ids.t2 = await teacher(ctxA, "Gita")
    const base = { academicYearId: ids.year, classId: ids.grade6, sectionId: ids.g6a, startDate: "2025-04-20" }
    await setClassTeacher(ctxA, { ...base, teacherId: ids.t1 })
    await rejects(setClassTeacher(ctxA, { ...base, teacherId: ids.t1 }), ValidationError, "teacherId")
    await rejects(setClassTeacher(ctxA, { ...base, teacherId: ids.t2, startDate: "2025-04-01" }), ValidationError, "startDate")
    await setClassTeacher(ctxA, { ...base, teacherId: ids.t2, startDate: "2025-09-01" })

    const all = await prisma.teacherAssignment.findMany({ where: { classId: ids.grade6, role: "CLASS_TEACHER" } })
    assert.equal(all.length, 2)
    assert.equal(all.find((a) => a.teacherId === ids.t1)?.status, "ENDED")
    assert.equal(all.find((a) => a.teacherId === ids.t2)?.status, "ACTIVE")
  })

  it("refuses teachers from another organisation and outside a head's department", async () => {
    const outsider = await teacher(ctxB, "Outsider")
    await rejects(
      setClassTeacher(ctxA, { academicYearId: ids.year, classId: ids.grade6, sectionId: ids.g6b, teacherId: outsider, startDate: "2025-04-20" }),
      ValidationError,
      "teacherId"
    )
    const dept = await prisma.faculty.create({ data: { organizationId: ctxA.organization.id, name: "Science", code: `SCI${run}` } })
    const other = await prisma.faculty.create({ data: { organizationId: ctxA.organization.id, name: "Arts", code: `ART${run}` } })
    await prisma.teacher.create({
      data: {
        organizationId: ctxA.organization.id, employeeId: `H-${run}`, firstName: "Head", lastName: "Teacher",
        dateOfJoining: new Date("2020-01-01T00:00:00Z"), departmentId: dept.id, userId: user.id,
      },
    })
    const artsTeacher = await teacher(ctxA, "Arts", other.id)
    const head = ctxFor(ctxA.organization, ["teachers.assignments.manage_department"])
    await rejects(
      setClassTeacher(head, { academicYearId: ids.year, classId: ids.grade6, sectionId: ids.g6b, teacherId: artsTeacher, startDate: "2025-04-20" }),
      ForbiddenError
    )
  })

  it("shows the class teacher on the sections list", async () => {
    const list = await listSections(ctxA, parseClassFilters({ view: "sections", class: ids.grade6 }), ids.year)
    const a = list.rows.find((r) => r.id === ids.g6a)!
    assert.equal(a.classTeacher?.firstName, "Gita")
    assert.equal(a.enrolled, 2)
  })
})

describe("archiving", () => {
  it("refuses to archive a section or class that still has students", async () => {
    await rejects(setSectionArchived(ctxA, ids.g6a, true), ConflictError)
    const result = await setClassesArchived(ctxA, [ids.grade6], true)
    assert.equal(result.succeeded, 0)
    assert.match(result.failed[0].reason, /still placed/)
  })

  it("archives an empty section, ends its assignments and blocks new placements", async () => {
    const empty = await saveClassSection(ctxA, null, { classId: ids.grade6, name: "D", isActive: true })
    await setClassTeacher(ctxA, { academicYearId: ids.year, classId: ids.grade6, sectionId: empty.id, teacherId: ids.t1, startDate: "2025-04-20" })
    await setSectionArchived(ctxA, empty.id, true)
    const assignment = await prisma.teacherAssignment.findFirstOrThrow({ where: { sectionId: empty.id } })
    assert.equal(assignment.status, "ENDED")
    const s = await student(ctxA, "Late", "MALE")
    const result = await enrollStudents(ctxA, {
      academicYearId: ids.year, classId: ids.grade6, sectionId: empty.id, studentIds: [s], enrollmentType: "NEW_ADMISSION",
    })
    assert.equal(result.succeeded, 0)
    await setSectionArchived(ctxA, empty.id, false)
  })

  it("archives and restores an empty class without touching other classes", async () => {
    const extra = await saveClass(ctxA, null, classInput({ name: "Grade 6 Evening", code: "" }))
    const result = await setClassesArchived(ctxA, [extra.id], true)
    assert.equal(result.succeeded, 1)
    const archivedList = await listClasses(ctxA, parseClassFilters({ status: "archived" }), ids.year)
    assert.deepEqual(archivedList.rows.map((r) => r.id), [extra.id])
    await rejects(saveClassSection(ctxA, null, { classId: extra.id, name: "A", isActive: true }), ValidationError, "classId")
    assert.equal((await setClassesArchived(ctxA, [extra.id], false)).succeeded, 1)
  })
})

describe("promotion", () => {
  it("previews problems without changing anything", async () => {
    const rows = await openEnrollments(ids.grade6, ids.year)
    const preview = await previewPromotion(ctxA, {
      fromYearId: ids.year, classId: ids.grade6, enrollmentIds: rows.map((r) => r.id), outcome: "PROMOTED",
      endedOn: "2026-03-30", toYearId: ids.nextYear, toClassId: ids.grade2, sectionMode: "same",
    })
    assert.equal(preview.rows.length, rows.length)
    assert.ok(preview.rows.every((r) => r.problems.length === 0))
    // Grade 2 has no sections, so "same section" places students without one.
    assert.ok(preview.rows.some((r) => r.warnings.length > 0))
    assert.equal((await openEnrollments(ids.grade6, ids.year)).length, rows.length)
  })

  it("promotes students, preserving the closed placements as history", async () => {
    const rows = await openEnrollments(ids.grade6, ids.year)
    const blocked = await student(ctxA, "Blocked", "FEMALE")
    await enrollStudents(ctxA, { academicYearId: ids.year, classId: ids.grade6, sectionId: ids.g6b, studentIds: [blocked], enrollmentType: "NEW_ADMISSION" })
    await enrollStudents(ctxA, { academicYearId: ids.nextYear, classId: ids.grade1, studentIds: [blocked], enrollmentType: "NEW_ADMISSION" })
    const all = await openEnrollments(ids.grade6, ids.year)

    const result = await promoteStudents(ctxA, {
      fromYearId: ids.year, classId: ids.grade6, enrollmentIds: all.map((r) => r.id), outcome: "PROMOTED",
      endedOn: "2026-03-30", toYearId: ids.nextYear, toClassId: ids.grade2, sectionMode: "none",
    })
    assert.equal(result.succeeded, rows.length)
    assert.equal(result.failed.length, 1)
    assert.match(result.failed[0].reason, /open placement/)

    const closed = await prisma.enrollment.findMany({ where: { id: { in: rows.map((r) => r.id) } } })
    assert.ok(closed.every((e) => e.status === "PROMOTED"))
    const next = await prisma.enrollment.findMany({ where: { previousEnrollmentId: { in: rows.map((r) => r.id) } } })
    assert.equal(next.length, rows.length)
    assert.ok(next.every((e) => e.classId === ids.grade2 && e.academicYearId === ids.nextYear && e.enrollmentType === "PROMOTION"))

    const history = await getClassHistory(ctxA, ids.grade6)
    const year = history.find((y) => y.id === ids.year)!
    assert.equal(year.byStatus.PROMOTED, rows.length)
    assert.equal(year.classTeachers.length, 3)

    // Running it again changes nothing: those placements are closed.
    const again = await promoteStudents(ctxA, {
      fromYearId: ids.year, classId: ids.grade6, enrollmentIds: rows.map((r) => r.id), outcome: "PROMOTED",
      endedOn: "2026-03-30", toYearId: ids.nextYear, toClassId: ids.grade2, sectionMode: "none",
    })
    assert.equal(again.succeeded, 0)
  })

  it("can't promote another organisation's placements", async () => {
    const rows = await prisma.enrollment.findMany({ where: { classId: ids.grade6 }, select: { id: true } })
    await rejects(
      promoteStudents(ctxB, {
        fromYearId: ids.year, classId: ids.grade6, enrollmentIds: rows.map((r) => r.id), outcome: "COMPLETED", endedOn: "2026-03-30",
      }),
      ValidationError,
      "fromYearId"
    )
  })
})

describe("import", () => {
  it("creates classes and adds missing sections by exact codes", async () => {
    const csv = [
      "education_level,program,class_name,class_code,sequence,sections,section_capacity,shift",
      "BASIC,,Remedial 7,R7,7,A|B,40,morning",
      "BASIC,,Grade 6 Day,,6,A|E,,",
      "NOPE,,Grade 9,,9,,,",
      "BASIC,,Remedial 7,,7,,,",
    ].join("\n")
    const preview = await previewClassImport(ctxA, { csv, firstLine: 2 })
    assert.equal(preview.rows[0].errors.length, 0)
    assert.match(preview.rows[1].warnings[0], /adds section E/)
    assert.match(preview.rows[2].errors[0], /No education level/)
    assert.match(preview.rows[3].errors.join(" "), /Same class as line 2/)

    const result = await commitClassImport(ctxA, { csv, firstLine: 2 })
    assert.equal(result.created, 2)
    const g7 = await prisma.academicClass.findFirstOrThrow({
      where: { organizationId: ctxA.organization.id, code: "R7" },
      include: { sections: true },
    })
    assert.deepEqual(g7.sections.map((s) => [s.name, s.capacity, s.shift]).sort(), [["A", 40, "MORNING"], ["B", 40, "MORNING"]])
    assert.ok(await prisma.section.findFirst({ where: { classId: ids.grade6, name: "E" } }))
  })
})
