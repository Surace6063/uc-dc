import "server-only"

import { standing, summarize, type AttendanceSummary, type StatusCounts } from "@/features/attendance/calculation"
import { addDays, localDate } from "@/features/attendance/constants"
import type { ReportParams } from "@/features/attendance/filters"
import { fullName } from "@/features/students/constants"
import type { AuthContext } from "@/lib/authorization/context"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { fromDate, toDate } from "@/lib/validation"
import { myAssignments, recordScopeWhere, sessionScopeWhere } from "@/services/attendance/access-service"
import { countEmployeeStatuses, countStudentStatuses } from "@/services/attendance/calculation-service"
import { getPolicy, nonWorkingDays, workingDays, type Policy } from "@/services/attendance/policy-service"
import { resolveAcademicYear } from "@/services/classes/class-service"

// Attendance reports and dashboard figures. Every number goes through
// calculation-service (status counts) and features/attendance/calculation
// (percentages), so a student's percentage is the same on every screen.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

const sum = (a: StatusCounts, b: StatusCounts) => {
  const out: StatusCounts = { ...a }
  for (const [k, v] of Object.entries(b) as [keyof StatusCounts, number][]) out[k] = (out[k] ?? 0) + v
  return out
}

// ------------------------------------------------------------ the period

// The academic year and dates a report covers: the requested range, else the
// year so far. Never beyond today (future registers can't exist anyway).
export async function resolvePeriod(ctx: Ctx, params: Pick<ReportParams, "year" | "from" | "to">) {
  const { years, yearId } = await resolveAcademicYear(ctx, params.year)
  const year = yearId
    ? await prisma.academicYear.findFirst({ where: { id: yearId, organizationId: ctx.organization.id }, select: { id: true, name: true, startDate: true, endDate: true } })
    : null
  const today = localDate()
  const yearFrom = year ? fromDate(year.startDate) : addDays(today, -29)
  const yearTo = year ? (fromDate(year.endDate) < today ? fromDate(year.endDate) : today) : today
  let from = params.from ?? yearFrom
  let to = params.to ?? yearTo
  if (to > today) to = today
  if (from > to) from = to
  return { years, yearId, yearName: year?.name ?? null, from, to }
}

export type ReportPeriod = Awaited<ReturnType<typeof resolvePeriod>>

