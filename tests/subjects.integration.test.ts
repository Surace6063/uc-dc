// End-to-end subject & course tests against the configured database. Each
// run creates two throwaway organisations (random slugs) and one test user
// and deletes them afterwards; no existing data is read or changed.
//
//   npm run test:integration
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import { parseSubjectFilters } from "@/features/subjects/filters"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import * as structure from "@/services/academics/structure-service"
import { saveClassSection } from "@/services/classes/class-service"
import { addSubjectTeacher } from "@/services/classes/teaching-service"
import {
  activateCurriculum,
  createCurriculum,
  createCurriculumVersion,
  getCurriculum,
  saveTopic,
  saveUnit,
} from "@/services/subjects/curriculum-service"
import { commitSubjectImport, previewSubjectImport } from "@/services/subjects/import-export-service"
import {
  addOfferings,
  assignOfferingTeacher,
  copyOfferings,
  getClassSubjects,
  removeOffering,
  updateOffering,
} from "@/services/subjects/offering-service"
import { getSubjectStats, listSubjects } from "@/services/subjects/subject-query"
import {
  addPrerequisite,
  deleteSubject,
  getSubjectDetail,
  saveCategory,
  saveSubject,
  setSubjectsArchived,
} from "@/services/subjects/subject-service"

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

const subject = (overrides: Record<string, unknown> = {}) => ({ name: "Mathematics", code: "MTH", isActive: true, ...overrides })

async function teacher(ctx: Ctx, firstName: string) {
  return (
    await prisma.teacher.create({
      data: {
        organizationId: ctx.organization.id, employeeId: `S-${randomUUID().slice(0, 8)}`, firstName, lastName: "Teacher",
        dateOfJoining: new Date("2024-04-15T00:00:00Z"),
      },
    })
  ).id
}

before(async () => {
  user = await prisma.user.create({
    data: { authUserId: randomUUID(), email: `subjects-${run}@example.com`, name: "Integration Test" },
    select: { id: true, email: true },
  })
  const orgA = await prisma.organization.create({ data: { name: `Subject School ${run}`, slug: `sub-a-${run}`, type: "SCHOOL" } })
  const orgB = await prisma.organization.create({ data: { name: `Subject College ${run}`, slug: `sub-b-${run}`, type: "COLLEGE" } })
  ctxA = ctxFor(orgA)
  ctxB = ctxFor(orgB)

  await structure.applyEducationPreset(ctxA, { presetKey: "basic", createClasses: true, createPrograms: false })
  await structure.applyEducationPreset(ctxA, { presetKey: "higher_secondary", createClasses: false, createPrograms: true })
  const levels = await prisma.educationLevel.findMany({ where: { organizationId: orgA.id } })
  ids.basic = levels.find((l) => l.code === "BASIC")!.id
  ids.hseb = levels.find((l) => l.code === "HSEB")!.id
  ids.science = (await prisma.program.findFirstOrThrow({ where: { organizationId: orgA.id, code: "SCI" } })).id
  ids.management = (await prisma.program.findFirstOrThrow({ where: { organizationId: orgA.id, code: "MGMT" } })).id
  ids.grade8 = (await prisma.academicClass.findFirstOrThrow({ where: { organizationId: orgA.id, name: "Grade 8" } })).id
  ids.grade11sci = (
    await structure.saveAcademicClass(ctxA, null, {
      educationLevelId: ids.hseb, programId: ids.science, name: "Grade 11", kind: "GRADE", sequence: 11, isActive: true,
    })
  ).id
  ids.g8a = (await saveClassSection(ctxA, null, { classId: ids.grade8, name: "A", isActive: true })).id
  ids.g8b = (await saveClassSection(ctxA, null, { classId: ids.grade8, name: "B", isActive: true })).id
  ids.g11a = (await saveClassSection(ctxA, null, { classId: ids.grade11sci, name: "A", isActive: true })).id

  const year = (name: string, start: string, end: string, status: "ACTIVE" | "PLANNED" | "COMPLETED", isCurrent = false) =>
    structure.saveAcademicYear(ctxA, null, { name: `${name}-${run}`, startDate: start, endDate: end, status, isCurrent })
  ids.pastYear = (await year("2081/82", "2024-04-14", "2025-04-13", "COMPLETED")).id
  ids.year = (await year("2082/83", "2025-04-14", "2026-04-13", "ACTIVE", true)).id
  ids.nextYear = (await year("2083/84", "2026-04-14", "2027-04-13", "PLANNED")).id
})

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [`sub-a-${run}`, `sub-b-${run}`] } } })
  await prisma.user.deleteMany({ where: { id: user.id } })
  await prisma.$disconnect()
})

