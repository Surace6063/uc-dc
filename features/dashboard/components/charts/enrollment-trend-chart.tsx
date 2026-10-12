"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { axis, chartClass, MissingYears, series, TooltipRow, yTitle } from "@/features/dashboard/components/charts/chart-theme"
import { ChartEmpty } from "@/features/dashboard/components/dashboard-ui"
import type { StudentOverview } from "@/services/dashboard/overview-service"

const config = {
  students: { label: "Enrolled students", theme: series[0] },
  admissions: { label: "New admissions", theme: series[2] },
} satisfies ChartConfig

// Enrolled students and new admissions per academic year (up to five years,
// ending with the selected one). Years without records are gaps.
export function EnrollmentTrendChart({ trend }: { trend: StudentOverview["trend"] }) {
  if (!trend.some((y) => y.hasData)) return <ChartEmpty>No enrollments recorded for these academic years.</ChartEmpty>
  return (
    <div className="flex flex-col gap-2">
      <ChartContainer config={config} className={chartClass}>
        <LineChart data={trend} margin={{ left: 8, right: 12, top: 8 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="year" {...axis} />
          <YAxis {...axis} allowDecimals={false} width={48} label={yTitle("Students")} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name, item) => (
                  <TooltipRow name={config[name as keyof typeof config]?.label ?? name} value={value == null ? "No records" : Number(value).toLocaleString()} color={item.color} />
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Line dataKey="students" type="monotone" stroke="var(--color-students)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          <Line dataKey="admissions" type="monotone" stroke="var(--color-admissions)" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ChartContainer>
      <MissingYears rows={trend} what="enrollments" />
    </div>
  )
}
