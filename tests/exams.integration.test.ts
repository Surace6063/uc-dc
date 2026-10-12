// End-to-end examination tests against the configured database. Each run
// creates two throwaway organisations (random slugs) and test users and
// deletes them afterwards; no existing data is read or changed.
//
//   npm run test:integration
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import { ZodError } from "zod"

import { addDays, localDate } from "@/features/attendance/constants"
import { parseExamFilters, parseResultFilters } from "@/features/exams/filters"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, PermissionDeniedError, ValidationError } from "@/lib/authorization/errors"
import { DEFAULT_ROLES, PERMISSION_KEYS, type PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import * as structure from "@/services/academics/structure-service"
import { saveClassSection } from "@/services/classes/class-service"
import { marksCompletion, resultAnalytics } from "@/services/exams/analytics-service"
import { examDashboard, listExaminations } from "@/services/exams/examination-query"
import {
  addExamSubjects,
  findExam,
  getExaminationDetail,
  saveExamination,
  saveExamSubject,
  scheduleExamination,
  unscheduleExamination,
} from "@/services/exams/examination-service"
import { commitMarksImport, previewMarksImport } from "@/services/exams/import-export-service"
import { getMarksSheet, marksPicker, saveMarks } from "@/services/exams/marks-service"
import { childResults, myResults, portalResultCard } from "@/services/exams/portal-service"
import { listExamResults, publicationCheck, staffResultCard } from "@/services/exams/result-service"
import {
  activateGradingScale,
  createSampleSetup,
  newGradingScaleVersion,
  saveGradingScale,
} from "@/services/exams/settings-service"
import {
  approveExamination,
  approveSheets,
  listReviewSheets,
  openRevision,
  placeHold,
  publishResults,
  returnSheets,
  revokeApproval,
  verifySheets,
} from "@/services/exams/workflow-service"

type Ctx = AuthContext

const run = randomUUID().slice(0, 8)
const users = {} as Record<"admin" | "teacher" | "science" | "officer" | "coordinator" | "parent" | "pupil", { id: string; email: string }>
let ctxA: Ctx
let ctxB: Ctx
const ctx = {} as Record<keyof typeof users, Ctx>
const ids = {} as Record<string, string>
const role = (slug: string) => DEFAULT_ROLES.find((r) => r.slug === slug)!.permissions as readonly PermissionKey[]

function ctxFor(org: { id: string; name: string; slug: string }, user: { id: string; email: string }, permissions: readonly PermissionKey[] = PERMISSION_KEYS): Ctx {
  return {
    user: { id: user.id, authUserId: randomUUID(), email: user.email, name: user.email, avatarUrl: null, isPlatformAdmin: false },
    organization: { ...org, type: "SCHOOL" },
    membership: { id: randomUUID() },
    role: { id: randomUUID(), name: "Test", slug: "test" },
    permissions,
  }
}

async function rejects<T extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => T, pattern?: RegExp) {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof type, `expected ${type.name}, got ${(error as Error)?.constructor?.name}: ${(error as Error)?.message} ${error instanceof ValidationError ? JSON.stringify(error.fieldErrors) : ""}`)
    if (pattern) {
      const text = error instanceof ValidationError ? `${error.message} ${JSON.stringify(error.fieldErrors)}` : (error as Error).message
      assert.match(text, pattern)
    }
    return error as T
  }
  assert.fail(`expected ${type.name}`)
}

const today = localDate()

async function student(firstName: string) {
  return prisma.student.create({
    data: { organizationId: ctxA.organization.id, admissionNumber: `EX-${firstName}-${run}`, firstName, lastName: "Test", admissionDate: new Date(`${addDays(today, -200)}T00:00:00Z`) },
  })
}

async function enroll(studentId: string, sectionId: string | null, roll: string) {
  return prisma.enrollment.create({
    data: {
      organizationId: ctxA.organization.id, studentId, academicYearId: ids.year, educationLevelId: ids.level, classId: ids.grade8, sectionId,
      rollNumber: roll, enrollmentDate: new Date(`${addDays(today, -100)}T00:00:00Z`),
    },
  })
}

const examInput = (overrides: Record<string, unknown> = {}) => ({
  academicYearId: ids.year, assessmentTypeId: ids.terminal, name: `First Terminal ${run}`, code: "FT", description: "",
  educationLevelId: "", programId: "", term: "First term", startDate: addDays(today, -30), endDate: addDays(today, -20),
  resultPublicationDate: "", gradingScaleId: ids.scale, resultPolicyId: ids.policy, ...overrides,
})

