// Student portal against a real database: a student reaches only their own
// class's records, and the submission rules hold.
// Run with: npm run test:integration (needs DATABASE_URL).
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import { myExamPapers } from "@/services/student-portal/exam-service"
import { getMyAssignment, myAssignments, myMaterials, mySubjects, myTimetable, submitMyAssignment } from "@/services/student-portal/learning-service"
import { myEnrollment } from "@/services/student-portal/me-service"
import { myAttendanceHistory, myDocuments, myDocumentUrl, myProfile } from "@/services/student-portal/record-service"
import { materialTarget } from "@/services/teaching/material-service"

const run = randomUUID().slice(0, 8)
const ids = {} as Record<string, string>
const userIds: string[] = []
let org: { id: string; name: string; slug: string }

const STUDENT: PermissionKey[] = ["dashboard.view", "academics.view", "courses.view", "assignments.view", "attendance.view", "exams.view", "subjects.view", "results.view", "communication.view"]

function ctxFor(userId: string, permissions: readonly PermissionKey[] = STUDENT): AuthContext {
  return {
    user: { id: userId, authUserId: randomUUID(), email: `s-${userId.slice(0, 6)}@example.com`, name: "Test", avatarUrl: null, isPlatformAdmin: false },
    organization: { ...org, type: "COLLEGE" },
    membership: { id: randomUUID() },
    role: { id: randomUUID(), name: "Student", slug: "student" },
    permissions,
  }
}

async function rejects<T extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => T) {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof type, `expected ${type.name}, got ${(error as Error)?.constructor?.name}: ${(error as Error)?.message}`)
    return
  }
  assert.fail(`expected ${type.name}`)
}

const form = (o: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}

let asha: AuthContext // Grade 10 section A
let bikash: AuthContext // Grade 10 section B
let nobody: AuthContext // no student profile

