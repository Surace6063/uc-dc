"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { RowSelectionState } from "@tanstack/react-table"
import { CheckIcon, CornerUpLeftIcon, InboxIcon, ShieldCheckIcon, XIcon } from "lucide-react"

import { createServerColumnHelper, selectionColumn, ServerDataTable, type ServerColumns } from "@/components/server-data-table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { FilterSelect } from "@/components/shared/filter-controls"
import { useCan } from "@/components/shared/session-provider"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { reviewSheetsAction } from "@/features/exams/actions"
import { SheetStatusBadge } from "@/features/exams/components/exams-nav"
import { formatDateTime, SHEET_STATUS_LABELS } from "@/features/exams/constants"
import type { SheetFilters } from "@/features/exams/filters"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { ReviewSheetRow } from "@/services/exams/workflow-service"

export function ReviewTable({ rows, total, filters, exams }: { rows: ReviewSheetRow[]; total: number; filters: SheetFilters; exams: { id: string; name: string }[] }) {
  const router = useRouter()
  const { setParams, pending } = useUrlFilters()
  const canReview = useCan("exams.review")
  const canApprove = useCan("exams.approve")
  const [selection, setSelection] = React.useState<RowSelectionState>({})
  const [action, setAction] = React.useState<null | { kind: "verify" | "approve" | "return"; ids: string[] }>(null)
  const [note, setNote] = React.useState("")
  const selectedIds = Object.keys(selection).filter((id) => selection[id])

  const columns = React.useMemo<ServerColumns<ReviewSheetRow>>(() => {
    const h = createServerColumnHelper<ReviewSheetRow>()
    return [
      selectionColumn<ReviewSheetRow>(),
      h.accessor("label", {
        header: "Marks sheet",
        enableSorting: false,
        cell: ({ row }) => (
          <Link href={`/dashboard/exams/marks?exam=${row.original.examinationId}&subject=${row.original.examinationSubjectId}&section=${row.original.sectionId ?? "none"}`} className="block min-w-56 hover:underline">
            <span className="font-medium">{row.original.label}</span>
            <span className="block text-xs text-muted-foreground">{row.original.examName}</span>
          </Link>
        ),
      }),
      h.accessor("status", { header: "Status", enableSorting: false, cell: ({ row }) => <SheetStatusBadge status={row.original.status} /> }),
      h.accessor("marks", { header: "Marks", enableSorting: false, meta: { cellClassName: "tabular-nums" } }),
      h.accessor((r) => r.submittedBy ?? "", {
        id: "submitted",
        header: "Submitted",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.submittedBy ?? "—"}{row.original.mine ? " (you)" : ""}
            <span className="block text-xs text-muted-foreground">{formatDateTime(row.original.submittedAt)}</span>
          </span>
        ),
      }),
      h.accessor((r) => r.verifiedBy ?? "", { id: "verified", header: "Verified by", enableSorting: false, cell: ({ getValue }) => getValue() || "—" }),
    ]
  }, [])

  async function run() {
    if (!action) return
    const result = await reviewSheetsAction(action.kind, { sheetIds: action.ids, note })
    if (!result.ok) {
      toast.add({ title: "Couldn't update", description: result.fieldErrors?.note?.[0] ?? result.error, type: "error" })
      return false
    }
    const { done, skipped } = result.data
    toast.add({
      title: `${done} sheet${done === 1 ? "" : "s"} ${action.kind === "verify" ? "verified" : action.kind === "approve" ? "approved" : "returned"}`,
      description: skipped.length ? `${skipped.length} skipped: ${skipped.slice(0, 3).map((s) => `${s.label} — ${s.reason}`).join("; ")}${skipped.length > 3 ? "…" : ""}` : undefined,
      type: skipped.length && !done ? "error" : "success",
    })
    setSelection({})
    setNote("")
    router.refresh()
  }

  const toolbar = (
    <div className="flex flex-col gap-3 border-b p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64"><FilterSelect label="Examination" value={filters.exam} onChange={(v) => setParams({ exam: v })} options={exams.map((e) => ({ value: e.id, label: e.name }))} /></div>
        <div className="w-48">
          <FilterSelect
            label="Status"
            value={filters.status === "ACTION" ? undefined : filters.status}
            allLabel="Waiting for review"
            onChange={(v) => setParams({ status: v })}
            options={(["SUBMITTED", "VERIFIED", "APPROVED", "RETURNED", "DRAFT"] as const).map((s) => ({ value: s, label: SHEET_STATUS_LABELS[s] }))}
          />
        </div>
      </div>
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          {canReview && <Button size="sm" variant="outline" onClick={() => setAction({ kind: "verify", ids: selectedIds })}><CheckIcon data-icon="inline-start" />Verify</Button>}
          {canApprove && <Button size="sm" onClick={() => setAction({ kind: "approve", ids: selectedIds })}><ShieldCheckIcon data-icon="inline-start" />Approve</Button>}
          <Button size="sm" variant="outline" onClick={() => setAction({ kind: "return", ids: selectedIds })}><CornerUpLeftIcon data-icon="inline-start" />Return</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelection({})}><XIcon data-icon="inline-start" />Clear</Button>
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
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        loading={pending}
        toolbar={toolbar}
        empty={
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon"><InboxIcon /></EmptyMedia>
              <EmptyTitle>Nothing to review</EmptyTitle>
              <EmptyDescription>Marks sheets appear here when teachers submit them.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
      <ConfirmDialog
        open={action !== null}
        onOpenChange={(open) => !open && setAction(null)}
        title={`${action?.kind === "verify" ? "Verify" : action?.kind === "approve" ? "Approve" : "Return"} ${action?.ids.length === 1 ? "this marks sheet" : `${action?.ids.length ?? 0} marks sheets`}?`}
        description={
          action?.kind === "return"
            ? "Teachers can edit returned marks again; every change is recorded with a reason."
            : "Sheets that aren't ready, or that you submitted yourself where the policy separates duties, are skipped and listed."
        }
        confirmLabel={action?.kind === "verify" ? "Verify" : action?.kind === "approve" ? "Approve" : "Return"}
        onConfirm={run}
      >
        {action?.kind === "return" && (
          <div className="grid gap-1.5">
            <Label htmlFor="review-note">What needs correcting?</Label>
            <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}
