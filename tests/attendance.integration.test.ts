// End-to-end attendance tests against the configured database. Each run
// creates two throwaway organisations (random slugs) and test users and
// deletes them afterwards; no existing data is read or changed.
//
//   npm run test:integration
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import { addDays, localDate } from "@/features/attendance/constants"
import { parseRecordFilters, parseReportParams } from "@/features/attendance/filters"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { DEFAULT_ROLES, PERMISSION_KEYS, type PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import * as structure from "@/services/academics/structure-service"
import { saveClassSection } from "@/services/classes/class-service"
import { noticeAbsences } from "@/services/attendance/alert-service"
import { cancelCorrection, listCorrections, requestCorrections, reviewCorrections } from "@/services/attendance/correction-service"
import { getEmployeeRegister, saveEmployeeRegister, selfCheck } from "@/services/attendance/employee-service"
import { commitAttendanceImport, previewAttendanceImport } from "@/services/attendance/import-export-service"
import { deleteHoliday, getPolicy, saveHoliday, savePolicy } from "@/services/attendance/policy-service"
import { childAttendance, myStudentAttendance } from "@/services/attendance/portal-service"
import { listRecords } from "@/services/attendance/record-query"
import { resolvePeriod, studentReport } from "@/services/attendance/report-service"
import { getRegister, listSessions, lockSessions, reopenSession, saveRegister } from "@/services/attendance/session-service"

type Ctx = AuthContext

const run = randomUUID().slice(0, 8)
const users = {} as Record<"admin" | "teacher" | "reviewer" | "parent" | "pupil" | "clerk", { id: string; email: string }>
let ctxA: Ctx
let ctxB: Ctx
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
    assert.ok(error instanceof type, `expected ${type.name}, got ${(error as Error)?.constructor?.name}: ${(error as Error)?.message}`)
    if (pattern) {
      const text = error instanceof ValidationError ? JSON.stringify(error.fieldErrors) : (error as Error).message
      assert.match(text, pattern)
    }
    return error as T
  }
  assert.fail(`expected ${type.name}`)
}

// Past working days inside the academic year (the test policy has no weekly
// holidays, so any date works).
const today = localDate()
const D1 = addDays(today, -40)
const D2 = addDays(today, -39)
const D3 = addDays(today, -38)
const D4 = addDays(today, -37)

async function student(ctx: Ctx, firstName: string) {
  return (
    await prisma.student.create({
      data: {
        organizationId: ctx.organization.id, admissionNumber: `ATT-${randomUUID().slice(0, 8)}`, firstName, lastName: "Test",
        admissionDate: new Date(`${addDays(today, -200)}T00:00:00Z`),
      },
    })
  )
}

async function enroll(ctx: Ctx, studentId: string, classId: string, sectionId: string | null, from: string, roll: string, extra: Record<string, unknown> = {}) {
  const cls = await prisma.academicClass.findUniqueOrThrow({ where: { id: classId } })
  return prisma.enrollment.create({
    data: {
      organizationId: ctx.organization.id, studentId, academicYearId: ids.year, educationLevelId: cls.educationLevelId, classId, sectionId,
      rollNumber: roll, enrollmentDate: new Date(`${from}T00:00:00Z`), ...extra,
    },
  })
}

const scope = (overrides: Record<string, unknown> = {}) => ({
  academicYearId: ids.year, date: D1, classId: ids.grade8, sectionId: ids.g8a, sessionType: "DAILY", slot: 1, ...overrides,
})

const register = (entries: { studentId: string; status: string | null }[], options: Record<string, unknown> = {}) => ({
  scope: scope(), sessionId: null, expectedUpdatedAt: null, submit: false, notes: "", entries, ...options,
})

