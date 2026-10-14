"use client"

import * as React from "react"
import Link from "next/link"
import { BadgePercentIcon, ClipboardListIcon, HandCoinsIcon, MoreHorizontalIcon, UsersIcon, XCircleIcon } from "lucide-react"
import type { SortingState } from "@tanstack/react-table"

import { createServerColumnHelper, ServerDataTable, type ServerColumns } from "@/components/server-data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { labelOptions } from "@/components/shared/filter-controls"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AssignStructureDialog, CancelFeeDialog, ConcessionDialog, type FeeTarget } from "@/features/finance/components/finance-dialogs"
import { FeeStatusBadge, FinanceToolbar, useFinanceFilters } from "@/features/finance/components/finance-ui"
import { FEE_STATUS_LABELS } from "@/features/finance/constants"
import type { FeeFilters } from "@/features/finance/filters"
import { formatRs } from "@/features/finance/money"
import { formatDate } from "@/features/teaching/format"
import type { FinanceOptions } from "@/services/finance/options-service"
import type { FeeRow } from "@/services/finance/payment-service"

type Totals = { assessed: number; discount: number; paid: number; balance: number }

export function FeesView({
  mode,
  rows,
  total,
  totals,
  filters,
  options,
  structures,
  openAssign,
  can,
}: {
  mode: "assignments" | "outstanding"
  rows: FeeRow[]
  total: number
  totals: Totals
  filters: FeeFilters
  options: FinanceOptions
  structures: { id: string; name: string }[]
  openAssign: boolean
  can: { create: boolean; adjust: boolean; reports: boolean }
}) {
  const { setParams, pending, searchParams } = useFinanceFilters()
  const [concession, setConcession] = React.useState<FeeTarget | null>(null)
  const [cancelling, setCancelling] = React.useState<FeeTarget | null>(null)
  const [assigning, setAssigning] = React.useState(openAssign && can.create && mode === "assignments")

  const columns = React.useMemo<ServerColumns<FeeRow>>(() => {
    const h = createServerColumnHelper<FeeRow>()
    const target = (r: FeeRow): FeeTarget => ({ id: r.id, title: r.title, amount: r.amount, balance: r.balance, studentName: r.student.name })
    return [
      h.display({
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <Link href={`/dashboard/finance/collect?student=${row.original.student.id}`} className="block min-w-44 hover:underline">
            <span className="font-medium">{row.original.student.name}</span>
            <span className="block text-xs text-muted-foreground">{row.original.student.admissionNumber}{row.original.student.className ? ` · ${row.original.student.className}` : ""}</span>
          </Link>
        ),
      }),
      h.accessor("title", { header: "Fee", enableSorting: false, cell: ({ row }) => <span className="block min-w-40 text-sm">{row.original.title}<span className="block text-xs text-muted-foreground">{row.original.category} · {row.original.year}</span></span> }),
      h.accessor("dueDate", { header: "Due", meta: { cellClassName: "whitespace-nowrap text-sm" }, cell: ({ row }) => formatDate(row.original.dueDate) }),
      h.accessor("amount", { header: "Amount", meta: { cellClassName: "text-right tabular-nums whitespace-nowrap", headerClassName: "text-right" }, cell: ({ row }) => formatRs(row.original.amount) }),
      h.display({ id: "discount", header: "Discount", meta: { cellClassName: "text-right tabular-nums whitespace-nowrap text-muted-foreground", headerClassName: "text-right" }, cell: ({ row }) => (row.original.discount ? formatRs(row.original.discount) : "—") }),
      h.display({ id: "paid", header: "Paid", meta: { cellClassName: "text-right tabular-nums whitespace-nowrap", headerClassName: "text-right" }, cell: ({ row }) => formatRs(row.original.paid) }),
      h.display({ id: "balance", header: "Balance", meta: { cellClassName: "text-right tabular-nums whitespace-nowrap font-semibold", headerClassName: "text-right" }, cell: ({ row }) => formatRs(row.original.balance) }),
      h.accessor("status", { header: "Status", enableSorting: false, cell: ({ row }) => <FeeStatusBadge status={row.original.status} overdue={row.original.overdue} /> }),
      h.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => {
          const r = row.original
          const open = r.status === "UNPAID" || r.status === "PARTIAL"
          return (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.title}`} />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem render={<Link href={`/dashboard/finance/collect?student=${r.student.id}`} />}><HandCoinsIcon />{open && can.create ? "Collect payment" : "Student account"}</DropdownMenuItem>
                {can.adjust && open && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setConcession(target(r))}><BadgePercentIcon />Discount / scholarship</DropdownMenuItem>
                    {r.paid === 0 && <DropdownMenuItem variant="destructive" onClick={() => setCancelling(target(r))}><XCircleIcon />Cancel fee</DropdownMenuItem>}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
    ]
  }, [can.adjust, can.create])

  const sorting: SortingState = [{ id: filters.sort === "student" ? "student" : filters.sort, desc: filters.dir === "desc" }]
  const exportHref = can.reports ? `/api/finance/export/fees?${new URLSearchParams(searchParams.toString())}` : undefined

  return (
    <div className="flex flex-col gap-4">
      <SummaryGrid columns={4}>
        <SummaryCard label="Assessed" value={formatRs(totals.assessed)} hint="Matching fees, excluding cancelled" />
        <SummaryCard label="Discounts & scholarships" value={formatRs(totals.discount)} />
        <SummaryCard label="Paid" value={formatRs(totals.paid)} hint="Verified payments" />
        <SummaryCard label="Balance" value={formatRs(totals.balance)} />
      </SummaryGrid>
      <ServerDataTable
        data={rows}
        columns={columns}
        rowCount={total}
        getRowId={(r) => r.id}
        pagination={{ pageIndex: filters.page - 1, pageSize: filters.pageSize }}
        onPaginationChange={(p) => setParams({ page: p.pageIndex > 0 ? String(p.pageIndex + 1) : null, pageSize: String(p.pageSize) }, { resetPage: false })}
        sorting={sorting}
        onSortingChange={(next) => next[0] && ["dueDate", "amount", "student", "createdAt"].includes(next[0].id) && setParams({ sort: next[0].id, dir: next[0].desc ? "desc" : "asc" })}
        loading={pending}
        toolbar={
          <FinanceToolbar
            q={filters.q}
            searchPlaceholder="Search student, admission no. or fee"
            selects={[
              { key: "class", label: "Class", value: filters.class, options: options.classes.map((c) => ({ value: c.id, label: c.name })) },
              { key: "category", label: "Fee head", value: filters.category, options: options.feeCategories.map((c) => ({ value: c.id, label: c.name })) },
              ...(mode === "assignments" ? [{ key: "status", label: "Status", value: filters.status, options: labelOptions(FEE_STATUS_LABELS) }] : []),
              { key: "due", label: "Due", value: filters.due, allLabel: "Any time", options: [{ value: "overdue", label: "Overdue" }, { value: "upcoming", label: "Not yet due" }] },
            ]}
            amounts={{ min: filters.min, max: filters.max }}
            exportHref={exportHref}
            actions={
              mode === "assignments" && can.create && (
                <Button size="sm" onClick={() => setAssigning(true)}>
                  <UsersIcon data-icon="inline-start" />
                  Assign fee structure
                </Button>
              )
            }
          />
        }
        empty={
          <EmptyState
            icon={ClipboardListIcon}
            title={mode === "outstanding" ? "Nothing outstanding" : "No fees"}
            description={mode === "outstanding" ? "No fees with a balance match these filters." : "Assign a fee structure to charge students, or add a one-off charge from a student's account."}
            className="border-0 bg-transparent py-6"
          />
        }
      />
      <ConcessionDialog fee={concession} onOpenChange={(o) => !o && setConcession(null)} />
      <CancelFeeDialog fee={cancelling} onOpenChange={(o) => !o && setCancelling(null)} />
      <AssignStructureDialog structures={structures} open={assigning} onOpenChange={setAssigning} />
    </div>
  )
}
