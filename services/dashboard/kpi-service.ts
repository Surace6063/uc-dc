import "server-only"

import { cache } from "react"

import { fractionToPercent, PCT_SCALE } from "@/features/exams/calculation"
import type { AuthContext } from "@/lib/authorization/context"
import { Prisma, type EnrollmentStatus, type EnrollmentType, type TeacherEmploymentType } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { DashboardScope } from "@/features/dashboard/scope"

// The dashboard's headline figures, as counts and aggregates in the
// database (no row fetching). Each KPI has its own loader so one failure
// only affects its own card. A comparison with the previous academic year
// is returned only when that year exists and is measured the same way.
type Ctx = Pick<AuthContext, "organization">

// Enrollments that count a student as enrolled in a year: still open, or
// finished the year (promoted, completed, detained). Withdrawn, transferred
// out and cancelled placements don't count. Leaving the institution closes
// open enrollments with the matching status (student-service applyStatus),
// so this also follows the student's status.
export const COUNTED_ENROLLMENT_STATUSES: EnrollmentStatus[] = ["ACTIVE", "ON_HOLD", "PROMOTED", "COMPLETED", "DETAINED"]

// Enrollment types that bring a student into the institution. TRANSFER is a
// class transfer at promotion (placement-service), and READMISSION a
// returning student, so neither is a new admission.
const ADMISSION_TYPES: EnrollmentType[] = ["NEW_ADMISSION", "LATERAL_ENTRY"]

// Program and class/semester filters on an enrollment.
const programFilter = (scope: DashboardScope): Prisma.EnrollmentWhereInput => ({
  ...(scope.programIds && { programId: { in: scope.programIds } }),
  ...(scope.classId && { classId: scope.classId }),
})

const previousYear = (scope: DashboardScope) => (scope.trendYears.length > 1 ? scope.trendYears[scope.trendYears.length - 2] : null)

// Distinct students (each counted once) enrolled in a year. Cached per
// request: the KPIs, the enrollment trend and the ratio trend all ask.
export const countStudents = cache((ctx: Ctx, scope: DashboardScope, academicYearId: string) =>
  prisma.student.count({
    where: {
      organizationId: ctx.organization.id,
      archivedAt: null,
      enrollments: { some: { academicYearId, status: { in: COUNTED_ENROLLMENT_STATUSES }, ...programFilter(scope) } },
    },
  })
)

// Distinct students admitted in a year; `windowed` applies the scope's date
// window. A student admitted and later withdrawn still counts; a cancelled
// admission doesn't. Cached per request like countStudents.
export const countAdmissions = cache((ctx: Ctx, scope: DashboardScope, academicYearId: string, windowed = false) =>
  prisma.student.count({
    where: {
      organizationId: ctx.organization.id,
      archivedAt: null,
      enrollments: {
        some: {
          academicYearId,
          enrollmentType: { in: ADMISSION_TYPES },
          status: { not: "CANCELLED" },
          ...programFilter(scope),
          ...(windowed && (scope.from || scope.to) && { enrollmentDate: { ...(scope.from && { gte: scope.from }), ...(scope.to && { lte: scope.to }) } }),
        },
      },
    },
  })
)

export type Comparison = { previous: number; yearName: string } | null

export const studentKpis = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const prev = previousYear(scope)
  const windowed = Boolean(scope.from || scope.to)
  const [total, admissions, prevTotal, prevAdmissions] = await Promise.all([
    countStudents(ctx, scope, scope.year.id),
    countAdmissions(ctx, scope, scope.year.id, true),
    prev ? countStudents(ctx, scope, prev.id) : null,
    // A date window has no counterpart last year, so no comparison then.
    prev && !windowed ? countAdmissions(ctx, scope, prev.id) : null,
  ])
  const compare = (previous: number | null): Comparison => (prev && previous ? { previous, yearName: prev.name } : null)
  return {
    total,
    totalComparison: compare(prevTotal),
    newAdmissions: admissions,
    admissionsComparison: compare(prevAdmissions),
  }
})

export type StudentKpis = Awaited<ReturnType<typeof studentKpis>>

// ------------------------------------------------------------ faculty

// Teachers eligible to count as faculty: active or on leave, not archived.
export const ELIGIBLE_TEACHER: Prisma.TeacherWhereInput = { archivedAt: null, employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] } }

// With a program filter, the teachers with an active assignment to it (or
// to one of its classes) in the selected year; with a class filter, to that
// class or to its whole program.
export function teacherScope(ctx: Ctx, scope: DashboardScope): Prisma.TeacherWhereInput {
  const assignment: Prisma.TeacherAssignmentWhereInput | null = scope.classId
    ? { OR: [{ classId: scope.classId }, ...(scope.classProgramId ? [{ classId: null, programId: scope.classProgramId }] : [])] }
    : scope.programIds
      ? { OR: [{ programId: { in: scope.programIds } }, { class: { programId: { in: scope.programIds } } }] }
      : null
  return {
    organizationId: ctx.organization.id,
    ...ELIGIBLE_TEACHER,
    ...(assignment && { assignments: { some: { academicYearId: scope.year.id, status: "ACTIVE", ...assignment } } }),
  }
}

