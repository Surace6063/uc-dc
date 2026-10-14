"use client"

import * as React from "react"
import { SearchIcon } from "lucide-react"

import { ariaSort, DataTablePagination, SortButton } from "@/components/data-table"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

// A searchable, sortable, paginated table for lists that are already
// limited on the server (a class roster, an assignment's submissions).

export type LocalColumn<T> = {
  id: string
  header: string
  cell: (row: T) => React.ReactNode
  sortValue?: (row: T) => string | number | null
  className?: string
}

export function LocalTable<T>({
  rows,
  columns,
  getRowId,
  searchText,
  searchPlaceholder = "Search",
  initialSort,
  pageSize = 25,
  empty,
  toolbar,
}: {
  rows: T[]
  columns: LocalColumn<T>[]
  getRowId: (row: T) => string
  searchText?: (row: T) => string
  searchPlaceholder?: string
  initialSort?: { id: string; desc?: boolean }
  pageSize?: number
  empty?: React.ReactNode
  toolbar?: React.ReactNode
}) {
  const [q, setQ] = React.useState("")
  const [sort, setSort] = React.useState(initialSort ?? null)
  const [page, setPage] = React.useState(0)

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = term && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(term)) : rows
    const col = sort && columns.find((c) => c.id === sort.id)
    if (!col?.sortValue) return list
    const value = col.sortValue
    return [...list].sort((a, b) => {
      const x = value(a)
      const y = value(b)
      if (x === y) return 0
      if (x === null) return 1
      if (y === null) return -1
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })
      return sort!.desc ? -cmp : cmp
    })
  }, [rows, q, sort, columns, searchText])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pageCount - 1)
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize)

  return (
    <div className="rounded-xl border bg-card">
      {(searchText || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          {searchText && (
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setPage(0)
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-9 pl-8"
              />
            </div>
          )}
          {toolbar}
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {columns.map((c, i) => {
                const sorted = sort?.id === c.id ? (sort.desc ? "desc" : "asc") : false
                return (
                  <TableHead key={c.id} aria-sort={ariaSort(sorted)} className={cn(i === 0 && "pl-4", i === columns.length - 1 && "pr-4", c.className)}>
                    {c.sortValue ? (
                      <SortButton sorted={sorted} onClick={() => setSort(sort?.id === c.id ? { id: c.id, desc: !sort.desc } : { id: c.id })}>
                        {c.header}
                      </SortButton>
                    ) : (
                      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{c.header}</span>
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted-foreground">
                  {q ? "No matches." : (empty ?? "Nothing here yet.")}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => (
                <TableRow key={getRowId(row)}>
                  {columns.map((c, i) => (
                    <TableCell key={c.id} className={cn(i === 0 && "pl-4", i === columns.length - 1 && "pr-4", c.className)}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination pageIndex={current} pageSize={pageSize} pageCount={pageCount} total={filtered.length} onPageChange={setPage} />
    </div>
  )
}
