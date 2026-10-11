"use client"

import * as React from "react"
import { BriefcaseIcon, DownloadIcon } from "lucide-react"

import { createServerColumnHelper, ServerDataTable, type ServerColumns } from "@/components/server-data-table"
import { FilterSelect, labelOptions, SearchBox } from "@/components/shared/filter-controls"
import { useCan } from "@/components/shared/session-provider"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AttendanceStatusBadge } from "@/features/attendance/components/attendance-nav"
import { ATTENDANCE_STATUS_LABELS, formatDay } from "@/features/attendance/constants"
import type { EmployeeFilters } from "@/features/attendance/filters"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { EmployeeRecordRow } from "@/services/attendance/employee-service"

// Teacher and staff attendance history: a separate table from student
// records, because the columns and rules differ.
export function EmployeeRecordsTable({ rows, total, filters }: { rows: EmployeeRecordRow[]; total: number; filters: EmployeeFilters }) {
  const { searchParams, setParams, pending } = useUrlFilters()
  const canExport = useCan("attendance.export")

  const columns = React.useMemo<ServerColumns<EmployeeRecordRow>>(() => {
    const h = createServerColumnHelper<EmployeeRecordRow>()
    return [
      h.accessor("date", { header: "Date", meta: { cellClassName: "whitespace-nowrap" }, cell: ({ getValue }) => formatDay(getValue()) }),
      h.accessor("name", {
        header: "Name",
        cell: ({ row }) => (
          <span className="block min-w-40">
            <span className="font-medium">{row.original.name}</span>
            <span className="block text-xs text-muted-foreground"><span className="font-mono">{row.original.employeeId}</span> · {row.original.type === "TEACHER" ? "Teacher" : "Staff"}</span>
          </span>
        ),
      }),
      h.accessor("status", { header: "Status", cell: ({ row }) => <AttendanceStatusBadge status={row.original.status} /> }),
      h.accessor((r) => r.checkIn ?? "", { id: "checkIn", header: "Check-in", enableSorting: false, meta: { cellClassName: "tabular-nums" }, cell: ({ getValue }) => getValue() || "—" }),
      h.accessor((r) => r.checkOut ?? "", { id: "checkOut", header: "Check-out", enableSorting: false, meta: { cellClassName: "tabular-nums" }, cell: ({ getValue }) => getValue() || "—" }),
      h.accessor((r) => r.lateMinutes ?? 0, { id: "late", header: "Late", enableSorting: false, cell: ({ row }) => (row.original.lateMinutes ? `${row.original.lateMinutes} min` : "—") }),
      h.accessor((r) => r.reason ?? "", { id: "reason", header: "Reason", enableSorting: false, cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span> }),
      h.accessor((r) => r.source, {
        id: "source",
        header: "Recorded",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.source === "SELF_SERVICE" ? "Self check-in" : row.original.source === "IMPORT" ? "Import" : (row.original.markedBy ?? "Manual")}
            {row.original.corrected && " · corrected"}
          </span>
        ),
      }),
    ]
  }, [])

  const exportHref = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    params.delete("pageSize")
    params.delete("view")
    return `/api/attendance/staff/export?${params}`
  }

  const toolbar = (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
      <div className="flex flex-wrap items-end gap-3">
        <SearchBox value={filters.q ?? ""} onSearch={(q) => setParams({ q })} placeholder="Name or employee ID" label="Search" />
        <div className="grid gap-1.5">
          <Label htmlFor="emp-from" className="text-xs text-muted-foreground">From</Label>
          <Input id="emp-from" type="date" value={filters.from ?? ""} onChange={(e) => setParams({ from: e.target.value || null })} className="h-8" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="emp-to" className="text-xs text-muted-foreground">To</Label>
          <Input id="emp-to" type="date" value={filters.to ?? ""} onChange={(e) => setParams({ to: e.target.value || null })} className="h-8" />
        </div>
        <div className="w-32"><FilterSelect label="Type" value={filters.type} onChange={(v) => setParams({ type: v })} options={[{ value: "TEACHER", label: "Teachers" }, { value: "STAFF", label: "Staff" }]} /></div>
        <div className="w-32"><FilterSelect label="Status" value={filters.status} onChange={(v) => setParams({ status: v })} options={labelOptions(ATTENDANCE_STATUS_LABELS)} /></div>
      </div>
      {canExport && (
        <Button size="sm" variant="outline" nativeButton={false} render={<a href={exportHref()} />}>
          <DownloadIcon data-icon="inline-start" />
          Export CSV
        </Button>
      )}
    </div>
  )

  return (
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
      loading={pending}
      toolbar={toolbar}
      empty={
        <Empty className="py-6">
          <EmptyHeader>
            <EmptyMedia variant="icon"><BriefcaseIcon /></EmptyMedia>
            <EmptyTitle>No teacher or staff attendance</EmptyTitle>
            <EmptyDescription>Records appear here once the daily register is saved or people check in.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  )
}
