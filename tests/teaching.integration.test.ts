// Teaching workspace against a real database: who may plan, share, set and
// review work for which classes, timetable clashes, and notice audiences.
// Run with: npm run test:integration (needs DATABASE_URL).
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import { localDate } from "@/features/attendance/constants"
import { parseClassAssignmentFilters, parseLessonPlanFilters, parseMaterialFilters, parseNoticeFilters } from "@/features/teaching/filters"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import {
  deleteClassAssignment,
  getClassAssignment,
  listClassAssignments,
  recordSubmission,
  reviewSubmission,
  saveClassAssignment,
  setClassAssignmentStatus,
} from "@/services/teaching/class-assignment-service"
import { classRoster, myClasses } from "@/services/teaching/class-service"
import { parseStudentFilters } from "@/features/students/filters"
import { getStudentStats, listStudents } from "@/services/students/student-query"
import { getStudentProfile } from "@/services/students/student-service"
import { teacherCounts } from "@/services/teaching/home-service"
import { deleteLessonPlan, listLessonPlans, saveLessonPlan } from "@/services/teaching/lesson-plan-service"
import { addMaterial, listMaterials, materialTarget } from "@/services/teaching/material-service"
import { listNotices, saveNotice } from "@/services/teaching/notice-service"
import { teachingOptions } from "@/services/teaching/options-service"
import { deleteSlot, mySchedule, saveSlot } from "@/services/teaching/timetable-service"

const run = randomUUID().slice(0, 8)
const ids = {} as Record<string, string>
const userIds: string[] = []
let org: { id: string; name: string; slug: string }

// Teacher-role permissions (no oversight, no notices.manage).
const TEACHER: PermissionKey[] = [
  "dashboard.view", "students.view", "classes.view", "subjects.view", "courses.view", "courses.create", "courses.update",
  "assignments.view", "assignments.create", "assignments.update", "assignments.delete", "assignments.grade",
  "attendance.view", "attendance.create", "exams.view", "exams.grade", "results.view", "communication.view",
]

function ctxFor(userId: string, permissions: readonly PermissionKey[]): AuthContext {
  return {
    user: { id: userId, authUserId: randomUUID(), email: `u-${userId.slice(0, 6)}@example.com`, name: "Test", avatarUrl: null, isPlatformAdmin: false },
    organization: { ...org, type: "COLLEGE" },
    membership: { id: randomUUID() },
    role: { id: randomUUID(), name: "Role", slug: "role" },
    permissions,
  }
}

async function rejects<T extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => T, field?: string) {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof type, `expected ${type.name}, got ${(error as Error)?.constructor?.name}: ${(error as Error)?.message} ${JSON.stringify((error as unknown as ValidationError).fieldErrors ?? "")}`)
    if (field) assert.ok(error instanceof ValidationError && error.fieldErrors[field], `expected an error on ${field}, got ${JSON.stringify((error as unknown as ValidationError).fieldErrors)}`)
    return
  }
  assert.fail(`expected ${type.name}`)
}

async function user(label: string) {
  const u = await prisma.user.create({ data: { authUserId: randomUUID(), email: `teach-${label}-${run}@example.com`, name: label } })
  userIds.push(u.id)
  return u.id
}

let maths: AuthContext // teaches Grade 10 (whole class) Mathematics
let science: AuthContext // teaches Grade 10 section B Science
let grade9: AuthContext // teaches Grade 9 Science only
let head: AuthContext // oversees teaching and manages the timetable and notices
let pupil: AuthContext // a Grade 10 A student

