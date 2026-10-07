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
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileTextIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

import {
  ariaSort,
  DataTablePagination,
  SortButton,
} from "@/components/data-table"
import {
  events,
  type CollegeEvent,
  type EventReport,
} from "@/components/events/data"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

const helper = createColumnHelper<typeof features, CollegeEvent>()

const PAGE_SIZES = [10, 25, 50]

const organizers: CollegeEvent["organizedBy"][] = [
  "Institution own self",
  "External institution",
]
const participantGroups: CollegeEvent["participants"][] = [
  "All",
  "Staff",
  "Students",
]

function ReportLink({ report }: { report: EventReport }) {
  return (
    <a
      href={report.url}
      download
      className="inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
    >
      <DownloadIcon className="size-3.5" />
      {report.name}
    </a>
  )
}

function EventDetails({ event }: { event: CollegeEvent }) {
  const details: { label: string; value: React.ReactNode }[] = [
    { label: "Title", value: event.title },
    {
      label: "Event date",
      value: <span className="tabular-nums">{event.date} (BS)</span>,
    },
    { label: "Organizer", value: event.organizedBy },
    { label: "Venue", value: event.venue },
    { label: "Participants", value: event.participants },
    {
      label: "Role",
      value: event.roles.length > 0 ? event.roles.join(", ") : "—",
    },
  ]

  return (
    <div className="grid min-h-0 overflow-y-auto md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* About and attachments */}
      <div className="flex flex-col gap-6 border-b p-5 md:border-r md:border-b-0">
        <section>
          <h3 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            About event
          </h3>
          <dl className="divide-y rounded-lg border">
            {details.map(({ label, value }) => (
              <div
                key={label}
                className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 px-3 py-2.5 text-sm"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Attachments
          </h3>
          {event.reports.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {event.reports.map((report, i) => (
                <li
                  key={report.url}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileTextIcon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    Attachment {i + 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <a href={report.url} target="_blank" rel="noreferrer" />
                    }
                    nativeButton={false}
                  >
                    <ExternalLinkIcon data-icon="inline-start" />
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              No attachments uploaded.
            </p>
          )}
        </section>
      </div>

      {/* Objectives */}
      <section className="p-5">
        <h3 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Objectives of the event / training
        </h3>
        {event.objectives.length > 0 ? (
          <ol className="space-y-3">
            {event.objectives.map((objective, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="pt-0.5">{objective}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
            No objectives recorded for this event.
          </p>
        )}
      </section>
    </div>
  )
}

export function EventTable() {
  const [viewing, setViewing] = React.useState<CollegeEvent | null>(null)
  const [organizer, setOrganizer] = React.useState("")
  const [participants, setParticipants] = React.useState("")

  const rows = React.useMemo(
    () =>
      events.filter(
        (e) =>
          (!organizer || e.organizedBy === organizer) &&
          (!participants || e.participants === participants)
      ),
    [organizer, participants]
  )

  const columns = React.useMemo(
    () =>
      helper.columns([
        helper.accessor("title", {
          header: "Title",
          cell: ({ getValue }) => (
            <p className="max-w-72 font-medium whitespace-normal">
              {getValue()}
            </p>
          ),
        }),
        helper.accessor("organizedBy", {
          header: "Organized by",
          cell: ({ getValue }) => {
            const internal = getValue() === "Institution own self"
            return (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                  internal
                    ? "bg-primary/10 text-primary"
                    : "bg-sky-500/10 text-sky-700 dark:text-sky-400"
                )}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {getValue()}
              </span>
            )
          },
        }),
        helper.accessor("date", { header: "Date" }),
        helper.accessor("venue", {
          header: "Venue",
          cell: ({ getValue }) => (
            <p className="max-w-64 whitespace-normal">{getValue()}</p>
          ),
        }),
        helper.accessor("participants", {
          header: "Participants",
          cell: ({ getValue }) => (
            <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium">
              <UsersIcon className="size-3 text-muted-foreground" />
              {getValue()}
            </span>
          ),
        }),
        helper.display({
          id: "report",
          header: "Report",
          cell: ({ row }) =>
            row.original.reports.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {row.original.reports.map((report) => (
                  <ReportLink key={report.url} report={report} />
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`View ${row.original.title}`}
                onClick={() => setViewing(row.original)}
              >
                <EyeIcon />
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
    getColumnCanGlobalFilter: (column) =>
      column.id !== "actions" && column.id !== "report",
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      sorting: [{ id: "date", desc: true }],
    },
  })

  const { pagination, globalFilter } = table.state
  const total = table.getPrePaginatedRowModel().rows.length

  return (
    <Card className="gap-0 p-0">
      {/* Title and filters */}
      <div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-medium">Events</h2>
          <p className="text-sm text-muted-foreground">
            {events.length} events ·{" "}
            {events.filter((e) => e.reports.length > 0).length} with reports
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="filter-organizer">Organized by</Label>
            <NativeSelect
              id="filter-organizer"
              value={organizer}
              onChange={(e) => {
                setOrganizer(e.target.value)
                table.setPageIndex(0)
              }}
              className="w-full sm:w-52"
            >
              <NativeSelectOption value="">All organizers</NativeSelectOption>
              {organizers.map((o) => (
                <NativeSelectOption key={o} value={o}>
                  {o}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="filter-participants">Participants</Label>
            <NativeSelect
              id="filter-participants"
              value={participants}
              onChange={(e) => {
                setParticipants(e.target.value)
                table.setPageIndex(0)
              }}
              className="w-full sm:w-40"
            >
              <NativeSelectOption value="">Everyone</NativeSelectOption>
              {participantGroups.map((p) => (
                <NativeSelectOption key={p} value={p}>
                  {p}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {(organizer || participants) && (
            <Button
              variant="ghost"
              onClick={() => {
                setOrganizer("")
                setParticipants("")
              }}
            >
              Reset
            </Button>
          )}
        </div>
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
            aria-label="Search events"
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
                      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        <table.FlexRender header={header} />
                      </span>
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
                    cell.column.id === "date"
                      ? "text-muted-foreground tabular-nums first:pl-4 last:pr-4"
                      : "first:pl-4 last:pr-4"
                  }
                >
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
          {total === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="h-32 text-center text-muted-foreground"
              >
                No events found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <DataTablePagination
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        pageCount={table.getPageCount()}
        total={total}
        onPageChange={(page) => table.setPageIndex(page)}
      />

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
      >
        <DialogContent className="max-h-[90svh] grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-3xl">
          {viewing && (
            <>
              <DialogHeader className="border-b p-5 pr-12">
                <DialogDescription className="text-xs">
                  Event details · {viewing.id}
                </DialogDescription>
                <DialogTitle className="text-lg leading-snug">
                  {viewing.title}
                </DialogTitle>
              </DialogHeader>
              <EventDetails event={viewing} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
