"use client"

import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"

/** Header button that toggles a column's sort and shows its direction. */
export function SortButton({
  sorted,
  onClick,
  children,
}: {
  sorted: false | "asc" | "desc"
  onClick?: (event: unknown) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
      {sorted === "asc" ? (
        <ArrowUpIcon className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon className="size-3.5" />
      ) : (
        <ArrowUpDownIcon className="size-3.5 opacity-40" />
      )}
    </button>
  )
}

export function ariaSort(sorted: false | "asc" | "desc") {
  if (sorted === "asc") return "ascending" as const
  if (sorted === "desc") return "descending" as const
  return undefined
}

/** Page numbers with ellipses, e.g. 1 2 3 4 5 … 8 */
function pageList(current: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i)
  if (current < 4) return [0, 1, 2, 3, 4, "…", count - 1]
  if (current > count - 5)
    return [0, "…", ...Array.from({ length: 5 }, (_, i) => count - 5 + i)]
  return [0, "…", current - 1, current, current + 1, "…", count - 1]
}

/** "Showing x to y of z entries" plus page navigation. */
export function DataTablePagination({
  pageIndex,
  pageSize,
  pageCount,
  total,
  onPageChange,
}: {
  pageIndex: number
  pageSize: number
  pageCount: number
  total: number
  onPageChange: (pageIndex: number) => void
}) {
  const from = total === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min(total, (pageIndex + 1) * pageSize)

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {from} to {to} of {total} entries
      </p>
      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(pageIndex - 1)}
            disabled={pageIndex === 0}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            Previous
          </Button>
          {pageList(pageIndex, pageCount).map((page, i) =>
            page === "…" ? (
              <span
                key={`gap-${i}`}
                className="px-1 text-sm text-muted-foreground"
              >
                …
              </span>
            ) : (
              <Button
                key={page}
                variant={page === pageIndex ? "outline" : "ghost"}
                size="icon-sm"
                aria-current={page === pageIndex ? "page" : undefined}
                onClick={() => onPageChange(page)}
              >
                {page + 1}
              </Button>
            )
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(pageIndex + 1)}
            disabled={pageIndex >= pageCount - 1}
          >
            Next
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </nav>
      )}
    </div>
  )
}
