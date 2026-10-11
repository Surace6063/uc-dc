"use client"

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Card } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { DashboardStats } from "@/services/attendance/report-service"

// Same categorical slots as the main dashboard charts (validated for
// colour-blind separation), in fixed order.
const series = [
  { light: "#2a78d6", dark: "#3987e5" },
  { light: "#eb6834", dark: "#d95926" },
  { light: "#1baf7a", dark: "#199e70" },
  { light: "#eda100", dark: "#c98500" },
]

const countsConfig = {
  present: { label: "Present", theme: series[0] },
  absent: { label: "Absent", theme: series[1] },
  late: { label: "Late", theme: series[3] },
} satisfies ChartConfig

const percentConfig = { percentage: { label: "Attendance %", color: "var(--primary)" } } satisfies ChartConfig

const axis = { tickLine: false, axisLine: false, tickMargin: 8 } as const
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="gap-4 p-5">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </Card>
  )
}

export function AttendanceCharts({ stats }: { stats: DashboardStats }) {
  const trend = stats.trend.map((d) => ({ ...d, day: shortDay(d.date) }))
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartCard title="Daily attendance, last 30 days" description="Percentage of marked students who attended, by day. Days without registers are left out.">
        {trend.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No submitted registers in the last 30 days.</p>
        ) : (
          <ChartContainer config={percentConfig} className="aspect-auto h-64 w-full">
            <LineChart data={trend} margin={{ left: -12, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" {...axis} minTickGap={24} />
              <YAxis {...axis} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line dataKey="percentage" type="monotone" stroke="var(--color-percentage)" strokeWidth={2} dot={trend.length < 12 ? { r: 4 } : false} activeDot={{ r: 5 }} />
            </LineChart>
          </ChartContainer>
        )}
      </ChartCard>
      <ChartCard title="Present, late and absent" description="Marked students per day (submitted registers).">
        {trend.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No submitted registers in the last 30 days.</p>
        ) : (
          <ChartContainer config={countsConfig} className="aspect-auto h-64 w-full">
            <BarChart data={trend} margin={{ left: -12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" {...axis} minTickGap={24} />
              <YAxis {...axis} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {(Object.keys(countsConfig) as (keyof typeof countsConfig)[]).map((key, i, keys) => (
                <Bar key={key} dataKey={key} stackId="a" fill={`var(--color-${key})`} stroke="var(--card)" strokeWidth={2} maxBarSize={24} radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0} />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </ChartCard>
      {stats.byClass.length > 0 && (
        <ChartCard title="Today by class" description="Attendance percentage of students marked today in each class.">
          <ChartContainer config={percentConfig} className="aspect-auto w-full" style={{ height: Math.max(160, stats.byClass.length * 32 + 40) }}>
            <BarChart data={stats.byClass} layout="vertical" margin={{ left: 0, right: 16 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" {...axis} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" {...axis} width={96} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="percentage" fill="var(--color-percentage)" maxBarSize={20} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      )}
    </div>
  )
}