describe("subjects", () => {
  it("creates and edits subjects with optional academic details", async () => {
    ids.category = (await saveCategory(ctxA, null, { name: "Mathematics" })).id
    const maths = await saveSubject(ctxA, null, subject({ code: "mth8", educationLevelId: ids.basic, categoryId: ids.category, creditHours: 5, weeklyPeriods: 6 }))
    ids.maths = maths.id
    assert.equal(maths.code, "MTH8")
    const updated = await saveSubject(ctxA, maths.id, subject({ code: "MTH8", localName: "गणित", educationLevelId: ids.basic, creditHours: "4.5" }))
    assert.equal(updated.creditHours, 4.5)
    assert.equal(updated.localName, "गणित")
    ids.english = (await saveSubject(ctxA, null, subject({ name: "English", code: "ENG" }))).id
  })

  it("prevents duplicate codes within an organisation only", async () => {
    await rejects(saveSubject(ctxA, null, subject({ name: "Maths again", code: "Mth8" })), ValidationError, "code")
    await saveSubject(ctxB, null, subject({ code: "MTH8" }))
  })

  it("validates levels, programs and categories", async () => {
    await rejects(
      saveSubject(ctxA, null, subject({ code: "PHY", educationLevelId: ids.basic, programId: ids.science })),
      ValidationError,
      "programId"
    )
    const physics = await saveSubject(ctxA, null, subject({ name: "Physics", code: "PHY", programId: ids.science }))
    assert.equal(physics.educationLevelId, ids.hseb, "the level is taken from the program")
    ids.physics = physics.id
    const otherCategory = await saveCategory(ctxB, null, { name: "Science" })
    await rejects(saveSubject(ctxA, null, subject({ code: "CHE", categoryId: otherCategory.id })), ValidationError, "categoryId")
  })

  it("keeps organisations apart", async () => {
    assert.equal(await getSubjectDetail(ctxB, ids.maths), null)
    await rejects(saveSubject(ctxB, ids.maths, subject({ code: "MTH9" })), NotFoundError)
    await rejects(addOfferings(ctxB, { academicYearId: ids.year, classId: ids.grade8, subjectIds: [ids.maths] }), ValidationError)
    const list = await listSubjects(ctxB, parseSubjectFilters({}), null)
    assert.ok(!list.rows.some((r) => r.id === ids.maths))
  })

  it("refuses self and cyclic prerequisites", async () => {
    await rejects(addPrerequisite(ctxA, ids.maths, { prerequisiteId: ids.maths }), ValidationError, "prerequisiteId")
    await addPrerequisite(ctxA, ids.physics, { prerequisiteId: ids.maths })
    await rejects(addPrerequisite(ctxA, ids.maths, { prerequisiteId: ids.physics }), ValidationError, "prerequisiteId")
    await rejects(addPrerequisite(ctxA, ids.physics, { prerequisiteId: ids.maths }), ValidationError, "prerequisiteId")
  })
})

describe("curricula", () => {
  it("versions a syllabus without changing earlier versions", async () => {
    const v1 = await createCurriculum(ctxA, ids.maths, { name: "CDC Mathematics", version: "2078", educationLevelId: ids.basic })
    ids.v1 = v1.id
    await rejects(activateCurriculum(ctxA, v1.id), ConflictError) // no units yet
    const unit = await saveUnit(ctxA, v1.id, null, { title: "Algebra", estimatedHours: 20 })
    await saveTopic(ctxA, unit.id, null, { title: "Linear equations", estimatedHours: 6 })
    await activateCurriculum(ctxA, v1.id)
    await rejects(saveUnit(ctxA, v1.id, unit.id, { title: "Changed" }), ConflictError)

    const v2 = await createCurriculumVersion(ctxA, v1.id, { version: "2081", copyContent: true })
    ids.v2 = v2.id
    const copy = await getCurriculum(ctxA, v2.id)
    assert.equal(copy?.units.length, 1)
    assert.equal(copy?.units[0].topics.length, 1)
    assert.equal(copy?.previousVersion?.id, v1.id)
    await rejects(createCurriculumVersion(ctxA, v1.id, { version: "2081" }), ValidationError, "version")
  })
})

