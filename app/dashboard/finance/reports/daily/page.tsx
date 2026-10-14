import type { Metadata } from "next"
import Link from "next/link"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { localDate } from "@/features/attendance/constants"
import { PaymentStateBadge } from "@/features/finance/components/finance-ui"
import { AmountTable, Field, inputClass, ReportFilters, ReportHeading } from "@/features/finance/components/report-ui"
import { PAYMENT_METHOD_LABELS } from "@/features/finance/constants"
import { parseReportFilters } from "@/features/finance/filters"
import { formatRs } from "@/features/finance/money"
import { formatDate } from "@/features/teaching/format"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { dailyReport } from "@/services/finance/report-service"

export const metadata: Metadata = { title: "Daily collection report" }

// One day's receipts (for closing the cash counter), with totals by method
// and by the person who received them.
export default async function DailyReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "finance.reports")) return <AccessDenied />
  const date = parseReportFilters(await searchParams).date ?? localDate()
  const r = await dailyReport(context, date)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Daily collection report" description="Receipts issued on a day, for closing the counter." breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Daily collection report" }]} />
      <ReportHeading organization={context.organization.name} title="Daily collection report" period={formatDate(date)} />
      <ReportFilters>
        <Field label="Date"><input type="date" name="date" defaultValue={date} max={localDate()} className={inputClass} /></Field>
      </ReportFilters>
      <SummaryGrid columns={3}>
        <SummaryCard label="Fees collected" value={formatRs(r.collected)} hint="Verified, not reversed" />
        <SummaryCard label="Other income" value={formatRs(r.otherIncome)} />
        <SummaryCard label="Expenses" value={formatRs(r.expenses)} />
      </SummaryGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <AmountTable title="By payment method" rows={r.byMethod.map((m) => ({ ...m, key: PAYMENT_METHOD_LABELS[m.key as keyof typeof PAYMENT_METHOD_LABELS] ?? m.key }))} label="Method" empty="No collections." />
        <AmountTable title="By collector" rows={r.byCollector} label="Received by" empty="No collections." />
      </div>
      <Card className="gap-3 p-5 print:border-0 print:p-0 print:shadow-none">
        <h2 className="text-base font-semibold">Receipts</h2>
        {r.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No receipts on this day.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Receipt</TableHead><TableHead>Student</TableHead><TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead>Received by</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {r.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><Link href={`/dashboard/finance/payments/${p.id}`} className="font-mono text-sm hover:underline">{p.receiptNumber}</Link></TableCell>
                  <TableCell className="text-sm">{p.student.firstName} {p.student.lastName}<span className="block text-xs text-muted-foreground">{p.student.admissionNumber}</span></TableCell>
                  <TableCell className="text-sm">{PAYMENT_METHOD_LABELS[p.method]}{p.reference ? <span className="block font-mono text-xs text-muted-foreground">{p.reference}</span> : null}</TableCell>
                  <TableCell><PaymentStateBadge status={p.status} verification={p.verificationStatus} /></TableCell>
                  <TableCell className="text-sm">{p.receivedBy}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRs(p.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
