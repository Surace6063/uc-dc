"use client"

import * as React from "react"

import { FilterChips, FilterSelect, labelOptions, SearchBox } from "@/components/shared/filter-controls"
import { useCan } from "@/components/shared/session-provider"
import {
  INVITATION_STATE_LABELS,
  PORTAL_STATUS_LABELS,
  RELATIONSHIP_LABELS,
} from "@/features/guardians/constants"
import { GUARDIAN_FILTER_KEYS, type GuardianFilters } from "@/features/guardians/filters"

type SetParams = (updates: Record<string, string | null>, options?: { resetPage?: boolean }) => void
type FilterKey = (typeof GUARDIAN_FILTER_KEYS)[number]

const CHILDREN_LABELS = { "0": "No linked students", "1": "One student", "2+": "Two or more" } as const

function chipLabel(key: FilterKey, f: GuardianFilters, studentLabel: string | null): string | null {
  switch (key) {
    case "relationship": return f.relationship ? `Relationship: ${RELATIONSHIP_LABELS[f.relationship]}` : null
    case "portal": return f.portal.length ? `Portal: ${f.portal.map((p) => PORTAL_STATUS_LABELS[p]).join(", ")}` : null
    case "invitation": return f.invitation ? `Invitation: ${INVITATION_STATE_LABELS[f.invitation]}` : null
    case "children": return f.children ? `Students: ${CHILDREN_LABELS[f.children]}` : null
    case "primary": return f.primary ? (f.primary === "yes" ? "Primary contact" : "Not a primary contact") : null
    case "email": return f.email ? (f.email === "has" ? "Has email" : "No email") : null
    case "student": return f.student ? `Guardians of ${studentLabel ?? "one student"}` : null
  }
}

export function GuardianFilterToolbar({
  filters,
  setParams,
  studentLabel,
}: {
  filters: GuardianFilters
  setParams: SetParams
  studentLabel: string | null
}) {
  const set = (key: string) => (value: string | null) => setParams({ [key]: value })
  const onSearch = React.useCallback((q: string | null) => setParams({ q }), [setParams])
  const canSeeStudents = useCan("students.view")
  const chips = GUARDIAN_FILTER_KEYS.map((key) => ({ key, label: chipLabel(key, filters, studentLabel) })).filter(
    (c): c is { key: FilterKey; label: string } => c.label !== null
  )

  return (
    <div className="flex flex-col gap-3 border-b p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <SearchBox
          value={filters.q ?? ""}
          onSearch={onSearch}
          placeholder={canSeeStudents ? "Name, guardian ID, phone, email, student…" : "Name, guardian ID, phone, email…"}
          label="Search guardians"
        />
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <FilterSelect label="Relationship" value={filters.relationship} onChange={set("relationship")} allLabel="Any" options={labelOptions(RELATIONSHIP_LABELS)} />
          <FilterSelect label="Portal access" value={filters.portal[0]} onChange={set("portal")} allLabel="Any" options={labelOptions(PORTAL_STATUS_LABELS)} />
          <FilterSelect label="Invitation" value={filters.invitation} onChange={set("invitation")} allLabel="Any" options={labelOptions(INVITATION_STATE_LABELS)} />
          <FilterSelect label="Linked students" value={filters.children} onChange={set("children")} allLabel="Any" options={labelOptions(CHILDREN_LABELS)} />
          <FilterSelect label="Primary contact" value={filters.primary} onChange={set("primary")} allLabel="Any"
            options={[{ value: "yes", label: "Primary for a student" }, { value: "no", label: "Not primary" }]} />
          <FilterSelect label="Email" value={filters.email} onChange={set("email")} allLabel="Any"
            options={[{ value: "has", label: "Has email" }, { value: "missing", label: "No email" }]} />
        </div>
      </div>
      <FilterChips
        chips={chips}
        onRemove={(key) => setParams({ [key]: null })}
        onClear={() => setParams(Object.fromEntries(GUARDIAN_FILTER_KEYS.map((k) => [k, null])))}
      />
    </div>
  )
}