describe("offerings", () => {
  it("offers subjects to a class with the active curriculum and skips duplicates", async () => {
    const result = await addOfferings(ctxA, { academicYearId: ids.year, classId: ids.grade8, subjectIds: [ids.maths, ids.english] })
    assert.equal(result.created, 2)
    const again = await addOfferings(ctxA, { academicYearId: ids.year, classId: ids.grade8, subjectIds: [ids.maths] })
    assert.equal(again.created, 0)
    const data = await getClassSubjects(ctxA, ids.year, ids.grade8)
    const maths = data!.offerings.find((o) => o.subject.id === ids.maths)!
    ids.mathsOffering = maths.id
    ids.englishOffering = data!.offerings.find((o) => o.subject.id === ids.english)!.id
    assert.equal(maths.curriculumId, ids.v1)
  })

  it("refuses subjects of another level or program", async () => {
    await rejects(addOfferings(ctxA, { academicYearId: ids.year, classId: ids.grade8, subjectIds: [ids.physics] }), ValidationError, "subjectIds")
    const ok = await addOfferings(ctxA, { academicYearId: ids.year, classId: ids.grade11sci, subjectIds: [ids.physics, ids.english] })
    assert.equal(ok.created, 2)
  })

  it("limits offerings to sections of their own class", async () => {
    await rejects(
      updateOffering(ctxA, ids.englishOffering, { requirement: "COMPULSORY", sectionIds: [ids.g11a] }),
      ValidationError,
      "sectionIds"
    )
    await updateOffering(ctxA, ids.englishOffering, { requirement: "OPTIONAL", sectionIds: [ids.g8b], weeklyPeriods: 4 })
    const data = await getClassSubjects(ctxA, ids.year, ids.grade8)
    assert.deepEqual(data!.offerings.find((o) => o.id === ids.englishOffering)!.sections.map((s) => s.sectionId), [ids.g8b])
  })

  it("assigns teachers only within the offering's sections and organisation", async () => {
    ids.t1 = await teacher(ctxA, "Sarita")
    const base = { offeringId: ids.englishOffering, teacherId: ids.t1, startDate: "2025-04-20" }
    await rejects(assignOfferingTeacher(ctxA, { ...base, sectionId: ids.g8a }), ValidationError, "sectionId")
    await assignOfferingTeacher(ctxA, { ...base, sectionId: ids.g8b })
    const assignment = await prisma.teacherAssignment.findFirstOrThrow({ where: { teacherId: ids.t1 } })
    assert.equal(assignment.weeklyPeriods, 4, "periods default to the offering's")
    assert.equal(assignment.subjectId, ids.english)
    const outsider = await teacher(ctxB, "Outsider")
    await rejects(assignOfferingTeacher(ctxA, { ...base, sectionId: ids.g8b, teacherId: outsider }), NotFoundError)
  })

  it("class pages only assign teachers for offered subjects", async () => {
    const t2 = await teacher(ctxA, "Hari")
    await rejects(
      addSubjectTeacher(ctxA, { academicYearId: ids.year, classId: ids.grade8, subjectId: ids.physics, teacherId: t2, startDate: "2025-04-20" }),
      ValidationError,
      "subjectId"
    )
    await addSubjectTeacher(ctxA, { academicYearId: ids.year, classId: ids.grade8, subjectId: ids.maths, teacherId: t2, startDate: "2025-04-20" })
  })

  it("copies a class's subjects to the next year and keeps the past year read-only", async () => {
    const copied = await copyOfferings(ctxA, { fromYearId: ids.year, toYearId: ids.nextYear, classId: ids.grade8 })
    assert.equal(copied.created, 2)
    const next = await getClassSubjects(ctxA, ids.nextYear, ids.grade8)
    const english = next!.offerings.find((o) => o.subject.id === ids.english)!
    assert.equal(english.requirement, "OPTIONAL")
    assert.deepEqual(english.sections.map((s) => s.sectionId), [ids.g8b])
    assert.equal(next!.assignments.length, 0, "teachers aren't copied")

    await rejects(addOfferings(ctxA, { academicYearId: ids.pastYear, classId: ids.grade8, subjectIds: [ids.maths] }), ConflictError)
  })

  it("keeps an offering's curriculum version after a new version is activated", async () => {
    await saveUnit(ctxA, ids.v2, null, { title: "Geometry" })
    await activateCurriculum(ctxA, ids.v2)
    const v1 = await getCurriculum(ctxA, ids.v1)
    assert.equal(v1?.status, "RETIRED")
    const data = await getClassSubjects(ctxA, ids.year, ids.grade8)
    assert.equal(data!.offerings.find((o) => o.id === ids.mathsOffering)!.curriculumId, ids.v1)
  })
})

