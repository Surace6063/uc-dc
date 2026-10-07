"use client"

import * as React from "react"
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import {
  FileSpreadsheetIcon,
  FileTextIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"

import {
  ariaSort,
  DataTablePagination,
  SortButton,
} from "@/components/data-table"
import {
  complaintBases,
  describeComplaint,
  grievances as initialGrievances,
  type Grievance,
} from "@/components/grievance/data"
import {
  GrievanceFormDialog,
  type GrievanceFormValues,
} from "@/components/grievance/grievance-form-dialog"
import { currentUser } from "@/components/nav-data"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/components/ui/toast"

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

const helper = createColumnHelper<typeof features, Grievance>()

const PAGE_SIZES = [10, 25, 50]

// Columns shared by the table and both exports.
const exportColumns: { label: string; value: (g: Grievance) => string }[] = [
  { label: "Grievant name", value: (g) => g.grievantName },
  { label: "Program", value: (g) => g.program },
  { label: "Year/Semester", value: (g) => g.term },
  { label: "Section", value: (g) => g.section },
  { label: "Role", value: (g) => g.role },
  { label: "Complaint", value: describeComplaint },
  { label: "Date", value: (g) => g.date },
  { label: "Location", value: (g) => g.location },
  { label: "Tormentor name", value: (g) => g.tormentorName },
  { label: "Phone", value: (g) => g.phone },
]

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportExcel(rows: Grievance[]) {
  // CSV with a UTF-8 BOM opens directly in Excel.
  const escape = (v: string) => `"${v.replaceAll('"', '""')}"`
  const lines = [
    exportColumns.map((c) => escape(c.label)).join(","),
    ...rows.map((r) => exportColumns.map((c) => escape(c.value(r))).join(",")),
  ]
  download(
    new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
    "grievances.csv"
  )
}

async function exportPdf(rows: Grievance[]) {
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])
  const doc = new jsPDF({ orientation: "landscape" })
  doc.setFontSize(14)
  doc.text("Grievance List · United College", 14, 16)
  autoTable(doc, {
    startY: 22,
    head: [exportColumns.map((c) => c.label)],
    body: rows.map((r) => exportColumns.map((c) => c.value(r))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [175, 77, 52] },
  })
  doc.save("grievances.pdf")
}

