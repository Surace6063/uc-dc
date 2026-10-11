"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ColumnVisibilityState, RowSelectionState } from "@tanstack/react-table"
import { ClipboardListIcon, DownloadIcon, ExternalLinkIcon, HistoryIcon, MoreHorizontalIcon, PencilIcon, XIcon } from "lucide-react"

import {
  ColumnVisibilityMenu,
  createServerColumnHelper,
  selectionColumn,
  ServerDataTable,
  type ServerColumns,
} from "@/components/server-data-table"
import { FilterSelect, labelOptions, SearchBox } from "@/components/shared/filter-controls"
import { useCan } from "@/components/shared/session-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AttendanceStatusBadge } from "@/features/attendance/components/attendance-nav"
import { CorrectionDialog } from "@/features/attendance/components/correction-dialog"
import { RecordHistoryDialog } from "@/features/attendance/components/record-history"
import { ATTENDANCE_STATUS_LABELS, formatDay, SESSION_TYPE_LABELS } from "@/features/attendance/constants"
import { RECORD_DEPENDENTS, type RecordFilters } from "@/features/attendance/filters"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { AttendanceStatus } from "@/lib/generated/prisma/enums"
import type { RecordRow } from "@/services/attendance/record-query"

export type RecordFilterOptions = {
  years: { id: string; name: string }[]
  classes: { id: string; name: string }[]
  sections: { id: string; name: string }[]
  offerings: { id: string; name: string }[]
  statuses: AttendanceStatus[]
  correctionsDirect: boolean
}

function registerHref(r: RecordRow) {
  const q = new URLSearchParams({
    year: r.register.academicYearId,
    date: r.date,
    class: r.register.classId,
    section: r.register.sectionId ?? "all",
    type: r.type,
    slot: String(r.register.slot),
  })
  if (r.register.subjectOfferingId) q.set("offering", r.register.subjectOfferingId)
  return `/dashboard/attendance/take?${q}`
}

