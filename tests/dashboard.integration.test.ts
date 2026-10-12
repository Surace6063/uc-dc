// Institutional dashboard figures against the configured database. Each run
// creates a throwaway organisation (random slug) and deletes it afterwards;
// no existing data is read or changed.
//
//   npm run test:integration
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import { parseDashboardFilters } from "@/features/dashboard/filters"
import { countChange, pointsChange } from "@/features/dashboard/format"
import type { AuthContext } from "@/lib/authorization/context"
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/authorization/permissions"
import type { AttendanceSessionStatus, AttendanceSessionType, AttendanceStatus, EnrollmentStatus, EnrollmentType, Gender, PublicationStatus, ResultStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { attendanceOverview, gpaDistribution, passFailByProgram, passRateTrend } from "@/services/dashboard/academic-service"
import { facultyKpis, passRateKpi, studentKpis } from "@/services/dashboard/kpi-service"
import { facultyByDesignation, facultyQualifications, studentTeacherRatio, studentTeacherRatioTrend } from "@/services/dashboard/faculty-service"
import { managementAlerts, recentActivity } from "@/services/dashboard/alerts-service"
import { loadDashboardScope, loadScopeOptions, studentOverview, yearExaminations } from "@/services/dashboard/overview-service"

const run = randomUUID().slice(0, 8)
const ids = {} as Record<string, string>
let ctx: AuthContext
let userId: string

function ctxFor(org: { id: string; name: string; slug: string }, permissions: readonly PermissionKey[] = PERMISSION_KEYS): AuthContext {
  return {
    user: { id: userId, authUserId: randomUUID(), email: `dash-${run}@example.com`, name: "Dash", avatarUrl: null, isPlatformAdmin: false },
    organization: { ...org, type: "COLLEGE" },
    membership: { id: randomUUID() },
    role: { id: randomUUID(), name: "Test", slug: "test" },
    permissions,
  }
}

const day = (s: string) => new Date(`${s}T00:00:00Z`)
const scopeFor = async (params: Record<string, string> = {}) => (await loadDashboardScope(ctx, parseDashboardFilters(params))).scope!

before(async () => {
  userId = (await prisma.user.create({ data: { authUserId: randomUUID(), email: `dash-${run}@example.com`, name: "Dash" } })).id
  const org = await prisma.organization.create({ data: { name: `Dash College ${run}`, slug: `dash-${run}`, type: "COLLEGE" } })
  ctx = ctxFor(org)
  const organizationId = org.id

  // 2023/24 exists but has no records at all: trends show it as a gap.
  ids.empty = (await prisma.academicYear.create({ data: { organizationId, name: "2023/24", startDate: day("2023-07-01"), endDate: day("2024-06-30"), status: "COMPLETED", isCurrent: false } })).id
  ids.prev = (await prisma.academicYear.create({ data: { organizationId, name: "2024/25", startDate: day("2024-07-01"), endDate: day("2025-06-30"), status: "COMPLETED", isCurrent: false } })).id
  ids.year = (await prisma.academicYear.create({ data: { organizationId, name: "2025/26", startDate: day("2025-07-01"), endDate: day("2026-06-30"), status: "ACTIVE", isCurrent: true } })).id
  ids.level = (await prisma.educationLevel.create({ data: { organizationId, name: "Bachelor", code: `B${run}`, usesPrograms: true } })).id
  ids.management = (await prisma.faculty.create({ data: { organizationId, name: "Management", code: `MG${run}` } })).id
  ids.science = (await prisma.faculty.create({ data: { organizationId, name: "Science", code: `SC${run}` } })).id
  ids.bbs = (await prisma.program.create({ data: { organizationId, educationLevelId: ids.level, facultyId: ids.management, name: "Bachelor of Business Studies", code: "BBS", sortOrder: 1 } })).id
  ids.bca = (await prisma.program.create({ data: { organizationId, educationLevelId: ids.level, facultyId: ids.science, name: "Bachelor of Computer Applications", code: "BCA", sortOrder: 2 } })).id
  ids.bbsClass = (await prisma.academicClass.create({ data: { organizationId, educationLevelId: ids.level, programId: ids.bbs, name: "BBS Year 1" } })).id
  ids.bcaClass = (await prisma.academicClass.create({ data: { organizationId, educationLevelId: ids.level, programId: ids.bca, name: "BCA Sem 1" } })).id

  const enroll = async (studentId: string, yearId: string, program: "bbs" | "bca", enrollmentType: EnrollmentType, date: string, status: EnrollmentStatus = "ACTIVE") =>
    (
      await prisma.enrollment.create({
        data: { organizationId, studentId, academicYearId: yearId, educationLevelId: ids.level, programId: ids[program], classId: ids[`${program}Class`], enrollmentType, enrollmentDate: day(date), status },
      })
    ).id

  // Current year. Counted: Sita, Gita, Ram (BBS); Hari, Anon, Tara (BCA).
  // Gita was promoted from last year and Tara moved class at promotion, so
  // neither is a new admission. Left withdrew (admitted, but not counted as
  // enrolled); Cancelled and Archived never count.
  const people: [string, Gender | null, "bbs" | "bca", EnrollmentType, string, EnrollmentStatus][] = [
    ["Sita", "FEMALE", "bbs", "NEW_ADMISSION", "2025-07-15", "ACTIVE"],
    ["Gita", "FEMALE", "bbs", "PROMOTION", "2025-07-15", "ACTIVE"],
    ["Ram", "MALE", "bbs", "NEW_ADMISSION", "2025-09-10", "ACTIVE"],
    ["Hari", "MALE", "bca", "LATERAL_ENTRY", "2025-07-20", "ACTIVE"],
    ["Anon", null, "bca", "NEW_ADMISSION", "2025-07-20", "ON_HOLD"],
    ["Tara", "FEMALE", "bca", "TRANSFER", "2025-07-20", "ACTIVE"],
    ["Left", "FEMALE", "bbs", "NEW_ADMISSION", "2025-08-01", "WITHDRAWN"],
    ["Cancelled", "MALE", "bbs", "NEW_ADMISSION", "2025-07-15", "CANCELLED"],
  ]
  for (const [name, gender, program, type, date, status] of people) {
    const s = await prisma.student.create({
      data: { organizationId, admissionNumber: `D-${name}-${run}`, firstName: name, lastName: "Test", gender, admissionDate: day(date), status: status === "WITHDRAWN" ? "WITHDRAWN" : "ACTIVE" },
    })
    ids[name] = s.id
    ids[`${name}Enr`] = await enroll(s.id, ids.year, program, type, date, status)
  }
  ids.GitaPrevEnr = await enroll(ids.Gita, ids.prev, "bbs", "NEW_ADMISSION", "2024-07-15", "PROMOTED")
  const archived = await prisma.student.create({ data: { organizationId, admissionNumber: `D-A-${run}`, firstName: "Archived", lastName: "Test", gender: "FEMALE", admissionDate: day("2025-07-15"), archivedAt: new Date() } })
  await enroll(archived.id, ids.year, "bbs", "NEW_ADMISSION", "2025-07-15")

  // Teachers: a full-time lecturer on BBS, a part-time professor on both
  // programs (through a class and directly), a resigned one who must not count.
  const lecturer = await prisma.designation.create({ data: { organizationId, name: "Lecturer", sortOrder: 2 } })
  const professor = await prisma.designation.create({ data: { organizationId, name: "Professor", sortOrder: 1 } })
  const from = day("2025-07-01")
  const t1 = await prisma.teacher.create({ data: { organizationId, employeeId: `T1-${run}`, firstName: "Kamala", lastName: "L", dateOfJoining: from, designationId: lecturer.id, departmentId: ids.management } })
  const t2 = await prisma.teacher.create({ data: { organizationId, employeeId: `T2-${run}`, firstName: "Bishnu", lastName: "P", dateOfJoining: from, designationId: professor.id, employmentType: "PART_TIME" } })
  const t3 = await prisma.teacher.create({ data: { organizationId, employeeId: `T3-${run}`, firstName: "Gone", lastName: "R", dateOfJoining: day("2024-07-01"), designationId: lecturer.id, employmentStatus: "RESIGNED" } })
  // Employment history: Kamala joined 2025-07-01; Gone taught from
  // 2024-07-01 and resigned 2025-08-01; Bishnu has no history (imported),
  // so his current status is used.
  await prisma.teacherEmploymentRecord.createMany({
    data: [
      { organizationId, teacherId: t1.id, effectiveDate: from, employmentType: "FULL_TIME", employmentStatus: "ACTIVE" },
      { organizationId, teacherId: t3.id, effectiveDate: day("2024-07-01"), employmentType: "FULL_TIME", employmentStatus: "ACTIVE" },
      { organizationId, teacherId: t3.id, effectiveDate: day("2025-08-01"), employmentType: "FULL_TIME", employmentStatus: "RESIGNED" },
    ],
  })
  // Highest qualifications: Kamala Master's (verified; also a Bachelor's),
  // Bishnu Doctorate (unverified). Gone's M.Phil. doesn't count (resigned).
  await prisma.teacherQualification.createMany({
    data: [
      { organizationId, teacherId: t1.id, level: "BACHELOR", title: "BBS" },
      { organizationId, teacherId: t1.id, level: "MASTER", title: "MBS", verificationStatus: "VERIFIED" },
      { organizationId, teacherId: t2.id, level: "DOCTORATE", title: "PhD" },
      { organizationId, teacherId: t3.id, level: "MPHIL", title: "MPhil" },
    ],
  })
  await prisma.teacherAssignment.createMany({
    data: [
      { organizationId, teacherId: t1.id, academicYearId: ids.year, classId: ids.bbsClass, role: "CLASS_TEACHER", startDate: from },
      { organizationId, teacherId: t2.id, academicYearId: ids.year, classId: ids.bbsClass, role: "SUBJECT_TEACHER", startDate: from },
      { organizationId, teacherId: t2.id, academicYearId: ids.year, programId: ids.bca, role: "OTHER", startDate: from },
      { organizationId, teacherId: t3.id, academicYearId: ids.year, programId: ids.bca, role: "OTHER", startDate: from },
    ],
  })

  // Published results. Current year, by each student's latest examination:
  // Sita FAIL→PASS (pass), Ram PASS→FAIL (fail), Hari PASS (pass), Gita
  // ABSENT (decided, not passed), Anon WITHHELD (not decided). Ram's Final
  // was first published as PASS, then superseded. Last year: Gita PASS.
  // GPAs (latest with a GPA): Sita 3.6, Ram 1.2, Hari 4.0.
  const scale = await prisma.gradingScale.create({ data: { organizationId, name: `Scale ${run}`, gradingType: "LETTER" } })
  const policy = await prisma.resultPolicy.create({ data: { organizationId, name: `Policy ${run}` } })
  const type = await prisma.assessmentType.create({ data: { organizationId, name: `Exam ${run}` } })
  const exam = (name: string, yearId: string, start: string) =>
    prisma.examination.create({
      data: { organizationId, academicYearId: yearId, assessmentTypeId: type.id, name, startDate: day(start), endDate: day(start), gradingScaleId: scale.id, resultPolicyId: policy.id, status: "PUBLISHED" },
    })
  const publish = async (examinationId: string, yearId: string, version: number, status: PublicationStatus, results: [string, ResultStatus, number?][]) => {
    const publication = await prisma.resultPublication.create({ data: { organizationId, examinationId, version, status, rulesSnapshot: {}, summary: {} } })
    await prisma.studentResult.createMany({
      data: results.map(([name, s, gpa]) => {
        const prev = yearId === ids.prev
        return {
          organizationId, publicationId: publication.id, examinationId, studentId: ids[name], enrollmentId: ids[prev ? `${name}PrevEnr` : `${name}Enr`],
          academicYearId: yearId, classId: ["Hari", "Anon", "Tara"].includes(name) ? ids.bcaClass : ids.bbsClass, status: s, gpa: gpa ?? null, breakdown: {},
        }
      }),
    })
  }
  const term = await exam("Terminal", ids.year, "2025-10-01")
  const final = await exam("Final", ids.year, "2026-03-01")
  const old = await exam("Old final", ids.prev, "2025-03-01")
  ids.term = term.id
  await publish(term.id, ids.year, 1, "ACTIVE", [["Sita", "FAIL", 1.8], ["Ram", "PASS", 2.6], ["Hari", "PASS", 4]])
  await publish(final.id, ids.year, 1, "SUPERSEDED", [["Ram", "PASS", 3.9]])
  await publish(final.id, ids.year, 2, "ACTIVE", [["Sita", "PASS", 3.6], ["Ram", "FAIL", 1.2], ["Gita", "ABSENT"], ["Anon", "WITHHELD"]])
  await publish(old.id, ids.prev, 1, "ACTIVE", [["Gita", "PASS"]])

  // Daily registers on four days (default policy: daily attendance on,
  // minimum 75%, 5-point margin). BBS: Sita 3/4 (75%, near), Ram 1/4 (25%,
  // short), Gita 4/4. BCA: Hari and Tara 4/4. A draft register and a period
  // register must not count.
  const subject = await prisma.subject.create({ data: { organizationId, name: "Accounting", code: `AC${run}`, creditHours: 3 } })
  const offering = await prisma.subjectOffering.create({ data: { organizationId, subjectId: subject.id, academicYearId: ids.year, classId: ids.bbsClass } })
  const register = async (program: "bbs" | "bca", date: string, marks: [string, AttendanceStatus][], status: AttendanceSessionStatus = "SUBMITTED", sessionType: AttendanceSessionType = "DAILY") => {
    const scopeKey = sessionType === "DAILY" ? "DAILY:1" : `PERIOD:${offering.id}:1`
    const subjectOfferingId = sessionType === "PERIOD" ? offering.id : null
    const session = await prisma.attendanceSession.create({
      data: { organizationId, academicYearId: ids.year, sessionType, date: day(date), scopeKey, classId: ids[`${program}Class`], subjectOfferingId, status },
    })
    await prisma.studentAttendance.createMany({
      data: marks.map(([name, s]) => ({
        organizationId, sessionId: session.id, studentId: ids[name], enrollmentId: ids[`${name}Enr`], academicYearId: ids.year,
        classId: ids[`${program}Class`], subjectOfferingId, sessionType, date: day(date), scopeKey, status: s,
      })),
    })
  }
  const days = ["2025-08-04", "2025-08-05", "2025-08-06", "2025-08-07"]
  for (const [i, d] of days.entries()) {
    await register("bbs", d, [["Sita", i === 3 ? "ABSENT" : "PRESENT"], ["Ram", i === 0 ? "PRESENT" : "ABSENT"], ["Gita", "PRESENT"]])
    await register("bca", d, [["Hari", "PRESENT"], ["Tara", "PRESENT"]])
  }
  await register("bca", "2025-08-08", [["Hari", "ABSENT"], ["Tara", "ABSENT"]], "DRAFT")
  await register("bbs", "2025-08-04", [["Gita", "ABSENT"]], "SUBMITTED", "PERIOD")

  await prisma.auditLog.create({ data: { organizationId, actorUserId: userId, action: "test.created", entityType: "test", summary: "Created a test record" } })
})

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: `dash-${run}` } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
})