before(async () => {
  org = await prisma.organization.create({ data: { name: `Portal College ${run}`, slug: `test-portal-${run}`, type: "COLLEGE" } })
  const organizationId = org.id
  const level = await prisma.educationLevel.create({ data: { organizationId, name: "Higher Secondary", code: `HS${run}` } })
  const g10 = await prisma.academicClass.create({ data: { organizationId, educationLevelId: level.id, name: "Grade 10" } })
  const a = await prisma.section.create({ data: { organizationId, classId: g10.id, name: "A" } })
  const b = await prisma.section.create({ data: { organizationId, classId: g10.id, name: "B" } })
  const year = await prisma.academicYear.create({ data: { organizationId, name: "2083", startDate: new Date("2026-04-14"), endDate: new Date("2027-04-13"), status: "ACTIVE", isCurrent: true } })
  const maths = await prisma.subject.create({ data: { organizationId, name: "Mathematics", code: `M${run}` } })
  const music = await prisma.subject.create({ data: { organizationId, name: "Music", code: `MU${run}` } })
  // Mathematics for the whole class; Music only for section B.
  const mathsOffering = await prisma.subjectOffering.create({ data: { organizationId, academicYearId: year.id, classId: g10.id, subjectId: maths.id, requirement: "COMPULSORY" } })
  const musicOffering = await prisma.subjectOffering.create({ data: { organizationId, academicYearId: year.id, classId: g10.id, subjectId: music.id, requirement: "ELECTIVE" } })
  await prisma.subjectOfferingSection.create({ data: { organizationId, offeringId: musicOffering.id, sectionId: b.id, classId: g10.id } })

  const teacherUser = await prisma.user.create({ data: { authUserId: randomUUID(), email: `portal-t-${run}@example.com`, name: "Teacher" } })
  userIds.push(teacherUser.id)
  const teacher = await prisma.teacher.create({ data: { organizationId, userId: teacherUser.id, employeeId: `T-${run}`, firstName: "Sita", lastName: "Rai", dateOfJoining: new Date("2024-04-15") } })
  await prisma.teacherAssignment.create({ data: { organizationId, teacherId: teacher.id, academicYearId: year.id, classId: g10.id, subjectId: maths.id, startDate: new Date("2026-04-14") } })

  const student = async (label: string, sectionId: string) => {
    const u = await prisma.user.create({ data: { authUserId: randomUUID(), email: `portal-${label}-${run}@example.com`, name: label } })
    userIds.push(u.id)
    const s = await prisma.student.create({ data: { organizationId, userId: u.id, admissionNumber: `${label}-${run}`, firstName: label, lastName: "K", admissionDate: new Date("2026-04-14"), medicalNotes: "staff only" } })
    await prisma.enrollment.create({ data: { organizationId, studentId: s.id, academicYearId: year.id, educationLevelId: level.id, classId: g10.id, sectionId, rollNumber: "1", enrollmentDate: new Date("2026-04-14") } })
    return { userId: u.id, studentId: s.id }
  }
  const sa = await student("Asha", a.id)
  const sb = await student("Bikash", b.id)
  const none = await prisma.user.create({ data: { authUserId: randomUUID(), email: `portal-none-${run}@example.com`, name: "None" } })
  userIds.push(none.id)
  asha = ctxFor(sa.userId)
  bikash = ctxFor(sb.userId)
  nobody = ctxFor(none.id)
  Object.assign(ids, { year: year.id, g10: g10.id, a: a.id, b: b.id, maths: maths.id, music: music.id, teacher: teacher.id, asha: sa.studentId, bikash: sb.studentId, mathsOffering: mathsOffering.id, musicOffering: musicOffering.id })

  // Timetable: a whole-class period and a section-B-only period.
  await prisma.timetableSlot.createMany({
    data: [
      { organizationId, academicYearId: year.id, classId: g10.id, subjectId: maths.id, teacherId: teacher.id, dayOfWeek: 0, startTime: "10:00", endTime: "10:45" },
      { organizationId, academicYearId: year.id, classId: g10.id, sectionId: b.id, subjectId: music.id, dayOfWeek: 1, startTime: "11:00", endTime: "11:45" },
    ],
  })
  // Materials: shared with the class, private, and section B only.
  const material = (title: string, o: Record<string, unknown>) =>
    prisma.teachingMaterial.create({ data: { organizationId, teacherId: teacher.id, academicYearId: year.id, classId: g10.id, subjectId: maths.id, title, kind: "LINK", url: "https://example.com", ...o } })
  ids.shared = (await material("Shared notes", {})).id
  ids.private = (await material("Teacher only", { sharedWithStudents: false })).id
  ids.sectionB = (await material("Section B worksheet", { sectionId: b.id })).id
  // Assignments: published (due later), draft, section B only, closed.
  const work = (title: string, o: Record<string, unknown>) =>
    prisma.classAssignment.create({ data: { organizationId, teacherId: teacher.id, academicYearId: year.id, classId: g10.id, subjectId: maths.id, title, dueAt: new Date(Date.now() + 3 * 86_400_000), maxMarks: 10, status: "PUBLISHED", ...o } })
  ids.open = (await work("Exercise 1", {})).id
  ids.draft = (await work("Draft work", { status: "DRAFT" })).id
  ids.forB = (await work("Section B work", { sectionId: b.id })).id
  ids.closed = (await work("Closed work", { status: "CLOSED", dueAt: new Date(Date.now() - 86_400_000) })).id
  // An examination with a whole-class paper and a section-B paper.
  const type = await prisma.assessmentType.create({ data: { organizationId, name: `Terminal ${run}`, category: "TERMINAL" } })
  const scale = await prisma.gradingScale.create({ data: { organizationId, name: `Scale ${run}`, gradingType: "LETTER" } })
  const policy = await prisma.resultPolicy.create({ data: { organizationId, name: `Policy ${run}` } })
  const exam = await prisma.examination.create({
    data: { organizationId, academicYearId: year.id, assessmentTypeId: type.id, gradingScaleId: scale.id, resultPolicyId: policy.id, name: "First Terminal", status: "SCHEDULED", startDate: new Date("2026-12-01"), endDate: new Date("2026-12-10") },
  })
  await prisma.examinationSubject.createMany({
    data: [
      { organizationId, examinationId: exam.id, subjectOfferingId: mathsOffering.id, classId: g10.id, maximumMarks: 100, examDate: new Date("2026-12-02") },
      { organizationId, examinationId: exam.id, subjectOfferingId: musicOffering.id, classId: g10.id, maximumMarks: 50, examDate: new Date("2026-12-03") },
    ],
  })
  // A required document requirement, and one document on file for Asha.
  await prisma.documentRequirement.createMany({ data: [{ organizationId, audience: "STUDENT", name: "Birth certificate", isRequired: true }, { organizationId, audience: "STUDENT", name: "Photo", isRequired: false }] })
  ids.doc = (await prisma.studentDocument.create({ data: { organizationId, studentId: sa.studentId, title: "Transfer certificate", fileName: "tc.pdf", mimeType: "application/pdf", sizeBytes: 1000, storagePath: `${organizationId}/x/${run}.pdf` } })).id
})