before(async () => {
  org = await prisma.organization.create({ data: { name: `Teaching College ${run}`, slug: `test-teach-${run}`, type: "COLLEGE" } })
  const organizationId = org.id
  const level = await prisma.educationLevel.create({ data: { organizationId, name: "Higher Secondary", code: `HS${run}` } })
  const g10 = await prisma.academicClass.create({ data: { organizationId, educationLevelId: level.id, name: "Grade 10" } })
  const g9 = await prisma.academicClass.create({ data: { organizationId, educationLevelId: level.id, name: "Grade 9" } })
  const a = await prisma.section.create({ data: { organizationId, classId: g10.id, name: "A" } })
  const b = await prisma.section.create({ data: { organizationId, classId: g10.id, name: "B" } })
  const year = await prisma.academicYear.create({ data: { organizationId, name: "2083", startDate: new Date("2026-04-14"), endDate: new Date("2027-04-13"), status: "ACTIVE", isCurrent: true } })
  const mathsSubject = await prisma.subject.create({ data: { organizationId, name: "Mathematics", code: `MATH${run}` } })
  const scienceSubject = await prisma.subject.create({ data: { organizationId, name: "Science", code: `SCI${run}` } })
  Object.assign(ids, { level: level.id, g10: g10.id, g9: g9.id, a: a.id, b: b.id, year: year.id, maths: mathsSubject.id, science: scienceSubject.id })

  const teacher = async (label: string) => {
    const userId = await user(label)
    const t = await prisma.teacher.create({ data: { organizationId, userId, employeeId: `${label}-${run}`, firstName: label, lastName: "Teacher", dateOfJoining: new Date("2024-04-15") } })
    return { userId, teacherId: t.id }
  }
  const tm = await teacher("maths")
  const ts = await teacher("science")
  const t9 = await teacher("grade9")
  const assign = (teacherId: string, classId: string, sectionId: string | null, subjectId: string) =>
    prisma.teacherAssignment.create({ data: { organizationId, teacherId, academicYearId: year.id, classId, sectionId, subjectId, startDate: new Date("2026-04-14") } })
  await assign(tm.teacherId, g10.id, null, mathsSubject.id)
  await assign(ts.teacherId, g10.id, b.id, scienceSubject.id)
  await assign(t9.teacherId, g9.id, null, scienceSubject.id)
  Object.assign(ids, { tm: tm.teacherId, ts: ts.teacherId, t9: t9.teacherId })

  // Three Grade 10 students (two in A, one in B) and one in Grade 9.
  const pupilUser = await user("pupil")
  const enrol = async (n: number, classId: string, sectionId: string, userId?: string) => {
    const s = await prisma.student.create({ data: { organizationId, userId, admissionNumber: `S${n}-${run}`, firstName: `Student${n}`, lastName: "K", admissionDate: new Date("2026-04-14") } })
    await prisma.enrollment.create({ data: { organizationId, studentId: s.id, academicYearId: year.id, educationLevelId: level.id, classId, sectionId, rollNumber: String(n), enrollmentDate: new Date("2026-04-14") } })
    return s.id
  }
  ids.s1 = await enrol(1, g10.id, a.id, pupilUser)
  ids.s2 = await enrol(2, g10.id, a.id)
  ids.s3 = await enrol(3, g10.id, b.id)
  ids.s9 = await enrol(4, g9.id, (await prisma.section.create({ data: { organizationId, classId: g9.id, name: "A" } })).id)

  maths = ctxFor(tm.userId, TEACHER)
  science = ctxFor(ts.userId, TEACHER)
  grade9 = ctxFor(t9.userId, TEACHER)
  head = ctxFor(await user("head"), PERMISSION_KEYS)
  pupil = ctxFor(pupilUser, ["dashboard.view", "communication.view", "courses.view", "assignments.view"])
})