describe("dashboard scope", () => {
  it("defaults to the current year, with earlier years for trends", async () => {
    const scope = await scopeFor()
    assert.equal(scope.year.id, ids.year)
    assert.deepEqual(scope.trendYears.map((y) => y.name), ["2023/24", "2024/25", "2025/26"])
    assert.equal(scope.programIds, null)
  })

  it("turns a faculty filter into its programs and classes, and ignores bad ids", async () => {
    const scope = await scopeFor({ faculty: ids.science, year: "not-a-uuid" })
    assert.equal(scope.year.id, ids.year)
    assert.deepEqual(scope.programIds, [ids.bca])
    assert.deepEqual(scope.classIds, [ids.bcaClass])
  })

  it("returns null when the organisation has no academic year", async () => {
    const org = await prisma.organization.create({ data: { name: `Empty ${run}`, slug: `dash-empty-${run}`, type: "COLLEGE" } })
    try {
      assert.equal((await loadDashboardScope(ctxFor(org), parseDashboardFilters({}))).scope, null)
    } finally {
      await prisma.organization.delete({ where: { id: org.id } })
    }
  })
})

describe("student KPIs", () => {
  it("counts enrolled students once and admissions by enrollment type, with a comparison", async () => {
    const k = await studentKpis(ctx, await scopeFor())
    assert.equal(k.total, 6)
    assert.equal(k.newAdmissions, 5)
    assert.deepEqual(k.totalComparison, { previous: 1, yearName: "2024/25" })
    assert.deepEqual(k.admissionsComparison, { previous: 1, yearName: "2024/25" })
    assert.equal(countChange(k.total, k.totalComparison)?.text, "+500.0%")
  })

  it("narrows admissions to the date range and drops the comparison", async () => {
    const k = await studentKpis(ctx, await scopeFor({ from: "2025-09-01", to: "2025-09-10" }))
    assert.equal(k.total, 6)
    assert.equal(k.newAdmissions, 1)
    assert.equal(k.admissionsComparison, null)
  })

  it("follows the program filter and has no comparison without last year's figure", async () => {
    const k = await studentKpis(ctx, await scopeFor({ program: ids.bca }))
    assert.equal(k.total, 3)
    assert.equal(k.totalComparison, null)
  })

  it("matches the chart totals, by program and gender", async () => {
    const s = await studentOverview(ctx, await scopeFor())
    assert.equal(s.total, 6)
    assert.deepEqual(s.gender, { female: 3, male: 2, other: 0, unrecorded: 1 })
    assert.deepEqual(s.byCaste.map((c) => [c.key, c.total]), [["UNRECORDED", 6]])
    assert.deepEqual(s.equity.groups.map((g) => g.share), [null, null, null, null, null])
    assert.deepEqual(
      s.byProgram.map((p) => [p.program, p.female, p.male, p.unrecorded, p.total]),
      [["BBS", 2, 1, 0, 3], ["BCA", 1, 1, 1, 3]]
    )
    assert.deepEqual(s.trend, [
      { year: "2023/24", hasData: false, students: null, admissions: null },
      { year: "2024/25", hasData: true, students: 1, admissions: 1 },
      { year: "2025/26", hasData: true, students: 6, admissions: 5 },
    ])
  })
})

