"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { RowSelectionState } from "@tanstack/react-table"
import { ClipboardListIcon, ExternalLinkIcon, LockIcon, LockOpenIcon, MoreHorizontalIcon, XIcon } from "lucide-react"

import { createServerColumnHelper, selectionColumn, ServerDataTable, type ServerColumns } from "@/components/server-data-table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { FilterSelect, labelOptions } from "@/components/shared/filter-controls"
import { useCan } from "@/components/shared/session-provider"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { lockSessionsAction, reopenSessionAction } from "@/features/attendance/actions"
import { SessionStatusBadge } from "@/features/attendance/components/attendance-nav"
import { formatDay, SESSION_STATUS_LABELS, SESSION_TYPE_LABELS } from "@/features/attendance/constants"
import { RECORD_DEPENDENTS, type SessionFilters } from "@/features/attendance/filters"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { SessionRow } from "@/services/attendance/session-service"

function href(r: SessionRow) {
  const q = new URLSearchParams({ year: r.academicYearId, date: r.date, class: r.classId, section: r.sectionId ?? "all", type: r.type, slot: String(r.slot) })
  if (r.subjectOfferingId) q.set("offering", r.subjectOfferingId)
  return `/dashboard/attendance/take?${q}`
}

export function SessionsTable({
  rows,
  total,
  filters,
  options,
}: {
  rows: SessionRow[]
  total: number
  filters: SessionFilters
  options: { years: { id: string; name: string }[]; classes: { id: string; name: string }[] }
}) {
  const router = useRouter()
  const { setParams, pending } = useUrlFilters(RECORD_DEPENDENTS)
  const canApprove = useCan("attendance.approve")
  const [selection, setSelection] = React.useState<RowSelectionState>({})
  const [locking, setLocking] = React.useState<string[] | null>(null)
  const [reopening, setReopening] = React.useState<SessionRow | null>(null)
  const [reason, setReason] = React.useState("")
  const selectedIds = Object.keys(selection).filter((id) => selection[id])

  const columns = React.useMemo<ServerColumns<SessionRow>>(() => {
    const h = createServerColumnHelper<SessionRow>()
    return [
      ...(canApprove ? [selectionColumn<SessionRow>()] : []),
      h.accessor("date", { header: "Date", enableSorting: false, meta: { cellClassName: "whitespace-nowrap" }, cell: ({ getValue }) => formatDay(getValue()) }),
      h.accessor("className", {
        id: "register",
        header: "Register",
        enableSorting: false,
        cell: ({ row }) => (
          <Link href={href(row.original)} className="block min-w-44 hover:underline">
            <span className="font-medium">{[row.original.className, row.original.sectionName && `Section ${row.original.sectionName}`].filter(Boolean).join(" · ")}</span>
            <span className="block text-xs text-muted-foreground">{[row.original.subjectName ?? row.original.typeLabel, row.original.slotLabel].join(" · ")}</span>
          </Link>
        ),
      }),
      h.accessor("status", { header: "Status", enableSorting: false, cell: ({ row }) => <SessionStatusBadge status={row.original.status} locked={row.original.locked} /> }),
      h.accessor("marked", {
        header: "Marked",
        enableSorting: false,
        meta: { cellClassName: "tabular-nums whitespace-nowrap" },
        cell: ({ row }) => (
          <span>
            {row.original.marked}
            <span className="block text-xs text-muted-foreground">{row.original.present} present · {row.original.absent} absent</span>
          </span>
        ),
      }),
      h.accessor((r) => r.takenBy ?? "", { id: "takenBy", header: "Taken by", enableSorting: false, cell: ({ getValue }) => getValue() || "—" }),
      h.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Register actions" />}>
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem render={<Link href={href(row.original)} />}>
                <ExternalLinkIcon />
                Open
              </DropdownMenuItem>
              {canApprove && row.original.status === "SUBMITTED" && (
                <DropdownMenuItem onClick={() => setLocking([row.original.id])}>
                  <LockIcon />
                  Lock
                </DropdownMenuItem>
              )}
              {canApprove && row.original.status === "LOCKED" && (
                <DropdownMenuItem onClick={() => setReopening(row.original)}>
                  <LockOpenIcon />
                  Reopen
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }),
    ]
  }, [canApprove])

  const toolbar = (
    <div className="flex flex-col gap-3 border-b p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="sessions-from" className="text-xs text-muted-foreground">From</Label>
          <Input id="sessions-from" type="date" value={filters.from ?? ""} onChange={(e) => setParams({ from: e.target.value || null })} className="h-8" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sessions-to" className="text-xs text-muted-foreground">To</Label>
          <Input id="sessions-to" type="date" value={filters.to ?? ""} onChange={(e) => setParams({ to: e.target.value || null })} className="h-8" />
        </div>
        <div className="w-32"><FilterSelect label="Academic year" value={filters.year} onChange={(v) => setParams({ year: v })} options={options.years.map((y) => ({ value: y.id, label: y.name }))} /></div>
        <div className="w-36"><FilterSelect label="Class" value={filters.class} onChange={(v) => setParams({ class: v })} options={options.classes.map((c) => ({ value: c.id, label: c.name }))} /></div>
        <div className="w-32"><FilterSelect label="Register" value={filters.type} onChange={(v) => setParams({ type: v })} options={labelOptions(SESSION_TYPE_LABELS)} /></div>
        <div className="w-32"><FilterSelect label="Status" value={filters.status} onChange={(v) => setParams({ status: v })} options={labelOptions(SESSION_STATUS_LABELS)} /></div>
      </div>
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => setLocking(selectedIds)}>
            <LockIcon data-icon="inline-start" />
            Lock
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelection({})}>
            <XIcon data-icon="inline-start" />
            Clear
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <>
      <ServerDataTable
        data={rows}
        columns={columns}
        rowCount={total}
        getRowId={(r) => r.id}
        pagination={{ pageIndex: filters.page - 1, pageSize: filters.pageSize }}
        onPaginationChange={(p) => setParams({ page: p.pageIndex > 0 ? String(p.pageIndex + 1) : null, pageSize: String(p.pageSize) }, { resetPage: false })}
        sorting={[]}
        onSortingChange={() => {}}
        rowSelection={canApprove ? selection : undefined}
        onRowSelectionChange={canApprove ? setSelection : undefined}
        loading={pending}
        toolbar={toolbar}
        empty={
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ClipboardListIcon /></EmptyMedia>
              <EmptyTitle>No registers</EmptyTitle>
              <EmptyDescription>Registers appear here once attendance is saved or submitted.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
      <ConfirmDialog
        open={locking !== null}
        onOpenChange={(open) => !open && setLocking(null)}
        title={`Lock ${locking?.length === 1 ? "this register" : `${locking?.length ?? 0} registers`}?`}
        description="Locked registers can't be corrected until someone who approves corrections reopens them. Only submitted registers are locked; drafts are skipped."
        confirmLabel="Lock"
        onConfirm={async () => {
          const result = await lockSessionsAction(locking)
          if (!result.ok) {
            toast.add({ title: "Couldn't lock", description: result.error, type: "error" })
            return false
          }
          toast.add({ title: `${result.data.locked} register${result.data.locked === 1 ? "" : "s"} locked`, description: result.data.skipped ? `${result.data.skipped} skipped (not submitted).` : undefined, type: "success" })
          setSelection({})
          router.refresh()
        }}
      />
      <ConfirmDialog
        open={reopening !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReopening(null)
            setReason("")
          }
        }}
        title="Reopen this register?"
        description="It becomes submitted again, so its marks can be corrected (each correction is still recorded)."
        confirmLabel="Reopen"
        onConfirm={async () => {
          const result = await reopenSessionAction({ sessionId: reopening?.id, reason })
          if (!result.ok) {
            toast.add({ title: "Couldn't reopen", description: result.fieldErrors?.reason?.[0] ?? result.error, type: "error" })
            return false
          }
          toast.add({ title: "Register reopened", type: "success" })
          setReason("")
          router.refresh()
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="reopen-reason">Reason</Label>
          <Textarea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Late medical certificates for two students" />
        </div>
      </ConfirmDialog>
    </>
  )
}
