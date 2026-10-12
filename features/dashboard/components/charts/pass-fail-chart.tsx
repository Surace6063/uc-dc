"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { axis, chartClass, series, TooltipRow, yTitle } from "@/features/dashboard/components/charts/chart-theme"
import { ChartEmpty } from "@/features/dashboard/components/dashboard-ui"
import type { PassFail } from "@/services/dashboard/academic-service"

const config = {
  passed: { label: "Passed", theme: series[2] },
  failed: { label: "Failed", theme: series[1] },
  absent: { label: "Absent", theme: series[3] },
} satisfies ChartConfig
const KEYS = ["passed", "failed", "absent"] as const

// Passed, failed and absent students per program (each student once).
export function PassFailChart({ data }: { data: PassFail }) {
  const { total } = data
  if (total.passed + total.failed + total.absent === 0) return <ChartEmpty>No published results for these filters.</ChartEmpty>
  const keys = KEYS.filter((k) => k !== "absent" || total.absent > 0)
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {[
          { label: "Passed", value: total.passed.toLocaleString() },
          { label: "Failed / absent", value: (total.failed + total.absent).toLocaleString() },
          { label: "Pass rate", value: total.passRate === null ? "—" : `${total.passRate.toFixed(1)}%` },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-muted/40 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      <ChartContainer config={config} className={chartClass}>
        <BarChart data={data.byProgram} margin={{ left: 8, right: 8, top: 8 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} allowDecimals={false} width={48} label={yTitle("Students")} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, p) => {
                  const row = p?.[0]?.payload
                  return row ? `${row.name}${row.passRate === null ? "" : ` · ${row.passRate.toFixed(1)}% passed`}` : ""
                }}
                formatter={(value, name, item) => <TooltipRow name={config[name as keyof typeof config]?.label ?? name} value={Number(value).toLocaleString()} color={item.color} />}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {keys.map((key) => (
            <Bar key={key} dataKey={key} fill={`var(--color-${key})`} maxBarSize={36} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  )
}