export function RecordsTable({ rows, total, filters, options }: { rows: RecordRow[]; total: number; filters: RecordFilters; options: RecordFilterOptions }) {
  const router = useRouter()
  const { searchParams, setParams, pending } = useUrlFilters(RECORD_DEPENDENTS)
  const canUpdate = useCan("attendance.update")
  const canApprove = useCan("attendance.approve")
  const canCorrect = canUpdate || canApprove
  const canExport = useCan("attendance.export")
  const [selection, setSelection] = React.useState<RowSelectionState>({})
  const [visibility, setVisibility] = useLocalStorage<ColumnVisibilityState>("attendance.records.columns", { markedBy: false, checkIn: false })
  const [correcting, setCorrecting] = React.useState<{ ids: string[]; label: string; status?: AttendanceStatus } | null>(null)
  const [history, setHistory] = React.useState<string | null>(null)
  const selectedIds = Object.keys(selection).filter((id) => selection[id])

  const columns = React.useMemo<ServerColumns<RecordRow>>(() => {
    const h = createServerColumnHelper<RecordRow>()
    return [
      ...(canCorrect ? [selectionColumn<RecordRow>()] : []),
      h.accessor("date", {
        header: "Date",
        enableHiding: false,
        meta: { cellClassName: "whitespace-nowrap" },
        cell: ({ row }) => (
          <span>
            {formatDay(row.original.date)}
            <span className="block text-xs text-muted-foreground">{SESSION_TYPE_LABELS[row.original.type]} · {row.original.slotLabel}</span>
          </span>
        ),
      }),
      h.accessor("studentName", {
        id: "student",
        header: "Student",
        enableHiding: false,
        cell: ({ row }) => (
          <Link href={`/dashboard/students/${row.original.studentId}`} className="block min-w-40 hover:underline">
            <span className="font-medium">{row.original.studentName}</span>
            <span className="block font-mono text-xs text-muted-foreground">
              {row.original.admissionNumber}
              {row.original.rollNumber && ` · Roll ${row.original.rollNumber}`}
            </span>
          </Link>
        ),
      }),
      h.accessor("className", { id: "class", header: "Class", enableSorting: false, meta: { label: "Class" } }),
      h.accessor((r) => r.sectionName ?? "", { id: "section", header: "Section", enableSorting: false, meta: { label: "Section" }, cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span> }),
      h.accessor((r) => r.subjectName ?? "", { id: "subject", header: "Subject", enableSorting: false, meta: { label: "Subject" }, cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span> }),
      h.accessor("status", {
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => (
          <span className="flex flex-col items-start gap-0.5">
            <AttendanceStatusBadge status={row.original.status} />
            {row.original.reason && <span className="max-w-40 truncate text-xs text-muted-foreground">{row.original.reason}</span>}
          </span>
        ),
      }),
      h.accessor((r) => r.checkIn ?? "", { id: "checkIn", header: "Check-in", enableSorting: false, meta: { label: "Check-in", cellClassName: "tabular-nums" }, cell: ({ getValue }) => getValue() || "—" }),
      h.accessor((r) => r.lateMinutes ?? 0, { id: "late", header: "Late", enableSorting: false, meta: { label: "Late minutes", cellClassName: "tabular-nums" }, cell: ({ row }) => (row.original.lateMinutes ? `${row.original.lateMinutes} min` : "—") }),
      h.accessor((r) => r.markedBy ?? "", { id: "markedBy", header: "Marked by", enableSorting: false, meta: { label: "Marked by" } }),
      h.accessor((r) => (r.pendingCorrection ? "pending" : r.corrected ? "corrected" : ""), {
        id: "correction",
        header: "Correction",
        enableSorting: false,
        meta: { label: "Correction" },
        cell: ({ row }) =>
          row.original.pendingCorrection ? (
            <span className="text-xs text-amber-700 dark:text-amber-400">Pending review</span>
          ) : row.original.corrected ? (
            <span className="text-xs text-muted-foreground">Corrected</span>
          ) : row.original.sessionStatus === "DRAFT" ? (
            <span className="text-xs text-muted-foreground">Draft register</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }),
      h.display({
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => {
          const r = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.studentName} on ${r.date}`} />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem render={<Link href={registerHref(r)} />}>
                  <ExternalLinkIcon />
                  Open register
                </DropdownMenuItem>
                {canCorrect && r.sessionStatus === "SUBMITTED" && !r.pendingCorrection && (
                  <DropdownMenuItem onClick={() => setCorrecting({ ids: [r.id], label: `${r.studentName}, ${formatDay(r.date)}`, status: r.status })}>
                    <PencilIcon />
                    Correct
                  </DropdownMenuItem>
                )}
                {(r.corrected || r.pendingCorrection) && (
                  <DropdownMenuItem onClick={() => setHistory(r.id)}>
                    <HistoryIcon />
                    History
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
    ]
  }, [canCorrect])

  const columnChoices = columns
    .filter((c) => c.id && c.id !== "select" && c.id !== "actions")
    .map((c) => ({ id: c.id as string, label: c.meta?.label ?? String(c.id), canHide: c.enableHiding !== false }))

  const exportHref = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    params.delete("pageSize")
    return `/api/attendance/export?${params}`
  }
  const hasFilters = searchParams.toString().replace(/(^|&)(page|pageSize|sort|dir)=[^&]*/g, "") !== ""

  const toolbar = (
    <>
      <div className="flex flex-col gap-3 border-b p-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox value={filters.q ?? ""} onSearch={(q) => setParams({ q })} placeholder="Student name or admission no." label="Search records" />
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <div className="grid gap-1.5">
              <Label htmlFor="records-from" className="text-xs text-muted-foreground">From</Label>
              <Input id="records-from" type="date" value={filters.from ?? ""} onChange={(e) => setParams({ from: e.target.value || null })} className="h-8" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="records-to" className="text-xs text-muted-foreground">To</Label>
              <Input id="records-to" type="date" value={filters.to ?? ""} onChange={(e) => setParams({ to: e.target.value || null })} className="h-8" />
            </div>
            <div className="sm:w-32"><FilterSelect label="Academic year" value={filters.year} onChange={(v) => setParams({ year: v })} options={options.years.map((y) => ({ value: y.id, label: y.name }))} /></div>
            <div className="sm:w-36"><FilterSelect label="Class" value={filters.class} onChange={(v) => setParams({ class: v })} options={options.classes.map((c) => ({ value: c.id, label: c.name }))} /></div>
            {options.sections.length > 0 && (
              <div className="sm:w-28"><FilterSelect label="Section" value={filters.section} onChange={(v) => setParams({ section: v })} options={options.sections.map((s) => ({ value: s.id, label: s.name }))} /></div>
            )}
            {options.offerings.length > 0 && (
              <div className="sm:w-40"><FilterSelect label="Subject" value={filters.offering} onChange={(v) => setParams({ offering: v })} options={options.offerings.map((o) => ({ value: o.id, label: o.name }))} /></div>
            )}
            <div className="sm:w-32"><FilterSelect label="Register" value={filters.type} onChange={(v) => setParams({ type: v })} options={labelOptions(SESSION_TYPE_LABELS)} /></div>
            <div className="sm:w-32"><FilterSelect label="Status" value={filters.status} onChange={(v) => setParams({ status: v })} options={labelOptions(ATTENDANCE_STATUS_LABELS)} /></div>
            <div className="sm:w-36">
              <FilterSelect label="Corrections" value={filters.correction} onChange={(v) => setParams({ correction: v })} allLabel="Any" options={[{ value: "corrected", label: "Corrected" }, { value: "pending", label: "Pending review" }]} />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        {selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{selectedIds.length} selected</span>
            <Button size="sm" variant="outline" onClick={() => setCorrecting({ ids: selectedIds, label: `${selectedIds.length} records` })}>
              <PencilIcon data-icon="inline-start" />
              Correct selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelection({})}>
              <XIcon data-icon="inline-start" />
              Clear
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{total.toLocaleString()}</span> {total === 1 ? "record" : "records"}
            {hasFilters && (
              <Button size="xs" variant="ghost" className="ml-2" onClick={() => router.replace("/dashboard/attendance/records")}>
                Clear filters
              </Button>
            )}
          </p>
        )}
        <div className="flex items-center gap-2">
          {canExport && (
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={exportHref()} />}>
              <DownloadIcon data-icon="inline-start" />
              Export CSV
            </Button>
          )}
          <ColumnVisibilityMenu columns={columnChoices} visibility={visibility} onChange={setVisibility} />
        </div>
      </div>
    </>
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
        sorting={[{ id: filters.sort, desc: filters.dir === "desc" }]}
        onSortingChange={(next) => {
          const s = next[0]
          if (s) setParams({ sort: s.id, dir: s.desc ? "desc" : "asc" })
        }}
        rowSelection={canCorrect ? selection : undefined}
        onRowSelectionChange={canCorrect ? setSelection : undefined}
        columnVisibility={visibility}
        loading={pending}
        toolbar={toolbar}
        empty={
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ClipboardListIcon /></EmptyMedia>
              <EmptyTitle>{hasFilters ? "No records match these filters" : "No attendance recorded yet"}</EmptyTitle>
              <EmptyDescription>{hasFilters ? "Try removing some filters." : "Records appear here once registers are saved."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
      {correcting && (
        <CorrectionDialog
          recordIds={correcting.ids}
          label={correcting.label}
          statuses={options.statuses}
          initialStatus={correcting.status}
          direct={options.correctionsDirect}
          onClose={() => setCorrecting(null)}
          onDone={() => setSelection({})}
        />
      )}
      {history && <RecordHistoryDialog recordId={history} onClose={() => setHistory(null)} />}
    </>
  )
}
