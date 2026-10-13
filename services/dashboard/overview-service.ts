import "server-only"

import { cache } from "react"

import type { DashboardFilters } from "@/features/dashboard/filters"
import { resolveScope, withExamination, type DashboardScope, type ScopeOptions } from "@/features/dashboard/scope"
import { casteByGender, fillTrend, summarizeEquity, type EquityCounts } from "@/features/dashboard/calculations"
import type { AuthContext } from "@/lib/authorization/context"
import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  COUNTED_ENROLLMENT_STATUSES,
  countAdmissions,
  countStudents,
} from "@/services/dashboard/kpi-service"

// Figures for the institutional dashboard. Each section has its own loader so
// the page can stream and fail section by section; loaders are wrapped in
// React cache() so the KPI row and the charts share one query per request
// (the page passes the same ctx and scope objects to both).
//
// Conventions shared by every figure (definitions live in kpi-service):
// - a student counts once per academic year; withdrawn, transferred-out and
//   cancelled enrollments and archived students are left out;
// - results come from published results only (as in results analytics);
// - "faculty" in KPIs means teaching staff; the faculty *filter* is the
//   academic faculty/school a program belongs to.
type Ctx = Pick<AuthContext, "organization" | "permissions">

// ------------------------------------------------------------ scope

// The organisation's filter options, loaded once per request: years,
// faculties and every program and class (inactive and archived included,
// so filters also cover history).
export const loadScopeOptions = cache(async (ctx: Ctx): Promise<ScopeOptions> => {
  const organizationId = ctx.organization.id
  const [years, faculties, programs, classes] = await Promise.all([
    prisma.academicYear.findMany({ where: { organizationId }, orderBy: { startDate: "desc" }, select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true } }),
    prisma.faculty.findMany({ where: { organizationId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.program.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, code: true, facultyId: true, isActive: true } }),
    prisma.academicClass.findMany({
      where: { organizationId },
      orderBy: [{ educationLevel: { sortOrder: "asc" } }, { sequence: "asc" }, { name: "asc" }],
      select: { id: true, name: true, programId: true, archivedAt: true, program: { select: { facultyId: true } } },
    }),
  ])
  return {
    years,
    faculties,
    programs,
    classes: classes.map((c) => ({ id: c.id, name: c.name, programId: c.programId, facultyId: c.program?.facultyId ?? null, archived: c.archivedAt !== null })),
  }
})

// Examinations of a year with published results: the only ones whose
// figures reach the dashboard, so the only ones offered as a filter.
export const yearExaminations = cache(async (ctx: Ctx, yearId: string) =>
  prisma.examination.findMany({
    where: { organizationId: ctx.organization.id, academicYearId: yearId, archivedAt: null, publications: { some: { status: "ACTIVE" } } },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true },
  })
)

// Everything the page needs to know about the filters: the options, the
// validated scope (null without any academic year) and the filters actually
// applied.
export async function loadDashboardScope(ctx: Ctx, raw: DashboardFilters) {
  const options = await loadScopeOptions(ctx)
  const resolved = resolveScope(options, raw)
  if (!resolved) return { options, exams: [], scope: null, filters: {} as DashboardFilters }
  const exams = await yearExaminations(ctx, resolved.scope.year.id)
  return { options, exams, ...withExamination(resolved, exams, raw.exam) }
}

// ------------------------------------------------------------ students

export type GenderKey = "female" | "male" | "other" | "unrecorded"
export const genderKey = (g: string | null): GenderKey => (g === "FEMALE" ? "female" : g === "MALE" ? "male" : g === "OTHER" ? "other" : "unrecorded")
const emptyGender = (): Record<GenderKey, number> => ({ female: 0, male: 0, other: 0, unrecorded: 0 })