async function classIdsFor(ctx: Ctx, params: Pick<ReportParams, "level" | "program">) {
  if (!params.level && !params.program) return null
  const rows = await prisma.academicClass.findMany({
    where: {
      organizationId: ctx.organization.id,
      ...(params.level && { educationLevelId: params.level }),
      ...(params.program && { programId: params.program }),
    },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

async function reportWhere(ctx: Ctx, params: ReportParams, period: ReportPeriod): Promise<Prisma.StudentAttendanceWhereInput> {
  const classIds = await classIdsFor(ctx, params)
  return {
    AND: [
      await recordScopeWhere(ctx),
      period.yearId ? { academicYearId: period.yearId } : {},
      { date: { gte: toDate(period.from), lte: toDate(period.to) } },
      classIds ? { classId: { in: classIds } } : {},
      params.class ? { classId: params.class } : {},
      params.section ? { sectionId: params.section } : {},
      params.offering ? { subjectOfferingId: params.offering } : {},
      params.type ? { sessionType: params.type } : {},
    ],
  }
}

// ------------------------------------------------------------ student rows

async function studentDetails(ctx: Ctx, studentIds: string[], yearId: string | null) {
  const students = await prisma.student.findMany({
    where: { organizationId: ctx.organization.id, id: { in: studentIds } },
    select: {
      id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true,
      enrollments: {
        where: yearId ? { academicYearId: yearId, status: { not: "CANCELLED" } } : { status: "ACTIVE" },
        orderBy: { enrollmentDate: "desc" },
        take: 1,
        select: {
          rollNumber: true, classId: true,
          class: { select: { name: true, sequence: true } },
          section: { select: { name: true } },
        },
      },
    },
  })
  return new Map(
    students.map((s) => {
      const e = s.enrollments[0]
      return [
        s.id,
        {
          name: fullName(s),
          admissionNumber: s.admissionNumber,
          className: e?.class.name ?? "—",
          classSequence: e?.class.sequence ?? 0,
          sectionName: e?.section?.name ?? null,
          rollNumber: e?.rollNumber ?? null,
        },
      ]
    })
  )
}

export type StudentReportRow = {
  studentId: string
  name: string
  admissionNumber: string
  className: string
  sectionName: string | null
  rollNumber: string | null
  subjectName?: string
  summary: AttendanceSummary
  standing: ReturnType<typeof standing>
}

const byPlacement = (a: StudentReportRow & { classSequence?: number }, b: StudentReportRow & { classSequence?: number }) =>
  a.className.localeCompare(b.className, undefined, { numeric: true }) ||
  (a.sectionName ?? "").localeCompare(b.sectionName ?? "") ||
  (Number(a.rollNumber) || 9999) - (Number(b.rollNumber) || 9999) ||
  a.name.localeCompare(b.name)

export async function studentReport(ctx: Ctx, params: ReportParams, period: ReportPeriod, policy: Policy): Promise<StudentReportRow[]> {
  const counts = await countStudentStatuses(ctx, await reportWhere(ctx, params, period), ["studentId"])
  const ids = [...counts.values()].map((c) => c.key.studentId as string).slice(0, 5000)
  const details = await studentDetails(ctx, ids, period.yearId)
  return ids
    .map((id) => {
      const d = details.get(id)!
      const summary = summarize(counts.get(id)!.counts, policy)
      return { studentId: id, ...d, summary, standing: standing(summary.percentage, policy) }
    })
    .sort(byPlacement)
}

export async function classReport(ctx: Ctx, params: ReportParams, period: ReportPeriod, policy: Policy) {
  const counts = await countStudentStatuses(ctx, await reportWhere(ctx, params, period), ["classId", "sectionId"])
  const classIds = [...new Set([...counts.values()].map((c) => c.key.classId as string))]
  const sectionIds = [...new Set([...counts.values()].map((c) => c.key.sectionId as string | null).filter((s): s is string => !!s))]
  const [classes, sections] = await Promise.all([
    prisma.academicClass.findMany({ where: { organizationId: ctx.organization.id, id: { in: classIds } }, select: { id: true, name: true, sequence: true, educationLevel: { select: { sortOrder: true } } } }),
    prisma.section.findMany({ where: { organizationId: ctx.organization.id, id: { in: sectionIds } }, select: { id: true, name: true } }),
  ])
  const classBy = new Map(classes.map((c) => [c.id, c]))
  const sectionBy = new Map(sections.map((s) => [s.id, s.name]))
  const totals = new Map<string, StatusCounts>()
  const rows = [...counts.values()].map((c) => {
    const classId = c.key.classId as string
    totals.set(classId, sum(totals.get(classId) ?? {}, c.counts))
    const summary = summarize(c.counts, policy)
    return {
      key: `${classId}:${c.key.sectionId ?? ""}`,
      classId,
      className: classBy.get(classId)?.name ?? "—",
      sectionName: c.key.sectionId ? (sectionBy.get(c.key.sectionId as string) ?? "—") : "No section",
      isTotal: false,
      summary,
      standing: standing(summary.percentage, policy),
    }
  })
  const totalRows = [...totals.entries()].map(([classId, counts]) => {
    const summary = summarize(counts, policy)
    return { key: `${classId}:total`, classId, className: classBy.get(classId)?.name ?? "—", sectionName: "All sections", isTotal: true, summary, standing: standing(summary.percentage, policy) }
  })
  const order = (id: string) => {
    const c = classBy.get(id)
    return (c?.educationLevel.sortOrder ?? 0) * 10_000 + (c?.sequence ?? 0)
  }
  return [...rows, ...totalRows].sort(
    (a, b) => order(a.classId) - order(b.classId) || a.className.localeCompare(b.className) || Number(a.isTotal) - Number(b.isTotal) || a.sectionName.localeCompare(b.sectionName)
  )
}

// Subject-wise: per student and subject when a class is chosen (course-wise
// percentages for colleges), otherwise per class offering.
export async function subjectReport(ctx: Ctx, params: ReportParams, period: ReportPeriod, policy: Policy, perStudent = Boolean(params.class)) {
  const where = await reportWhere(ctx, { ...params, type: "PERIOD" }, period)
  const counts = await countStudentStatuses(ctx, where, perStudent ? ["studentId", "subjectOfferingId"] : ["subjectOfferingId"])
  const offeringIds = [...new Set([...counts.values()].map((c) => c.key.subjectOfferingId as string))]
  const offerings = await prisma.subjectOffering.findMany({
    where: { organizationId: ctx.organization.id, id: { in: offeringIds } },
    select: { id: true, subject: { select: { name: true, code: true } }, class: { select: { name: true } } },
  })
  const offeringBy = new Map(offerings.map((o) => [o.id, o]))
  if (!perStudent) {
    return {
      perStudent: false as const,
      rows: [...counts.values()]
        .map((c) => {
          const o = offeringBy.get(c.key.subjectOfferingId as string)
          const summary = summarize(c.counts, policy)
          return { key: c.key.subjectOfferingId as string, className: o?.class.name ?? "—", subjectName: o ? `${o.subject.name} (${o.subject.code})` : "—", summary, standing: standing(summary.percentage, policy) }
        })
        .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }) || a.subjectName.localeCompare(b.subjectName)),
    }
  }
  const details = await studentDetails(ctx, [...new Set([...counts.values()].map((c) => c.key.studentId as string))], period.yearId)
  return {
    perStudent: true as const,
    rows: [...counts.values()]
      .map((c) => {
        const o = offeringBy.get(c.key.subjectOfferingId as string)
        const summary = summarize(c.counts, policy)
        return {
          studentId: c.key.studentId as string,
          ...details.get(c.key.studentId as string)!,
          subjectName: o ? o.subject.name : "—",
          summary,
          standing: standing(summary.percentage, policy),
        }
      })
      .sort((a, b) => byPlacement(a, b) || a.subjectName.localeCompare(b.subjectName)),
  }
}

