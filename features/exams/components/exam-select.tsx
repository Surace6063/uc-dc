"use client"

import { FilterSelect } from "@/components/shared/filter-controls"
import { useUrlFilters } from "@/hooks/use-url-filters"

// An examination picker that keeps its choice in the URL (?exam=).
export function ExamSelect({ exams, value, label = "Examination" }: { exams: { id: string; name: string }[]; value: string | undefined; label?: string }) {
  const { setParams } = useUrlFilters()
  return (
    <div className="max-w-md">
      <FilterSelect label={label} value={value} allLabel="Choose an examination" onChange={(v) => setParams({ exam: v })} options={exams.map((e) => ({ value: e.id, label: e.name }))} />
    </div>
  )
}