describe("faculty KPIs", () => {
  it("counts eligible teachers by employment type", async () => {
    assert.deepEqual(await facultyKpis(ctx, await scopeFor()), { total: 2, fullTime: 1, partTime: 1 })
    assert.equal((await facultyKpis(ctx, await scopeFor({ program: ids.bca }))).total, 1)
  })

  it("groups teachers by designation and gives the student–teacher ratio", async () => {
    const scope = await scopeFor()
    assert.deepEqual(await facultyByDesignation(ctx, scope), [{ designation: "Professor", teachers: 1 }, { designation: "Lecturer", teachers: 1 }])
    const r = await studentTeacherRatio(ctx, scope)
    assert.equal(r.overall, 3)
    assert.deepEqual(r.byProgram.map((p) => [p.program, p.teachers, p.ratio]), [["BBS", 2, 1.5], ["BCA", 1, 3]])
  })
})

describe("faculty profile and ratio history", () => {
  it("narrows designation and qualification by department and employment type", async () => {
    assert.deepEqual(await facultyByDesignation(ctx, await scopeFor({ dept: ids.management })), [{ designation: "Lecturer", teachers: 1 }])
    assert.deepEqual(await facultyByDesignation(ctx, await scopeFor({ emp: "PART_TIME" })), [{ designation: "Professor", teachers: 1 }])
    // Headcounts and ratios ignore these filters.
    assert.equal((await facultyKpis(ctx, await scopeFor({ emp: "PART_TIME" }))).total, 2)
  })

  it("counts each eligible teacher once by highest qualification", async () => {
    assert.deepEqual(await facultyQualifications(ctx, await scopeFor()), {
      teachers: 2,
      recorded: 2,
      verified: 1,
      mastersOrHigher: 2,
      levels: [{ key: "DOCTORATE", teachers: 1 }, { key: "MASTER", teachers: 1 }],
    })
    const dept = await facultyQualifications(ctx, await scopeFor({ dept: ids.management }))
    assert.deepEqual(dept.levels, [{ key: "MASTER", teachers: 1 }])
  })

  it("trends the ratio from employment history, with gaps and no division by zero", async () => {
    const t = await studentTeacherRatioTrend(ctx, await scopeFor())
    assert.deepEqual(t.points, [
      { year: "2023/24", hasData: false, students: null, teachers: null, ratio: null },
      // Gone was still teaching at the end of 2024/25.
      { year: "2024/25", hasData: true, students: 1, teachers: 1, ratio: 1 },
      { year: "2025/26", hasData: true, students: 6, teachers: 2, ratio: 3 },
    ])
    assert.equal(t.teachersWithoutHistory, 1)
    // BBS last year had a student but no assigned teacher: no ratio.
    const bbs = await studentTeacherRatioTrend(ctx, await scopeFor({ program: ids.bbs }))
    assert.deepEqual(bbs.points.slice(1).map((p) => [p.students, p.teachers, p.ratio]), [[1, 0, null], [3, 2, 1.5]])
  })
})