export function GrievanceTable() {
  const [data, setData] = React.useState<Grievance[]>(initialGrievances)
  const [basis, setBasis] = React.useState("")
  const [appliedBasis, setAppliedBasis] = React.useState("")
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState<Grievance | null>(null)

  const rows = React.useMemo(
    () =>
      appliedBasis
        ? data.filter((g) => g.complaint.some((c) => c === appliedBasis))
        : data,
    [data, appliedBasis]
  )

  const columns = React.useMemo(
    () =>
      helper.columns([
        helper.accessor("grievantName", {
          header: "Grievant name",
          cell: ({ getValue }) => (
            <span className="font-medium">{getValue()}</span>
          ),
        }),
        helper.accessor("program", { header: "Program" }),
        helper.accessor("term", { header: "Year / Semester" }),
        helper.accessor("section", { header: "Section" }),
        helper.accessor("role", { header: "Role" }),
        helper.accessor(describeComplaint, {
          id: "complaint",
          header: "Complaint",
          cell: ({ row }) => (
            <div className="max-w-56">
              <div className="flex flex-wrap gap-1">
                {row.original.complaint.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-primary"
                  >
                    {c}
                  </span>
                ))}
              </div>
              {row.original.otherDetails && (
                <p
                  className="mt-1 line-clamp-2 text-xs whitespace-normal text-muted-foreground"
                  title={row.original.otherDetails}
                >
                  {row.original.otherDetails}
                </p>
              )}
            </div>
          ),
        }),
        helper.accessor("date", { header: "Date" }),
        helper.accessor("location", { header: "Location" }),
        helper.accessor("tormentorName", { header: "Tormentor name" }),
        helper.accessor("phone", { header: "Phone number" }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete grievance from ${row.original.grievantName}`}
                onClick={() => setDeleting(row.original)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon />
              </Button>
            </div>
          ),
        }),
      ]),
    []
  )

  const table = useTable({
    features,
    columns,
    data: rows,
    globalFilterFn: "includesString",
    getColumnCanGlobalFilter: (column) => column.id !== "actions",
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      sorting: [{ id: "date", desc: true }],
    },
  })

  const { pagination, globalFilter } = table.state
  const visible = table.getPrePaginatedRowModel().rows.map((r) => r.original)

  function handleAdd(values: GrievanceFormValues) {
    // TODO: submit the grievance through the API.
    const grievance: Grievance = {
      ...values,
      id: `GR-${Date.now()}`,
      grievantName: currentUser.name,
      program: "—",
      term: "—",
      section: "—",
      role: "Staff",
    }
    setData((prev) => [grievance, ...prev])
    table.setPageIndex(0)
    toast.add({
      title: "Grievance submitted",
      description: `${values.informTo} will be informed.`,
      type: "success",
    })
  }

  function handleDelete() {
    if (!deleting) return
    setData((prev) => prev.filter((g) => g.id !== deleting.id))
    toast.add({ title: "Grievance deleted", type: "success" })
    setDeleting(null)
  }

  return (
    <Card className="gap-0 p-0">
      {/* Title, exports and filter */}
      <div className="flex flex-col gap-4 border-b p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-medium">Grievances</h2>
            <p className="text-sm text-muted-foreground">
              Complaints raised by students and staff.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => exportExcel(visible)}
              disabled={visible.length === 0}
            >
              <FileSpreadsheetIcon data-icon="inline-start" />
              Export Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => exportPdf(visible)}
              disabled={visible.length === 0}
            >
              <FileTextIcon data-icon="inline-start" />
              Export PDF
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              Add grievance
            </Button>
          </div>
        </div>

        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            setAppliedBasis(basis)
            table.setPageIndex(0)
          }}
        >
          <div className="grid flex-1 gap-2 sm:max-w-xs">
            <Label htmlFor="filter-basis">Basis of complaint</Label>
            <NativeSelect
              id="filter-basis"
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              className="w-full"
            >
              <NativeSelectOption value="">All</NativeSelectOption>
              {complaintBases.map((b) => (
                <NativeSelectOption key={b} value={b}>
                  {b}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              Filter grievance
            </Button>
            {appliedBasis && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setBasis("")
                  setAppliedBasis("")
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* Table controls */}
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Show
          <NativeSelect
            size="sm"
            value={pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((size) => (
              <NativeSelectOption key={size} value={size}>
                {size}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          entries
        </div>
        <div className="relative sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter ?? ""}
            onChange={(e) => {
              table.setGlobalFilter(e.target.value)
              table.setPageIndex(0)
            }}
            placeholder="Search…"
            aria-label="Search grievances"
            className="h-8 pl-9"
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="bg-muted/40 hover:bg-muted/40">
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={ariaSort(sorted)}
                    className="first:pl-4 last:pr-4"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <SortButton
                        sorted={sorted}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                      </SortButton>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={
                    cell.column.id === "date" || cell.column.id === "phone"
                      ? "text-muted-foreground tabular-nums first:pl-4 last:pr-4"
                      : "first:pl-4 last:pr-4"
                  }
                >
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
          {visible.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="h-32 text-center text-muted-foreground"
              >
                No grievances found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <DataTablePagination
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        pageCount={table.getPageCount()}
        total={visible.length}
        onPageChange={(page) => table.setPageIndex(page)}
      />

      <GrievanceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleAdd}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this grievance?</AlertDialogTitle>
            <AlertDialogDescription>
              The grievance from {deleting?.grievantName} will be permanently
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
