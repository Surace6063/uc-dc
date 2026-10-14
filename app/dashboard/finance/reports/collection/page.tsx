import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { localDate } from "@/features/attendance/constants"
import { AmountTable, Field, inputClass, ReportFilters, ReportHeading } from "@/features/finance/components/report-ui"
import { PAYMENT_METHOD_LABELS } from "@/features/finance/constants"
import { orderedRange, parseReportFilters } from "@/features/finance/filters"
import { formatRs } from "@/features/finance/money"
import { formatDate } from "@/features/teaching/format"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { financeOptions } from "@/services/finance/options-service"
import { collectionReport } from "@/services/finance/report-service"

export const metadata: Metadata = { title: "Fee collection report" }

export default async function CollectionReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "finance.reports")) return <AccessDenied />
  const f = parseReportFilters(await searchParams)
  const { from, to } = orderedRange({ to: f.to ?? localDate(), from: f.from ?? `${(f.to ?? localDate()).slice(0, 7)}-01` })
  const [report, options] = await Promise.all([collectionReport(context, { from, to, classId: f.class, method: f.method }), financeOptions(context)])
  const period = `${formatDate(from)} – ${formatDate(to)}`

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Fee collection report" description="Verified fee payments in a period, by fee head, method and day." breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Fee collection report" }]} />
      <ReportHeading organization={context.organization.name} title="Fee collection report" period={period} />
      <ReportFilters clearHref="?">
        <Field label="From"><input type="date" name="from" defaultValue={from} className={inputClass} /></Field>
        <Field label="To"><input type="date" name="to" defaultValue={to} className={inputClass} /></Field>
        <Field label="Class">
          <select name="class" defaultValue={f.class ?? ""} className={inputClass}>
            <option value="">All classes</option>
            {options.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Method">
          <select name="method" defaultValue={f.method ?? ""} className={inputClass}>
            <option value="">All methods</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </ReportFilters>
      <SummaryGrid columns={3}>
        <SummaryCard label="Collected" value={formatRs(report.total)} hint={period} />
        <SummaryCard label="Receipts" value={report.receipts} />
        <SummaryCard label="Awaiting clearance" value={formatRs(report.pending.amount)} hint={`${report.pending.count} payment${report.pending.count === 1 ? "" : "s"}, not counted above`} />
      </SummaryGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <AmountTable title="By fee head" rows={report.byCategory} label="Fee head" empty="No collections in this period." />
        <AmountTable title="By payment method" rows={report.byMethod.map((m) => ({ ...m, key: PAYMENT_METHOD_LABELS[m.key as keyof typeof PAYMENT_METHOD_LABELS] ?? m.key }))} label="Method" empty="No collections in this period." />
      </div>
      <AmountTable title="By day" rows={report.byDay.map((d) => ({ ...d, key: formatDate(d.key) }))} label="Date" empty="No collections in this period." />
    </div>
  )
}
