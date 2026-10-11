"use client"

import * as React from "react"
import {
  columnVisibilityFeature,
  createColumnHelper,
  metaHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table"
import { AlertTriangleIcon, Columns3Icon, RotateCcwIcon } from "lucide-react"

import { ariaSort, DataTablePagination, SortButton } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// A table whose rows, sorting, pagination and counts all come from the
// server. The table only renders and reports state changes; the page turns
// them into a new request (usually URL search params). Reusable for any list:
// students, teachers, staff, guardians, courses, ...

type ColumnMeta = {
  // Name shown in the column visibility menu.
  label?: string
  cellClassName?: string
  headerClassName?: string
}

export const serverTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
  columnMeta: metaHelper<ColumnMeta>(),
})

export type ServerTableFeatures = typeof serverTableFeatures

export function createServerColumnHelper<TData extends RowData>() {
  return createColumnHelper<ServerTableFeatures, TData>()
}

export type ServerColumns<TData extends RowData> = ColumnDef<ServerTableFeatures, TData, any>[] // eslint-disable-line @typescript-eslint/no-explicit-any

const apply = <T,>(updater: Updater<T>, current: T) =>
  typeof updater === "function" ? (updater as (old: T) => T)(current) : updater

// Checkbox column: selects rows on the current page; selection is kept by ID
// across pages so bulk actions can span several pages.
export function selectionColumn<TData extends RowData>(): ServerColumns<TData>[number] {
  const helper = createServerColumnHelper<TData>()
  return helper.display({
    id: "select",
    enableHiding: false,
    meta: { headerClassName: "w-10", cellClassName: "w-10" },
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows on this page"
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={!table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()}
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(checked) => row.toggleSelected(checked)}
      />
    ),
  })
}

export function ColumnVisibilityMenu({
  columns,
  visibility,
  onChange,
}: {
  columns: { id: string; label: string; canHide: boolean }[]
  visibility: ColumnVisibilityState
  onChange: (next: ColumnVisibilityState) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Columns3Icon data-icon="inline-start" />
        Columns
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show columns</DropdownMenuLabel>
          {columns
            .filter((c) => c.canHide)
            .map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={visibility[c.id] !== false}
                onCheckedChange={(checked) => onChange({ ...visibility, [c.id]: checked })}
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type ServerDataTableProps<TData extends RowData> = {
  data: TData[]
  columns: ServerColumns<TData>
  rowCount: number
  getRowId: (row: TData) => string
  pagination: PaginationState
  onPaginationChange: (next: PaginationState) => void
  sorting: SortingState
  onSortingChange: (next: SortingState) => void
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (next: RowSelectionState) => void
  columnVisibility?: ColumnVisibilityState
  pageSizes?: readonly number[]
  // A request for new data is in flight; rows are dimmed, not removed.
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  empty?: React.ReactNode
  // Rendered above the table (search, filters, bulk actions).
  toolbar?: React.ReactNode
  rowClassName?: (row: TData) => string | undefined
}

export function ServerDataTable<TData extends RowData>({
  data,
  columns,
  rowCount,
  getRowId,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  rowSelection = {},
  onRowSelectionChange,
  columnVisibility = {},
  pageSizes = [10, 25, 50, 100],
  loading,
  error,
  onRetry,
  empty,
  toolbar,
  rowClassName,
}: ServerDataTableProps<TData>) {
  const table = useTable({
    features: serverTableFeatures,
    columns,
    data,
    getRowId,
    rowCount,
    manualPagination: true,
    manualSorting: true,
    enableSortingRemoval: false,
    enableRowSelection: Boolean(onRowSelectionChange),
    state: { pagination, sorting, rowSelection, columnVisibility },
    onPaginationChange: (updater) => onPaginationChange(apply(updater, pagination)),
    onSortingChange: (updater) => onSortingChange(apply(updater, sorting)),
    onRowSelectionChange: (updater) => onRowSelectionChange?.(apply(updater, rowSelection)),
  })

  const pageCount = Math.max(1, Math.ceil(rowCount / pagination.pageSize))
  const visibleColumnCount = table.getVisibleLeafColumns().length
  const rows = table.getRowModel().rows

  return (
    <div className="flex min-w-0 flex-col rounded-xl border bg-card">
      {toolbar}

      <div className="relative max-h-[70vh] overflow-auto" aria-busy={loading || undefined}>
        <Table className="min-w-[960px]">
          <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  const meta = header.column.columnDef.meta
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={ariaSort(sorted)}
                      className={cn("first:pl-4 last:pr-4", meta?.headerClassName)}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <SortButton sorted={sorted} onClick={header.column.getToggleSortingHandler()}>
                          <table.FlexRender header={header} />
                        </SortButton>
                      ) : (
                        <span className="text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                          <table.FlexRender header={header} />
                        </span>
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className={cn("transition-opacity", loading && rows.length > 0 && "opacity-50")}>
            {error ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumnCount} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <AlertTriangleIcon className="size-6 text-destructive" />
                    <p className="text-sm text-muted-foreground">{error}</p>
                    {onRetry && (
                      <Button variant="outline" size="sm" onClick={onRetry}>
                        <RotateCcwIcon data-icon="inline-start" />
                        Try again
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : loading && rows.length === 0 ? (
              Array.from({ length: Math.min(pagination.pageSize, 8) }, (_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: visibleColumnCount }, (_, j) => (
                    <TableCell key={j} className="first:pl-4 last:pr-4">
                      <Skeleton className="h-4 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumnCount} className="h-56 text-center text-muted-foreground">
                  {empty ?? "No results."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={rowClassName?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn("first:pl-4 last:pr-4", cell.column.columnDef.meta?.cellClassName)}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col border-t sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 px-4 pt-3 text-sm text-muted-foreground sm:pt-0">
          Rows
          <NativeSelect
            size="sm"
            value={pagination.pageSize}
            onChange={(e) => onPaginationChange({ pageIndex: 0, pageSize: Number(e.target.value) })}
            aria-label="Rows per page"
          >
            {pageSizes.map((size) => (
              <NativeSelectOption key={size} value={size}>
                {size}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex-1 [&>div]:border-t-0">
          <DataTablePagination
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            pageCount={pageCount}
            total={rowCount}
            onPageChange={(pageIndex) => onPaginationChange({ ...pagination, pageIndex })}
          />
        </div>
      </div>
    </div>
  )
}
