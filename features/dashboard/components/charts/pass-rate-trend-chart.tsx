"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { axis, chartClass, MissingYears, percentTick, series, TooltipRow, yTitle } from "@/features/dashboard/components/charts/chart-theme"
import { ChartEmpty } from "@/features/dashboard/components/dashboard-ui"
import type { PassRateTrend } from "@/services/dashboard/academic-service"

const config = { passRate: { label: "Pass rate", theme: series[0] } } satisfies ChartConfig

// Student-level pass rate per academic year. University and national
// averages are not drawn: no verified benchmark figures are recorded.
export function PassRateTrendChart({ trend }: { trend: PassRateTrend }) {
  if (!trend.some((y) => y.hasData)) return <ChartEmpty>No published results for these academic years.</ChartEmpty>
  return (
    <div className="flex flex-col gap-2">
      <ChartContainer config={config} className={chartClass}>
        <LineChart data={trend} margin={{ left: 8, right: 12, top: 8 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="year" {...axis} />
          <YAxis {...axis} domain={[0, 100]} tickFormatter={percentTick} width={52} label={yTitle("Pass rate")} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, _, item) => (
                  <div className="grid w-full gap-1">
                    <TooltipRow name="Pass rate" value={value == null ? "No results" : `${value}%`} color={item.color} />
                    {item.payload.students != null && <TooltipRow name="Students" value={Number(item.payload.students).toLocaleString()} />}
                  </div>
                )}
              />
            }
          />
          <Line dataKey="passRate" type="monotone" stroke="var(--color-passRate)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ChartContainer>
      <MissingYears rows={trend} what="published results" />
      <p className="text-xs text-muted-foreground">University and national averages aren&apos;t shown: no verified benchmark figures are recorded.</p>
    </div>
  )
}
