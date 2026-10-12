import type { ChartConfig } from "@/components/ui/chart"
import { CHART_HEIGHT } from "@/features/dashboard/components/dashboard-ui"
import type { GenderKey } from "@/services/dashboard/overview-service"
import { cn } from "@/lib/utils"

// Shared look of the dashboard charts: palette, axes, axis titles and
// tooltip rows, so every chart reads the same way.

// Same categorical slots as the attendance charts (validated for
// colour-blind separation), in fixed order, plus a neutral for "unknown".
export const series = [
  { light: "#2a78d6", dark: "#3987e5" }, // blue
  { light: "#eb6834", dark: "#d95926" }, // orange
  { light: "#1baf7a", dark: "#199e70" }, // aqua
  { light: "#eda100", dark: "#c98500" }, // yellow
] as const
export const neutral = { light: "#a3a3a3", dark: "#737373" }

export const axis = { tickLine: false, axisLine: false, tickMargin: 8, fontSize: 12 } as const
export const chartClass = cn(CHART_HEIGHT, "aspect-auto w-full")
export const percentTick = (v: number) => `${v}%`

const axisTitleStyle = { fill: "var(--muted-foreground)", fontSize: 12, textAnchor: "middle" } as const
export const yTitle = (value: string) => ({ value, angle: -90, position: "insideLeft" as const, offset: 12, style: axisTitleStyle })
export const xTitle = (value: string) => ({ value, position: "insideBottom" as const, offset: -4, style: axisTitleStyle })

// A tooltip line: series name and its value, e.g. "Pass rate  82.5%".
export function TooltipRow({ name, value, color }: { name: React.ReactNode; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {color && <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />}
        {name}
      </span>
      <span className="font-mono font-medium text-foreground tabular-nums">{value}</span>
    </div>
  )
}

export const genderConfig = {
  female: { label: "Female", theme: series[0] },
  male: { label: "Male", theme: series[1] },
  other: { label: "Other", theme: series[2] },
  unrecorded: { label: "Not recorded", theme: neutral },
} satisfies ChartConfig
export const GENDER_KEYS = Object.keys(genderConfig) as GenderKey[]

// Years in a trend that had no records, for the note under a chart.
export function MissingYears({ rows, what }: { rows: { year: string; hasData: boolean }[]; what: string }) {
  const missing = rows.filter((r) => !r.hasData).map((r) => r.year)
  if (missing.length === 0) return null
  return <p className="text-xs text-muted-foreground">No {what} recorded for {missing.join(", ")}; shown as a gap.</p>
}
