import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PrintButton } from "@/features/finance/components/finance-ui"
import { formatRs } from "@/features/finance/money"

// Server-rendered building blocks for finance reports: a GET filter form
// (works without JavaScript), print, and amount tables with totals.

export function ReportFilters({ children, exportHref, clearHref }: { children: React.ReactNode; exportHref?: string; clearHref?: string }) {
  return (
    <form className="flex flex-wrap items-end gap-3 print:hidden">
      {children}
      <Button type="submit" size="sm" variant="outline">Apply</Button>
      {clearHref && <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={clearHref} />}>Reset</Button>}
      <span className="ml-auto flex gap-2">
        {exportHref && <Button size="sm" variant="outline" nativeButton={false} render={<a href={exportHref} />}>CSV</Button>}
        <PrintButton />
      </span>
    </form>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

export const inputClass = "h-9 rounded-md border bg-background px-2 text-sm text-foreground"

export function AmountTable({ title, rows, label = "Category", empty = "Nothing recorded." }: { title: string; rows: { key: string; amount: number; extra?: React.ReactNode }[]; label?: string; empty?: string }) {
  const total = rows.reduce((n, r) => n + r.amount, 0)
  return (
    <Card className="gap-3 p-5 print:break-inside-avoid print:border-0 print:p-0 print:shadow-none">
      <h2 className="text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>{label}</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}><TableCell>{r.key}{r.extra}</TableCell><TableCell className="text-right tabular-nums">{formatRs(r.amount)}</TableCell></TableRow>
            ))}
          </TableBody>
          <TableFooter><TableRow><TableCell className="font-semibold">Total</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatRs(total)}</TableCell></TableRow></TableFooter>
        </Table>
      )}
    </Card>
  )
}

export function ReportHeading({ organization, title, period }: { organization: string; title: string; period: string }) {
  return (
    <div className="hidden print:block">
      <p className="text-lg font-semibold">{organization}</p>
      <p className="text-sm">{title} · {period}</p>
    </div>
  )
}