// Marks for one sheet: { studentId: { componentId: "62.5" | "AB" | null } }
function entries(cells: Record<string, Record<string, string | null>>, remarks: Record<string, string> = {}) {
  return Object.entries(cells).map(([studentId, comps]) => ({
    studentId,
    remark: remarks[studentId] ?? "",
    internalNote: "",
    marks: Object.entries(comps).map(([componentId, v]) => {
      if (v === null) return { componentId, status: null, marks: null }
      const codes: Record<string, string> = { AB: "ABSENT", EX: "EXEMPT", INC: "INCOMPLETE", WH: "WITHHELD" }
      return codes[v] ? { componentId, status: codes[v], marks: null } : { componentId, status: "SCORED", marks: Number(v) }
    }),
  }))
}

async function save(c: Ctx, examinationSubjectId: string, sectionId: string | null, cells: Record<string, Record<string, string | null>>, options: Record<string, unknown> = {}) {
  const sheet = await getMarksSheet(c, { examinationSubjectId, sectionId })
  return saveMarks(c, {
    scope: { examinationSubjectId, sectionId },
    sheetId: sheet.sheet?.id ?? null,
    expectedUpdatedAt: sheet.sheet?.updatedAt ?? null,
    submit: false,
    reason: "",
    entries: entries(cells),
    ...options,
  })
}

before(async () => {
  for (const key of Object.keys({ admin: 1, teacher: 1, science: 1, officer: 1, coordinator: 1, parent: 1, pupil: 1 }) as (keyof typeof users)[]) {
    users[key] = await prisma.user.create({ data: { authUserId: randomUUID(), email: `ex-${key}-${run}@example.com`, name: key }, select: { id: true, email: true } })
  }
  const orgA = await prisma.organization.create({ data: { name: `Exam School ${run}`, slug: `ex-a-${run}`, type: "SCHOOL" } })
  const orgB = await prisma.organization.create({ data: { name: `Exam Other ${run}`, slug: `ex-b-${run}`, type: "SCHOOL" } })
  ctxA = ctxFor(orgA, users.admin)
  ctxB = ctxFor(orgB, users.admin)
  ctx.admin = ctxA
  ctx.teacher = ctxFor(orgA, users.teacher, role("teacher"))
  ctx.science = ctxFor(orgA, users.science, role("teacher"))
  ctx.officer = ctxFor(orgA, users.officer, role("exam_officer"))
  ctx.coordinator = ctxFor(orgA, users.coordinator, role("academic_coordinator"))
  ctx.parent = ctxFor(orgA, users.parent, role("parent"))
  ctx.pupil = ctxFor(orgA, users.pupil, role("student"))

  await structure.applyEducationPreset(ctxA, { presetKey: "basic", createClasses: true, createPrograms: false })
  const grade8 = await prisma.academicClass.findFirstOrThrow({ where: { organizationId: orgA.id, name: "Grade 8" } })
  ids.grade8 = grade8.id
  ids.level = grade8.educationLevelId
  ids.g8a = (await saveClassSection(ctxA, null, { classId: ids.grade8, name: "A", isActive: true })).id
  ids.g8b = (await saveClassSection(ctxA, null, { classId: ids.grade8, name: "B", isActive: true })).id
  ids.year = (await structure.saveAcademicYear(ctxA, null, { name: `Y-${run}`, startDate: addDays(today, -180), endDate: addDays(today, 180), status: "ACTIVE", isCurrent: true })).id
  ids.yearB = (await structure.saveAcademicYear(ctxB, null, { name: `YB-${run}`, startDate: addDays(today, -180), endDate: addDays(today, 180), status: "ACTIVE", isCurrent: true })).id

  // 8A: Sita, Aarav, Elina. 8B: Dipak.
  for (const [name, section, roll] of [["Sita", "g8a", "1"], ["Aarav", "g8a", "2"], ["Elina", "g8a", "3"], ["Dipak", "g8b", "1"]] as const) {
    const s = await student(name)
    ids[name.toLowerCase()] = s.id
    await enroll(s.id, ids[section], roll)
  }
  await prisma.student.update({ where: { id: ids.sita }, data: { userId: users.pupil.id } })
  const guardian = await prisma.guardian.create({ data: { organizationId: orgA.id, fullName: "Parent Test", userId: users.parent.id, portalStatus: "ACTIVE" } })
  await prisma.studentGuardian.create({ data: { organizationId: orgA.id, studentId: ids.sita, guardianId: guardian.id, relationship: "MOTHER", canAccessStudentPortalData: true } })
  // Linked to Aarav too, but without portal access.
  await prisma.studentGuardian.create({ data: { organizationId: orgA.id, studentId: ids.aarav, guardianId: guardian.id, relationship: "MOTHER", canAccessStudentPortalData: false } })

  ids.maths = (await prisma.subject.create({ data: { organizationId: orgA.id, name: "Mathematics", code: `M${run}`, creditHours: 4 } })).id
  ids.science = (await prisma.subject.create({ data: { organizationId: orgA.id, name: "Science", code: `S${run}`, creditHours: 3 } })).id
  ids.mathsOffering = (await prisma.subjectOffering.create({ data: { organizationId: orgA.id, subjectId: ids.maths, academicYearId: ids.year, classId: ids.grade8 } })).id
  ids.scienceOffering = (await prisma.subjectOffering.create({ data: { organizationId: orgA.id, subjectId: ids.science, academicYearId: ids.year, classId: ids.grade8 } })).id

  const from = new Date(`${addDays(today, -100)}T00:00:00Z`)
  const teacher = await prisma.teacher.create({ data: { organizationId: orgA.id, userId: users.teacher.id, employeeId: `T1-${run}`, firstName: "Kamala", lastName: "Maths", dateOfJoining: from } })
  const sciTeacher = await prisma.teacher.create({ data: { organizationId: orgA.id, userId: users.science.id, employeeId: `T2-${run}`, firstName: "Hari", lastName: "Science", dateOfJoining: from } })
  await prisma.teacherAssignment.createMany({
    data: [
      { organizationId: orgA.id, teacherId: teacher.id, academicYearId: ids.year, classId: ids.grade8, subjectId: ids.maths, role: "SUBJECT_TEACHER", startDate: from },
      { organizationId: orgA.id, teacherId: sciTeacher.id, academicYearId: ids.year, classId: ids.grade8, sectionId: ids.g8a, subjectId: ids.science, role: "SUBJECT_TEACHER", startDate: from },
    ],
  })
})

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [`ex-a-${run}`, `ex-b-${run}`] } } })
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } })
  await prisma.$disconnect()
})

