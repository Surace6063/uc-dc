"use client"

import { genderConfig, GENDER_KEYS } from "@/features/dashboard/components/charts/chart-theme"
import { DoughnutChart } from "@/features/dashboard/components/charts/doughnut-chart"
import { ChartEmpty } from "@/features/dashboard/components/dashboard-ui"
import { genderParityIndex, shares } from "@/features/dashboard/calculations"
import type { StudentOverview } from "@/services/dashboard/overview-service"

// Doughnut of enrolled students by recorded gender, with counts, shares and
// the Gender Parity Index. "Not recorded" is its own slice, never guessed.
export function GenderChart({ gender }: { gender: StudentOverview["gender"] }) {
  const slices = shares(Object.fromEntries(GENDER_KEYS.map((k) => [k, gender[k]])) as Record<(typeof GENDER_KEYS)[number], number>)
  if (slices.length === 0) return <ChartEmpty>No students enrolled for these filters.</ChartEmpty>
  const gpi = genderParityIndex(gender.female, gender.male)

  return (
    <div className="flex flex-col gap-3">
      <DoughnutChart
        slices={slices.map((s) => ({ ...s, label: String(genderConfig[s.key].label) }))}
        config={genderConfig}
        unit="students"
        listLabel="Students by gender"
      />
      <dl className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
        <dt className="text-muted-foreground">Gender Parity Index (female ÷ male)</dt>
        <dd className="font-semibold tabular-nums">{gpi === null ? "—" : gpi.toFixed(2)}</dd>
      </dl>
    </div>
  )
}