after(async () => {
  await prisma.organization.deleteMany({ where: { id: org.id } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await prisma.$disconnect()
})

describe("student portal: own class only", () => {
  it("finds the student's own enrollment and nothing for unlinked accounts", async () => {
    assert.equal((await myEnrollment(asha))?.section?.name, "A")
    assert.equal(await myEnrollment(nobody), null)
    assert.equal(await myProfile(nobody), null)
    const profile = await myProfile(asha)
    assert.ok(profile && !("medicalNotes" in profile.profile), "staff-only fields are never returned")
  })

  it("limits subjects, timetable and exam papers to the student's section", async () => {
    assert.deepEqual((await mySubjects(asha)).map((s) => s.subject.name), ["Mathematics"])
    assert.deepEqual((await mySubjects(bikash)).map((s) => s.subject.name).sort(), ["Mathematics", "Music"])
    assert.equal((await myTimetable(asha)).length, 1)
    assert.equal((await myTimetable(bikash)).length, 2)
    assert.deepEqual((await myExamPapers(asha, "all")).map((p) => p.subjectOffering.subject.name), ["Mathematics"])
    assert.equal((await myExamPapers(bikash, "all")).length, 2)
  })

  it("shows only shared materials for the student's class, and opens only those", async () => {
    assert.deepEqual((await myMaterials(asha, { page: 1, pageSize: 20 })).rows.map((m) => m.title), ["Shared notes"])
    assert.equal((await myMaterials(bikash, { page: 1, pageSize: 20 })).total, 2)
    // A search must not widen the section limit.
    assert.equal((await myMaterials(asha, { q: "worksheet", page: 1, pageSize: 20 })).total, 0)
    assert.equal(await materialTarget(asha, ids.shared), "https://example.com")
    await rejects(materialTarget(asha, ids.private), NotFoundError)
    await rejects(materialTarget(asha, ids.sectionB), NotFoundError)
  })

  it("never shows drafts or other sections' assignments", async () => {
    const titles = (await myAssignments(asha, {})).map((a) => a.title).sort()
    assert.deepEqual(titles, ["Closed work", "Exercise 1"])
    await rejects(getMyAssignment(asha, ids.draft), NotFoundError)
    await rejects(getMyAssignment(asha, ids.forB), NotFoundError)
    assert.equal((await myAssignments(asha, { status: "overdue" })).map((a) => a.title)[0], "Closed work")
  })
})

describe("student portal: submissions", () => {
  it("accepts work while open, and again after it's returned", async () => {
    await rejects(submitMyAssignment(asha, ids.open, form({ content: "" })), ValidationError)
    await submitMyAssignment(asha, ids.open, form({ content: "My answers" }))
    let a = await getMyAssignment(asha, ids.open)
    assert.equal(a.submission?.status, "SUBMITTED")
    assert.equal(a.submission?.late, false)
    // Returned for changes → may hand in again.
    await prisma.assignmentSubmission.update({ where: { id: a.submission!.id }, data: { status: "RETURNED", feedback: "Show working" } })
    await submitMyAssignment(asha, ids.open, form({ content: "With working" }))
    a = await getMyAssignment(asha, ids.open)
    assert.deepEqual([a.submission?.status, a.submission?.content], ["SUBMITTED", "With working"])
    // Reviewed work is final.
    await prisma.assignmentSubmission.update({ where: { id: a.submission!.id }, data: { status: "REVIEWED", marks: 9 } })
    await rejects(submitMyAssignment(asha, ids.open, form({ content: "Again" })), ConflictError)
    assert.equal((await getMyAssignment(asha, ids.open)).submission?.marks, 9)
  })

  it("refuses closed work and other students' assignments", async () => {
    await rejects(submitMyAssignment(asha, ids.closed, form({ content: "Late" })), ConflictError)
    await rejects(submitMyAssignment(asha, ids.forB, form({ content: "Not mine" })), NotFoundError)
    await rejects(submitMyAssignment(nobody, ids.open, form({ content: "x" })), NotFoundError)
  })
})

describe("student portal: records", () => {
  it("lists documents and reports missing required ones", async () => {
    const docs = await myDocuments(asha)
    assert.equal(docs?.documents.length, 1)
    assert.equal(docs?.missing, 1, "the birth certificate is required and missing; the photo is optional")
    assert.equal((await myDocuments(bikash))?.documents.length, 0)
    await rejects(myDocumentUrl(bikash, ids.doc), NotFoundError)
  })

  it("returns only the student's own attendance", async () => {
    const h = await myAttendanceHistory(asha, { page: 1, pageSize: 25 })
    assert.equal(h?.total, 0)
    assert.equal(await myAttendanceHistory(nobody, { page: 1, pageSize: 25 }), null)
  })
})
