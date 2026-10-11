// Pure-logic attendance tests (no database). Run with: npm test
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { assignmentCovers, canTakeRegister, type TeachingAssignment } from "@/features/attendance/access"
import { standing, statusWeight, summarize } from "@/features/attendance/calculation"
import { atLocalTime, datesBetween, localDate, localTime, scopeKey, studentStatuses, weekday } from "@/features/attendance/constants"
import { employedOn, lateMinutesFor, statusForCheckIn } from "@/features/attendance/employees"
import { parseRecordFilters, parseReportParams } from "@/features/attendance/filters"
import { parseStatusWord } from "@/features/attendance/import-template"
import { correctionRequestSchema, policySchema, registerScopeSchema, saveRegisterSchema } from "@/features/attendance/schemas"
import { DEFAULT_ROLES } from "@/lib/authorization/permissions"

const uuid = (n: number) => `3a1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b${String(n).padStart(2, "0")}`
const policy = { lateCountsAsPresent: true, excusedTreatment: "EXCLUDE" as const, minimumPercentage: 75, warningMarginPercentage: 5 }

describe("attendance percentage", () => {
  it("counts attended over conducted, with late and half days per policy", () => {
    const s = summarize({ PRESENT: 6, LATE: 2, HALF_DAY: 2, ABSENT: 2 }, policy)
    assert.equal(s.marked, 12)
    assert.equal(s.conducted, 12)
    assert.equal(s.attended, 9)
    assert.equal(s.percentage, 75)
    assert.equal(summarize({ PRESENT: 6, LATE: 2, HALF_DAY: 2, ABSENT: 2 }, { ...policy, lateCountsAsPresent: false }).attended, 7)
  })

  it("applies the excused-absence rule to excused and leave alike", () => {
    const counts = { PRESENT: 8, ABSENT: 1, EXCUSED: 1, ON_LEAVE: 2 }
    assert.equal(summarize(counts, policy).percentage, 88.9) // 8 / 9
    assert.equal(summarize(counts, { ...policy, excusedTreatment: "COUNT_AS_ABSENT" }).percentage, 66.7) // 8 / 12
    assert.equal(summarize(counts, { ...policy, excusedTreatment: "COUNT_AS_PRESENT" }).percentage, 91.7) // 11 / 12
    assert.deepEqual(statusWeight("EXCUSED", policy), { attended: 0, conducted: 0 })
  })

  it("has no percentage (and no shortage) when nothing was conducted", () => {
    const empty = summarize({}, policy)
    assert.equal(empty.percentage, null)
    assert.equal(standing(empty.percentage, policy), "none")
    // Only excused marks: nothing counted either.
    assert.equal(summarize({ EXCUSED: 3 }, policy).percentage, null)
  })

  it("classifies shortages against the minimum and warning margin", () => {
    assert.equal(standing(74.9, policy), "below")
    assert.equal(standing(75, policy), "approaching")
    assert.equal(standing(79.9, policy), "approaching")
    assert.equal(standing(80, policy), "ok")
  })
})

