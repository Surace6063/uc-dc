import "server-only"

import { standing, summarize } from "@/features/attendance/calculation"
import { localDate, slotLabel } from "@/features/attendance/constants"
import type { AuthContext } from "@/lib/authorization/context"
import { prisma } from "@/lib/prisma"
import { fromDate, toDate } from "@/lib/validation"
import { countEmployeeStatuses, countStudentStatuses } from "@/services/attendance/calculation-service"
import { myEmployeeProfile } from "@/services/attendance/employee-service"
import { getPolicy } from "@/services/attendance/policy-service"
import { countedSessionWhere } from "@/services/attendance/session-service"
import { requireGuardianStudentAccess } from "@/services/guardians/portal-service"

// Attendance as students, parents and employees see their own. The student
// is never taken from the client: a student sees the profile linked to their
// account; a guardian sees a child only through a link that allows portal
// access (checked on every call). Internal remarks, who marked a record and
// correction discussions are never included; only the shared reason is.
type Ctx = Pick<AuthContext, "organization" | "user">

export async function myStudentProfile(ctx: Ctx) {
  return prisma.student.findFirst({
    where: { organizationId: ctx.organization.id, userId: ctx.user.id, archivedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
}

async function overview(ctx: Ctx, studentId: string) {
  const policy = await getPolicy(ctx)
  const enrollment = await prisma.enrollment.findFirst({
    where: { organizationId: ctx.organization.id, studentId, status: { in: ["ACTIVE", "ON_HOLD"] } },
    orderBy: { enrollmentDate: "desc" },
    select: { academicYearId: true, academicYear: { select: { name: true, startDate: true } }, class: { select: { name: true } }, section: { select: { name: true } } },
  })
  if (!enrollment) return { policy: publicPolicy(policy), enrollment: null, summary: null, standing: "none" as const, bySubject: [], months: [], recent: [] }

  const base = { studentId, academicYearId: enrollment.academicYearId }
  const [overall, subjects, byDate, recent] = await Promise.all([
    countStudentStatuses(ctx, policy.dailyEnabled ? { ...base, sessionType: "DAILY" } : base, []),
    countStudentStatuses(ctx, { ...base, sessionType: "PERIOD" }, ["subjectOfferingId"]),
    countStudentStatuses(ctx, policy.dailyEnabled ? { ...base, sessionType: "DAILY" } : base, ["date"]),
    prisma.studentAttendance.findMany({
      where: { ...base, organizationId: ctx.organization.id, session: countedSessionWhere, date: { lte: toDate(localDate()) } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 60,
      select: {
        id: true, date: true, status: true, lateMinutes: true, reason: true, sessionType: true,
        session: { select: { slot: true, subjectOffering: { select: { subject: { select: { name: true } } } } } },
      },
    }),
  ])
  const offerings = await prisma.subjectOffering.findMany({
    where: { organizationId: ctx.organization.id, id: { in: [...subjects.values()].map((s) => s.key.subjectOfferingId as string) } },
    select: { id: true, subject: { select: { name: true } } },
  })
  const summary = summarize(overall.get("")?.counts ?? {}, policy)
  const months = new Map<string, Record<string, number>>()
  for (const c of byDate.values()) {
    const m = (c.key.date as string).slice(0, 7)
    const acc = months.get(m) ?? {}
    for (const [k, v] of Object.entries(c.counts)) acc[k] = (acc[k] ?? 0) + (v ?? 0)
    months.set(m, acc)
  }
  return {
    policy: publicPolicy(policy),
    enrollment: { yearName: enrollment.academicYear.name, className: enrollment.class.name, sectionName: enrollment.section?.name ?? null },
    summary,
    standing: standing(summary.percentage, policy),
    bySubject: offerings
      .map((o) => {
        const s = summarize(subjects.get(o.id)!.counts, policy)
        return { name: o.subject.name, summary: s, standing: standing(s.percentage, policy) }
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    months: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, counts]) => ({ month, summary: summarize(counts, policy) })),
    recent: recent.map((r) => ({
      id: r.id,
      date: fromDate(r.date),
      status: r.status,
      lateMinutes: r.lateMinutes,
      reason: r.reason,
      label: r.session.subjectOffering?.subject.name ?? slotLabel(r.sessionType, r.session.slot, policy.dailySlots),
    })),
  }
}

function publicPolicy(policy: Awaited<ReturnType<typeof getPolicy>>) {
  return { minimumPercentage: policy.minimumPercentage, warningMarginPercentage: policy.warningMarginPercentage }
}

export type StudentAttendanceOverview = Awaited<ReturnType<typeof overview>>

export async function myStudentAttendance(ctx: Ctx) {
  const student = await myStudentProfile(ctx)
  if (!student) return null
  return { student, ...(await overview(ctx, student.id)) }
}

// For the parent portal. The link is re-checked here whatever the caller did.
export async function childAttendance(ctx: Ctx, studentId: string) {
  await requireGuardianStudentAccess(ctx, studentId)
  return overview(ctx, studentId)
}

// An employee's own attendance for the last 60 days.
export async function myEmployeeAttendance(ctx: Ctx) {
  const profile = await myEmployeeProfile(ctx)
  if (!profile) return null
  const policy = await getPolicy(ctx)
  const key = profile.type === "TEACHER" ? { teacherId: profile.person.id } : { staffId: profile.person.id }
  const from = new Date(Date.now() - 60 * 86_400_000)
  const [counts, rows, today] = await Promise.all([
    countEmployeeStatuses(ctx, { ...key, date: { gte: from } }, []),
    prisma.employeeAttendance.findMany({
      where: { organizationId: ctx.organization.id, ...key, date: { gte: from } },
      orderBy: { date: "desc" },
      take: 60,
      select: { id: true, date: true, status: true, checkInAt: true, checkOutAt: true, lateMinutes: true, reason: true },
    }),
    prisma.employeeAttendance.findFirst({
      where: { organizationId: ctx.organization.id, ...key, date: toDate(localDate()) },
      select: { checkInAt: true, checkOutAt: true, status: true },
    }),
  ])
  return {
    type: profile.type,
    name: [profile.person.firstName, profile.person.lastName].join(" "),
    employeeId: profile.person.employeeId,
    selfCheckIn: policy.employeeSelfCheckIn && policy.employeeAttendanceEnabled,
    today,
    summary: summarize(counts.get("")?.counts ?? {}, policy),
    rows: rows.map((r) => ({ ...r, date: fromDate(r.date) })),
  }
}