// No comparison: teacher headcounts aren't recorded per academic year, so
// last year's figure can't be measured the same way.
export const facultyKpis = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const rows = await prisma.teacher.groupBy({ by: ["employmentType"], where: teacherScope(ctx, scope), _count: { _all: true } })
  const by = (types: TeacherEmploymentType[]) => rows.filter((r) => types.includes(r.employmentType)).reduce((n, r) => n + r._count._all, 0)
  return {
    total: by(["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "VISITING", "OTHER"]),
    fullTime: by(["FULL_TIME"]),
    partTime: by(["PART_TIME", "CONTRACT", "TEMPORARY", "VISITING", "OTHER"]),
  }
})

export type FacultyKpis = Awaited<ReturnType<typeof facultyKpis>>

// ------------------------------------------------------------ pass rate

export type PassRate = { students: number; passed: number; rate: number | null }

type OutcomeRow = { academic_year_id: string; program_id: string | null; status: "PASS" | "FAIL" | "ABSENT"; students: number }

// The one result definition behind every pass figure on the dashboard: each
// student counts once per academic year, by their most recent published
// result that year (latest examination, then latest publication) among
// decided outcomes (pass, fail, absent; DECIDED in analytics-service).
// With an examination, that examination's result. Grouped by the program of
// the class the result was recorded in; the class/program filters apply to
// that class too.
async function latestOutcomes(ctx: Ctx, scope: DashboardScope, yearIds: string[], examinationId: string | null): Promise<OutcomeRow[]> {
  if (scope.classIds?.length === 0 || yearIds.length === 0) return []
  const classFilter = scope.classIds ? Prisma.sql`AND r.class_id = ANY(${scope.classIds}::uuid[])` : Prisma.empty
  const examFilter = examinationId ? Prisma.sql`AND r.examination_id = ${examinationId}::uuid` : Prisma.empty
  return prisma.$queryRaw<OutcomeRow[]>`
    SELECT latest.academic_year_id, c.program_id, latest.status::text AS status, count(*)::int AS students
    FROM (
      SELECT DISTINCT ON (r.academic_year_id, r.student_id) r.academic_year_id, r.class_id, r.status
      FROM student_results r
      JOIN result_publications p ON p.id = r.publication_id AND p.status = 'ACTIVE'
      JOIN examinations e ON e.id = r.examination_id
      WHERE r.organization_id = ${ctx.organization.id}::uuid
        AND r.academic_year_id = ANY(${yearIds}::uuid[])
        AND r.status IN ('PASS', 'FAIL', 'ABSENT')
        ${classFilter}
        ${examFilter}
      ORDER BY r.academic_year_id, r.student_id, e.start_date DESC, p.published_at DESC
    ) latest
    JOIN academic_classes c ON c.id = latest.class_id
    GROUP BY latest.academic_year_id, c.program_id, latest.status`
}

const toRate = (passed: number, students: number): PassRate => ({
  students,
  passed,
  rate: students === 0 ? null : fractionToPercent(BigInt(passed), BigInt(students), 1) / PCT_SCALE,
})

// Student-level pass rate per academic year of the trend (whole years).
export const studentPassRates = cache(async (ctx: Ctx, scope: DashboardScope): Promise<Map<string, PassRate>> => {
  const rows = await latestOutcomes(ctx, scope, scope.trendYears.map((y) => y.id), null)
  const totals = new Map<string, { students: number; passed: number }>()
  for (const r of rows) {
    const t = totals.get(r.academic_year_id) ?? { students: 0, passed: 0 }
    t.students += r.students
    if (r.status === "PASS") t.passed += r.students
    totals.set(r.academic_year_id, t)
  }
  return new Map([...totals.entries()].map(([yearId, t]) => [yearId, toRate(t.passed, t.students)]))
})

// Passed, failed and absent students per program in the selected year, or
// in the selected examination.
export const outcomesByProgram = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const rows = await latestOutcomes(ctx, scope, [scope.year.id], scope.examinationId)
  return rows.map((r) => ({ programId: r.program_id, status: r.status, students: r.students }))
})

export const passRateKpi = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const rates = await studentPassRates(ctx, scope)
  const prev = previousYear(scope)
  const previous = prev ? rates.get(prev.id) : undefined
  return {
    current: rates.get(scope.year.id) ?? { students: 0, passed: 0, rate: null },
    comparison: prev && previous?.rate != null ? { previous: previous.rate, yearName: prev.name } : null,
  }
})

export type PassRateKpi = Awaited<ReturnType<typeof passRateKpi>>
