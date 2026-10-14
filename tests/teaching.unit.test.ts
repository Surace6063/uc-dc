// Teaching workspace rules (no database). Run with: npm test
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { TeachingAssignment } from "@/features/attendance/access"
import { teaches, taughtPlaces } from "@/features/teaching/access"
import { parseClassAssignmentFilters, parseLessonPlanFilters, parseNoticeFilters } from "@/features/teaching/filters"
import { classAssignmentSchema, lessonPlanSchema, materialSchema, noticeSchema, reviewSubmissionSchema, timetableSlotSchema } from "@/features/teaching/schemas"
import { DEFAULT_ROLES, PERMISSION_KEYS } from "@/lib/authorization/permissions"

const Y = "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b10"
const C = "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b11"
const A = "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b12"
const B = "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b13"
const MATHS = "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b14"
const SCIENCE = "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b15"

const assignment = (o: Partial<TeachingAssignment>): TeachingAssignment => ({ academicYearId: Y, classId: C, sectionId: null, subjectId: null, role: "SUBJECT_TEACHER", ...o })

describe("who teaches what", () => {
  it("covers every section with a whole-class assignment, but only one with a section assignment", () => {
    const whole = [assignment({ subjectId: MATHS })]
    assert.ok(teaches(whole, { academicYearId: Y, classId: C, sectionId: null, subjectId: MATHS }))
    assert.ok(teaches(whole, { academicYearId: Y, classId: C, sectionId: A, subjectId: MATHS }))
    const sectionA = [assignment({ sectionId: A, subjectId: MATHS })]
    assert.ok(teaches(sectionA, { academicYearId: Y, classId: C, sectionId: A, subjectId: MATHS }))
    assert.ok(!teaches(sectionA, { academicYearId: Y, classId: C, sectionId: B, subjectId: MATHS }))
    assert.ok(!teaches(sectionA, { academicYearId: Y, classId: C, sectionId: null, subjectId: MATHS }), "whole-class work needs a whole-class assignment")
  })

  it("needs the subject for subject work, and any assignment for class-level things", () => {
    const classTeacher = [assignment({ role: "CLASS_TEACHER" })]
    assert.ok(!teaches(classTeacher, { academicYearId: Y, classId: C, sectionId: null, subjectId: MATHS }))
    assert.ok(teaches(classTeacher, { academicYearId: Y, classId: C, sectionId: null, subjectId: null }))
    const maths = [assignment({ subjectId: MATHS })]
    assert.ok(!teaches(maths, { academicYearId: Y, classId: C, sectionId: null, subjectId: SCIENCE }))
    assert.ok(!teaches(maths, { academicYearId: "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b99", classId: C, sectionId: null, subjectId: MATHS }), "other years don't count")
  })

  it("lists each class and section once", () => {
    const places = taughtPlaces([assignment({ subjectId: MATHS }), assignment({ subjectId: SCIENCE }), assignment({ sectionId: A, subjectId: MATHS })])
    assert.equal(places.length, 2)
  })
})

describe("teaching forms", () => {
  const place = { academicYearId: Y, classId: C, sectionId: "", subjectId: MATHS }

  it("refuses periods that end before they start or on an invalid day", () => {
    const slot = { ...place, teacherId: "", dayOfWeek: "1", startTime: "10:00", endTime: "10:45", room: "", note: "" }
    assert.equal(timetableSlotSchema.parse(slot).dayOfWeek, 1)
    assert.ok(!timetableSlotSchema.safeParse({ ...slot, endTime: "09:30" }).success)
    assert.ok(!timetableSlotSchema.safeParse({ ...slot, dayOfWeek: "7" }).success)
    assert.ok(!timetableSlotSchema.safeParse({ ...slot, startTime: "9:00" }).success)
  })

  it("keeps lesson periods sensible and requires a subject", () => {
    const plan = { ...place, title: "Quadratics", topic: "", plannedDate: "2026-05-01", periods: "2", objectives: "", activities: "", resources: "", assessment: "", status: "PLANNED", reflection: "" }
    assert.equal(lessonPlanSchema.parse(plan).periods, 2)
    assert.ok(!lessonPlanSchema.safeParse({ ...plan, periods: "0" }).success)
    assert.ok(!lessonPlanSchema.safeParse({ ...plan, subjectId: "" }).success)
  })

  it("needs a web address for links only", () => {
    const m = { ...place, title: "Notes", description: "", kind: "LINK", url: "https://drive.google.com/x", sharedWithStudents: "true" }
    assert.equal(materialSchema.parse(m).sharedWithStudents, true)
    assert.ok(!materialSchema.safeParse({ ...m, url: "javascript:alert(1)" }).success)
    assert.ok(!materialSchema.safeParse({ ...m, url: "" }).success)
    assert.ok(materialSchema.safeParse({ ...m, kind: "FILE", url: "" }).success)
  })

  it("validates due times, full marks and review marks", () => {
    const a = { ...place, title: "Exercise 5", instructions: "", dueDate: "2026-05-01", dueTime: "23:59", maxMarks: "", status: "PUBLISHED" }
    assert.equal(classAssignmentSchema.parse(a).maxMarks, null)
    assert.equal(classAssignmentSchema.parse({ ...a, maxMarks: "20" }).maxMarks, 20)
    assert.ok(!classAssignmentSchema.safeParse({ ...a, maxMarks: "0" }).success)
    assert.ok(!classAssignmentSchema.safeParse({ ...a, status: "CLOSED" }).success, "closing is its own action")
    assert.ok(!reviewSubmissionSchema.safeParse({ status: "REVIEWED", marks: "-1", feedback: "" }).success)
  })

  it("needs a class for class notices", () => {
    const n = { title: "Test", body: "Unit test on Sunday", audience: "CLASS", academicYearId: "", classId: "", sectionId: "", pinned: false, expiresOn: "" }
    assert.ok(!noticeSchema.safeParse(n).success)
    assert.ok(noticeSchema.safeParse({ ...n, classId: C }).success)
    assert.ok(noticeSchema.safeParse({ ...n, audience: "EVERYONE" }).success)
  })
})

describe("teaching filters and permissions", () => {
  it("drops unknown filter values", () => {
    assert.equal(parseLessonPlanFilters({ status: "DONE", sort: "secret" }).status, undefined)
    assert.equal(parseLessonPlanFilters({ sort: "secret" }).sort, "plannedDate")
    assert.equal(parseClassAssignmentFilters({ review: "pending" }).review, "pending")
    assert.equal(parseClassAssignmentFilters({ review: "all" }).review, undefined)
    assert.equal(parseNoticeFilters({ pageSize: "1000" }).pageSize, 20)
  })

  it("adds notices.manage for heads, not teachers", () => {
    assert.ok(PERMISSION_KEYS.includes("notices.manage"))
    const role = (slug: string) => DEFAULT_ROLES.find((r) => r.slug === slug)!.permissions as readonly string[]
    assert.ok(role("owner").includes("notices.manage") && role("admin").includes("notices.manage") && role("principal").includes("notices.manage"))
    assert.ok(!role("teacher").includes("notices.manage"))
  })
})