describe("pass rate", () => {
  it("counts each student once, by their latest active published result", async () => {
    const k = await passRateKpi(ctx, await scopeFor())
    assert.deepEqual(k.current, { students: 4, passed: 2, rate: 50 })
    assert.deepEqual(k.comparison, { previous: 100, yearName: "2024/25" })
    assert.equal(pointsChange(k.current.rate, k.comparison)?.text, "−50.0 pts")
  })

  it("follows the program filter through result classes", async () => {
    const k = await passRateKpi(ctx, await scopeFor({ program: ids.bca }))
    assert.deepEqual(k.current, { students: 1, passed: 1, rate: 100 })
    assert.equal(k.comparison, null)
  })

  it("is empty, not zero, for a year without published results", async () => {
    const k = await passRateKpi(ctx, await scopeFor({ year: ids.prev }))
    assert.deepEqual(k.current, { students: 1, passed: 1, rate: 100 })
    const none = await passRateKpi(ctx, await scopeFor({ program: ids.bca, year: ids.prev }))
    assert.deepEqual(none.current, { students: 0, passed: 0, rate: null })
  })

  it("trends the same student-level rate, with gaps for years without results", async () => {
    assert.deepEqual(await passRateTrend(ctx, await scopeFor()), [
      { year: "2023/24", hasData: false, passRate: null, students: null },
      { year: "2024/25", hasData: true, passRate: 100, students: 1 },
      { year: "2025/26", hasData: true, passRate: 50, students: 4 },
    ])
  })
})

