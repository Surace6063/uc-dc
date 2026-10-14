import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeftRightIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Field, inputClass, ReportFilters } from "@/features/finance/components/report-ui"
import { PAYMENT_METHOD_LABELS } from "@/features/finance/constants"
import { parseTransactionFilters } from "@/features/finance/filters"
import { formatRs } from "@/features/finance/money"
import { formatDate } from "@/features/teaching/format"
import { getPageContext } from "@/lib/authorization/page"
import { cn } from "@/lib/utils"
import { isFinanceStaff } from "@/services/finance/access"
import { listTransactions } from "@/services/finance/ledger-service"

export const metadata: Metadata = { title: "Financial transactions" }

const TYPE_LABEL = { fee: "Fee payment", income: "Income", expense: "Expense" } as const
const STATE_LABEL = { completed: null, pending: "Awaiting clearance", reversed: "Reversed", voided: "Voided" } as const

// Every fee payment and income/expense entry in one list, newest first.
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await getPageContext()
  if (!isFinanceStaff(context)) return <AccessDenied />
  const raw = await searchParams
  const f = parseTransactionFilters(raw)
  const list = await listTransactions(context, f)
  const pages = Math.max(1, Math.ceil(list.total / f.pageSize))
  const href = (page: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(raw).filter(([k, v]) => v && k !== "page")) as Record<string, string>, ...(page > 1 && { page: String(page) }) })}`

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Financial transactions" description="Fee payments, other income and expenses together. Money in is positive, money out negative." breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Transactions" }]} />
      <ReportFilters clearHref="?">
        <Field label="Search"><input name="q" defaultValue={f.q ?? ""} placeholder="Receipt, student, description" className={inputClass} /></Field>
        <Field label="Type">
          <select name="type" defaultValue={f.type ?? ""} className={inputClass}>
            <option value="">All</option>
            <option value="fee">Fee payments</option>
            <option value="income">Income</option>
            <option value="expense">Expenses</option>
          </select>
        </Field>
        <Field label="Method">
          <select name="method" defaultValue={f.method ?? ""} className={inputClass}>
            <option value="">All methods</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="From"><input type="date" name="from" defaultValue={f.from ?? ""} className={inputClass} /></Field>
        <Field label="To"><input type="date" name="to" defaultValue={f.to ?? ""} className={inputClass} /></Field>
        <Field label="Reversed / voided">
          <select name="include" defaultValue={f.include ?? ""} className={inputClass}>
            <option value="">Hide</option>
            <option value="cancelled">Show</option>
          </select>
        </Field>
      </ReportFilters>
      <SummaryGrid columns={3}>
        <SummaryCard label="Money in" value={formatRs(list.moneyIn)} hint="Verified fees + other income" />
        <SummaryCard label="Money out" value={formatRs(list.moneyOut)} hint="Expenses" />
        <SummaryCard label="Net" value={formatRs(list.moneyIn - list.moneyOut)} />
      </SummaryGrid>
      {list.rows.length === 0 ? (
        <EmptyState icon={ArrowLeftRightIcon} title="No transactions" description="Nothing matches these filters." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="pr-4 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((t) => (
                <TableRow key={`${t.type}:${t.id}`} className={t.state === "reversed" || t.state === "voided" ? "text-muted-foreground" : undefined}>
                  <TableCell className="pl-4 whitespace-nowrap">{formatDate(t.date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TYPE_LABEL[t.type]}</Badge>
                    {STATE_LABEL[t.state] && <span className="ml-1.5 text-xs">{STATE_LABEL[t.state]}</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.href && t.type === "fee" ? <Link href={t.href} className="hover:underline">{t.reference}</Link> : t.reference}</TableCell>
                  <TableCell className="max-w-96 text-sm">{t.description}</TableCell>
                  <TableCell className="text-sm">{PAYMENT_METHOD_LABELS[t.method]}</TableCell>
                  <TableCell className={cn("pr-4 text-right font-semibold whitespace-nowrap tabular-nums", (t.state === "reversed" || t.state === "voided") && "line-through", t.amount < 0 && "text-destructive")}>{t.amount < 0 ? `−${formatRs(-t.amount)}` : formatRs(t.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm print:hidden">
          <span className="text-muted-foreground">Page {f.page} of {pages} · {list.total} transactions</span>
          <span className="flex gap-2">
            <Button size="sm" variant="outline" disabled={f.page <= 1} nativeButton={false} render={<Link href={href(f.page - 1)} aria-disabled={f.page <= 1} />}>Previous</Button>
            <Button size="sm" variant="outline" disabled={f.page >= pages} nativeButton={false} render={<Link href={href(f.page + 1)} aria-disabled={f.page >= pages} />}>Next</Button>
          </span>
        </nav>
      )}
    </div>
  )
}
