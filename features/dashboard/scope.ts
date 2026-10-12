import { TREND_YEARS, type DashboardFilters } from "@/features/dashboard/filters"
import type { TeacherEmploymentType } from "@/lib/generated/prisma/enums"
import { toDate } from "@/lib/validation"

// Turns the URL filters into the scope every dashboard query uses. Pure: it
// validates against the organisation's own options (loaded once on the
// server), so the same rules are unit-tested and nothing from the URL
// reaches a query unchecked. Invalid or inconsistent values are dropped
// (falling back to the wider view), and `filters` reports what was
// actually applied so the toolbar and the reporting-period line match the
// figures.

export type ScopeOptions = {
  years: { id: string; name: string; startDate: Date; endDate: Date; isCurrent: boolean }[]
  faculties: { id: string; name: string }[]
  // Every program and class, including inactive/archived ones, so filters
  // also cover history; the toolbar lists only active ones.
  programs: { id: string; name: string; code: string; facultyId: string | null; isActive: boolean }[]
  classes: { id: string; name: string; programId: string | null; facultyId: string | null; archived: boolean }[]
}

export type DashboardScope = {
  year: { id: string; name: string; startDate: Date; endDate: Date }
  // Oldest first, ending with the selected year (at most TREND_YEARS).
  trendYears: { id: string; name: string }[]
  // null = every program (no faculty/program filter).
  programIds: string[] | null
  // A single class/semester filter, or null, and that class's program.
  classId: string | null
  classProgramId: string | null
  // Classes results and attendance are narrowed to (the class filter, else
  // the filtered programs' classes); null = every class.
  classIds: string[] | null
  // One examination for the examination charts, or null for the whole year.
  examinationId: string | null
  // Faculty profile filters (designation and qualification charts only).
  staff: { departmentId: string | null; employmentType: TeacherEmploymentType | null }
  // Explicit date window for date-based figures (new admissions, recent
  // activity); null ends are open.
  from: Date | null
  to: Date | null
}

export function resolveScope(options: ScopeOptions, f: DashboardFilters): { scope: DashboardScope; filters: DashboardFilters } | null {
  const years = [...options.years].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
  const year = years.find((y) => y.id === f.year) ?? years.find((y) => y.isCurrent) ?? years.at(-1)
  if (!year) return null

  const faculty = options.faculties.find((x) => x.id === f.faculty)?.id
  const program = options.programs.find((p) => p.id === f.program && (!faculty || p.facultyId === faculty))
  const klass = options.classes.find((c) => c.id === f.class && (program ? c.programId === program.id : !faculty || c.facultyId === faculty))
  const department = options.faculties.find((x) => x.id === f.dept)?.id

  const programIds = program ? [program.id] : faculty ? options.programs.filter((p) => p.facultyId === faculty).map((p) => p.id) : null
  const classIds = klass ? [klass.id] : programIds ? options.classes.filter((c) => c.programId && programIds.includes(c.programId)).map((c) => c.id) : null

  // A reversed range is read the right way round.
  let [from, to] = [f.from, f.to]
  if (from && to && from > to) [from, to] = [to, from]

  return {
    scope: {
      year: { id: year.id, name: year.name, startDate: year.startDate, endDate: year.endDate },
      trendYears: years.filter((y) => y.startDate <= year.startDate).slice(-TREND_YEARS).map((y) => ({ id: y.id, name: y.name })),
      programIds,
      classId: klass?.id ?? null,
      classProgramId: klass?.programId ?? null,
      classIds,
      // Checked against the year's examinations separately (withExamination).
      examinationId: null,
      staff: { departmentId: department ?? null, employmentType: f.emp ?? null },
      from: from ? toDate(from) : null,
      // `to` is a calendar day; include all of it.
      to: to ? new Date(toDate(to).getTime() + 86_400_000 - 1) : null,
    },
    filters: {
      year: f.year === year.id ? year.id : undefined,
      faculty,
      program: program?.id,
      class: klass?.id,
      exam: undefined,
      dept: department,
      emp: f.emp,
      from,
      to,
    },
  }
}

// Applies the examination filter once the year's examinations (those with
// published results) are known; any other id is dropped.
export function withExamination(resolved: { scope: DashboardScope; filters: DashboardFilters }, exams: { id: string }[], examId: string | undefined) {
  const exam = exams.find((e) => e.id === examId)?.id
  return { scope: { ...resolved.scope, examinationId: exam ?? null }, filters: { ...resolved.filters, exam } }
}

// ------------------------------------------------------------ reporting period

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

export type PeriodItem = { label: string; value: string }

// What the figures on the page cover, for the reporting-period line.
export function describeScope(scope: DashboardScope, filters: DashboardFilters, options: ScopeOptions, examName: string | null): PeriodItem[] {
  const name = <T extends { id: string; name: string }>(list: T[], id: string | null | undefined) => list.find((x) => x.id === id)?.name ?? "—"
  const items: PeriodItem[] = [{ label: "Academic year", value: `${scope.year.name} (${day(scope.year.startDate)} – ${day(scope.year.endDate)})` }]
  if (filters.faculty) items.push({ label: "Faculty", value: name(options.faculties, filters.faculty) })
  if (filters.program) items.push({ label: "Program", value: name(options.programs, filters.program) })
  if (filters.class) items.push({ label: "Class", value: name(options.classes, filters.class) })
  if (!filters.faculty && !filters.program && !filters.class) items.push({ label: "Programs", value: "All" })
  items.push({ label: "Examinations", value: examName ?? "All published" })
  if (scope.from || scope.to) {
    const range = scope.from && scope.to ? `${day(scope.from)} – ${day(scope.to)}` : scope.from ? `from ${day(scope.from)}` : `until ${day(scope.to!)}`
    items.push({ label: "Admissions & activity", value: range })
  }
  return items
}