describe("settings", () => {
  it("creates a draft sample setup that must be verified before use", async () => {
    const result = await createSampleSetup(ctxA)
    assert.equal(result.created.length, 3)
    const scale = await prisma.gradingScale.findFirstOrThrow({ where: { organizationId: ctxA.organization.id }, include: { rules: true } })
    assert.equal(scale.status, "DRAFT")
    assert.equal(scale.rules.length, 8)
    ids.scale = scale.id
    ids.policy = (await prisma.resultPolicy.findFirstOrThrow({ where: { organizationId: ctxA.organization.id } })).id
    ids.terminal = (await prisma.assessmentType.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, name: "First Terminal Examination" } })).id
    // Running it again adds nothing.
    assert.deepEqual((await createSampleSetup(ctxA)).created, [])
  })

  it("refuses overlapping or incomplete grade bands", async () => {
    const bands = [
      { grade: "A", minimumPercentage: 50, maximumPercentage: 100, gradePoint: 4, isFailing: false },
      { grade: "B", minimumPercentage: 40, maximumPercentage: 60, gradePoint: 3, isFailing: false },
      { grade: "F", minimumPercentage: 0, maximumPercentage: 40, gradePoint: 0, isFailing: true },
    ]
    await rejects(saveGradingScale(ctxA, null, { name: "Broken", gradingType: "GRADE_POINT", rules: bands }), ValidationError, /overlap/)
    await rejects(saveGradingScale(ctxA, null, { name: "Gappy", gradingType: "LETTER", rules: [bands[0], bands[2]] }), ValidationError, /No grade covers 40.00% to 50.00%/)
  })
})

