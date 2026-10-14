import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PrintButton } from "@/features/finance/components/finance-ui"
import { PAYMENT_METHOD_LABELS } from "@/features/finance/constants"
import { formatRs } from "@/features/finance/money"
import { formatDate, formatDateTime } from "@/features/teaching/format"
import type { Receipt } from "@/services/finance/payment-service"

// A printable receipt, the same for finance staff and the student. Reversed
// and uncleared payments say so prominently, so a printout can't be
// mistaken for a valid receipt.
export function ReceiptView({ r, back }: { r: Receipt; back: { href: string; label: string } }) {
  const e = r.enrollment
  const reversed = r.status === "REVERSED"
  const pending = !reversed && r.verificationStatus === "PENDING"

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={back.href} />}>← {back.label}</Button>
        <PrintButton label="Print receipt" />
      </div>
      <Card className="mx-auto w-full max-w-2xl gap-5 p-8 print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-xl font-semibold">{r.organization.name}</h1>
            <p className="text-sm text-muted-foreground">Payment receipt</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-semibold">{r.receiptNumber}</p>
            <p className="text-sm text-muted-foreground">{formatDate(r.receivedOn)}</p>
          </div>
        </header>
        {(reversed || pending) && (
          <p className={reversed ? "rounded-lg border-2 border-destructive px-4 py-2 text-center font-semibold text-destructive" : "rounded-lg border-2 border-amber-500 px-4 py-2 text-center font-semibold text-amber-700 dark:text-amber-400"}>
            {reversed ? `REVERSED${r.reversedAt ? ` on ${formatDate(r.reversedAt)}` : ""}: ${r.reversalReason ?? ""}. This receipt is not valid.` : "AWAITING CLEARANCE: not counted as paid until the cheque or transfer clears."}
          </p>
        )}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Received from</dt><dd className="font-medium">{r.studentName}{r.payerName ? ` (paid by ${r.payerName})` : ""}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Admission no.</dt><dd className="font-medium">{r.student.admissionNumber}</dd></div>
          {e && <div><dt className="text-xs text-muted-foreground">Class</dt><dd className="font-medium">{[e.class.name, e.section?.name && `Section ${e.section.name}`, e.rollNumber && `Roll ${e.rollNumber}`].filter(Boolean).join(" · ")} ({e.academicYear.name})</dd></div>}
          <div><dt className="text-xs text-muted-foreground">Payment method</dt><dd className="font-medium">{PAYMENT_METHOD_LABELS[r.method]}{r.reference ? ` · ${r.reference}` : ""}</dd></div>
        </dl>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Particulars</th><th className="py-2 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={i} className="border-b border-dashed"><td className="py-2">{l.title}<span className="block text-xs text-muted-foreground">{l.category}</span></td><td className="py-2 text-right tabular-nums">{formatRs(l.amount)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td className="pt-3 font-semibold">Total received</td><td className="pt-3 text-right text-lg font-semibold tabular-nums">{formatRs(r.amount)}</td></tr>
            <tr><td className="pt-1 text-muted-foreground">Balance remaining</td><td className="pt-1 text-right text-muted-foreground tabular-nums">{formatRs(r.balanceAfter)}</td></tr>
          </tfoot>
        </table>
        {r.note && <p className="text-sm"><span className="text-muted-foreground">Note: </span>{r.note}</p>}
        <footer className="flex flex-wrap items-end justify-between gap-4 border-t pt-4 text-sm">
          <div className="text-muted-foreground">
            <p>Received by {r.receivedBy ?? "—"} · recorded {formatDateTime(r.createdAt)}</p>
            {r.verificationStatus === "VERIFIED" && r.verifiedBy && r.verifiedBy !== r.receivedBy && <p>Cleared/verified by {r.verifiedBy}</p>}
          </div>
          <div className="text-center">
            <div className="h-10 w-40 border-b" />
            <p className="text-xs text-muted-foreground">Authorised signature</p>
          </div>
        </footer>
        {!reversed && !pending && <Badge variant="secondary" className="self-start print:hidden">Valid receipt</Badge>}
      </Card>
    </div>
  )
}