describe("pass vs fail and GPA", () => {
  it("counts passed, failed and absent students once each, per program", async () => {
    const r = await passFailByProgram(ctx, await scopeFor())
    assert.deepEqual(r.total, { passed: 2, failed: 1, absent: 1, passRate: 50 })
    assert.deepEqual(r.byProgram.map((p) => [p.label, p.passed, p.failed, p.absent, p.passRate]), [["BBS", 1, 1, 1, 33.3], ["BCA", 1, 0, 0, 100]])
  })

  it("follows the examination filter", async () => {
    const r = await passFailByProgram(ctx, await scopeFor({ exam: ids.term }))
    assert.deepEqual(r.total, { passed: 2, failed: 1, absent: 0, passRate: 66.7 })
  })

  it("distributes each student's latest GPA in half-point bands", async () => {
    const g = await gpaDistribution(ctx, await scopeFor())
    assert.equal(g.students, 3)
    assert.equal(g.average, 2.93)
    assert.deepEqual(g.bands.filter((b) => b.students > 0), [{ band: "1.0–1.5", students: 1 }, { band: "3.5–4.0", students: 2 }])
    assert.equal(g.outOfScale, false)
    const term = await gpaDistribution(ctx, await scopeFor({ exam: ids.term }))
    assert.deepEqual(term.bands.filter((b) => b.students > 0).map((b) => b.band), ["1.5–2.0", "2.5–3.0", "3.5–4.0"])
  })
})

