"use client"

import { FilterChips, FilterSelect, SearchBox } from "@/components/shared/filter-controls"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TEACHING_DEPENDENTS } from "@/features/teaching/filters"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { TeachingOptions } from "@/services/teaching/options-service"

// Search and class / section / subject filters (plus list-specific ones)
// for teaching lists. Everything lives in the URL and is applied on the
// server; the academic year comes from the header's year selector.

export type ExtraFilter = { key: string; label: string; value: string | undefined; options: { value: string; label: string }[] }

export function useTeachingFilters() {
  return useUrlFilters(TEACHING_DEPENDENTS)
}

export function TeachingToolbar({
  options,
  filters,
  extra = [],
  dates,
  searchPlaceholder,
  actions,
}: {
  options: TeachingOptions
  filters: { q?: string; class?: string; section?: string; subject?: string; from?: string; to?: string }
  extra?: ExtraFilter[]
  dates?: { from: string; to: string }
  searchPlaceholder: string
  actions?: React.ReactNode
}) {
  const { setParams } = useTeachingFilters()
  const cls = options.classes.find((c) => c.id === filters.class)
  const chips = [
    filters.q && { key: "q", label: `“${filters.q}”` },
    filters.class && { key: "class", label: cls?.name ?? "Class" },
    filters.section && { key: "section", label: `Section ${cls?.sections.find((s) => s.id === filters.section)?.name ?? ""}` },
    filters.subject && { key: "subject", label: options.subjects.find((s) => s.id === filters.subject)?.name ?? "Subject" },
    ...extra.filter((e) => e.value).map((e) => ({ key: e.key, label: e.options.find((o) => o.value === e.value)?.label ?? e.label })),
    filters.from && { key: "from", label: `From ${filters.from}` },
    filters.to && { key: "to", label: `To ${filters.to}` },
  ].filter((c): c is { key: string; label: string } => !!c)

  return (
    <div className="flex flex-col gap-3 border-b p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchBox value={filters.q ?? ""} onSearch={(q) => setParams({ q })} placeholder={searchPlaceholder} label={searchPlaceholder} />
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <FilterSelect label="Class" value={filters.class} onChange={(v) => setParams({ class: v })} options={options.classes.map((c) => ({ value: c.id, label: c.name }))} />
        <FilterSelect label="Section" value={filters.section} disabled={!cls || cls.sections.length === 0} onChange={(v) => setParams({ section: v })} options={(cls?.sections ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        <FilterSelect label="Subject" value={filters.subject} onChange={(v) => setParams({ subject: v })} options={options.subjects.map((s) => ({ value: s.id, label: s.name }))} />
        {extra.map((e) => (
          <FilterSelect key={e.key} label={e.label} value={e.value} onChange={(v) => setParams({ [e.key]: v })} options={e.options} />
        ))}
        {dates && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="tf-from" className="text-xs text-muted-foreground">{dates.from}</Label>
              <Input id="tf-from" type="date" value={filters.from ?? ""} onChange={(e) => setParams({ from: e.target.value || null })} className="h-8" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tf-to" className="text-xs text-muted-foreground">{dates.to}</Label>
              <Input id="tf-to" type="date" value={filters.to ?? ""} onChange={(e) => setParams({ to: e.target.value || null })} className="h-8" />
            </div>
          </>
        )}
      </div>
      {chips.length > 0 && <FilterChips chips={chips} onRemove={(key) => setParams({ [key]: null })} onClear={() => setParams(Object.fromEntries(chips.map((c) => [c.key, null])))} />}
    </div>
  )
}