export async function monthlyReport(ctx: Ctx, params: ReportParams, period: ReportPeriod, policy: Policy) {
  const counts = await countStudentStatuses(ctx, await reportWhere(ctx, params, period), ["date"])
  const months = new Map<string, { counts: StatusCounts; days: Set<string> }>()
  for (const c of counts.values()) {
    const date = c.key.date as string
    const month = date.slice(0, 7)
    const entry = months.get(month) ?? { counts: {}, days: new Set<string>() }
    entry.counts = sum(entry.counts, c.counts)
    entry.days.add(date)
    months.set(month, entry)
  }
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => {
      const summary = summarize(m.counts, policy)
      return { month, daysWithAttendance: m.days.size, summary, standing: standing(summary.percentage, policy) }
    })
}

export async function shortageReport(ctx: Ctx, params: ReportParams, period: ReportPeriod, policy: Policy) {
  const short = (r: { standing: string }) => r.standing === "below" || r.standing === "approaching"
  const students = (await studentReport(ctx, params, period, policy)).filter(short)
  // Course-wise shortages: a student can be fine overall and short in one subject.
  const bySubject = policy.periodEnabled ? await subjectReport(ctx, params, period, policy, true) : null
  const subjects = bySubject?.perStudent ? bySubject.rows.filter(short) : []
  return {
    students: students.sort((a, b) => (a.summary.percentage ?? 0) - (b.summary.percentage ?? 0)),
    subjects,
  }
}

// ------------------------------------------------------------ employees

