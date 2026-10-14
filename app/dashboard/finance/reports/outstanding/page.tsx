import type { Metadata } from "next"
import Link from "next/link"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AmountTable, Field, inputClass, ReportFilters, ReportHeading } from "@/features/finance/components/report-ui"
import { parseReportFilters } from "@/features/finance/filters"
import { formatRs } from "@/features/finance/money"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { financeOptions } from "@/services/finance/options-service"
import { currentYear, outstandingReport } from "@/services/finance/report-service"

export const metadata: Metadata = { title: "Outstanding balance report" }

export default async function OutstandingReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "finance.reports")) return <AccessDenied />
  const raw = await searchParams
  const f = parseReportFilters(raw)
  const [year, options] = await Promise.all([currentYear(context, f.year), financeOptions(context)])
  const report = await outstandingReport(context, { yearId: year?.id ?? null, classId: f.class })
  const exportParams = new URLSearchParams({ ...(f.year && { year: f.year }), ...(f.class && { class: f.class }) })

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Outstanding balance report" description="Unpaid fee balances by class, fee head and student." breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Outstanding balance report" }]} />
      <ReportHeading organization={context.organization.name} title="Outstanding balance report" period={year?.name ?? "All years"} />
      <ReportFilters clearHref="?" exportHref={`/api/finance/export/outstanding?${exportParams}`}>
        <Field label="Academic year">
          <select name="year" defaultValue={f.year ?? year?.id ?? ""} className={inputClass}>
            {options.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            <option value="all">All years</option>
          </select>
        </Field>
        <Field label="Class">
          <select name="class" defaultValue={f.class ?? ""} className={inputClass}>
            <option value="">All classes</option>
            {options.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </ReportFilters>
      <SummaryGrid columns={3}>
        <SummaryCard label="Outstanding" value={formatRs(report.total)} />
        <SummaryCard label="Overdue" value={formatRs(report.overdue)} hint="Past the due date" />
        <SummaryCard label="Students owing" value={report.students.length} />
      </SummaryGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <AmountTable title="By class" rows={report.byClass.map((c) => ({ key: c.className, amount: c.balance, extra: <span className="block text-xs text-muted-foreground">{c.students} students · {formatRs(c.overdue)} overdue</span> }))} label="Class" empty="Nothing outstanding." />
        <AmountTable title="By fee head" rows={report.byCategory} label="Fee head" empty="Nothing outstanding." />
      </div>
      <Card className="gap-3 p-5 print:border-0 print:p-0 print:shadow-none">
        <h2 className="text-base font-semibold">Students</h2>
        {report.students.length === 0 ? (
          <p className="text-sm text-muted-foreground">No student owes anything.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Class</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Overdue</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
            <TableBody>
              {report.students.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><Link href={`/dashboard/finance/collect?student=${s.id}`} className="font-medium hover:underline">{s.name}</Link><span className="block text-xs text-muted-foreground">{s.admissionNumber}</span></TableCell>
                  <TableCell className="text-sm">{s.className}</TableCell>
                  <TableCell className="text-sm">{s.phone ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.overdue ? formatRs(s.overdue) : "—"}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatRs(s.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
