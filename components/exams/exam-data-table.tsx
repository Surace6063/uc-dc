"use client"

import * as React from "react"
import Link from "next/link"
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
  CalendarDaysIcon,
  ClipboardPenLineIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

import {
  ariaSort,
  DataTablePagination,
  SortButton,
} from "@/components/data-table"
import {
  examSubjects,
  exams as initialExams,
  levelOf,
  TODAY_BS,
  type Exam,
} from "@/components/exams/data"
import {
  ExamFormDialog,
  type ExamFormValues,
} from "@/components/exams/exam-form-dialog"
import { StatusBadge } from "@/components/exams/status-badge"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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

const helper = createColumnHelper<typeof features, Exam>()

const PAGE_SIZES = [10, 25, 50]

function RowAction({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ExamDataTable() {
  const [data, setData] = React.useState<Exam[]>(initialExams)
  const [subject, setSubject] = React.useState("")
  const [appliedSubject, setAppliedSubject] = React.useState("")
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Exam | undefined>()

  const rows = React.useMemo(
    () =>
      appliedSubject ? data.filter((e) => e.subject === appliedSubject) : data,
    [data, appliedSubject]
  )

  const columns = React.useMemo(
    () =>
      helper.columns([
        helper.accessor("level", { header: "Level" }),
        helper.accessor("program", { header: "Program" }),
        helper.accessor("term", { header: "Year / Semester" }),
        helper.accessor("name", {
          header: "Exam name",
          cell: ({ row }) => (
            <div>
              <p className="font-medium">{row.original.name}</p>
              <p className="text-xs text-muted-foreground">
                {row.original.subject}
              </p>
            </div>
          ),
        }),
        helper.accessor("startDate", { header: "Start date" }),
        helper.accessor("type", { header: "Exam type" }),
        helper.accessor("createdDate", { header: "Created" }),
        helper.accessor("status", {
          header: "Status",
          cell: ({ getValue }) => <StatusBadge status={getValue()} />,
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => (
            <div className="flex justify-end gap-0.5">
              <RowAction
                label="Assign marks"
                render={<Link href="/dashboard/exams/marks" />}
                nativeButton={false}
              >
                <ClipboardPenLineIcon />
              </RowAction>
              <RowAction
                label="Edit exam"
                onClick={() => {
                  setEditing(row.original)
                  setDialogOpen(true)
                }}
              >
                <PencilIcon />
              </RowAction>
              <RowAction
                label="Exam schedule"
                render={<Link href="/dashboard/exams/schedule" />}
                nativeButton={false}
              >
                <CalendarDaysIcon />
              </RowAction>
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
      sorting: [{ id: "createdDate", desc: true }],
    },
  })

  const { pagination, globalFilter } = table.state
  const filteredCount = table.getFilteredRowModel().rows.length
  const pageCount = table.getPageCount()

  function handleSubmit(values: ExamFormValues) {
    if (editing) {
      setData((prev) =>
        prev.map((exam) =>
          exam.id === editing.id
            ? { ...exam, ...values, level: levelOf(values.program) }
            : exam
        )
      )
      toast.add({
        title: "Exam updated",
        description: values.name,
        type: "success",
      })
    } else {
      // TODO: create the exam through the API.
      const exam: Exam = {
        ...values,
        id: `EX-${Date.now()}`,
        level: levelOf(values.program),
        createdDate: TODAY_BS,
      }
      setData((prev) => [exam, ...prev])
      table.setPageIndex(0)
      toast.add({
        title: "Exam added",
        description: values.name,
        type: "success",
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter criteria */}
      <Card className="gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-medium">Filter criteria</h2>
            <p className="text-sm text-muted-foreground">
              Narrow the list to a single subject.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(undefined)
              setDialogOpen(true)
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Add new
          </Button>
        </div>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            setAppliedSubject(subject)
            table.setPageIndex(0)
          }}
        >
          <div className="grid flex-1 gap-2 sm:max-w-md">
            <Label htmlFor="filter-subject">Subject</Label>
            <NativeSelect
              id="filter-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full"
            >
              <NativeSelectOption value="">All subjects</NativeSelectOption>
              {examSubjects.map((s) => (
                <NativeSelectOption key={s.name} value={s.name}>
                  {s.name} ({s.program})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            {appliedSubject && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSubject("")
                  setAppliedSubject("")
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </form>
      </Card>

      {/* Data table */}
      <Card className="gap-0 p-0">
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
              aria-label="Search exams"
              className="h-8 pl-9"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow
                key={group.id}
                className="bg-muted/40 hover:bg-muted/40"
              >
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  const canSort = header.column.getCanSort()
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={ariaSort(sorted)}
                      className="first:pl-4 last:pr-4"
                    >
                      {header.isPlaceholder ? null : canSort ? (
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
                    className={cn(
                      "first:pl-4 last:pr-4",
                      cell.column.id === "startDate" ||
                        cell.column.id === "createdDate"
                        ? "text-muted-foreground tabular-nums"
                        : undefined
                    )}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {filteredCount === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  No exams found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <DataTablePagination
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          pageCount={pageCount}
          total={filteredCount}
          onPageChange={(page) => table.setPageIndex(page)}
        />
      </Card>

      <ExamFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
