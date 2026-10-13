"use client"

import { Progress } from "@/components/ui/progress"
import { GenderStackedBars } from "@/features/dashboard/components/charts/gender-bars"
import { ChartEmpty } from "@/features/dashboard/components/dashboard-ui"
import { CASTE_ETHNICITY_LABELS } from "@/features/students/constants"
import type { StudentOverview } from "@/services/dashboard/overview-service"

// Inclusion charts (EMIS section 6): enrollment by caste/ethnicity and the
// equity groups. "Not recorded" is always shown as such, never folded into
// a group.

const casteLabel = (key: StudentOverview["byCaste"][number]["key"]) => (key === "UNRECORDED" ? "Not recorded" : CASTE_ETHNICITY_LABELS[key])

export function CasteEthnicityChart({ rows }: { rows: StudentOverview["byCaste"] }) {
  const total = rows.reduce((n, r) => n + r.total, 0)
  if (total === 0) return <ChartEmpty>No students enrolled for these filters.</ChartEmpty>
  const unrecorded = rows.find((r) => r.key === "UNRECORDED")?.total ?? 0
  if (unrecorded === total) return <ChartEmpty>No caste/ethnicity is recorded for these students yet. Add it under each student&apos;s background details.</ChartEmpty>
  return (
    <div className="flex flex-col gap-2">
      <GenderStackedBars rows={rows.map((r) => ({ ...r, label: casteLabel(r.key) }))} unit="students" />
      {unrecorded > 0 && (
        <p className="text-xs text-muted-foreground">
          {unrecorded.toLocaleString()} of {total.toLocaleString()} students ({Math.round((unrecorded / total) * 1000) / 10}%) have no caste/ethnicity recorded.
        </p>
      )}
    </div>
  )
}

// Share of students in each equity group, out of those with it recorded.
export function EquityGroups({ data }: { data: StudentOverview["equity"] }) {
  if (data.students === 0) return <ChartEmpty>No students enrolled for these filters.</ChartEmpty>
  return (
    <ul className="flex flex-col gap-4">
      {data.groups.map((g) => (
        <li key={g.key} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{g.label}</span>
            <span className="font-semibold tabular-nums">
              {g.share === null ? "—" : `${g.students.toLocaleString()} · ${g.share}%`}
            </span>
          </div>
          {g.share !== null && <Progress value={g.share} aria-label={`${g.label}: ${g.share}% of recorded students`} />}
          <span className="text-xs text-muted-foreground">
            {g.recorded === 0 ? "Not recorded for any student yet" : `Recorded for ${g.recorded.toLocaleString()} of ${data.students.toLocaleString()} students`}
          </span>
        </li>
      ))}
    </ul>
  )
}