describe("archiving and history", () => {
  it("won't archive a subject still offered in a running year", async () => {
    const result = await setSubjectsArchived(ctxA, [ids.english], true)
    assert.equal(result.succeeded, 0)
    assert.match(result.failed[0].reason, /Still offered/)
  })

  it("discontinues (not deletes) a taught offering and keeps its assignment history", async () => {
    const result = await removeOffering(ctxA, ids.englishOffering)
    assert.equal(result.removed, false)
    const offering = await prisma.subjectOffering.findUniqueOrThrow({ where: { id: ids.englishOffering } })
    assert.equal(offering.status, "DISCONTINUED")
    const assignment = await prisma.teacherAssignment.findFirstOrThrow({ where: { teacherId: ids.t1 } })
    assert.equal(assignment.status, "ENDED")
  })

  it("refuses to delete referenced subjects and blocks archived ones from new offerings", async () => {
    await rejects(deleteSubject(ctxA, ids.maths), ConflictError)
    const art = await saveSubject(ctxA, null, subject({ name: "Art", code: "ART" }))
    assert.equal((await setSubjectsArchived(ctxA, [art.id], true)).succeeded, 1)
    await rejects(addOfferings(ctxA, { academicYearId: ids.year, classId: ids.grade8, subjectIds: [art.id] }), ValidationError, "subjectIds")
    const detail = await getSubjectDetail(ctxA, ids.maths)
    assert.ok(detail!.offerings.some((o) => o.academicYear.id === ids.year), "past offerings stay visible")
    assert.ok(detail!.activity.length > 0)
  })

  it("reports offered subjects and offerings without teachers", async () => {
    const stats = await getSubjectStats(ctxA, ids.year)
    assert.ok(stats.offered >= 3)
    assert.ok(stats.withoutTeacher >= 1)
    const offered = await listSubjects(ctxA, parseSubjectFilters({ offered: "yes" }), ids.year)
    assert.ok(offered.rows.some((r) => r.id === ids.maths))
  })
})

describe("import", () => {
  it("creates and updates by code with row-level errors", async () => {
    const csv = [
      "code,name,category,requirement,education_level,program,credit_hours,weekly_periods",
      "SCI8,Science,,compulsory,BASIC,,5,6",
      "ENG,English Language,,,,,,5",
      "XYZ,Unknown level,,,NOPE,,,",
      "SCI8,Science again,,,,,,",
      "ACC,Accountancy,Mathematics,elective,HSEB,MGMT,3.75,",
    ].join("\n")
    const preview = await previewSubjectImport(ctxA, { csv, firstLine: 2 })
    assert.equal(preview.rows[0].errors.length, 0)
    assert.match(preview.rows[1].warnings[0], /Updates the existing subject ENG/)
    assert.match(preview.rows[2].errors[0], /No education level/)
    assert.match(preview.rows[3].errors.join(" "), /Same code as line 2/)
    assert.equal(preview.rows[4].errors.length, 0)

    const result = await commitSubjectImport(ctxA, { csv, firstLine: 2 })
    assert.equal(result.created, 3)
    const english = await prisma.subject.findUniqueOrThrow({ where: { id: ids.english } })
    assert.equal(english.name, "English Language")
    const acc = await prisma.subject.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, code: "ACC" } })
    assert.equal(acc.programId, ids.management)
    assert.equal(acc.creditHours, 3.75)
  })
})
