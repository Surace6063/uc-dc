import "server-only"

import { cache } from "react"

import { attendanceGroups, attendanceShortages, emptyOutcomes, fillTrend, gpaBands, outcomeOf, passRate, type OutcomeCounts } from "@/features/dashboard/calculations"
import type { AuthContext } from "@/lib/authorization/context"
import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { countStudentStatuses } from "@/services/attendance/calculation-service"
import { getPolicy } from "@/services/attendance/policy-service"
import { outcomesByProgram, studentPassRates } from "@/services/dashboard/kpi-service"
import type { DashboardScope } from "@/features/dashboard/scope"

// Academic performance charts: pass rates, outcomes, GPA and attendance.
// Result figures share one definition with the pass-rate KPI (latestOutcomes
// in kpi-service: each student once, by their latest published result).
// Attendance figures come from the attendance module's own counting and
// policy, so percentages match the attendance reports.
type Ctx = Pick<AuthContext, "organization">

async function programLabels(ctx: Ctx, ids: (string | null)[]) {
  const programs = await prisma.program.findMany({
    where: { organizationId: ctx.organization.id, id: { in: ids.filter((id): id is string => !!id) } },
    select: { id: true, name: true, code: true, sortOrder: true },
  })
  const by = new Map(programs.map((p) => [p.id, p]))
  return (id: string | null) => {
    const p = id ? by.get(id) : undefined
    return { label: p?.code || p?.name || "No program", name: p?.name ?? "No program", order: p?.sortOrder ?? Number.MAX_SAFE_INTEGER }
  }
}

// ------------------------------------------------------------ pass rate trend

// No university or national benchmark is shown: the system holds no
// verified benchmark figures, and none are estimated.
export const passRateTrend = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const rates = await studentPassRates(ctx, scope)
  return fillTrend(scope.trendYears, new Map([...rates.entries()].map(([id, r]) => [id, { passRate: r.rate, students: r.students }])), { passRate: null, students: null })
})

export type PassRateTrend = Awaited<ReturnType<typeof passRateTrend>>

// ------------------------------------------------------------ pass vs fail

// Passed, failed and absent students per program for the selected year (or
// examination). Each student appears once, in the program of the class
// their result was recorded in.
export const passFailByProgram = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const rows = await outcomesByProgram(ctx, scope)
  const label = await programLabels(ctx, rows.map((r) => r.programId))
  const groups = new Map<string | null, OutcomeCounts>()
  for (const r of rows) {
    const outcome = outcomeOf(r.status)
    if (!outcome) continue
    const g = groups.get(r.programId) ?? emptyOutcomes()
    g[outcome] += r.students
    groups.set(r.programId, g)
  }
  const total = emptyOutcomes()
  for (const g of groups.values()) for (const k of Object.keys(total) as (keyof OutcomeCounts)[]) total[k] += g[k]
  return {
    total: { ...total, passRate: passRate(total) },
    byProgram: [...groups.entries()]
      .map(([id, counts]) => ({ ...label(id), ...counts, passRate: passRate(counts) }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  }
})

export type PassFail = Awaited<ReturnType<typeof passFailByProgram>>

// ------------------------------------------------------------ GPA

// Examination GPA of each student's latest published result with a GPA (as
// pass rates), in half-point bands. Results only carry a GPA when their
// grading scale uses grade points; CGPA isn't stored, so it isn't shown.
export const gpaDistribution = cache(async (ctx: Ctx, scope: DashboardScope) => {
  if (scope.classIds?.length === 0) return { students: 0, bands: gpaBands([]), average: null, outOfScale: false }
  const classFilter = scope.classIds ? Prisma.sql`AND r.class_id = ANY(${scope.classIds}::uuid[])` : Prisma.empty
  const examFilter = scope.examinationId ? Prisma.sql`AND r.examination_id = ${scope.examinationId}::uuid` : Prisma.empty
  const rows = await prisma.$queryRaw<{ low: number; students: number; total: number; max: number }[]>`
    SELECT floor(latest.gpa * 2)::float / 2 AS low, count(*)::int AS students,
      sum(latest.gpa)::float AS total, max(latest.gpa)::float AS max
    FROM (
      SELECT DISTINCT ON (r.student_id) r.gpa
      FROM student_results r
      JOIN result_publications p ON p.id = r.publication_id AND p.status = 'ACTIVE'
      JOIN examinations e ON e.id = r.examination_id
      WHERE r.organization_id = ${ctx.organization.id}::uuid
        AND r.academic_year_id = ${scope.year.id}::uuid
        AND r.gpa IS NOT NULL
        ${classFilter}
        ${examFilter}
      ORDER BY r.student_id, e.start_date DESC, p.published_at DESC
    ) latest
    GROUP BY 1`
  const students = rows.reduce((n, r) => n + r.students, 0)
  const sum = rows.reduce((n, r) => n + r.total, 0)
  return {
    students,
    bands: gpaBands(rows),
    average: students === 0 ? null : Math.round((sum / students) * 100) / 100,
    // Bands assume a 4.0 scale; anything above it is shown as a note.
    outOfScale: rows.some((r) => r.max > 4),
  }
})

export type GpaDistribution = Awaited<ReturnType<typeof gpaDistribution>>

// ------------------------------------------------------------ attendance

// Attendance percentage and shortages per program, or per class/semester
// once one program or class is selected. Uses submitted and locked
// registers of the academic year: daily registers where daily attendance is
// on (as the attendance dashboard), otherwise every register.
export const attendanceOverview = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const policy = await getPolicy(ctx)
  const groupBy: "program" | "class" = scope.classId || scope.programIds?.length === 1 ? "class" : "program"
  const base = { minimumPercentage: policy.minimumPercentage, warningMarginPercentage: policy.warningMarginPercentage, groupBy }
  if (scope.classIds?.length === 0) return { ...base, rows: [], totals: { students: 0, below: 0, approaching: 0 } }

  const counts = await countStudentStatuses(
    ctx,
    {
      academicYearId: scope.year.id,
      ...(scope.classIds && { classId: { in: scope.classIds } }),
      ...(policy.dailyEnabled && { sessionType: "DAILY" }),
    },
    ["studentId", "classId"]
  )
  const rows = [...counts.values()].map((c) => ({ studentId: c.key.studentId as string, classId: c.key.classId as string, counts: c.counts }))
  const classes = await prisma.academicClass.findMany({
    where: { organizationId: ctx.organization.id, id: { in: [...new Set(rows.map((r) => r.classId))] } },
    select: { id: true, name: true, sequence: true, programId: true, educationLevel: { select: { sortOrder: true } }, program: { select: { name: true, code: true, sortOrder: true } } },
  })
  const classOf = new Map(classes.map((c) => [c.id, c]))
  const groupOf = (classId: string) => {
    const c = classOf.get(classId)
    if (!c) return null
    if (groupBy === "class") return { key: c.id, label: c.name, name: c.name, order: c.educationLevel.sortOrder * 10_000 + c.sequence }
    return {
      key: c.programId ?? "none",
      label: c.program?.code || c.program?.name || "No program",
      name: c.program?.name ?? "No program",
      order: c.program?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    }
  }
  return { ...base, rows: attendanceGroups(rows, groupOf, policy), totals: attendanceShortages(rows, policy) }
})

export type AttendanceOverview = Awaited<ReturnType<typeof attendanceOverview>>
