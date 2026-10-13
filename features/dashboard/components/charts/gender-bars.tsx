"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { axis, GENDER_KEYS, genderConfig, xTitle } from "@/features/dashboard/components/charts/chart-theme"

// Horizontal bars per group, stacked by gender (caste/ethnicity, academic
// rank, …). `unit` is the plural noun for the tooltip and axis.
export function GenderStackedBars({
  rows,
  unit,
}: {
  rows: { label: string; female: number; male: number; other: number; unrecorded: number; total: number }[]
  unit: string
}) {
  const keys = GENDER_KEYS.filter((k) => rows.some((r) => r[k] > 0))
  return (
    <ChartContainer config={genderConfig} className="aspect-auto w-full" style={{ height: Math.max(256, rows.length * 34 + 72) }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16, bottom: 12 }} accessibilityLayer>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" {...axis} allowDecimals={false} label={xTitle(unit[0].toUpperCase() + unit.slice(1))} />
        <YAxis type="category" dataKey="label" {...axis} width={132} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => `${p?.[0]?.payload?.label} · ${p?.[0]?.payload?.total?.toLocaleString()} ${unit}`} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {keys.map((key, i) => (
          <Bar key={key} dataKey={key} stackId="g" fill={`var(--color-${key})`} stroke="var(--card)" strokeWidth={1} maxBarSize={20} radius={i === keys.length - 1 ? [0, 4, 4, 0] : 0} />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
