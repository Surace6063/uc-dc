import "server-only"

import { localDate } from "@/features/attendance/constants"
import { SEVERITY_ORDER, type ManagementAlert } from "@/features/dashboard/alerts"
import type { DashboardScope, ScopeOptions } from "@/features/dashboard/scope"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import type { PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import { toDate } from "@/lib/validation"
import { attendanceOverview } from "@/services/dashboard/academic-service"
import { ELIGIBLE_TEACHER } from "@/services/dashboard/kpi-service"
import { studentOverview } from "@/services/dashboard/overview-service"

// Management alerts, raised only from records the system actually holds;
// each is shown only to those with the permission to act on it. Work queues
// (marks, results, registers, corrections) are institution-wide and current;
// attendance shortages and data checks follow the dashboard's year and
// program filters, like the charts they relate to.
//
// Not monitored, because the system has no such records: QAA/SSR evidence,
// quality-improvement actions and budgets (NOT_MONITORED in
// features/dashboard/alerts).
type Ctx = Pick<AuthContext, "organization" | "permissions">

type Check = { permission: PermissionKey | PermissionKey[]; run: () => Promise<ManagementAlert | null> }

export async function managementAlerts(ctx: Ctx, scope: DashboardScope | null, options: ScopeOptions): Promise<ManagementAlert[]> {
  const organizationId = ctx.organization.id
  const today = toDate(localDate())
  const may = (p: PermissionKey | PermissionKey[]) => (Array.isArray(p) ? p.some((k) => hasPermission(ctx, k)) : hasPermission(ctx, p))
  const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

  const checks: Check[] = [
    // ---------------------------------------------------------- setup
    {
      permission: "academics.manage",
      run: async () =>
        scope ? null : { id: "no-year", severity: "high", category: "Setup", title: "No academic year set", description: "Most figures follow the academic year. Add one and mark it as current.", href: "/dashboard/academics?tab=years" },
    },

    // ---------------------------------------------------------- examinations
    {
      permission: "exams.publish",
      run: async () => {
        const where = { organizationId, archivedAt: null, status: { notIn: ["PUBLISHED", "ARCHIVED"] as ("PUBLISHED" | "ARCHIVED")[] }, resultPublicationDate: { lt: today } }
        const [n, oldest] = await Promise.all([
          prisma.examination.count({ where }),
          prisma.examination.findFirst({ where, orderBy: { resultPublicationDate: "asc" }, select: { resultPublicationDate: true } }),
        ])
        return n
          ? { id: "results-overdue", severity: "high", category: "Examinations", title: "Results past their publication date", description: `${plural(n, "examination")} still unpublished after the planned result date.`, count: n, date: { label: "Due", value: oldest!.resultPublicationDate! }, href: "/dashboard/exams" }
          : null
      },
    },
    {
      permission: ["exams.marks.manage", "exams.update"],
      run: async () => {
        const where = { organizationId, archivedAt: null, status: { in: ["SCHEDULED", "REVISION"] as ("SCHEDULED" | "REVISION")[] }, endDate: { lt: today }, sheets: { some: { status: { in: ["DRAFT", "RETURNED"] as ("DRAFT" | "RETURNED")[] } } } }
        const [n, oldest] = await Promise.all([
          prisma.examination.count({ where }),
          prisma.examination.findFirst({ where, orderBy: { endDate: "asc" }, select: { endDate: true } }),
        ])
        return n
          ? { id: "marks-overdue", severity: "medium", category: "Examinations", title: "Marks still being entered after the exam ended", description: `${plural(n, "examination")} with mark sheets not yet submitted.`, count: n, date: { label: "Ended", value: oldest!.endDate }, href: "/dashboard/exams/marks" }
          : null
      },
    },
    {
      permission: "exams.review",
      run: async () => {
        const where = { organizationId, status: "SUBMITTED" as const }
        const [n, oldest] = await Promise.all([
          prisma.marksSheet.count({ where }),
          prisma.marksSheet.findFirst({ where, orderBy: { submittedAt: "asc" }, select: { submittedAt: true } }),
        ])
        return n
          ? { id: "marks-review", severity: "medium", category: "Examinations", title: "Marks awaiting review", description: "Submitted mark sheets need verifying before results can be approved.", count: n, ...(oldest?.submittedAt && { date: { label: "Oldest", value: oldest.submittedAt } }), href: "/dashboard/exams/review" }
          : null
      },
    },
    {
      permission: "exams.publish",
      run: async () => {
        const n = await prisma.examination.count({ where: { organizationId, status: "APPROVED", archivedAt: null } })
        return n ? { id: "results-ready", severity: "low", category: "Examinations", title: "Results ready to publish", description: "Approved examinations whose results haven't been published yet.", count: n, href: "/dashboard/exams?status=APPROVED" } : null
      },
    },
    {
      permission: "exams.approve",
      run: async () => {
        const where = { organizationId, releasedAt: null }
        const [n, oldest] = await Promise.all([
          prisma.resultHold.count({ where }),
          prisma.resultHold.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
        ])
        return n
          ? { id: "result-holds", severity: "low", category: "Examinations", title: "Results on hold", description: "Students whose results are withheld until the hold is released.", count: n, date: { label: "Oldest", value: oldest!.createdAt }, href: "/dashboard/exams" }
          : null
      },
    },

    // ---------------------------------------------------------- attendance
    {
      permission: "attendance.view_all",
      run: async () => {
        if (!scope) return null
        const a = await attendanceOverview(ctx, scope)
        const below = a.totals.below
        return below
          ? {
              id: "attendance-shortage", severity: "high", category: "Attendance", title: "Attendance shortages",
              description: `${plural(below, "student")} below the ${a.minimumPercentage}% minimum in ${scope.year.name}.`, count: below,
              href: `/dashboard/attendance/reports?kind=shortage&year=${scope.year.id}`,
            }
          : null
      },
    },
    {
      permission: ["attendance.manage", "attendance.view_all"],
      run: async () => {
        const where = { organizationId, status: "DRAFT" as const, date: { lt: today } }
        const [n, oldest] = await Promise.all([
          prisma.attendanceSession.count({ where }),
          prisma.attendanceSession.findFirst({ where, orderBy: { date: "asc" }, select: { date: true } }),
        ])
        return n
          ? { id: "registers-draft", severity: "medium", category: "Attendance", title: "Registers not submitted", description: "Attendance registers from past days still in draft; they don't count until submitted.", count: n, date: { label: "Oldest", value: oldest!.date }, href: "/dashboard/attendance/sessions" }
          : null
      },
    },
    {
      permission: "attendance.approve",
      run: async () => {
        const where = { organizationId, status: "PENDING" as const }
        const [n, oldest] = await Promise.all([
          prisma.attendanceCorrection.count({ where }),
          prisma.attendanceCorrection.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
        ])
        return n
          ? { id: "attendance-corrections", severity: "low", category: "Attendance", title: "Attendance corrections pending", description: "Requested changes to attendance records waiting for approval.", count: n, date: { label: "Oldest", value: oldest!.createdAt }, href: "/dashboard/attendance/corrections" }
          : null
      },
    },

    // ---------------------------------------------------------- UGC data quality
    {
      permission: "students.view",
      run: async () => {
        if (!scope) return null
        const n = (await studentOverview(ctx, scope)).gender.unrecorded
        return n
          ? { id: "ugc-gender", severity: "medium", category: "Data quality", title: "Students without a recorded gender", description: `${plural(n, "enrolled student")} in ${scope.year.name}; UGC reports enrollment, graduates and the Gender Parity Index by gender.`, count: n, href: "/dashboard/students" }
          : null
      },
    },
    {
      permission: "students.view",
      run: async () => {
        if (!scope) return null
        const n = (await studentOverview(ctx, scope)).byCaste.find((c) => c.key === "UNRECORDED")?.total ?? 0
        return n
          ? { id: "ugc-caste", severity: "medium", category: "Data quality", title: "Students without a recorded caste/ethnicity", description: `${plural(n, "enrolled student")} in ${scope.year.name}; UGC reports enrollment by caste/ethnicity.`, count: n, href: "/dashboard/students?caste=unrecorded" }
          : null
      },
    },
    {
      permission: "academics.view",
      run: async () => {
        const n = options.programs.filter((p) => p.isActive && !p.facultyId).length
        return n
          ? { id: "ugc-program-faculty", severity: "low", category: "Data quality", title: "Programs without a faculty", description: `${plural(n, "active program")} not linked to a faculty; UGC reports programs by faculty.`, count: n, href: "/dashboard/academics?tab=programs" }
          : null
      },
    },
    {
      permission: "teachers.view",
      run: async () => {
        const n = await prisma.teacher.count({ where: { organizationId, ...ELIGIBLE_TEACHER, designationId: null } })
        return n
          ? { id: "ugc-designation", severity: "low", category: "Data quality", title: "Teachers without a designation", description: `${plural(n, "teacher")} can't be counted by rank (Professor, Lecturer, …) in UGC staff figures.`, count: n, href: "/dashboard/teachers" }
          : null
      },
    },
    {
      permission: "teachers.view",
      run: async () => {
        const n = await prisma.teacher.count({ where: { organizationId, ...ELIGIBLE_TEACHER, qualifications: { none: {} } } })
        return n
          ? { id: "ugc-qualification", severity: "low", category: "Data quality", title: "Teachers without a recorded qualification", description: `${plural(n, "teacher")} missing from faculty qualification figures.`, count: n, href: "/dashboard/teachers" }
          : null
      },
    },
  ]

  const results = await Promise.all(checks.filter((c) => may(c.permission)).map((c) => c.run()))
  return results.filter((a): a is ManagementAlert => a !== null).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

// ------------------------------------------------------------ activity

// Pages a log entry can link to, by entity type.
const ENTITY_LINKS: Record<string, (id: string) => string> = {
  student: (id) => `/dashboard/students/${id}`,
  teacher: (id) => `/dashboard/teachers/${id}`,
  staff: (id) => `/dashboard/staff/${id}`,
  guardian: (id) => `/dashboard/parents/${id}`,
  examination: (id) => `/dashboard/exams/${id}`,
  class: (id) => `/dashboard/classes/${id}`,
}

// Latest audit-log entries (audit.view only), within the date window when
// one is set. Only what the audit log recorded; nothing is reconstructed.
export async function recentActivity(ctx: Ctx, scope: DashboardScope | null, take = 8) {
  const rows = await prisma.auditLog.findMany({
    where: { organizationId: ctx.organization.id, ...((scope?.from || scope?.to) && { createdAt: { ...(scope.from && { gte: scope.from }), ...(scope.to && { lte: scope.to }) } }) },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, entityType: true, entityId: true, summary: true, createdAt: true, actor: { select: { name: true, email: true } } },
  })
  return rows.map((r) => ({ ...r, href: r.entityId && ENTITY_LINKS[r.entityType] ? ENTITY_LINKS[r.entityType](r.entityId) : null }))
}

export type ActivityEntry = Awaited<ReturnType<typeof recentActivity>>[number]