describe("who may take a register", () => {
  const year = uuid(1)
  const cls = uuid(2)
  const secA = uuid(3)
  const secB = uuid(4)
  const maths = uuid(5)
  const classTeacherA: TeachingAssignment = { academicYearId: year, classId: cls, sectionId: secA, subjectId: null, role: "CLASS_TEACHER" }
  const mathsAll: TeachingAssignment = { academicYearId: year, classId: cls, sectionId: null, subjectId: maths, role: "SUBJECT_TEACHER" }
  const daily = (sectionId: string | null) => ({ academicYearId: year, classId: cls, sectionId, sessionType: "DAILY" as const, subjectId: null })
  const period = (sectionId: string | null, subjectId: string) => ({ academicYearId: year, classId: cls, sectionId, sessionType: "PERIOD" as const, subjectId })

  it("lets class teachers take their own section's daily register only", () => {
    assert.ok(assignmentCovers(classTeacherA, daily(secA)))
    assert.ok(!assignmentCovers(classTeacherA, daily(secB)))
    assert.ok(!assignmentCovers(classTeacherA, daily(null)))
    assert.ok(!assignmentCovers({ ...classTeacherA, academicYearId: uuid(9) }, daily(secA)))
  })

  it("lets subject teachers take only their subject's periods", () => {
    assert.ok(assignmentCovers(mathsAll, period(secA, maths)))
    assert.ok(assignmentCovers(mathsAll, period(null, maths)))
    assert.ok(!assignmentCovers(mathsAll, period(secA, uuid(6))))
    assert.ok(!assignmentCovers(mathsAll, daily(secA)))
    assert.ok(canTakeRegister([classTeacherA, mathsAll], period(secB, maths)))
    assert.ok(!canTakeRegister([], daily(secA)))
  })
})

describe("teacher and staff rules", () => {
  it("respects employment dates", () => {
    const p = { dateOfJoining: "2026-04-01", employmentStatus: "ACTIVE" }
    assert.ok(!employedOn(p, "2026-03-31"))
    assert.ok(employedOn(p, "2026-04-01"))
    const left = { dateOfJoining: "2025-01-01", employmentStatus: "RESIGNED", lastWorkingDate: "2026-06-30" }
    assert.ok(employedOn(left, "2026-06-30"))
    assert.ok(!employedOn(left, "2026-07-01"))
    assert.ok(!employedOn({ dateOfJoining: "2025-01-01", employmentStatus: "TERMINATED" }, "2026-01-01"))
  })

  it("marks late only beyond the grace period", () => {
    const rules = { workdayStartTime: "10:00", lateGraceMinutes: 10 }
    assert.equal(lateMinutesFor("09:50", "10:00"), 0)
    assert.deepEqual(statusForCheckIn("PRESENT", "10:10", rules), { status: "PRESENT", lateMinutes: null })
    assert.deepEqual(statusForCheckIn("PRESENT", "10:25", rules), { status: "LATE", lateMinutes: 25 })
    assert.deepEqual(statusForCheckIn("ON_LEAVE", "10:25", rules), { status: "ON_LEAVE", lateMinutes: null })
  })
})