describe("attendance overview", () => {
  it("gives attendance and shortages per program from submitted daily registers", async () => {
    const a = await attendanceOverview(ctx, await scopeFor())
    assert.equal(a.groupBy, "program")
    assert.equal(a.minimumPercentage, 75)
    assert.deepEqual(a.rows.map((r) => [r.label, r.percentage, r.students, r.below, r.approaching]), [["BBS", 66.7, 3, 1, 1], ["BCA", 100, 2, 0, 0]])
  })

  it("switches to classes once one program is selected", async () => {
    const a = await attendanceOverview(ctx, await scopeFor({ program: ids.bbs }))
    assert.equal(a.groupBy, "class")
    assert.deepEqual(a.rows.map((r) => [r.label, r.percentage]), [["BBS Year 1", 66.7]])
  })
})

describe("class and examination filters", () => {
  it("narrows students, teachers and results to one class", async () => {
    const scope = await scopeFor({ class: ids.bcaClass })
    assert.equal((await studentKpis(ctx, scope)).total, 3)
    // Bishnu teaches BCA as a whole program, so counts for its classes.
    assert.equal((await facultyKpis(ctx, scope)).total, 1)
    assert.deepEqual((await passRateKpi(ctx, scope)).current, { students: 1, passed: 1, rate: 100 })
  })

  it("offers only examinations of the year with published results", async () => {
    assert.deepEqual((await yearExaminations(ctx, ids.year)).map((e) => e.name), ["Terminal", "Final"])
    assert.deepEqual(await yearExaminations(ctx, ids.empty), [])
  })

  it("ignores an examination from another year", async () => {
    const scope = await scopeFor({ year: ids.prev, exam: ids.term })
    assert.equal(scope.examinationId, null)
  })
})

