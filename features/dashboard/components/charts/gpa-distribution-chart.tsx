"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { axis, chartClass, series, TooltipRow, xTitle, yTitle } from "@/features/dashboard/components/charts/chart-theme"
import { ChartEmpty } from "@/features/dashboard/components/dashboard-ui"
import type { GpaDistribution } from "@/services/dashboard/academic-service"

const config = { students: { label: "Students", theme: series[0] } } satisfies ChartConfig

// Students per half-point GPA band (each student's latest result).
export function GpaDistributionChart({ data }: { data: GpaDistribution }) {
  if (data.students === 0) return <ChartEmpty>No published results with a GPA for these filters. GPA is recorded only when the grading scale uses grade points.</ChartEmpty>
  return (
    <div className="flex flex-col gap-2">
      <ChartContainer config={config} className={chartClass}>
        <BarChart data={data.bands} margin={{ left: 8, right: 8, top: 8, bottom: 12 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          {/* Band starts on the axis (they fit on a phone); the tooltip names the full band. */}
          <XAxis dataKey="band" {...axis} interval={0} tickFormatter={(band: string) => band.split("–")[0]} label={xTitle("GPA (band start)")} />
          <YAxis {...axis} allowDecimals={false} width={48} label={yTitle("Students")} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) => `GPA ${label}`}
                formatter={(value, _, item) => <TooltipRow name="Students" value={`${Number(value).toLocaleString()} · ${Math.round((Number(value) / data.students) * 1000) / 10}%`} color={item.color} />}
              />
            }
          />
          <Bar dataKey="students" fill="var(--color-students)" maxBarSize={40} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        {data.students.toLocaleString()} students · average GPA {data.average?.toFixed(2) ?? "—"}. CGPA isn&apos;t stored, so only examination GPA is shown.
        {data.outOfScale && " Some GPAs are above 4.0 and are counted in the top band."}
      </p>
    </div>
  )
}
