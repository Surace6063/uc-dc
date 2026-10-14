import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { localDate } from "@/features/attendance/constants"
import { AmountTable, Field, inputClass, ReportFilters, ReportHeading } from "@/features/finance/components/report-ui"
import { parseReportFilters } from "@/features/finance/filters"
import { formatRs } from "@/features/finance/money"
import { formatDate } from "@/features/teaching/format"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { monthlyReport } from "@/services/finance/report-service"

export const metadata: Metadata = { title: "Monthly financial report" }

// Money in and out for one month, by category. Months are Gregorian (AD).
export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "finance.reports")) return <AccessDenied />
  const month = parseReportFilters(await searchParams).month ?? localDate().slice(0, 7)
  const r = await monthlyReport(context, month)
  const period = `${formatDate(r.start)} – ${formatDate(r.end)}`

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Monthly financial report" description="Fee collections, other income and expenses for a month." breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Monthly financial report" }]} />
      <ReportHeading organization={context.organization.name} title="Monthly financial report" period={period} />
      <ReportFilters>
        <Field label="Month (AD)"><input type="month" name="month" defaultValue={month} max={localDate().slice(0, 7)} className={inputClass} /></Field>
      </ReportFilters>
      <SummaryGrid columns={4}>
        <SummaryCard label="Fee collections" value={formatRs(r.totals.fees)} hint={r.pending ? `${formatRs(r.pending)} more awaiting clearance` : period} />
        <SummaryCard label="Other income" value={formatRs(r.totals.income)} />
        <SummaryCard label="Expenses" value={formatRs(r.totals.expenses)} />
        <SummaryCard label="Net" value={formatRs(r.totals.net)} hint={r.totals.net >= 0 ? "Surplus" : "Deficit"} />
      </SummaryGrid>
      <div className="grid gap-4 lg:grid-cols-3">
        <AmountTable title="Fee collections" rows={r.fees} label="Fee head" empty="No fee collections." />
        <AmountTable title="Other income" rows={r.income} label="Source" empty="No other income." />
        <AmountTable title="Expenses" rows={r.expenses} label="Expense head" empty="No expenses." />
      </div>
    </div>
  )
}
