"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { axis, GENDER_KEYS, genderConfig, xTitle } from "@/features/dashboard/components/charts/chart-theme"
import { ChartEmpty } from "@/features/dashboard/components/dashboard-ui"
import type { StudentOverview } from "@/services/dashboard/overview-service"

// Enrolled students per program, stacked by gender. Only gender categories
// that occur are drawn, so the legend has no empty entries.
export function StudentsByProgramChart({ rows }: { rows: StudentOverview["byProgram"] }) {
  if (rows.length === 0) return <ChartEmpty>No students enrolled for these filters.</ChartEmpty>
  const keys = GENDER_KEYS.filter((k) => rows.some((r) => r[k] > 0))
  return (
    <ChartContainer config={genderConfig} className="aspect-auto w-full" style={{ height: Math.max(256, rows.length * 36 + 72) }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16, bottom: 12 }} accessibilityLayer>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" {...axis} allowDecimals={false} label={xTitle("Students")} />
        <YAxis type="category" dataKey="program" {...axis} width={88} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => `${p?.[0]?.payload?.name} · ${p?.[0]?.payload?.total?.toLocaleString()} students`} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {keys.map((key, i) => (
          <Bar key={key} dataKey={key} stackId="g" fill={`var(--color-${key})`} stroke="var(--card)" strokeWidth={1} maxBarSize={22} radius={i === keys.length - 1 ? [0, 4, 4, 0] : 0} />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
