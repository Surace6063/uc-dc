"use client"

import { FilterSelect, labelOptions } from "@/components/shared/filter-controls"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RESULT_STATUS_LABELS } from "@/features/exams/constants"
import { REPORT_DEPENDENTS, type ReportFilters } from "@/features/exams/filters"
import { useUrlFilters } from "@/hooks/use-url-filters"

type Option = { id: string; name: string }

export function AnalyticsFilters({
  filters,
  options,
}: {
  filters: ReportFilters & { year: string }
  options: {
    years: Option[]
    exams: Option[]
    levels: Option[]
    programs: (Option & { educationLevelId: string })[]
    classes: (Option & { educationLevelId: string; programId: string | null })[]
    sections: (Option & { classId: string })[]
    subjects: Option[]
  }
}) {
  const { setParams } = useUrlFilters(REPORT_DEPENDENTS)
  const o = (list: Option[]) => list.map((x) => ({ value: x.id, label: x.name }))
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 print:hidden">
      <FilterSelect label="Academic year" value={filters.year} onChange={(v) => setParams({ year: v })} options={o(options.years)} allLabel="Current year" />
      <FilterSelect label="Examination" value={filters.exam} onChange={(v) => setParams({ exam: v })} options={o(options.exams)} allLabel="All examinations" />
      <FilterSelect label="Level" value={filters.level} onChange={(v) => setParams({ level: v })} options={o(options.levels)} />
      <FilterSelect label="Program" value={filters.program} onChange={(v) => setParams({ program: v })} options={o(options.programs.filter((p) => !filters.level || p.educationLevelId === filters.level))} />
      <FilterSelect label="Class" value={filters.class} onChange={(v) => setParams({ class: v })} options={o(options.classes.filter((c) => (!filters.level || c.educationLevelId === filters.level) && (!filters.program || c.programId === filters.program)))} />
      <FilterSelect label="Section" value={filters.section} onChange={(v) => setParams({ section: v })} options={o(options.sections.filter((s) => s.classId === filters.class))} disabled={!filters.class} />
      <FilterSelect label="Subject" value={filters.subject} onChange={(v) => setParams({ subject: v })} options={o(options.subjects)} />
      <FilterSelect label="Result" value={filters.status} onChange={(v) => setParams({ status: v })} options={labelOptions(RESULT_STATUS_LABELS).filter((x) => x.value !== "NOT_TAKEN")} />
      <div className="grid gap-1.5">
        <Label htmlFor="support-threshold" className="text-xs text-muted-foreground">Support below %</Label>
        <Input id="support-threshold" type="number" min={0} max={100} defaultValue={filters.support} onBlur={(e) => setParams({ support: e.target.value || null })} className="h-8" />
      </div>
    </div>
  )
}
