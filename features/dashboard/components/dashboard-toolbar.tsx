"use client"

import { RotateCwIcon } from "lucide-react"

import { FilterChips, FilterSelect, labelOptions } from "@/components/shared/filter-controls"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DASHBOARD_DEPENDENTS, type DashboardFilters } from "@/features/dashboard/filters"
import { EMPLOYMENT_TYPE_LABELS } from "@/features/teachers/constants"
import { useUrlFilters } from "@/hooks/use-url-filters"
import { cn } from "@/lib/utils"

type Option = { id: string; name: string }

// Re-runs every server query on the page without losing the filters.
export function RefreshButton() {
  const { refresh, pending } = useUrlFilters()
  return (
    <Button variant="outline" onClick={refresh} disabled={pending}>
      <RotateCwIcon data-icon="inline-start" className={cn(pending && "animate-spin")} />
      {pending ? "Refreshing…" : "Refresh"}
    </Button>
  )
}

export function RetryButton() {
  const { refresh, pending } = useUrlFilters()
  return (
    <Button variant="outline" size="sm" onClick={refresh} disabled={pending}>
      <RotateCwIcon data-icon="inline-start" className={cn(pending && "animate-spin")} />
      Try again
    </Button>
  )
}

function DateField({ id, label, value, min, max, onChange }: { id: string; label: string; value?: string; min?: string; max?: string; onChange: (v: string | null) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input id={id} type="date" value={value ?? ""} min={min} max={max} onChange={(e) => onChange(e.target.value || null)} className="h-8" />
    </div>
  )
}

export function DashboardToolbar({
  filters,
  selectedYearId,
  yearRange,
  options,
}: {
  filters: DashboardFilters
  // The year actually shown (the URL's, else the current one).
  selectedYearId: string | null
  yearRange: { from: string; to: string } | null
  options: {
    years: (Option & { isCurrent: boolean })[]
    faculties: Option[]
    programs: (Option & { facultyId: string | null })[]
    classes: (Option & { programId: string | null; facultyId: string | null })[]
    exams: Option[]
  }
}) {
  const { setParams, pending } = useUrlFilters(DASHBOARD_DEPENDENTS)
  const o = (list: Option[]) => list.map((x) => ({ value: x.id, label: x.name }))
  const programs = options.programs.filter((p) => !filters.faculty || p.facultyId === filters.faculty)
  const classes = options.classes.filter((c) => (filters.program ? c.programId === filters.program : !filters.faculty || c.facultyId === filters.faculty))
  const yearLabel = (y: Option & { isCurrent: boolean }) => ({ value: y.id, label: y.isCurrent ? `${y.name} (current)` : y.name })

  const chips = [
    filters.faculty && { key: "faculty", label: `Faculty: ${options.faculties.find((f) => f.id === filters.faculty)?.name ?? "—"}` },
    filters.program && { key: "program", label: `Program: ${options.programs.find((p) => p.id === filters.program)?.name ?? "—"}` },
    filters.class && { key: "class", label: `Class: ${options.classes.find((c) => c.id === filters.class)?.name ?? "—"}` },
    filters.exam && { key: "exam", label: `Exam: ${options.exams.find((e) => e.id === filters.exam)?.name ?? "—"}` },
    (filters.from || filters.to) && { key: "dates", label: `Dates: ${filters.from ?? "start"} – ${filters.to ?? "end"}` },
  ].filter((c): c is { key: string; label: string } => !!c)

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4 transition-opacity", pending && "opacity-70")} aria-busy={pending}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-7">
        <FilterSelect
          label="Academic year"
          value={filters.year ?? selectedYearId ?? undefined}
          onChange={(v) => setParams({ year: v })}
          options={options.years.map(yearLabel)}
          allLabel="Current year"
          disabled={options.years.length === 0}
        />
        <FilterSelect label="Faculty / school" value={filters.faculty} onChange={(v) => setParams({ faculty: v })} options={o(options.faculties)} allLabel="All faculties" disabled={options.faculties.length === 0} />
        <FilterSelect label="Program" value={filters.program} onChange={(v) => setParams({ program: v })} options={o(programs)} allLabel="All programs" disabled={programs.length === 0} />
        <FilterSelect label="Semester / class" value={filters.class} onChange={(v) => setParams({ class: v })} options={o(classes)} allLabel="All classes" disabled={classes.length === 0} />
        <FilterSelect label="Examination" value={filters.exam} onChange={(v) => setParams({ exam: v })} options={o(options.exams)} allLabel="Whole year" disabled={options.exams.length === 0} />
        <DateField id="dashboard-from" label="From" value={filters.from} min={yearRange?.from} max={filters.to ?? yearRange?.to} onChange={(v) => setParams({ from: v })} />
        <DateField id="dashboard-to" label="To" value={filters.to} min={filters.from ?? yearRange?.from} max={yearRange?.to} onChange={(v) => setParams({ to: v })} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Examination narrows the pass vs fail and GPA charts; dates narrow new admissions and recent activity. Everything else covers the academic year.</p>
        <FilterChips
          chips={chips}
          onRemove={(key) => setParams(key === "dates" ? { from: null, to: null } : { [key]: null })}
          onClear={() => setParams({ faculty: null, program: null, class: null, exam: null, from: null, to: null })}
        />
      </div>
    </div>
  )
}

// Filters for the faculty profile charts (designation, qualification).
export function FacultyProfileFilters({ filters, departments }: { filters: DashboardFilters; departments: Option[] }) {
  const { setParams, pending } = useUrlFilters()
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:max-w-xl", pending && "opacity-70")} aria-busy={pending}>
      <FilterSelect label="Teacher's department" value={filters.dept} onChange={(v) => setParams({ dept: v })} options={departments.map((d) => ({ value: d.id, label: d.name }))} allLabel="All departments" disabled={departments.length === 0} />
      <FilterSelect label="Employment type" value={filters.emp} onChange={(v) => setParams({ emp: v })} options={labelOptions(EMPLOYMENT_TYPE_LABELS)} allLabel="All types" />
    </div>
  )
}