describe("examination setup", () => {
  it("validates dates and references, including other organisations' records", async () => {
    await rejects(saveExamination(ctxA, null, examInput({ endDate: addDays(today, -40) })), ZodError, /on or after the start/)
    await rejects(saveExamination(ctxA, null, examInput({ startDate: addDays(today, -400) })), ValidationError, /must fall within/)
    await rejects(saveExamination(ctxA, null, examInput({ academicYearId: ids.yearB })), ValidationError, /valid academic year/)
    const exam = await saveExamination(ctxA, null, examInput())
    ids.exam = exam.id
    assert.equal(exam.status, "DRAFT")
    await rejects(saveExamination(ctxA, null, examInput()), ValidationError, /already exists/)
  })

  it("adds subjects with components and validates their configuration", async () => {
    const added = await addExamSubjects(ctxA, {
      examinationId: ids.exam, offeringIds: [ids.mathsOffering, ids.scienceOffering], passMarks: 35,
      components: [{ name: "Theory", componentType: "THEORY", maximumMarks: 100, passMarks: "", weightage: "" }],
    })
    assert.equal(added.added, 2)
    const detail = await getExaminationDetail(ctxA, ids.exam)
    const maths = detail.subjects.find((s) => s.name === "Mathematics")!
    ids.mathsSubject = maths.id
    ids.scienceSubject = detail.subjects.find((s) => s.name === "Science")!.id
    assert.equal(maths.creditHours, "4")
    await rejects(
      saveExamSubject(ctxA, maths.id, {
        maximumMarks: 100, passMarks: 35, creditHours: 4, isCompulsory: true,
        components: [{ name: "Theory", componentType: "THEORY", maximumMarks: 75, passMarks: 27 }, { name: "Practical", componentType: "PRACTICAL", maximumMarks: 20, passMarks: 8 }],
      }),
      ValidationError,
      /add up to 95/
    )
    await saveExamSubject(ctxA, maths.id, {
      maximumMarks: 100, passMarks: 35, creditHours: 4, isCompulsory: true, examDate: addDays(today, -28),
      components: [{ name: "Theory", componentType: "THEORY", maximumMarks: 75, passMarks: 27 }, { name: "Practical", componentType: "PRACTICAL", maximumMarks: 25, passMarks: 10 }],
    })
    const comps = await prisma.assessmentComponent.findMany({ where: { examinationSubjectId: maths.id }, orderBy: { sequence: "asc" } })
    ids.mTheory = comps[0].id
    ids.mPractical = comps[1].id
    ids.sTheory = (await prisma.assessmentComponent.findFirstOrThrow({ where: { examinationSubjectId: ids.scienceSubject } })).id
  })

  it("schedules only with an active grading scale, then freezes the configuration", async () => {
    await rejects(scheduleExamination(ctxA, { examinationId: ids.exam }), ConflictError, /Activate the grading scale/)
    await activateGradingScale(ctxA, ids.scale)
    await scheduleExamination(ctxA, { examinationId: ids.exam })
    await rejects(
      addExamSubjects(ctxA, { examinationId: ids.exam, offeringIds: [ids.mathsOffering], components: [{ name: "T", componentType: "THEORY", maximumMarks: 10 }] }),
      ConflictError,
      /draft/
    )
    // The timetable can still change.
    const r = await saveExamSubject(ctxA, ids.scienceSubject, { maximumMarks: 100, passMarks: 35, isCompulsory: true, examDate: addDays(today, -25), venue: "Hall 1", components: [{ name: "Theory", componentType: "THEORY", maximumMarks: 100 }] })
    assert.equal(r.scheduleOnly, true)
  })

  it("lists examinations with server-side filters", async () => {
    const list = await listExaminations(ctxA, parseExamFilters({ q: "terminal", status: "SCHEDULED" }))
    assert.equal(list.total, 1)
    assert.equal(list.rows[0].students, 4)
    // Maths and science in sections A and B.
    assert.equal(list.rows[0].sheets.expected, 4)
    assert.equal(list.rows[0].sheets.NOT_STARTED, 4)
    assert.equal((await listExaminations(ctxB, parseExamFilters({}))).total, 0)
    const stats = await examDashboard(ctxA, ids.year)
    assert.equal(stats?.awaitingMarks, 1)
  })
})