after(async () => {
  await prisma.organization.deleteMany({ where: { id: org.id } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await prisma.$disconnect()
})

const place = (o: Record<string, unknown> = {}) => ({ academicYearId: ids.year, classId: ids.g10, sectionId: "", subjectId: ids.maths, ...o })

describe("my classes", () => {
  it("lists only the teacher's classes, counting every section for a whole-class assignment", async () => {
    const classes = await myClasses(maths, ids.year)
    assert.deepEqual(classes.map((c) => [c.className, c.sectionName, c.students, c.subjects.map((s) => s.name)]), [["Grade 10", null, 3, ["Mathematics"]]])
    const sci = await myClasses(science, ids.year)
    assert.deepEqual(sci.map((c) => [c.sectionName, c.students]), [["B", 1]])
  })

  it("shows rosters only to the class's teachers and academic heads", async () => {
    assert.equal((await classRoster(maths, { academicYearId: ids.year, classId: ids.g10, sectionId: null })).students.length, 3)
    assert.equal((await classRoster(science, { academicYearId: ids.year, classId: ids.g10, sectionId: ids.b })).students.length, 1)
    await rejects(classRoster(science, { academicYearId: ids.year, classId: ids.g10, sectionId: ids.a }), NotFoundError)
    await rejects(classRoster(grade9, { academicYearId: ids.year, classId: ids.g10, sectionId: null }), NotFoundError)
    assert.equal((await classRoster(head, { academicYearId: ids.year, classId: ids.g10, sectionId: null })).students.length, 3)
  })

  it("offers only taught places in forms", async () => {
    const o = await teachingOptions(science)
    assert.deepEqual(o.places.map((p) => [p.sectionName, p.subjects.map((s) => s.name)]), [["B", ["Science"]]])
    assert.equal(o.oversees, false)
    assert.equal((await teachingOptions(head)).oversees, true)
  })
})

describe("timetable", () => {
  const slot = (o: Record<string, unknown> = {}) => ({ ...place(), teacherId: "", dayOfWeek: 0, startTime: "10:00", endTime: "10:45", room: "201", note: "", ...o })

  it("lets teachers add their own periods for what they teach, and refuses clashes", async () => {
    const s = await saveSlot(maths, null, slot())
    ids.slot = s.id
    await rejects(saveSlot(maths, null, slot({ subjectId: ids.science })), ForbiddenError)
    // The same teacher can't be in two places…
    await rejects(saveSlot(maths, null, slot({ sectionId: ids.a, startTime: "10:30", endTime: "11:15" })), ConflictError)
    // …and a section can't have a period during a whole-class one.
    await rejects(saveSlot(science, null, slot({ sectionId: ids.b, subjectId: ids.science, startTime: "10:15", endTime: "11:00" })), ConflictError)
    const later = await saveSlot(science, null, slot({ sectionId: ids.b, subjectId: ids.science, startTime: "10:45", endTime: "11:30" }))
    ids.sciSlot = later.id
    // A teacher's periods are always their own.
    const own = await prisma.timetableSlot.findUniqueOrThrow({ where: { id: later.id } })
    assert.equal(own.teacherId, ids.ts)
  })

  it("lets coordinators place any teacher, and teachers change only their own periods", async () => {
    await saveSlot(head, null, slot({ classId: ids.g9, subjectId: ids.science, teacherId: ids.t9 }))
    assert.equal((await mySchedule(grade9, ids.year)).length, 1)
    await rejects(deleteSlot(maths, ids.sciSlot), ForbiddenError)
    await rejects(saveSlot(maths, ids.sciSlot, slot({ startTime: "12:00", endTime: "12:45" })), ForbiddenError)
    assert.equal((await mySchedule(maths, ids.year)).length, 1)
  })
})

describe("lesson plans", () => {
  const plan = (o: Record<string, unknown> = {}) => ({ ...place(), title: "Quadratics", topic: "Algebra", plannedDate: "2026-05-03", periods: 2, objectives: "Factorise", activities: "", resources: "", assessment: "", status: "PLANNED", reflection: "", ...o })

  it("are written only for subjects one teaches, and changed only by their author", async () => {
    ids.plan = (await saveLessonPlan(maths, null, plan())).id
    await rejects(saveLessonPlan(maths, null, plan({ subjectId: ids.science })), ForbiddenError)
    await rejects(saveLessonPlan(science, ids.plan, plan()), ForbiddenError)
    await rejects(deleteLessonPlan(science, ids.plan), ForbiddenError)
    await saveLessonPlan(maths, ids.plan, plan({ status: "DELIVERED" }))
    const saved = await prisma.lessonPlan.findUniqueOrThrow({ where: { id: ids.plan } })
    assert.equal(saved.deliveredOn?.toISOString().slice(0, 10), "2026-05-03")
  })

  it("are listed to their author and academic heads only", async () => {
    await saveLessonPlan(science, null, plan({ sectionId: ids.b, subjectId: ids.science, title: "Cells" }))
    const mine = await listLessonPlans(maths, parseLessonPlanFilters({}))
    assert.deepEqual(mine.rows.map((r) => r.title), ["Quadratics"])
    assert.equal(mine.counts.DELIVERED, 1)
    assert.equal((await listLessonPlans(head, parseLessonPlanFilters({}))).total, 2)
    assert.equal((await listLessonPlans(pupil, parseLessonPlanFilters({}))).total, 0, "no teacher profile, no oversight")
  })
})

describe("class assignments", () => {
  const dueDate = localDate(new Date(Date.now() + 3 * 86_400_000))
  const work = (o: Record<string, unknown> = {}) => ({ ...place(), title: "Exercise 5.2", instructions: "Questions 1–10", dueDate, dueTime: "23:59", maxMarks: "20", status: "PUBLISHED", ...o })

  it("are set for taught classes, with submissions recorded and reviewed", async () => {
    await rejects(saveClassAssignment(grade9, null, work()), ForbiddenError)
    ids.work = (await saveClassAssignment(maths, null, work())).id
    const list = await listClassAssignments(maths, parseClassAssignmentFilters({}))
    assert.deepEqual(list.rows.map((r) => [r.title, r.students, r.submitted]), [["Exercise 5.2", 3, 0]])

    await recordSubmission(maths, ids.work, { studentId: ids.s1, submittedOn: "", content: "On paper" })
    await rejects(recordSubmission(maths, ids.work, { studentId: ids.s1, submittedOn: "", content: "" }), ConflictError)
    await rejects(recordSubmission(maths, ids.work, { studentId: ids.s9, submittedOn: "", content: "" }), ValidationError, "studentId")
    await rejects(recordSubmission(science, ids.work, { studentId: ids.s2, submittedOn: "", content: "" }), ForbiddenError)

    const detail = await getClassAssignment(maths, ids.work)
    assert.equal(detail.summary.awaitingReview, 1)
    const submissionId = detail.students.find((s) => s.student.id === ids.s1)!.submission!.id
    await rejects(reviewSubmission(maths, ids.work, submissionId, { status: "REVIEWED", marks: "25", feedback: "" }), ValidationError, "marks")
    await reviewSubmission(maths, ids.work, submissionId, { status: "REVIEWED", marks: "18", feedback: "Good work" })
    assert.equal((await getClassAssignment(maths, ids.work)).summary.reviewed, 1)
    assert.equal((await teacherCounts(maths, ids.year)).awaitingReview, 0)
  })

  it("can't be deleted once work is in, and can't be edited while closed", async () => {
    await rejects(deleteClassAssignment(maths, ids.work), ConflictError)
    await setClassAssignmentStatus(maths, ids.work, "CLOSED")
    await rejects(saveClassAssignment(maths, ids.work, work({ title: "Changed" })), ConflictError)
    await setClassAssignmentStatus(maths, ids.work, "PUBLISHED")
    await rejects(getClassAssignment(science, ids.work), NotFoundError)
    assert.equal((await getClassAssignment(head, ids.work)).isOwner, false)
    const draft = await saveClassAssignment(maths, null, work({ title: "Draft", status: "DRAFT" }))
    await rejects(recordSubmission(maths, draft.id, { studentId: ids.s2, submittedOn: "", content: "" }), ConflictError)
    await deleteClassAssignment(maths, draft.id)
  })
})

describe("teaching materials", () => {
  it("shares links for taught subjects and opens them only for their teacher and heads", async () => {
    const form = new FormData()
    for (const [k, v] of Object.entries({ academicYearId: ids.year, classId: ids.g10, sectionId: "", subjectId: ids.maths, title: "Khan Academy", description: "", kind: "LINK", url: "https://www.khanacademy.org/math", sharedWithStudents: "true" })) form.set(k, v)
    const m = await addMaterial(maths, form)
    assert.equal(await materialTarget(maths, m.id), "https://www.khanacademy.org/math")
    assert.equal(await materialTarget(head, m.id), "https://www.khanacademy.org/math")
    await rejects(materialTarget(science, m.id), NotFoundError)
    form.set("subjectId", ids.science)
    await rejects(addMaterial(maths, form), ForbiddenError)
    assert.equal((await listMaterials(maths, parseMaterialFilters({}))).total, 1)
  })
})

describe("notices", () => {
  const notice = (o: Record<string, unknown> = {}) => ({ title: "Unit test", body: "Sunday, period 2", audience: "CLASS", academicYearId: ids.year, classId: ids.g10, sectionId: "", pinned: false, expiresOn: "", ...o })

  it("lets teachers post only to classes they teach", async () => {
    await saveNotice(maths, null, notice())
    await rejects(saveNotice(maths, null, notice({ audience: "EVERYONE", classId: "" })), ForbiddenError)
    await rejects(saveNotice(maths, null, notice({ classId: ids.g9 })), ForbiddenError)
    await saveNotice(head, null, notice({ title: "Staff meeting", audience: "STAFF", classId: "" }))
    await saveNotice(head, null, notice({ title: "Holiday", audience: "EVERYONE", classId: "", pinned: true }))
  })

  it("reaches the right people", async () => {
    const titles = async (ctx: AuthContext) => (await listNotices(ctx, parseNoticeFilters({}))).rows.map((n) => n.title).sort()
    assert.deepEqual(await titles(maths), ["Holiday", "Staff meeting", "Unit test"])
    // Section B's teacher sees a whole-class notice for Grade 10.
    assert.deepEqual(await titles(science), ["Holiday", "Staff meeting", "Unit test"])
    assert.deepEqual(await titles(grade9), ["Holiday", "Staff meeting"])
    assert.deepEqual(await titles(pupil), ["Holiday", "Unit test"])
    const first = (await listNotices(pupil, parseNoticeFilters({}))).rows[0]
    assert.equal(first.title, "Holiday", "pinned first")
    assert.equal(first.canEdit, false)
  })
})

describe("student records for teachers", () => {
  it("lists and opens only the students a teacher teaches", async () => {
    const ids_ = async (ctx: AuthContext) => (await listStudents(ctx, parseStudentFilters({}))).rows.map((r) => r.id).sort()
    assert.deepEqual(await ids_(maths), [ids.s1, ids.s2, ids.s3].sort(), "whole-class assignment: every section")
    assert.deepEqual(await ids_(science), [ids.s3], "section B only")
    assert.deepEqual(await ids_(grade9), [ids.s9])
    assert.equal((await ids_(head)).length, 4, "administrators are unaffected")
    assert.equal((await getStudentStats(science, ids.year)).total, 1)
    await getStudentProfile(maths, ids.s1)
    await rejects(getStudentProfile(grade9, ids.s1), NotFoundError)
    await rejects(getStudentProfile(science, ids.s1), NotFoundError)
  })
})