describe("alerts and activity", () => {
  it("raises alerts from the records, most severe first", async () => {
    const options = await loadScopeOptions(ctx)
    const alerts = await managementAlerts(ctx, await scopeFor(), options)
    // Ram is below 75%; a past draft register; Anon has no gender recorded;
    // no one has a caste/ethnicity recorded.
    assert.deepEqual(alerts.map((a) => [a.id, a.severity, a.count]), [
      ["attendance-shortage", "high", 1],
      ["registers-draft", "medium", 1],
      ["ugc-gender", "medium", 1],
      ["ugc-caste", "medium", 6],
    ])
    assert.equal(alerts[1].date?.value.toISOString().slice(0, 10), "2025-08-08")
    assert.match(alerts[0].href, /kind=shortage/)
  })

  it("shows each alert only to those who can act on it", async () => {
    const options = await loadScopeOptions(ctx)
    const studentsOnly = await managementAlerts(ctxFor(ctx.organization, ["dashboard.view", "students.view"]), await scopeFor(), options)
    assert.deepEqual(studentsOnly.map((a) => a.id), ["ugc-gender", "ugc-caste"])
    const noYear = await managementAlerts(ctxFor(ctx.organization, ["dashboard.view", "academics.manage"]), null, options)
    assert.deepEqual(noYear.map((a) => a.id), ["no-year"])
  })

  it("flags overdue result publication with its due date", async () => {
    const options = await loadScopeOptions(ctx)
    await prisma.examination.update({ where: { id: ids.term }, data: { status: "APPROVED", resultPublicationDate: day("2025-11-01") } })
    try {
      const alerts = await managementAlerts(ctxFor(ctx.organization, ["dashboard.view", "exams.publish"]), await scopeFor(), options)
      assert.deepEqual(alerts.map((a) => [a.id, a.severity]), [["results-overdue", "high"], ["results-ready", "low"]])
      assert.equal(alerts[0].date?.value.toISOString().slice(0, 10), "2025-11-01")
    } finally {
      await prisma.examination.update({ where: { id: ids.term }, data: { status: "PUBLISHED", resultPublicationDate: null } })
    }
  })

  it("shows recent audit entries, linking to what they are about", async () => {
    const entries = await recentActivity(ctx, null)
    assert.deepEqual(entries.map((e) => [e.summary, e.href]), [["Created a test record", null]])
  })
})
