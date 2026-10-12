"use client"

import { Cell, Label, Pie, PieChart } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { TooltipRow } from "@/features/dashboard/components/charts/chart-theme"

export type Slice = { key: string; label: string; count: number; share: number }

// A doughnut with the total in the middle and a legend list of counts and
// shares beside it (below it on narrow cards). Shared by the gender and
// qualification charts; slices are passed already counted and sorted.
export function DoughnutChart({ slices, config, unit, listLabel }: { slices: Slice[]; config: ChartConfig; unit: string; listLabel: string }) {
  const total = slices.reduce((n, s) => n + s.count, 0)
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <ChartContainer config={config} className="mx-auto aspect-square h-52 max-w-full">
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(_, __, item) => <TooltipRow name={item.payload.label} value={`${item.payload.count.toLocaleString()} · ${item.payload.share}%`} color={item.payload.fill} />}
              />
            }
          />
          <Pie data={slices} dataKey="count" nameKey="key" innerRadius="58%" outerRadius="90%" paddingAngle={slices.length > 1 ? 2 : 0} strokeWidth={0}>
            {slices.map((s) => (
              <Cell key={s.key} fill={`var(--color-${s.key})`} />
            ))}
            <Label
              content={({ viewBox }) =>
                viewBox && "cx" in viewBox ? (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold">{total.toLocaleString()}</tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">{unit}</tspan>
                  </text>
                ) : null
              }
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="grid gap-1.5 text-sm" aria-label={listLabel}>
        {slices.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: `var(--color-${s.key})` }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {s.count.toLocaleString()} <span className="text-muted-foreground">· {s.share}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
