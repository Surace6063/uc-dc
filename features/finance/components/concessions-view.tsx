"use client"

import * as React from "react"
import Link from "next/link"
import { BadgePercentIcon, MoreHorizontalIcon, Undo2Icon, UserIcon } from "lucide-react"

import { createServerColumnHelper, ServerDataTable, type ServerColumns } from "@/components/server-data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { labelOptions } from "@/components/shared/filter-controls"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { revokeConcessionAction } from "@/features/finance/actions"
import { FinanceToolbar, ReasonDialog, useFinanceFilters } from "@/features/finance/components/finance-ui"
import { CONCESSION_KIND_LABELS } from "@/features/finance/constants"
import type { ConcessionFilters } from "@/features/finance/filters"
import { formatRs } from "@/features/finance/money"
import { SCHOLARSHIP_LABELS } from "@/features/students/constants"
import { formatDate } from "@/features/teaching/format"
import type { listConcessions, ConcessionRow } from "@/services/finance/ledger-service"

type List = Awaited<ReturnType<typeof listConcessions>>

export function ConcessionsView({ list, filters, canAdjust }: { list: List; filters: ConcessionFilters; canAdjust: boolean }) {
  const { setParams, pending } = useFinanceFilters()
  const [revoking, setRevoking] = React.useState<ConcessionRow | null>(null)
  const columns = React.useMemo<ServerColumns<ConcessionRow>>(() => {
    const h = createServerColumnHelper<ConcessionRow>()
    return [
      h.display({
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <Link href={`/dashboard/finance/collect?student=${row.original.student.id}`} className="block min-w-40 hover:underline">
            <span className="font-medium">{row.original.student.firstName} {row.original.student.lastName}</span>
            <span className="block text-xs text-muted-foreground">{row.original.student.admissionNumber}</span>
          </Link>
        ),
      }),
      h.display({
        id: "what",
        header: "Concession",
        cell: ({ row }) => (
          <span className="block min-w-44 text-sm">
            <span className="flex flex-wrap items-center gap-1.5 font-medium">{row.original.title}<Badge variant="outline">{CONCESSION_KIND_LABELS[row.original.kind]}</Badge></span>
            <span className="block text-xs text-muted-foreground">
              On “{row.original.studentFee.title}” ({formatRs(row.original.feeAmount)}){row.original.scholarshipCategory ? ` · ${SCHOLARSHIP_LABELS[row.original.scholarshipCategory]}` : ""}
            </span>
          </span>
        ),
      }),
      h.display({ id: "amount", header: "Amount", meta: { cellClassName: "text-right font-semibold tabular-nums", headerClassName: "text-right" }, cell: ({ row }) => formatRs(row.original.amount) }),
      h.display({
        id: "approved",
        header: "Approved",
        cell: ({ row }) => <span className="text-sm">{formatDate(row.original.createdAt)}<span className="block text-xs text-muted-foreground">{row.original.approvedBy ?? "—"}{row.original.reason ? ` · ${row.original.reason}` : ""}</span></span>,
      }),
      h.display({ id: "state", header: "Status", cell: ({ row }) => (row.original.revokedAt ? <span className="text-sm"><Badge variant="destructive">Revoked</Badge><span className="block text-xs text-muted-foreground">{row.original.revokeReason}</span></span> : <Badge variant="secondary">Active</Badge>) }),
      h.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.title}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem render={<Link href={`/dashboard/finance/collect?student=${row.original.student.id}`} />}><UserIcon />Student account</DropdownMenuItem>
              {canAdjust && !row.original.revokedAt && <DropdownMenuItem variant="destructive" onClick={() => setRevoking(row.original)}><Undo2Icon />Revoke</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }),
    ]
  }, [canAdjust])

  return (
    <div className="flex flex-col gap-4">
      <SummaryGrid columns={3}>
        {(["DISCOUNT", "SCHOLARSHIP", "WAIVER"] as const).map((k) => {
          const g = list.byKind.find((x) => x.kind === k)
          return <SummaryCard key={k} label={`${CONCESSION_KIND_LABELS[k]}s`} value={formatRs(g?.amount ?? 0)} hint={`${g?.count ?? 0} active`} icon={BadgePercentIcon} />
        })}
      </SummaryGrid>
      <ServerDataTable
        data={list.rows}
        columns={columns}
        rowCount={list.total}
        getRowId={(r) => r.id}
        pagination={{ pageIndex: filters.page - 1, pageSize: filters.pageSize }}
        onPaginationChange={(p) => setParams({ page: p.pageIndex > 0 ? String(p.pageIndex + 1) : null, pageSize: String(p.pageSize) }, { resetPage: false })}
        sorting={[]}
        onSortingChange={() => {}}
        loading={pending}
        toolbar={
          <FinanceToolbar
            q={filters.q}
            searchPlaceholder="Search name, student or admission no."
            selects={[
              { key: "kind", label: "Type", value: filters.kind, options: labelOptions(CONCESSION_KIND_LABELS) },
              { key: "view", label: "Show", value: filters.view === "active" ? undefined : filters.view, allLabel: "Active", options: [{ value: "revoked", label: "Revoked" }, { value: "all", label: "All" }] },
            ]}
          />
        }
        empty={<EmptyState icon={BadgePercentIcon} title="No discounts or scholarships" description="Give one from a student's account or the fee list (needs the finance adjust permission)." className="border-0 bg-transparent py-6" />}
      />
      <ReasonDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke “${revoking?.title ?? ""}”?`}
        description="The fee's balance goes back up by this amount. The concession stays on record as revoked."
        confirmLabel="Revoke"
        run={(reason) => revokeConcessionAction(revoking!.id, { reason })}
      />
    </div>
  )
}