before(async () => {
  for (const key of Object.keys({ admin: 1, teacher: 1, reviewer: 1, parent: 1, pupil: 1, clerk: 1 }) as (keyof typeof users)[]) {
    users[key] = await prisma.user.create({
      data: { authUserId: randomUUID(), email: `att-${key}-${run}@example.com`, name: key },
      select: { id: true, email: true },
    })
  }
  const orgA = await prisma.organization.create({ data: { name: `Attendance School ${run}`, slug: `att-a-${run}`, type: "SCHOOL" } })
  const orgB = await prisma.organization.create({ data: { name: `Attendance Other ${run}`, slug: `att-b-${run}`, type: "SCHOOL" } })
  ctxA = ctxFor(orgA, users.admin)
  ctxB = ctxFor(orgB, users.admin)

  await structure.applyEducationPreset(ctxA, { presetKey: "basic", createClasses: true, createPrograms: false })
  ids.grade8 = (await prisma.academicClass.findFirstOrThrow({ where: { organizationId: orgA.id, name: "Grade 8" } })).id
  ids.grade7 = (await prisma.academicClass.findFirstOrThrow({ where: { organizationId: orgA.id, name: "Grade 7" } })).id
  ids.g8a = (await saveClassSection(ctxA, null, { classId: ids.grade8, name: "A", isActive: true })).id
  ids.g8b = (await saveClassSection(ctxA, null, { classId: ids.grade8, name: "B", isActive: true })).id
  ids.year = (
    await structure.saveAcademicYear(ctxA, null, { name: `Y-${run}`, startDate: addDays(today, -180), endDate: addDays(today, 180), status: "ACTIVE", isCurrent: true })
  ).id

  // Section A: Sita, Aarav, Bimala. Section B: Dipak. Late joiner Elina
  // (from D3). Ganesh withdrew before D1.
  const s = async (name: string) => (await student(ctxA, name)).id
  ids.sita = await s("Sita")
  ids.aarav = await s("Aarav")
  ids.bimala = await s("Bimala")
  ids.dipak = await s("Dipak")
  ids.elina = await s("Elina")
  ids.ganesh = await s("Ganesh")
  const from = addDays(today, -100)
  await enroll(ctxA, ids.sita, ids.grade8, ids.g8a, from, "1")
  await enroll(ctxA, ids.aarav, ids.grade8, ids.g8a, from, "2")
  await enroll(ctxA, ids.bimala, ids.grade8, ids.g8a, from, "3")
  await enroll(ctxA, ids.dipak, ids.grade8, ids.g8b, from, "1")
  await enroll(ctxA, ids.elina, ids.grade8, ids.g8a, D3, "4")
  await enroll(ctxA, ids.ganesh, ids.grade8, ids.g8a, from, "5", { status: "WITHDRAWN", endedOn: new Date(`${addDays(D1, -5)}T00:00:00Z`) })

  // Teacher: class teacher of 8A and maths teacher of grade 8.
  const teacher = await prisma.teacher.create({
    data: { organizationId: orgA.id, userId: users.teacher.id, employeeId: `T-${run}`, firstName: "Kamala", lastName: "Teacher", dateOfJoining: new Date(`${addDays(today, -365)}T00:00:00Z`) },
  })
  ids.teacher = teacher.id
  ids.maths = (await prisma.subject.create({ data: { organizationId: orgA.id, name: "Mathematics", code: `M${run}` } })).id
  ids.science = (await prisma.subject.create({ data: { organizationId: orgA.id, name: "Science", code: `S${run}` } })).id
  ids.mathsOffering = (await prisma.subjectOffering.create({ data: { organizationId: orgA.id, subjectId: ids.maths, academicYearId: ids.year, classId: ids.grade8 } })).id
  ids.scienceOffering = (await prisma.subjectOffering.create({ data: { organizationId: orgA.id, subjectId: ids.science, academicYearId: ids.year, classId: ids.grade8 } })).id
  await prisma.subjectOfferingSection.create({ data: { offeringId: ids.scienceOffering, sectionId: ids.g8b, classId: ids.grade8, organizationId: orgA.id } })
  await prisma.teacherAssignment.createMany({
    data: [
      { organizationId: orgA.id, teacherId: teacher.id, academicYearId: ids.year, classId: ids.grade8, sectionId: ids.g8a, role: "CLASS_TEACHER", startDate: new Date(`${from}T00:00:00Z`) },
      { organizationId: orgA.id, teacherId: teacher.id, academicYearId: ids.year, classId: ids.grade8, subjectId: ids.maths, role: "SUBJECT_TEACHER", startDate: new Date(`${from}T00:00:00Z`) },
    ],
  })

  await savePolicy(ctxA, { ...(await getPolicy(ctxA)), weeklyOffDays: [], periodEnabled: true, lockAfterDays: "" })
})

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [`att-a-${run}`, `att-b-${run}`] } } })
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } })
  await prisma.$disconnect()
})