// Enrolled students by program, gender and caste/ethnicity, the equity
// groups, and the enrollment trend. Same definition as the Total students
// KPI (kpi-service), so the totals match; a student is placed in the program
// of their latest counted enrollment that year. Background fields that
// aren't recorded are counted as "not recorded", never as a category.
export const studentOverview = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const organizationId = ctx.organization.id
  const programFilter = Prisma.sql`${scope.programIds ? Prisma.sql`AND e.program_id = ANY(${scope.programIds}::uuid[])` : Prisma.empty} ${scope.classId ? Prisma.sql`AND e.class_id = ${scope.classId}::uuid` : Prisma.empty}`
  const [rows, trend] = await Promise.all([
    prisma.$queryRaw<(EquityCounts & { program_id: string | null; gender: string | null; caste: string | null; count: number })[]>`
      SELECT latest.program_id, latest.gender, latest.caste, count(*)::int AS count,
        count(*) FILTER (WHERE latest.economically_disadvantaged)::int AS econ_yes,
        count(latest.economically_disadvantaged)::int AS econ_recorded,
        count(*) FILTER (WHERE latest.first_generation_learner)::int AS first_yes,
        count(latest.first_generation_learner)::int AS first_recorded,
        count(*) FILTER (WHERE latest.remote_area)::int AS remote_yes,
        count(latest.remote_area)::int AS remote_recorded,
        count(*) FILTER (WHERE latest.scholarship <> 'NONE')::int AS scholarship_yes,
        count(latest.scholarship)::int AS scholarship_recorded,
        count(*) FILTER (WHERE latest.disability <> 'NONE')::int AS disability_yes,
        count(latest.disability)::int AS disability_recorded
      FROM (
        SELECT DISTINCT ON (e.student_id) e.program_id, s.gender::text AS gender, s.caste_ethnicity::text AS caste,
          s.economically_disadvantaged, s.first_generation_learner, s.remote_area,
          s.scholarship_category::text AS scholarship, s.disability_type::text AS disability
        FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.organization_id = ${organizationId}::uuid
          AND e.academic_year_id = ${scope.year.id}::uuid
          AND e.status::text = ANY(${COUNTED_ENROLLMENT_STATUSES}::text[])
          AND s.archived_at IS NULL
          ${programFilter}
        ORDER BY e.student_id, e.enrollment_date DESC, e.created_at DESC
      ) latest
      GROUP BY latest.program_id, latest.gender, latest.caste`,
    Promise.all(
      scope.trendYears.map(async (y) => {
        const [students, admissions] = await Promise.all([countStudents(ctx, scope, y.id), countAdmissions(ctx, scope, y.id)])
        return [y.id, { students, admissions }] as const
      })
    ),
  ])

  const gender = emptyGender()
  const perProgram = new Map<string | null, Record<GenderKey, number>>()
  for (const r of rows) {
    const key = genderKey(r.gender)
    gender[key] += r.count
    const row = perProgram.get(r.program_id) ?? emptyGender()
    row[key] += r.count
    perProgram.set(r.program_id, row)
  }
  const programs = await prisma.program.findMany({
    where: { organizationId, id: { in: [...perProgram.keys()].filter((id): id is string => !!id) } },
    select: { id: true, name: true, code: true, sortOrder: true },
  })
  const programOf = new Map(programs.map((p) => [p.id, p]))
  const byProgram = [...perProgram.entries()]
    .map(([id, counts]) => {
      const p = id ? programOf.get(id) : undefined
      return { programId: id, program: p?.code || p?.name || "No program", name: p?.name ?? "No program", sortOrder: p?.sortOrder ?? Number.MAX_SAFE_INTEGER, ...counts, total: counts.female + counts.male + counts.other + counts.unrecorded }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  return {
    total: rows.reduce((n, r) => n + r.count, 0),
    gender,
    byProgram,
    byCaste: casteByGender(rows.map((r) => ({ caste: r.caste, gender: genderKey(r.gender), count: r.count }))),
    // Aggregate counts only; no individual's disability is exposed.
    equity: summarizeEquity(rows),
    // Years without any counted enrollment are gaps, not zeros.
    trend: fillTrend(scope.trendYears, new Map(trend.filter(([, v]) => v.students > 0)), { students: null, admissions: null }),
  }
})

export type StudentOverview = Awaited<ReturnType<typeof studentOverview>>
