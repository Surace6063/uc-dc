import type { Metadata } from "next"
import Link from "next/link"
import { ReceiptIcon } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PaymentStateBadge } from "@/features/finance/components/finance-ui"
import { PAYMENT_METHOD_LABELS } from "@/features/finance/constants"
import { formatRs } from "@/features/finance/money"
import { NoStudentProfile } from "@/features/student-portal/components/no-student"
import { formatDate } from "@/features/teaching/format"
import { getPageContext } from "@/lib/authorization/page"
import { myFeeAccount } from "@/services/student-portal/fee-service"

export const metadata: Metadata = { title: "Payment history" }

// The student's own payments and receipts, as recorded by the accounts office.
export default async function StudentPaymentsPage() {
  const context = await getPageContext()
  const account = await myFeeAccount(context)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Payment history" description="Payments recorded for you, with receipts you can print." breadcrumbs={[{ label: "Payment history" }]} />
      {!account ? (
        <NoStudentProfile />
      ) : account.payments.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title="No payments yet" description="Payments the accounts office records for you will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Receipt</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {account.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-4"><Link href={`/dashboard/student/payments/${p.id}`} className="font-mono text-sm font-medium hover:underline">{p.receiptNumber}</Link></TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDate(p.receivedOn)}</TableCell>
                  <TableCell className="text-sm">{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                  <TableCell><PaymentStateBadge status={p.status} verification={p.verificationStatus} /></TableCell>
                  <TableCell className="pr-4 text-right font-semibold tabular-nums">{formatRs(p.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