const teacherCtx = () => ctxFor({ ...ctxA.organization }, users.teacher, role("teacher"))
const reviewerCtx = () => ctxFor({ ...ctxA.organization }, users.reviewer, role("academic_coordinator"))

describe("daily registers", () => {
  it("loads only students placed in the section on that date", async () => {
    const reg = await getRegister(ctxA, scope())
    assert.equal(reg.session, null)
    assert.deepEqual(reg.students.map((s) => s.name).sort(), ["Aarav Test", "Bimala Test", "Sita Test"])
    const later = await getRegister(ctxA, scope({ date: D3 }))
    assert.ok(later.students.some((s) => s.studentId === ids.elina), "a student enrolled from D3 appears from D3")
  })

  it("saves a draft without recording unmarked students", async () => {
    const result = await saveRegister(ctxA, register([{ studentId: ids.sita, status: "PRESENT" }, { studentId: ids.aarav, status: "ABSENT" }]))
    assert.equal(result.status, "DRAFT")
    assert.equal(result.marked, 2)
    assert.equal(result.unmarked, 1)
    ids.session1 = result.sessionId
    ids.session1Updated = result.updatedAt
    assert.equal(await prisma.studentAttendance.count({ where: { sessionId: ids.session1 } }), 2)
  })

  it("refuses a second register for the same scope and stale saves", async () => {
    await rejects(saveRegister(ctxA, register([{ studentId: ids.bimala, status: "PRESENT" }])), ConflictError, /started this register/)
    await rejects(
      saveRegister(ctxA, register([{ studentId: ids.bimala, status: "PRESENT" }], { sessionId: ids.session1, expectedUpdatedAt: new Date(0).toISOString() })),
      ConflictError,
      /changed by someone else/
    )
  })

  it("refuses students not placed here, other organisations' students and invalid statuses", async () => {
    const options = { sessionId: ids.session1, expectedUpdatedAt: ids.session1Updated }
    await rejects(saveRegister(ctxA, register([{ studentId: ids.dipak, status: "PRESENT" }], options)), ValidationError, /isn't placed/)
    await rejects(saveRegister(ctxA, register([{ studentId: ids.ganesh, status: "PRESENT" }], options)), ValidationError, /isn't placed/)
    const outsider = await student(ctxB, "Outsider")
    await rejects(saveRegister(ctxA, register([{ studentId: outsider.id, status: "PRESENT" }], options)), ValidationError, /isn't placed/)
    await rejects(saveRegister(ctxA, register([{ studentId: ids.sita, status: "ON_LEAVE" }], options)), ValidationError, /isn't used/)
  })

  it("refuses future dates and dates outside the academic year", async () => {
    await rejects(saveRegister(ctxA, register([{ studentId: ids.sita, status: "PRESENT" }], { scope: scope({ date: addDays(today, 1) }) })), ValidationError, /future/)
    await rejects(saveRegister(ctxA, register([{ studentId: ids.sita, status: "PRESENT" }], { scope: scope({ date: addDays(today, -400) }) })), ValidationError, /within/)
  })

  it("submits, then refuses changes outside a correction", async () => {
    const result = await saveRegister(
      ctxA,
      register(
        [
          { studentId: ids.sita, status: "PRESENT" },
          { studentId: ids.aarav, status: "ABSENT" },
          { studentId: ids.bimala, status: "LATE" },
        ],
        { sessionId: ids.session1, expectedUpdatedAt: ids.session1Updated, submit: true }
      )
    )
    assert.equal(result.status, "SUBMITTED")
    assert.equal(result.marked, 3)
    assert.ok(result.firstSubmission)
    // A repeated submit (double click) changes nothing.
    await rejects(
      saveRegister(ctxA, register([{ studentId: ids.sita, status: "ABSENT" }], { sessionId: ids.session1, expectedUpdatedAt: result.updatedAt, submit: true })),
      ConflictError,
      /already been submitted/
    )
    const sita = await prisma.studentAttendance.findFirstOrThrow({ where: { sessionId: ids.session1, studentId: ids.sita } })
    assert.equal(sita.status, "PRESENT")
  })

  it("never marks a student twice for the same day, even from a whole-class register", async () => {
    const whole = await getRegister(ctxA, scope({ sectionId: null }))
    assert.equal(whole.students.find((s) => s.studentId === ids.sita)?.markedElsewhere, "A")
    await rejects(
      saveRegister(ctxA, { ...register([{ studentId: ids.sita, status: "ABSENT" }]), scope: scope({ sectionId: null }) }),
      ValidationError,
      /Already marked in another register/
    )
    // Section B students can still be marked in the whole-class register.
    const ok = await saveRegister(ctxA, { ...register([{ studentId: ids.dipak, status: "PRESENT" }]), scope: scope({ sectionId: null }) })
    assert.equal(ok.marked, 1)
  })
})

describe("calendar", () => {
  it("refuses registers on holidays unless the policy allows them", async () => {
    const holiday = await saveHoliday(ctxA, null, { name: "Dashain", startDate: D4, endDate: D4, appliesTo: "ALL" })
    await rejects(saveRegister(ctxA, register([{ studentId: ids.sita, status: "PRESENT" }], { scope: scope({ date: D4 }) })), ConflictError, /Dashain/)
    const reg = await getRegister(ctxA, scope({ date: D4 }))
    assert.ok(reg.blockedByCalendar)
    await deleteHoliday(ctxA, holiday.id)
  })
})

describe("period registers and teacher scope", () => {
  it("lets the class teacher take only their section's daily register", async () => {
    const t = teacherCtx()
    const result = await saveRegister(t, register([{ studentId: ids.sita, status: "PRESENT" }], { scope: scope({ date: D2 }) }))
    ids.session2 = result.sessionId
    await rejects(saveRegister(t, register([{ studentId: ids.dipak, status: "PRESENT" }], { scope: scope({ date: D2, sectionId: ids.g8b }) })), ForbiddenError)
    await rejects(getRegister(t, scope({ date: D2, sectionId: ids.g8b })), ForbiddenError)
  })

  it("takes period attendance for the subject teacher's subject only", async () => {
    const t = teacherCtx()
    const period = scope({ date: D2, sessionType: "PERIOD", subjectOfferingId: ids.mathsOffering, slot: 2 })
    const result = await saveRegister(t, { ...register([{ studentId: ids.sita, status: "PRESENT" }, { studentId: ids.aarav, status: "ABSENT" }]), scope: period, submit: true })
    assert.equal(result.marked, 2)
    // The same student may be marked once per period, separately from the daily register.
    assert.equal(await prisma.studentAttendance.count({ where: { studentId: ids.sita, date: new Date(`${D2}T00:00:00Z`) } }), 2)
    await rejects(
      saveRegister(t, { ...register([{ studentId: ids.dipak, status: "PRESENT" }]), scope: scope({ date: D2, sessionType: "PERIOD", subjectOfferingId: ids.scienceOffering, sectionId: ids.g8b }) }),
      ForbiddenError
    )
  })

  it("checks the subject is taught in the section", async () => {
    await rejects(getRegister(ctxA, scope({ sessionType: "PERIOD", subjectOfferingId: ids.scienceOffering })), ValidationError, /isn't taught in section A/)
    const offeringElsewhere = await prisma.subjectOffering.create({ data: { organizationId: ctxA.organization.id, subjectId: ids.maths, academicYearId: ids.year, classId: ids.grade7 } })
    await rejects(getRegister(ctxA, scope({ sessionType: "PERIOD", subjectOfferingId: offeringElsewhere.id })), ValidationError, /studies/)
  })
})

describe("corrections", () => {
  it("queues a teacher's correction for review and keeps the record unchanged", async () => {
    const t = teacherCtx()
    const aarav = await prisma.studentAttendance.findFirstOrThrow({ where: { sessionId: ids.session1, studentId: ids.aarav } })
    ids.aaravRecord = aarav.id
    const result = await requestCorrections(t, { recordIds: [aarav.id], toStatus: "EXCUSED", toReason: "Fever", justification: "Medical note received" })
    assert.deepEqual([result.pending, result.applied], [1, 0])
    assert.equal((await prisma.studentAttendance.findUniqueOrThrow({ where: { id: aarav.id } })).status, "ABSENT")
    const again = await requestCorrections(t, { recordIds: [aarav.id], toStatus: "PRESENT", justification: "Again" })
    assert.match(again.skipped[0].reason, /already waiting/)
  })

  it("doesn't let anyone review their own request", async () => {
    const self = ctxFor({ ...ctxA.organization }, users.teacher, PERMISSION_KEYS)
    const pending = await listCorrections(self, { status: "PENDING" })
    const outcome = await reviewCorrections(self, { correctionIds: pending.map((p) => p.id), decision: "APPROVE" })
    assert.equal(outcome.approved, 0)
    assert.match(outcome.skipped[0].reason, /your own/)
  })

  it("applies an approved correction and keeps the original value", async () => {
    const reviewer = reviewerCtx()
    const pending = await listCorrections(reviewer, { status: "PENDING" })
    const outcome = await reviewCorrections(reviewer, { correctionIds: pending.map((p) => p.id), decision: "APPROVE", note: "OK" })
    assert.equal(outcome.approved, 1)
    const record = await prisma.studentAttendance.findUniqueOrThrow({ where: { id: ids.aaravRecord }, include: { corrections: true } })
    assert.equal(record.status, "EXCUSED")
    assert.equal(record.reason, "Fever")
    assert.equal(record.correctedById, users.reviewer.id)
    assert.equal(record.corrections[0].fromStatus, "ABSENT")
    assert.equal(record.corrections[0].status, "APPROVED")
  })

  it("lets approvers correct directly, and requesters cancel their own requests", async () => {
    const direct = await requestCorrections(reviewerCtx(), { recordIds: [ids.aaravRecord], toStatus: "ABSENT", justification: "Note was for another day" })
    assert.equal(direct.applied, 1)
    const t = teacherCtx()
    const req = await requestCorrections(t, { recordIds: [ids.aaravRecord], toStatus: "PRESENT", justification: "Check" })
    assert.equal(req.pending, 1)
    const [mine] = await listCorrections(t, { status: "PENDING" })
    await cancelCorrection(t, mine.id)
    assert.equal((await prisma.attendanceCorrection.findUniqueOrThrow({ where: { id: mine.id } })).status, "CANCELLED")
  })

  it("protects locked registers until they are reopened", async () => {
    const locked = await lockSessions(reviewerCtx(), [ids.session1, ids.session2])
    assert.deepEqual(locked, { locked: 1, skipped: 1 }) // the draft is skipped
    const refused = await requestCorrections(reviewerCtx(), { recordIds: [ids.aaravRecord], toStatus: "PRESENT", justification: "Try" })
    assert.match(refused.skipped[0].reason, /locked/)
    await assert.rejects(reopenSession(reviewerCtx(), { sessionId: ids.session1, reason: "" }))
    await reopenSession(reviewerCtx(), { sessionId: ids.session1, reason: "Late medical certificate" })
    const ok = await requestCorrections(reviewerCtx(), { recordIds: [ids.aaravRecord], toStatus: "PRESENT", justification: "Arrived during assembly" })
    assert.equal(ok.applied, 1)
    assert.equal(await prisma.attendanceCorrection.count({ where: { studentAttendanceId: ids.aaravRecord } }), 4)
  })
})

describe("calculation and reports", () => {
  it("counts only submitted marks and applies the policy", async () => {
    const params = parseReportParams({ kind: "students", year: ids.year, from: D1, to: D2, type: "DAILY" })
    const period = await resolvePeriod(ctxA, params)
    let policy = await getPolicy(ctxA)
    const rows = await studentReport(ctxA, params, period, policy)
    const by = Object.fromEntries(rows.map((r) => [r.studentId, r.summary]))
    // Sita: D1 present (submitted). Her D2 daily register is still a draft.
    assert.equal(by[ids.sita].marked, 1)
    assert.equal(by[ids.sita].percentage, 100)
    // Bimala: late counts as attended by default.
    assert.equal(by[ids.bimala].percentage, 100)
    await savePolicy(ctxA, { ...policy, lateCountsAsPresent: false, lockAfterDays: "" })
    policy = await getPolicy(ctxA)
    const strict = Object.fromEntries((await studentReport(ctxA, params, period, policy)).map((r) => [r.studentId, r.summary]))
    assert.equal(strict[ids.bimala].percentage, 0)
    // Elina was never marked: she has no row rather than 0%.
    assert.equal(strict[ids.elina], undefined)
    await savePolicy(ctxA, { ...policy, lateCountsAsPresent: true, lockAfterDays: "" })
  })

  it("lists only what the caller may see", async () => {
    const all = await listRecords(ctxA, parseRecordFilters({}))
    assert.ok(all.total >= 6)
    const other = await listRecords(ctxB, parseRecordFilters({}))
    assert.equal(other.total, 0)
    // The teacher teaches maths to the whole of Grade 8, so sees Grade 8 only.
    const t = await listRecords(teacherCtx(), parseRecordFilters({}))
    assert.ok(t.total > 0 && t.rows.every((r) => r.className === "Grade 8"))
    assert.ok((await listSessions(ctxB, { page: 1, pageSize: 25 })).total === 0)
  })
})

describe("organisation isolation", () => {
  it("treats another organisation's registers and records as missing", async () => {
    await rejects(getRegister(ctxB, scope()), ValidationError, /academic year/)
    await rejects(requestCorrections(ctxB, { recordIds: [ids.aaravRecord], toStatus: "ABSENT", justification: "x" }), NotFoundError)
    assert.equal((await lockSessions(ctxB, [ids.session1])).locked, 0)
  })
})

describe("teacher and staff attendance", () => {
  it("records a day once per person and keeps earlier days' changes as corrections", async () => {
    const result = await saveEmployeeRegister(ctxA, { date: D1, entries: [{ employeeType: "TEACHER", employeeId: ids.teacher, status: "PRESENT", checkInTime: "10:30" }] })
    assert.equal(result.created, 1)
    const record = await prisma.employeeAttendance.findFirstOrThrow({ where: { teacherId: ids.teacher } })
    assert.equal(record.status, "LATE") // 30 minutes after 10:00, beyond the 10-minute grace
    assert.equal(record.lateMinutes, 30)
    await rejects(saveEmployeeRegister(ctxA, { date: D1, entries: [{ employeeType: "TEACHER", employeeId: ids.teacher, status: "ON_LEAVE" }] }), ValidationError, /justification|Explain/)
    const changed = await saveEmployeeRegister(ctxA, { date: D1, justification: "Approved leave", entries: [{ employeeType: "TEACHER", employeeId: ids.teacher, status: "ON_LEAVE" }] })
    assert.equal(changed.corrected, 1)
    assert.equal(await prisma.employeeAttendance.count({ where: { teacherId: ids.teacher } }), 1)
    assert.equal((await prisma.attendanceCorrection.findFirstOrThrow({ where: { employeeAttendanceId: record.id } })).fromStatus, "LATE")
  })

  it("respects employment dates and organisation boundaries", async () => {
    const newcomer = await prisma.staff.create({
      data: { organizationId: ctxA.organization.id, employeeId: `S-${run}`, firstName: "New", lastName: "Staff", dateOfJoining: new Date(`${D3}T00:00:00Z`), userId: users.clerk.id },
    })
    ids.staff = newcomer.id
    await rejects(saveEmployeeRegister(ctxA, { date: D1, entries: [{ employeeType: "STAFF", employeeId: newcomer.id, status: "PRESENT" }] }), ValidationError, /wasn't employed/)
    await rejects(saveEmployeeRegister(ctxB, { date: D1, entries: [{ employeeType: "STAFF", employeeId: newcomer.id, status: "PRESENT" }] }), ValidationError, /Not one of/)
    const reg = await getEmployeeRegister(ctxA, D1)
    assert.ok(!reg.people.some((p) => p.id === newcomer.id))
  })

  it("allows self check-in only when the policy does, once a day", async () => {
    const clerk = ctxFor({ ...ctxA.organization }, users.clerk, role("staff"))
    await rejects(selfCheck(clerk, "in"), ConflictError, /turned off/)
    const policy = await getPolicy(ctxA)
    await savePolicy(ctxA, { ...policy, employeeSelfCheckIn: true, lockAfterDays: "" })
    await selfCheck(clerk, "in")
    await rejects(selfCheck(clerk, "in"), ConflictError, /already/)
    await selfCheck(clerk, "out")
    const record = await prisma.employeeAttendance.findFirstOrThrow({ where: { staffId: ids.staff } })
    assert.equal(record.source, "SELF_SERVICE")
    assert.ok(record.checkOutAt)
  })
})

describe("portals and notices", () => {
  it("shows a student only their own attendance", async () => {
    await prisma.student.update({ where: { id: ids.sita }, data: { userId: users.pupil.id } })
    const mine = await myStudentAttendance(ctxFor({ ...ctxA.organization }, users.pupil, role("student")))
    assert.equal(mine?.student.id, ids.sita)
    assert.ok(mine?.recent.every((r) => !("remarks" in r)))
  })

  it("lets a guardian see only linked children with portal access", async () => {
    const guardian = await prisma.guardian.create({
      data: { organizationId: ctxA.organization.id, fullName: "Parent Test", userId: users.parent.id, portalStatus: "ACTIVE" },
    })
    await prisma.studentGuardian.create({
      data: { studentId: ids.aarav, guardianId: guardian.id, organizationId: ctxA.organization.id, relationship: "FATHER", canAccessStudentPortalData: true },
    })
    await prisma.studentGuardian.create({
      data: { studentId: ids.bimala, guardianId: guardian.id, organizationId: ctxA.organization.id, relationship: "FATHER", canAccessStudentPortalData: false },
    })
    const parent = ctxFor({ ...ctxA.organization }, users.parent, role("parent"))
    const child = await childAttendance(parent, ids.aarav)
    assert.ok(child.summary && child.summary.marked >= 1)
    await rejects(childAttendance(parent, ids.bimala), NotFoundError)
    await rejects(childAttendance(parent, ids.sita), NotFoundError)
  })

  it("prepares absence notices once, without claiming delivery", async () => {
    const policy = await getPolicy(ctxA)
    await savePolicy(ctxA, { ...policy, notifyGuardiansOnAbsence: true, lockAfterDays: "" })
    const result = await saveRegister(ctxA, register([{ studentId: ids.aarav, status: "ABSENT" }, { studentId: ids.sita, status: "PRESENT" }], { scope: scope({ date: D3 }), submit: true }))
    const notice = await noticeAbsences(ctxA, result.sessionId)
    assert.deepEqual(notice, { students: 1, recipients: 1, sent: 0, unreached: 1 })
    assert.equal(await noticeAbsences(ctxA, result.sessionId), null)
  })
})

describe("CSV import", () => {
  it("previews row errors and imports only new marks", async () => {
    const admission = (await prisma.student.findUniqueOrThrow({ where: { id: ids.bimala } })).admissionNumber
    const elina = (await prisma.student.findUniqueOrThrow({ where: { id: ids.elina } })).admissionNumber
    const csv = [
      "date,admission_number,status,subject_code,period",
      `${D3},${admission},P,,`,
      `${D3},${admission},A,,`,
      `${D3},NOPE-1,P,,`,
      `${D3},${elina},sick,,`,
      `${D1},${elina},P,,`,
      `${D3},${admission},A,M${run},4`,
    ].join("\n")
    const preview = await previewAttendanceImport(ctxA, { csv, firstLine: 2 })
    const errs = preview.rows.map((r) => r.errors.join(" "))
    assert.equal(errs[0], "")
    assert.match(errs[1], /Same student/)
    assert.match(errs[2], /No student/)
    assert.match(errs[3], /Unknown status/)
    assert.match(errs[4], /wasn't placed/)
    assert.equal(errs[5], "")
    const commit = await commitAttendanceImport(ctxA, { csv, firstLine: 2 })
    assert.equal(commit.created, 2)
    const again = await previewAttendanceImport(ctxA, { csv: csv.split("\n").slice(0, 2).join("\n"), firstLine: 2 })
    assert.match(again.rows[0].errors.join(" "), /Already recorded/)
  })
})