export async function employeeReport(ctx: Ctx, params: ReportParams, period: ReportPeriod, policy: Policy) {
  const where: Prisma.EmployeeAttendanceWhereInput = {
    date: { gte: toDate(period.from), lte: toDate(period.to) },
    ...(params.employeeType && { employeeType: params.employeeType }),
  }
  const [counts, days] = await Promise.all([
    countEmployeeStatuses(ctx, where, ["employeeType", "teacherId", "staffId"]),
    workingDays(ctx, { from: period.from, to: period.to }, { audience: "employees", policy }),
  ])
  const teacherIds = [...counts.values()].map((c) => c.key.teacherId as string | null).filter((id): id is string => !!id)
  const staffIds = [...counts.values()].map((c) => c.key.staffId as string | null).filter((id): id is string => !!id)
  const [teachers, staff] = await Promise.all([
    prisma.teacher.findMany({ where: { organizationId: ctx.organization.id, id: { in: teacherIds } }, select: { id: true, employeeId: true, firstName: true, middleName: true, lastName: true } }),
    prisma.staff.findMany({ where: { organizationId: ctx.organization.id, id: { in: staffIds } }, select: { id: true, employeeId: true, firstName: true, middleName: true, lastName: true } }),
  ])
  const people = new Map([...teachers, ...staff].map((p) => [p.id, p]))
  const lateMinutes = await prisma.employeeAttendance.groupBy({
    by: ["teacherId", "staffId"],
    where: { AND: [{ organizationId: ctx.organization.id }, where] },
    _sum: { lateMinutes: true },
  })
  const lateBy = new Map(lateMinutes.map((l) => [l.teacherId ?? l.staffId, l._sum.lateMinutes ?? 0]))
  return {
    workingDays: days.length,
    rows: [...counts.values()]
      .map((c) => {
        const id = (c.key.teacherId ?? c.key.staffId) as string
        const p = people.get(id)
        const summary = summarize(c.counts, policy)
        return {
          id,
          type: c.key.employeeType as "TEACHER" | "STAFF",
          name: p ? fullName(p) : "—",
          employeeId: p?.employeeId ?? "—",
          summary,
          totalLateMinutes: lateBy.get(id) ?? 0,
          // Working days without any record: not counted either way.
          unrecorded: Math.max(0, days.length - summary.marked),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

// ------------------------------------------------------------ dashboard

// Organisation-wide figures for the attendance dashboard (attendance.view_all).
// "Today" uses daily registers (first slot) where daily attendance is on,
// otherwise period registers. Unmarked students are reported as unmarked.
export async function dashboardStats(ctx: Ctx) {
  const policy = await getPolicy(ctx)
  const period = await resolvePeriod(ctx, {})
  const today = localDate()
  const yearId = period.yearId
  const todayWhere: Prisma.StudentAttendanceWhereInput = {
    date: toDate(today),
    ...(yearId && { academicYearId: yearId }),
    ...(policy.dailyEnabled ? { scopeKey: "DAILY:1" } : { sessionType: "PERIOD" }),
  }
  const trendFrom = addDays(today, -29)
  const [closedToday, closedRecent, enrolled, todayCounts, trendCounts, classCounts, drafts, submittedToday, pendingCorrections, yearStudents] =
    await Promise.all([
      nonWorkingDays(ctx, { from: today, to: today }, { audience: "students", policy }),
      nonWorkingDays(ctx, { from: trendFrom, to: today }, { audience: "students", policy }),
      yearId
        ? prisma.enrollment.count({ where: { organizationId: ctx.organization.id, academicYearId: yearId, status: "ACTIVE", student: { archivedAt: null } } })
        : 0,
      countStudentStatuses(ctx, todayWhere, []),
      countStudentStatuses(
        ctx,
        { date: { gte: toDate(trendFrom), lte: toDate(today) }, ...(yearId && { academicYearId: yearId }), ...(policy.dailyEnabled ? { sessionType: "DAILY" } : {}) },
        ["date"]
      ),
      countStudentStatuses(ctx, todayWhere, ["classId"]),
      prisma.attendanceSession.count({ where: { organizationId: ctx.organization.id, status: "DRAFT" } }),
      prisma.attendanceSession.count({ where: { organizationId: ctx.organization.id, date: toDate(today), status: { in: ["SUBMITTED", "LOCKED"] } } }),
      prisma.attendanceCorrection.count({ where: { organizationId: ctx.organization.id, status: "PENDING" } }),
      yearId ? countStudentStatuses(ctx, { academicYearId: yearId }, ["studentId"]) : Promise.resolve(new Map()),
    ])

  const todaySummary = summarize(todayCounts.get("")?.counts ?? {}, policy)
  let below = 0
  let approaching = 0
  for (const s of yearStudents.values()) {
    const st = standing(summarize(s.counts, policy).percentage, policy)
    if (st === "below") below++
    if (st === "approaching") approaching++
  }
  const classes = await prisma.academicClass.findMany({
    where: { organizationId: ctx.organization.id, id: { in: [...classCounts.values()].map((c) => c.key.classId as string) } },
    select: { id: true, name: true, sequence: true, educationLevel: { select: { sortOrder: true } } },
    orderBy: [{ educationLevel: { sortOrder: "asc" } }, { sequence: "asc" }],
  })

  return {
    today,
    yearId,
    yearName: period.yearName,
    nonWorkingToday: closedToday.get(today) ?? null,
    enrolled,
    todaySummary,
    completion: enrolled > 0 ? Math.round((todaySummary.marked / enrolled) * 1000) / 10 : null,
    unmarked: Math.max(0, enrolled - todaySummary.marked),
    drafts,
    submittedToday,
    pendingCorrections,
    below,
    approaching,
    minimumPercentage: policy.minimumPercentage,
    trend: [...trendCounts.values()]
      .map((c) => ({ date: c.key.date as string, ...summarize(c.counts, policy) }))
      .filter((d) => d.marked > 0 || !closedRecent.has(d.date))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ date: d.date, present: d.present, late: d.late, absent: d.absent, excused: d.excused + d.onLeave, percentage: d.percentage })),
    byClass: classes.map((c) => {
      const s = summarize(classCounts.get(c.id)!.counts, policy)
      return { classId: c.id, name: c.name, percentage: s.percentage, present: s.present + s.late, absent: s.absent, marked: s.marked }
    }),
  }
}

export type DashboardStats = Awaited<ReturnType<typeof dashboardStats>>

// A teacher's registers for a day: the daily registers of classes they look
// after and the subjects they teach, with each register's state.
export async function myRegistersToday(ctx: Ctx, date = localDate()) {
  const policy = await getPolicy(ctx)
  const { yearId } = await resolveAcademicYear(ctx, null)
  if (!yearId) return { yearId: null, date, items: [] }
  const assignments = (await myAssignments(ctx, prisma, yearId)).filter((a) => a.classId)
  const classIds = [...new Set(assignments.map((a) => a.classId!))]
  const [classes, offerings, sessions] = await Promise.all([
    prisma.academicClass.findMany({
      where: { organizationId: ctx.organization.id, id: { in: classIds } },
      select: { id: true, name: true, sections: { where: { archivedAt: null, isActive: true }, select: { id: true, name: true } } },
    }),
    prisma.subjectOffering.findMany({
      where: { organizationId: ctx.organization.id, academicYearId: yearId, classId: { in: classIds }, status: "ACTIVE" },
      select: { id: true, classId: true, subjectId: true, subject: { select: { name: true } } },
    }),
    prisma.attendanceSession.findMany({
      where: { AND: [{ organizationId: ctx.organization.id, date: toDate(date) }, await sessionScopeWhere(ctx)] },
      select: { id: true, classId: true, sectionId: true, subjectOfferingId: true, sessionType: true, slot: true, status: true },
    }),
  ])
  const classBy = new Map(classes.map((c) => [c.id, c]))
  const items: { key: string; label: string; classId: string; sectionId: string | null; type: "DAILY" | "PERIOD"; offeringId: string | null; status: string | null }[] = []
  for (const a of assignments) {
    const cls = classBy.get(a.classId!)
    if (!cls) continue
    const sectionName = a.sectionId ? cls.sections.find((s) => s.id === a.sectionId)?.name : null
    if ((a.role === "CLASS_TEACHER" || a.role === "CO_TEACHER") && policy.dailyEnabled) {
      const s = sessions.find((x) => x.sessionType === "DAILY" && x.classId === cls.id && x.sectionId === a.sectionId && x.slot === 1)
      items.push({ key: `D:${cls.id}:${a.sectionId}`, label: [cls.name, sectionName && `Section ${sectionName}`, "Daily"].filter(Boolean).join(" · "), classId: cls.id, sectionId: a.sectionId, type: "DAILY", offeringId: null, status: s?.status ?? null })
    }
    if (a.subjectId && policy.periodEnabled) {
      const o = offerings.find((x) => x.classId === cls.id && x.subjectId === a.subjectId)
      if (!o) continue
      const done = sessions.filter((x) => x.subjectOfferingId === o.id && x.sectionId === a.sectionId)
      items.push({
        key: `P:${o.id}:${a.sectionId}`,
        label: [cls.name, sectionName && `Section ${sectionName}`, o.subject.name].filter(Boolean).join(" · "),
        classId: cls.id, sectionId: a.sectionId, type: "PERIOD", offeringId: o.id,
        status: done.length ? `${done.length} period${done.length === 1 ? "" : "s"} taken` : null,
      })
    }
  }
  return { yearId, date, items: [...new Map(items.map((i) => [i.key, i])).values()] }
}

