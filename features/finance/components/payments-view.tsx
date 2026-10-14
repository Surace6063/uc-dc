"use client"

import * as React from "react"
import Link from "next/link"
import { CheckCircle2Icon, MoreHorizontalIcon, ReceiptIcon, Undo2Icon, UserIcon } from "lucide-react"
import type { SortingState } from "@tanstack/react-table"

import { createServerColumnHelper, ServerDataTable, type ServerColumns } from "@/components/server-data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { labelOptions } from "@/components/shared/filter-controls"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { confirmPaymentAction, reversePaymentAction } from "@/features/finance/actions"
import { FinanceToolbar, PaymentStateBadge, ReasonDialog, useFinanceFilters } from "@/features/finance/components/finance-ui"
import { PAYMENT_METHOD_LABELS } from "@/features/finance/constants"
import type { PaymentFilters } from "@/features/finance/filters"
import { formatRs } from "@/features/finance/money"
import { formatDate } from "@/features/teaching/format"
import { useActionRunner } from "@/hooks/use-dialog-submit"
import type { FinanceOptions } from "@/services/finance/options-service"
import type { PaymentRow } from "@/services/finance/payment-service"

export function PaymentsView({ rows, total, collected, filters, options, can }: { rows: PaymentRow[]; total: number; collected: number; filters: PaymentFilters; options: FinanceOptions; can: { update: boolean; reverse: boolean; reports: boolean } }) {
  const { setParams, pending, searchParams } = useFinanceFilters()
  const runner = useActionRunner()
  const [reversing, setReversing] = React.useState<PaymentRow | null>(null)

  const columns = React.useMemo<ServerColumns<PaymentRow>>(() => {
    const h = createServerColumnHelper<PaymentRow>()
    return [
      h.accessor("receiptNumber", { id: "receipt", header: "Receipt", cell: ({ row }) => <Link href={`/dashboard/finance/payments/${row.original.id}`} className="font-mono text-sm font-medium hover:underline">{row.original.receiptNumber}</Link> }),
      h.accessor("receivedOn", { header: "Date", meta: { cellClassName: "whitespace-nowrap text-sm" }, cell: ({ row }) => formatDate(row.original.receivedOn) }),
      h.display({
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <Link href={`/dashboard/finance/collect?student=${row.original.student.id}`} className="block min-w-40 hover:underline">
            <span className="font-medium">{row.original.studentName}</span>
            <span className="block text-xs text-muted-foreground">{row.original.student.admissionNumber}</span>
          </Link>
        ),
      }),
      h.display({ id: "method", header: "Method", cell: ({ row }) => <span className="text-sm">{PAYMENT_METHOD_LABELS[row.original.method]}{row.original.reference && <span className="block font-mono text-xs text-muted-foreground">{row.original.reference}</span>}</span> }),
      h.accessor("amount", { header: "Amount", meta: { cellClassName: "text-right font-semibold tabular-nums whitespace-nowrap", headerClassName: "text-right" }, cell: ({ row }) => formatRs(row.original.amount) }),
      h.display({ id: "state", header: "Status", cell: ({ row }) => <PaymentStateBadge status={row.original.status} verification={row.original.verificationStatus} /> }),
      h.display({ id: "by", header: "Received by", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.receivedBy ?? "—"}</span> }),
      h.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => {
          const p = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.receiptNumber}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem render={<Link href={`/dashboard/finance/payments/${p.id}`} />}><ReceiptIcon />Receipt</DropdownMenuItem>
                <DropdownMenuItem render={<Link href={`/dashboard/finance/collect?student=${p.student.id}`} />}><UserIcon />Student account</DropdownMenuItem>
                {can.update && p.status === "COMPLETED" && p.verificationStatus === "PENDING" && <DropdownMenuItem onClick={() => runner.run(() => confirmPaymentAction(p.id))}><CheckCircle2Icon />Confirm cleared</DropdownMenuItem>}
                {can.reverse && p.status === "COMPLETED" && <DropdownMenuItem variant="destructive" onClick={() => setReversing(p)}><Undo2Icon />Reverse payment</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
    ]
  }, [can.update, can.reverse, runner])

  const sorting: SortingState = [{ id: filters.sort === "receipt" ? "receipt" : filters.sort, desc: filters.dir === "desc" }]

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {total.toLocaleString()} payment{total === 1 ? "" : "s"} · <span className="font-semibold text-foreground">{formatRs(collected)}</span> collected (verified, not reversed)
      </p>
      <ServerDataTable
        data={rows}
        columns={columns}
        rowCount={total}
        getRowId={(r) => r.id}
        pagination={{ pageIndex: filters.page - 1, pageSize: filters.pageSize }}
        onPaginationChange={(p) => setParams({ page: p.pageIndex > 0 ? String(p.pageIndex + 1) : null, pageSize: String(p.pageSize) }, { resetPage: false })}
        sorting={sorting}
        onSortingChange={(next) => next[0] && ["receivedOn", "amount", "receipt"].includes(next[0].id) && setParams({ sort: next[0].id, dir: next[0].desc ? "desc" : "asc" })}
        loading={pending || runner.pending}
        toolbar={
          <FinanceToolbar
            q={filters.q}
            searchPlaceholder="Receipt, reference, student or admission no."
            selects={[
              { key: "method", label: "Method", value: filters.method, options: labelOptions(PAYMENT_METHOD_LABELS) },
              { key: "status", label: "Status", value: filters.status, options: [{ value: "completed", label: "Completed" }, { value: "pending", label: "Awaiting clearance" }, { value: "reversed", label: "Reversed" }] },
              { key: "class", label: "Class", value: filters.class, options: options.classes.map((c) => ({ value: c.id, label: c.name })) },
            ]}
            dates={{ from: filters.from, to: filters.to }}
            amounts={{ min: filters.min, max: filters.max }}
            exportHref={can.reports ? `/api/finance/export/payments?${new URLSearchParams(searchParams.toString())}` : undefined}
          />
        }
        empty={<EmptyState icon={ReceiptIcon} title="No payments" description="No payments match these filters." className="border-0 bg-transparent py-6" />}
      />
      <ReasonDialog
        open={reversing !== null}
        onOpenChange={(o) => !o && setReversing(null)}
        title={`Reverse ${reversing?.receiptNumber ?? ""}?`}
        description="For a bounced cheque, a wrong entry or a refund. The receipt stays on record as reversed and the fees are reopened."
        confirmLabel="Reverse payment"
        run={(reason) => reversePaymentAction(reversing!.id, { reason })}
      />
    </div>
  )
}