describe("dates, scopes and parsing", () => {
  it("uses Nepal local time (UTC+05:45) for registers", () => {
    const at = atLocalTime("2026-05-04", "10:15")
    assert.equal(at.toISOString(), "2026-05-04T04:30:00.000Z")
    assert.equal(localTime(at), "10:15")
    assert.equal(localDate(new Date("2026-05-03T18:20:00Z")), "2026-05-04")
    assert.equal(weekday("2026-10-10"), 6) // a Saturday
    assert.deepEqual(datesBetween("2026-01-30", "2026-02-02"), ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"])
  })

  it("keys a register by type, subject and slot", () => {
    assert.equal(scopeKey("DAILY", 1, null), "DAILY:1")
    assert.equal(scopeKey("PERIOD", 3, uuid(5)), `PERIOD:${uuid(5)}:3`)
  })

  it("offers half day only when the policy enables it, never leave for students", () => {
    assert.deepEqual(studentStatuses({ halfDayEnabled: false }), ["PRESENT", "LATE", "ABSENT", "EXCUSED"])
    assert.ok(studentStatuses({ halfDayEnabled: true }).includes("HALF_DAY"))
    assert.ok(!studentStatuses({ halfDayEnabled: true }).includes("ON_LEAVE"))
  })

  it("requires a subject for period registers and none for daily ones", () => {
    const base = { academicYearId: uuid(1), date: "2026-05-04", classId: uuid(2) }
    assert.ok(registerScopeSchema.safeParse({ ...base, sessionType: "DAILY" }).success)
    assert.ok(!registerScopeSchema.safeParse({ ...base, sessionType: "PERIOD" }).success)
    assert.ok(!registerScopeSchema.safeParse({ ...base, sessionType: "DAILY", subjectOfferingId: uuid(5) }).success)
    assert.ok(!registerScopeSchema.safeParse({ ...base, sessionType: "WEEKLY" }).success)
  })

  it("accepts only controlled statuses", () => {
    const entry = { studentId: uuid(7), status: "PRESENT" }
    const register = { scope: { academicYearId: uuid(1), date: "2026-05-04", classId: uuid(2), sessionType: "DAILY" }, sessionId: null, expectedUpdatedAt: null, submit: false }
    assert.ok(saveRegisterSchema.safeParse({ ...register, entries: [entry] }).success)
    assert.ok(!saveRegisterSchema.safeParse({ ...register, entries: [{ ...entry, status: "SICK" }] }).success)
    assert.ok(!correctionRequestSchema.safeParse({ recordIds: [uuid(7)], toStatus: "PRESENT", justification: "" }).success)
    assert.equal(parseStatusWord("p"), "PRESENT")
    assert.equal(parseStatusWord("Half day"), "HALF_DAY")
    assert.equal(parseStatusWord("maybe"), null)
  })

  it("validates the policy", () => {
    const valid = {
      dailyEnabled: true, periodEnabled: false, dailySlots: 1, maxPeriodsPerDay: 8, defaultStatus: "PRESENT", halfDayEnabled: false,
      lateCountsAsPresent: true, excusedTreatment: "EXCLUDE", minimumPercentage: 75, warningMarginPercentage: 5,
      correctionsRequireApproval: true, lockAfterDays: "", weeklyOffDays: [6, 6], allowOnNonWorkingDays: false,
      notifyGuardiansOnAbsence: false, notifyGuardiansOnLate: false, employeeAttendanceEnabled: true, employeeSelfCheckIn: false,
      workdayStartTime: "10:00", lateGraceMinutes: 10,
    }
    const parsed = policySchema.parse(valid)
    assert.deepEqual(parsed.weeklyOffDays, [6])
    assert.equal(parsed.lockAfterDays, null)
    assert.ok(!policySchema.safeParse({ ...valid, dailyEnabled: false }).success)
    assert.ok(!policySchema.safeParse({ ...valid, minimumPercentage: 120 }).success)
    assert.ok(!policySchema.safeParse({ ...valid, workdayStartTime: "25:00" }).success)
  })

  it("parses list filters leniently", () => {
    const f = parseRecordFilters({ status: "ABSENT", page: "x", pageSize: "7", from: "bad" })
    assert.equal(f.status, "ABSENT")
    assert.equal(f.page, 1)
    assert.equal(f.pageSize, 25)
    assert.equal(f.from, undefined)
    assert.equal(parseReportParams({ kind: "nope" }).kind, "students")
  })
})

describe("attendance permissions in default roles", () => {
  const role = (slug: string) => DEFAULT_ROLES.find((r) => r.slug === slug)!.permissions as readonly string[]

  it("keeps parents and students to their own attendance", () => {
    for (const slug of ["parent", "student"]) {
      assert.ok(role(slug).includes("attendance.view"))
      assert.ok(!role(slug).some((p) => p.startsWith("attendance.") && p !== "attendance.view"), slug)
    }
  })

  it("scopes teachers to their classes and leaves approval to others", () => {
    assert.ok(role("teacher").includes("attendance.create"))
    assert.ok(!role("teacher").includes("attendance.manage"))
    assert.ok(!role("teacher").includes("attendance.view_all"))
    assert.ok(!role("teacher").includes("attendance.approve"))
    assert.ok(!role("attendance_officer").includes("attendance.approve"))
    assert.ok(role("academic_coordinator").includes("attendance.approve"))
    assert.ok(role("hr").includes("attendance.staff.manage"))
    assert.ok(!role("hr").includes("attendance.view_all"))
  })
})
