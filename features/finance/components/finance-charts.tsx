"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { axis, chartClass, series } from "@/features/dashboard/components/charts/chart-theme"
import { ChartEmpty } from "@/features/dashboard/components/dashboard-ui"
import { formatRs, formatRsShort } from "@/features/finance/money"

// Finance charts. Amounts arrive in paisa and are plotted in rupees on one
// axis; colours come from the dashboard's validated series order.

type Month = { month: string; fees: number; income: number; expense: number }

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })
const tick = (rupees: number) => formatRsShort(rupees * 100).replace("Rs. ", "")

const feesConfig = { fees: { label: "Fees collected", theme: series[0] } } satisfies ChartConfig
const flowConfig = { income: { label: "Income", theme: series[0] }, expense: { label: "Expenses", theme: series[1] } } satisfies ChartConfig

// A visually hidden table of the same numbers, for screen readers.
function DataTable({ rows, columns }: { rows: Month[]; columns: { key: keyof Month; label: string }[] }) {
  return (
    <table className="sr-only">
      <thead><tr><th>Month</th>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r.month}><td>{monthLabel(r.month)}</td>{columns.map((c) => <td key={c.key}>{formatRs(r[c.key] as number)}</td>)}</tr>)}</tbody>
    </table>
  )
}

export function FeeCollectionTrend({ months }: { months: Month[] }) {
  if (months.every((m) => m.fees === 0)) return <ChartEmpty>No fee payments recorded in the last 12 months.</ChartEmpty>
  const data = months.map((m) => ({ label: monthLabel(m.month), fees: m.fees / 100 }))
  return (
    <>
      <ChartContainer config={feesConfig} className={chartClass}>
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
          <YAxis {...axis} width={56} tickFormatter={tick} />
          <ChartTooltip cursor={{ fillOpacity: 0.06 }} content={<ChartTooltipContent formatter={(v) => formatRs(Math.round(Number(v) * 100))} />} />
          <Bar dataKey="fees" fill="var(--color-fees)" maxBarSize={28} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
      <DataTable rows={months} columns={[{ key: "fees", label: "Fees collected" }]} />
    </>
  )
}

export function IncomeExpenseChart({ months }: { months: Month[] }) {
  if (months.every((m) => m.income === 0 && m.expense === 0)) return <ChartEmpty>No income or expenses recorded in the last 12 months.</ChartEmpty>
  const data = months.map((m) => ({ label: monthLabel(m.month), income: m.income / 100, expense: m.expense / 100 }))
  return (
    <>
      <ChartContainer config={flowConfig} className={chartClass}>
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }} barGap={2} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
          <YAxis {...axis} width={56} tickFormatter={tick} />
          <ChartTooltip cursor={{ fillOpacity: 0.06 }} content={<ChartTooltipContent formatter={(v, name) => `${name === "income" ? "Income" : "Expenses"}: ${formatRs(Math.round(Number(v) * 100))}`} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="income" fill="var(--color-income)" maxBarSize={18} radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill="var(--color-expense)" maxBarSize={18} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
      <DataTable rows={months} columns={[{ key: "income", label: "Income (fees + other)" }, { key: "expense", label: "Expenses" }]} />
    </>
  )
}
