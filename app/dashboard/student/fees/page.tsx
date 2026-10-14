import type { Metadata } from "next"
import Link from "next/link"
import { WalletIcon } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FeeStatusBadge } from "@/features/finance/components/finance-ui"
import { CONCESSION_KIND_LABELS } from "@/features/finance/constants"
import { formatRs } from "@/features/finance/money"
import { NoStudentProfile } from "@/features/student-portal/components/no-student"
import { formatDate } from "@/features/teaching/format"
import { getPageContext } from "@/lib/authorization/page"
import { myFeeAccount } from "@/services/student-portal/fee-service"

export const metadata: Metadata = { title: "My fees" }

// The student's own fees: what's charged, discounts, what's paid, what's due.
// Payments are made at the accounts office; online payment isn't set up.
export default async function StudentFeesPage() {
  const context = await getPageContext()
  const account = await myFeeAccount(context)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="My fees" description="Your fees, discounts and balance. Pay at the accounts office and keep your receipt." breadcrumbs={[{ label: "My fees" }]} />
      {!account ? (
        <NoStudentProfile />
      ) : account.fees.length === 0 ? (
        <EmptyState icon={WalletIcon} title="No fees yet" description="Fees the school assigns to you will appear here." />
      ) : (
        <>
          <SummaryGrid columns={4}>
            <SummaryCard label="Total fees" value={formatRs(account.totals.assessed)} hint={account.totals.discount ? `${formatRs(account.totals.discount)} in discounts & scholarships` : undefined} />
            <SummaryCard label="Paid" value={formatRs(account.totals.paid)} hint={account.totals.pending ? `${formatRs(account.totals.pending)} awaiting clearance` : undefined} href="/dashboard/student/payments" />
            <SummaryCard label="Balance" value={formatRs(account.totals.balance)} hint={account.nextDue ? `Next due ${formatDate(account.nextDue.dueDate)}` : undefined} />
            <SummaryCard label="Overdue" value={formatRs(account.totals.overdue)} hint={account.totals.overdue ? "Past the due date" : "Nothing overdue"} />
          </SummaryGrid>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Fee</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {account.fees.map((f) => (
                  <TableRow key={f.id} className={f.status === "CANCELLED" ? "text-muted-foreground" : undefined}>
                    <TableCell className="pl-4">
                      {f.title}
                      <span className="block text-xs text-muted-foreground">{f.category} · {f.year}</span>
                      {f.concessions.map((c) => (
                        <span key={c.id} className="block text-xs text-emerald-700 dark:text-emerald-400">{CONCESSION_KIND_LABELS[c.kind]}: {c.title} ({formatRs(c.amount)})</span>
                      ))}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(f.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRs(f.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.discount ? formatRs(f.discount) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRs(f.paid)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatRs(f.balance)}</TableCell>
                    <TableCell className="pr-4"><FeeStatusBadge status={f.status} overdue={f.overdue} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Online payment isn&apos;t available in the portal yet. A payment shows here once the accounts office records it; cheques count once they clear. See <Link href="/dashboard/student/payments" className="underline">payment history</Link> for receipts.
          </p>
        </>
      )}
    </div>
  )
}