describe("marks entry", () => {
  it("lets teachers enter only the subjects and sections they teach", async () => {
    await getMarksSheet(ctx.teacher, { examinationSubjectId: ids.mathsSubject, sectionId: ids.g8a })
    await rejects(getMarksSheet(ctx.science, { examinationSubjectId: ids.mathsSubject, sectionId: ids.g8a }), ForbiddenError)
    await rejects(save(ctx.science, ids.scienceSubject, ids.g8b, { [ids.dipak]: { [ids.sTheory]: "50" } }), ForbiddenError)
    const picker = await marksPicker(ctx.science, ids.exam)
    assert.deepEqual(picker.sheets.map((s) => `${s.subjectName}:${s.sectionName}`), ["Science:A"])
    // Other organisations can't even find the subject.
    await rejects(getMarksSheet(ctxB, { examinationSubjectId: ids.mathsSubject, sectionId: null }), NotFoundError)
  })

  it("validates marks on the server", async () => {
    await rejects(save(ctx.teacher, ids.mathsSubject, ids.g8a, { [ids.sita]: { [ids.mTheory]: "80" } }), ValidationError, /Above the full marks/)
    await rejects(save(ctx.teacher, ids.mathsSubject, ids.g8a, { [ids.sita]: { [ids.mTheory]: "-1" } }), ZodError, /negative/)
    await rejects(save(ctx.teacher, ids.mathsSubject, ids.g8a, { [ids.sita]: { [ids.mTheory]: "10.555" } }), ValidationError, /2 decimals/)
    await rejects(save(ctx.teacher, ids.mathsSubject, ids.g8a, { [ids.dipak]: { [ids.mTheory]: "50" } }), ValidationError, /isn't placed/)
    await rejects(save(ctx.teacher, ids.mathsSubject, ids.g8a, { [ids.sita]: { [ids.sTheory]: "50" } }), ValidationError, /isn't part of the subject/)
  })

  it("saves drafts, refuses incomplete submissions and stale saves", async () => {
    const first = await save(ctx.teacher, ids.mathsSubject, ids.g8a, { [ids.sita]: { [ids.mTheory]: "60", [ids.mPractical]: "20" }, [ids.aarav]: { [ids.mTheory]: "30" } })
    assert.equal(first.created, 3)
    ids.mathsA = first.sheetId
    await rejects(
      saveMarks(ctx.teacher, { scope: { examinationSubjectId: ids.mathsSubject, sectionId: ids.g8a }, sheetId: ids.mathsA, expectedUpdatedAt: "2000-01-01T00:00:00.000Z", entries: [] }),
      ConflictError,
      /changed by someone else/
    )
    await rejects(save(ctx.teacher, ids.mathsSubject, ids.g8a, {}, { submit: true }), ValidationError, /missing for 2 students/)
    const done = await save(
      ctx.teacher, ids.mathsSubject, ids.g8a,
      { [ids.aarav]: { [ids.mPractical]: "AB" }, [ids.elina]: { [ids.mTheory]: "70", [ids.mPractical]: "24.5" } },
      { submit: true }
    )
    assert.equal(done.status, "SUBMITTED")
    await rejects(save(ctx.teacher, ids.mathsSubject, ids.g8a, { [ids.sita]: { [ids.mTheory]: "61" } }), ConflictError, /submitted/)
  })

  it("never shows a draft sheet's marks as results", async () => {
    const preview = await listExamResults(ctx.officer, ids.exam, parseResultFilters({ view: "provisional" }))
    assert.equal(preview.view, "provisional")
    assert.ok(preview.rows.every((r) => r.status === "PENDING"))
    const teacherView = await listExamResults(ctx.teacher, ids.exam, parseResultFilters({ view: "provisional" }))
    assert.equal(teacherView.view, "published")
    assert.equal(teacherView.rows.length, 0)
  })
})

describe("review and approval", () => {
  it("enforces separation of duties and the verification step", async () => {
    // The officer enters (and submits) section B's maths and science.
    const mathsB = await save(ctx.officer, ids.mathsSubject, ids.g8b, { [ids.dipak]: { [ids.mTheory]: "30", [ids.mPractical]: "3" } }, { submit: true })
    const sciB = await save(ctx.officer, ids.scienceSubject, ids.g8b, { [ids.dipak]: { [ids.sTheory]: "33" } }, { submit: true })
    ids.mathsB = mathsB.sheetId
    ids.sciB = sciB.sheetId
    const own = await verifySheets(ctx.officer, { sheetIds: [ids.mathsB] })
    assert.equal(own.done, 0)
    assert.match(own.skipped[0].reason, /someone else must verify/)
    const early = await approveSheets(ctx.coordinator, { sheetIds: [ids.mathsA] })
    assert.match(early.skipped[0].reason, /verified before approval/)
    const queue = await listReviewSheets(ctx.coordinator, { page: 1, pageSize: 25, status: "ACTION" })
    assert.equal(queue.total, 3)
  })

  it("returns marks for correction and keeps every change with its reason", async () => {
    await rejects(returnSheets(ctx.coordinator, { sheetIds: [ids.mathsA], note: "" }), ZodError)
    await rejects(verifySheets(ctx.teacher, { sheetIds: [ids.mathsA] }), PermissionDeniedError)
    await returnSheets(ctx.coordinator, { sheetIds: [ids.mathsA], note: "Aarav's practical: check the absence" })
    await rejects(save(ctx.teacher, ids.mathsSubject, ids.g8a, { [ids.aarav]: { [ids.mPractical]: "12" } }), ValidationError, /reason/)
    await save(ctx.teacher, ids.mathsSubject, ids.g8a, { [ids.aarav]: { [ids.mPractical]: "12" } }, { reason: "Practical was done on the make-up day", submit: true })
    const history = await prisma.studentMarkHistory.findMany({ where: { examinationId: ids.exam, studentId: ids.aarav } })
    assert.equal(history.length, 1)
    assert.equal(history[0].fromStatus, "ABSENT")
    assert.equal(history[0].toMarks?.toString(), "12")
    assert.equal(history[0].reason, "Practical was done on the make-up day")
  })

  it("verifies and approves through the right people", async () => {
    const v = await verifySheets(ctx.coordinator, { sheetIds: [ids.mathsA, ids.mathsB, ids.sciB] })
    assert.equal(v.done, 3)
    const a = await approveSheets(ctx.coordinator, { sheetIds: [ids.mathsA, ids.mathsB, ids.sciB] })
    assert.equal(a.done, 3)
  })

  it("won't approve results while marks are missing", async () => {
    const check = await publicationCheck(ctxA, ids.exam)
    assert.match(check.errors.join(), /Science · Section A|Grade 8 · Section A · Science/)
    await rejects(approveExamination(ctx.coordinator, { examinationId: ids.exam }), ValidationError, /isn't approved yet|aren't approved yet/)
    // Science 8A: Sita and Aarav scored; Elina's paper is withheld for review.
    await save(ctx.science, ids.scienceSubject, ids.g8a, { [ids.sita]: { [ids.sTheory]: "88" }, [ids.aarav]: { [ids.sTheory]: "36.5" }, [ids.elina]: { [ids.sTheory]: "WH" } }, { submit: true })
    const sheet = await prisma.marksSheet.findFirstOrThrow({ where: { examinationSubjectId: ids.scienceSubject, sectionId: ids.g8a } })
    ids.sciA = sheet.id
    await verifySheets(ctx.officer, { sheetIds: [ids.sciA] })
    await approveSheets(ctx.coordinator, { sheetIds: [ids.sciA] })
    await placeHold(ctx.officer, { examinationId: ids.exam, studentId: ids.dipak, reason: "Fee clearance pending" })
    await rejects(placeHold(ctx.officer, { examinationId: ids.exam, studentId: ids.dipak, reason: "again" }), ConflictError)
    const approved = await approveExamination(ctx.coordinator, { examinationId: ids.exam })
    assert.deepEqual(approved.errors, [])
    assert.equal(approved.summary.counts.PASS, 2)
    assert.equal(approved.summary.counts.WITHHELD, 2)
    const exam = await findExam(prisma, ctxA, ids.exam)
    assert.equal(exam.status, "APPROVED")
    assert.ok(exam.rulesSnapshot)
    const frozen = await returnSheets(ctx.coordinator, { sheetIds: [ids.sciA], note: "x" })
    assert.equal(frozen.done, 0)
    assert.match(frozen.skipped[0].reason, /revoke the approval first/)
  })
})

describe("publication and portals", () => {
  it("publishes an immutable version and notifies honestly", async () => {
    await rejects(publishResults(ctx.teacher, { examinationId: ids.exam }), PermissionDeniedError)
    await rejects(publishResults(ctx.coordinator, { examinationId: ids.exam }), PermissionDeniedError)
    const published = await publishResults(ctx.officer, { examinationId: ids.exam, notifyGuardians: true })
    assert.equal(published.version, 1)
    assert.equal(published.students, 4)
    // No delivery channel is configured: nobody is claimed to be reached.
    assert.equal(published.notices?.sent, 0)
    const results = await prisma.studentResult.findMany({ where: { publicationId: published.publicationId } })
    const sita = results.find((r) => r.studentId === ids.sita)!
    // Maths 80/100, science 88/100 → 168/200 = 84 %.
    assert.equal(sita.totalObtained?.toString(), "168")
    assert.equal(sita.percentage?.toString(), "84")
    assert.equal(sita.grade, "A")
    assert.equal(sita.status, "PASS")
    assert.equal(results.find((r) => r.studentId === ids.elina)!.status, "WITHHELD")
    assert.equal(results.find((r) => r.studentId === ids.dipak)!.status, "WITHHELD")
    assert.equal((await findExam(prisma, ctxA, ids.exam)).status, "PUBLISHED")
  })

  it("shows students only their own published results", async () => {
    const mine = await myResults(ctx.pupil)
    assert.equal(mine?.years[0].items.length, 1)
    const item = mine!.years[0].items[0]
    ids.sitaResult = item.resultId
    const card = await portalResultCard(ctx.pupil, item.resultId)
    assert.equal(card.official, true)
    assert.equal(card.breakdown.subjects.length, 2)
    const aaravResult = (await prisma.studentResult.findFirstOrThrow({ where: { studentId: ids.aarav } })).id
    await rejects(portalResultCard(ctx.pupil, aaravResult), NotFoundError)
  })

  it("shows guardians only children shared with them", async () => {
    const years = await childResults(ctx.parent, ids.sita)
    assert.equal(years[0].items[0].grade, "A")
    await rejects(childResults(ctx.parent, ids.aarav), NotFoundError)
    const aaravResult = (await prisma.studentResult.findFirstOrThrow({ where: { studentId: ids.aarav } })).id
    await rejects(portalResultCard(ctx.parent, aaravResult), NotFoundError)
    await rejects(portalResultCard(ctxB, ids.sitaResult), NotFoundError)
  })

  it("withholds marks from withheld results everywhere", async () => {
    const card = await staffResultCard(ctxA, ids.exam, ids.dipak, {})
    assert.equal(card.status, "WITHHELD")
    assert.equal(card.percentage, null)
    assert.equal(card.breakdown.subjects.length, 0)
  })

  it("scopes published results for teachers to the classes they teach", async () => {
    const forScience = await listExamResults(ctx.science, ids.exam, parseResultFilters({}))
    assert.deepEqual(forScience.rows.map((r) => r.sectionName).sort(), ["A", "A", "A"])
    const all = await listExamResults(ctxA, ids.exam, parseResultFilters({}))
    assert.equal(all.total, 4)
  })
})

describe("corrections after publication", () => {
  it("revises published results through the full workflow and keeps the old version", async () => {
    await rejects(openRevision(ctx.officer, { examinationId: ids.exam, reason: "x" }), PermissionDeniedError)
    await openRevision(ctx.coordinator, { examinationId: ids.exam, reason: "Re-totalling request for Aarav (science)", sheetIds: [ids.sciA] })
    // The published version is still what students see.
    assert.equal((await myResults(ctx.pupil))!.years[0].items[0].version, 1)
    await save(ctx.science, ids.scienceSubject, ids.g8a, { [ids.aarav]: { [ids.sTheory]: "46.5" } }, { reason: "Re-totalling found 10 uncounted marks", submit: true })
    await verifySheets(ctx.officer, { sheetIds: [ids.sciA] })
    await approveSheets(ctx.coordinator, { sheetIds: [ids.sciA] })
    await approveExamination(ctx.coordinator, { examinationId: ids.exam })
    await rejects(publishResults(ctx.officer, { examinationId: ids.exam }), ValidationError, /Explain what this revised version corrects/)
    const v2 = await publishResults(ctx.officer, { examinationId: ids.exam, reason: "Corrected Aarav's science total", notifyGuardians: false })
    assert.equal(v2.version, 2)
    const pubs = await prisma.resultPublication.findMany({ where: { examinationId: ids.exam }, orderBy: { version: "asc" } })
    assert.deepEqual(pubs.map((p) => p.status), ["SUPERSEDED", "ACTIVE"])
    const [old, revised] = await Promise.all(pubs.map((p) => prisma.studentResult.findFirstOrThrow({ where: { publicationId: p.id, studentId: ids.aarav } })))
    assert.notEqual(old.totalObtained?.toString(), revised.totalObtained?.toString())
    const history = await prisma.studentMarkHistory.findMany({ where: { examinationId: ids.exam, studentId: ids.aarav, componentId: ids.sTheory } })
    assert.equal(history[0].fromMarks?.toString(), "36.5")
  })

  it("never regrades published results when the grading scale changes", async () => {
    const before = await prisma.studentResult.findMany({ where: { examinationId: ids.exam }, select: { id: true, grade: true, percentage: true } })
    const v2 = await newGradingScaleVersion(ctxA, ids.scale)
    await saveGradingScale(ctxA, v2.id, {
      name: "Sample letter grading", gradingType: "GRADE_POINT",
      rules: [
        { grade: "Distinction", minimumPercentage: 80, maximumPercentage: 100, gradePoint: 4 },
        { grade: "Pass", minimumPercentage: 40, maximumPercentage: 80, gradePoint: 2 },
        { grade: "Fail", minimumPercentage: 0, maximumPercentage: 40, gradePoint: 0, isFailing: true },
      ],
    })
    await activateGradingScale(ctxA, v2.id)
    assert.equal((await prisma.gradingScale.findUniqueOrThrow({ where: { id: ids.scale } })).status, "RETIRED")
    const after = await prisma.studentResult.findMany({ where: { examinationId: ids.exam }, select: { id: true, grade: true, percentage: true } })
    assert.deepEqual(after, before)
    // And the next calculation of this examination still uses its snapshot.
    const card = await staffResultCard(ctxA, ids.exam, ids.sita, { provisional: true })
    assert.equal(card.grade, "A")
  })

  it("lets approval be revoked before publication only by approvers", async () => {
    await rejects(revokeApproval(ctx.coordinator, { examinationId: ids.exam, reason: "x" }), ConflictError, /aren't approved/)
  })
})

describe("import, reports and tenant isolation", () => {
  it("imports marks with row-level validation into draft sheets", async () => {
    const exam = await saveExamination(ctxA, null, examInput({ name: `Unit Test ${run}`, code: "", gradingScaleId: (await prisma.gradingScale.findFirstOrThrow({ where: { organizationId: ctxA.organization.id, status: "ACTIVE" } })).id }))
    ids.unit = exam.id
    await addExamSubjects(ctxA, { examinationId: exam.id, offeringIds: [ids.mathsOffering], passMarks: 8, components: [{ name: "Theory", componentType: "THEORY", maximumMarks: 25 }] })
    await scheduleExamination(ctxA, { examinationId: exam.id })
    const csv = [
      "admission_number,subject_code,component,marks",
      `EX-Sita-${run},M${run},Theory,20`,
      `EX-Sita-${run},M${run},Theory,21`,
      `EX-Aarav-${run},M${run},theory,AB`,
      `EX-Elina-${run},M${run},Theory,30`,
      `NOPE-${run},M${run},Theory,10`,
      `EX-Dipak-${run},S${run},Theory,10`,
      `EX-Dipak-${run},M${run},Viva,10`,
    ].join("\n")
    const preview = await previewMarksImport(ctx.teacher, { examinationId: exam.id, csv, firstLine: 2 })
    const errors = preview.rows.map((r) => r.errors[0] ?? "ok")
    assert.equal(errors[0], "ok")
    assert.match(errors[1], /more than once/)
    assert.equal(errors[2], "ok")
    assert.match(errors[3], /Above the full marks/)
    assert.match(errors[4], /No student/)
    assert.match(errors[5], /no subject/)
    assert.match(errors[6], /Unknown component/)
    const committed = await commitMarksImport(ctx.teacher, { examinationId: exam.id, csv, firstLine: 2 })
    assert.equal(committed.rows.filter((r) => r.created).length, 2)
    const sheet = await prisma.marksSheet.findFirstOrThrow({ where: { examinationId: exam.id, sectionId: ids.g8a } })
    assert.equal(sheet.status, "DRAFT")
    // A second import never overwrites.
    const again = await previewMarksImport(ctx.teacher, { examinationId: exam.id, csv: `admission_number,subject_code,component,marks\nEX-Sita-${run},M${run},Theory,22`, firstLine: 2 })
    assert.match(again.rows[0].errors[0], /Already has 20/)
    // The science teacher can't import maths.
    const other = await previewMarksImport(ctx.science, { examinationId: exam.id, csv: `admission_number,subject_code,component,marks\nEX-Elina-${run},M${run},Theory,5`, firstLine: 2 })
    assert.match(other.rows[0].errors[0], /can't enter marks/)
    await rejects(unscheduleExamination(ctxA, { examinationId: exam.id }), ConflictError, /already been entered/)
  })

  it("reports from published results", async () => {
    const report = await resultAnalytics(ctxA, { year: ids.year, support: 40 })
    assert.equal(report.totals.students, 4)
    assert.equal(report.totals.counts.PASS, 2)
    assert.equal(report.subjects.length, 2)
    const completion = await marksCompletion(ctxA, ids.year)
    assert.equal(completion.exams.length, 1)
    assert.ok(completion.teachers.some((t) => t.name.includes("Kamala")))
  })

  it("keeps other organisations out", async () => {
    await rejects(findExam(prisma, ctxB, ids.exam), NotFoundError)
    await rejects(getExaminationDetail(ctxB, ids.exam), NotFoundError)
    await rejects(listExamResults(ctxB, ids.exam, parseResultFilters({})), NotFoundError)
    await rejects(approveExamination(ctxB, { examinationId: ids.exam }), NotFoundError)
    await rejects(placeHold(ctxB, { examinationId: ids.exam, studentId: ids.sita, reason: "x" }), NotFoundError)
    assert.equal((await resultAnalytics(ctxB, { year: ids.yearB, support: 40 })).totals.students, 0)
  })
})

// Last: errors raised by the database itself (they break PGlite's socket).
describe("database guards", () => {
  it("refuses changes to published results", async () => {
    const result = await prisma.studentResult.findFirstOrThrow({ where: { examinationId: ids.exam } })
    await assert.rejects(prisma.studentResult.update({ where: { id: result.id }, data: { grade: "A+" } }), /published_results_immutable|cannot be changed/)
  })

  it("refuses marks on closed sheets", async () => {
    const mark = await prisma.studentMark.findFirstOrThrow({ where: { marksSheetId: ids.sciA } })
    await assert.rejects(prisma.studentMark.update({ where: { id: mark.id }, data: { marksObtained: 99 } }), /student_marks_sheet_editable|cannot be changed/)
  })
})
