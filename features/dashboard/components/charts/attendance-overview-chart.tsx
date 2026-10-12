"use client"

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Badge } from "@/components/ui/badge"
import { axis, chartClass, percentTick, series, TooltipRow, yTitle } from "@/features/dashboard/components/charts/chart-theme"
import { ChartEmpty } from "@/features/dashboard/components/dashboard-ui"
import type { AttendanceOverview } from "@/services/dashboard/academic-service"

const config = {
  percentage: { label: "Attendance", theme: series[0] },
  short: { label: "Below minimum", theme: series[1] },
} satisfies ChartConfig

// Attendance % per program or class/semester against the policy minimum,
// with the students below it (a shortage) and close to it.
export function AttendanceOverviewChart({ data }: { data: AttendanceOverview }) {
  const rows = data.rows.filter((r) => r.percentage !== null)
  if (rows.length === 0) return <ChartEmpty>No submitted attendance registers for these filters.</ChartEmpty>
  const min = data.minimumPercentage
  const shortages = data.rows.filter((r) => r.below > 0 || r.approaching > 0)
  const unit = data.groupBy === "class" ? "Class / semester" : "Program"

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ChartContainer config={config} className={chartClass}>
        <BarChart data={rows} margin={{ left: 8, right: 8, top: 16 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} domain={[0, 100]} tickFormatter={percentTick} width={52} label={yTitle("Attendance")} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(_, p) => p?.[0]?.payload?.name}
                formatter={(value, _, item) => (
                  <div className="grid w-full gap-1">
                    <TooltipRow name="Attendance" value={`${value}%`} />
                    <TooltipRow name="Students" value={item.payload.students.toLocaleString()} />
                    <TooltipRow name={`Below ${min}%`} value={item.payload.below.toLocaleString()} />
                  </div>
                )}
              />
            }
          />
          <ReferenceLine y={min} stroke="var(--color-short)" strokeDasharray="4 4" label={{ value: `Minimum ${min}%`, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} />
          <Bar dataKey="percentage" maxBarSize={40} radius={[4, 4, 0, 0]}>
            {rows.map((r) => (
              <Cell key={r.key} fill={r.percentage! < min ? "var(--color-short)" : "var(--color-percentage)"} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>

      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Shortages by {unit.toLowerCase()}</p>
        {shortages.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No students below or near the {min}% minimum.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {shortages.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate" title={r.name}>{r.name}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {r.below > 0 && <Badge variant="destructive" className="tabular-nums">{r.below} below</Badge>}
                  {r.approaching > 0 && <Badge variant="secondary" className="tabular-nums">{r.approaching} near</Badge>}
                  <span className="text-xs text-muted-foreground tabular-nums">of {r.students}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Below = under {min}%; near = within {data.warningMarginPercentage} points of it (attendance policy).
        </p>
      </div>
    </div>
  )
}
