"use client"

import * as React from "react"
import Link from "next/link"
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table"
import {
  AwardIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileClockIcon,
  HourglassIcon,
  MoreHorizontalIcon,
  PenLineIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { ColumnVisibilityMenu, createServerColumnHelper, ServerDataTable, type ServerColumns } from "@/components/server-data-table"
import { FilterChips, FilterSelect, labelOptions, SearchBox } from "@/components/shared/filter-controls"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ExamStatusBadge } from "@/features/exams/components/exams-nav"
import { ASSESSMENT_CATEGORY_LABELS, EXAM_STATUS_LABELS, formatDay } from "@/features/exams/constants"
import { EXAM_DEPENDENTS, type ExamFilters } from "@/features/exams/filters"
import { useUrlFilters } from "@/hooks/use-url-filters"
import { useLocalStorage } from "@/hooks/use-local-storage"
import type { ExamRow } from "@/services/exams/examination-query"

type Options = {
  years: { id: string; name: string }[]
  types: { id: string; name: string }[]
  levels: { id: string; name: string }[]
  programs: { id: string; name: string; educationLevelId: string }[]
  classes: { id: string; name: string; educationLevelId: string; programId: string | null }[]
}

export type DashboardStats = { total: number; awaitingMarks: number; awaitingApproval: number; reviewQueue: number; published: number; incomplete: number } | null

export function ExamDashboardCards({ stats, yearName }: { stats: DashboardStats; yearName: string | null }) {
  const { setParams, searchParams } = useUrlFilters(EXAM_DEPENDENTS)
  if (!stats) return null
  const status = searchParams.get("status")
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Examinations" value={stats.total} hint={yearName ? `in ${yearName}` : undefined} icon={ClipboardListIcon} active={!status} onClick={() => setParams({ status: null })} />
      <StatCard label="Awaiting marks" value={stats.awaitingMarks} hint="Sheets not yet submitted" icon={PenLineIcon} active={status === "SCHEDULED"} onClick={() => setParams({ status: "SCHEDULED" })} />
      <StatCard label="Awaiting approval" value={stats.awaitingApproval} hint={`${stats.reviewQueue} sheet${stats.reviewQueue === 1 ? "" : "s"} to review`} icon={HourglassIcon} active={status === "APPROVED"} onClick={() => setParams({ status: "APPROVED" })} />
      <StatCard label="Published" value={stats.published} icon={AwardIcon} active={status === "PUBLISHED"} onClick={() => setParams({ status: "PUBLISHED" })} />
      <StatCard label="Incomplete or withheld" value={stats.incomplete} hint="Students, in published results" icon={TriangleAlertIcon} />
    </div>
  )
}

function Progress({ row }: { row: ExamRow }) {
  const s = row.sheets
  if (s.expected === 0) return <span className="text-muted-foreground">No subjects</span>
  const submitted = s.SUBMITTED + s.VERIFIED + s.APPROVED
  return (
    <span className="whitespace-nowrap tabular-nums">
      {submitted}/{s.expected} submitted
      <span className="block text-xs text-muted-foreground">
        {s.APPROVED} approved{s.RETURNED ? ` · ${s.RETURNED} returned` : ""}
      </span>
    </span>
  )
}

const NO_HIDDEN: ColumnVisibilityState = {}

const HIDEABLE = [
  { id: "type", label: "Type" },
  { id: "year", label: "Academic year" },
  { id: "classes", label: "Classes / program" },
  { id: "dates", label: "Dates" },
  { id: "students", label: "Students" },
  { id: "progress", label: "Marks" },
  { id: "published", label: "Publication" },
]

export function ExamsTable({ rows, total, filters, options, canExport }: { rows: ExamRow[]; total: number; filters: ExamFilters; options: Options; canExport: boolean }) {
  const { setParams, pending, searchParams } = useUrlFilters(EXAM_DEPENDENTS)
  const [visibility, setVisibility] = useLocalStorage<ColumnVisibilityState>("exams.list.columns", NO_HIDDEN)

  const columns = React.useMemo<ServerColumns<ExamRow>>(() => {
    const h = createServerColumnHelper<ExamRow>()
    return [
      h.accessor("name", {
        header: "Examination",
        enableHiding: false,
        cell: ({ row }) => (
          <Link href={`/dashboard/exams/${row.original.id}`} className="block min-w-48 hover:underline">
            <span className="font-medium">{row.original.name}</span>
            <span className="block text-xs text-muted-foreground">{[row.original.code, row.original.term].filter(Boolean).join(" · ") || "—"}</span>
          </Link>
        ),
      }),
      h.accessor("typeName", { id: "type", header: "Type", enableSorting: false, meta: { label: "Type" }, cell: ({ row }) => <span className="text-sm">{row.original.typeName}<span className="block text-xs text-muted-foreground">{ASSESSMENT_CATEGORY_LABELS[row.original.category]}</span></span> }),
      h.accessor("yearName", { id: "year", header: "Year", enableSorting: false, meta: { label: "Academic year" } }),
      h.accessor((r) => r.classes.join(", "), {
        id: "classes",
        header: "Classes",
        enableSorting: false,
        meta: { label: "Classes / program" },
        cell: ({ row }) => (
          <span className="block max-w-56 text-sm">
            {row.original.classes.length ? `${row.original.classes.slice(0, 3).join(", ")}${row.original.classes.length > 3 ? ` +${row.original.classes.length - 3}` : ""}` : "—"}
            {row.original.scope && <span className="block text-xs text-muted-foreground">{row.original.scope}</span>}
          </span>
        ),
      }),
      h.accessor("startDate", {
        id: "dates",
        header: "Dates",
        meta: { label: "Dates", cellClassName: "whitespace-nowrap" },
        cell: ({ row }) => <span className="text-sm">{formatDay(row.original.startDate)}<span className="block text-xs text-muted-foreground">to {formatDay(row.original.endDate)}</span></span>,
      }),
      h.accessor("students", { id: "students", header: "Students", enableSorting: false, meta: { label: "Students", cellClassName: "tabular-nums" } }),
      h.display({ id: "progress", header: "Marks", meta: { label: "Marks" }, cell: ({ row }) => <Progress row={row.original} /> }),
      h.accessor("status", { header: "Status", enableHiding: false, cell: ({ row }) => <ExamStatusBadge status={row.original.status} phase={row.original.phase} /> }),
      h.display({
        id: "published",
        header: "Publication",
        meta: { label: "Publication" },
        cell: ({ row }) => (row.original.publishedVersion ? <span className="text-sm whitespace-nowrap">Version {row.original.publishedVersion}<span className="block text-xs text-muted-foreground">{formatDay(row.original.publishedAt)}</span></span> : <span className="text-muted-foreground">—</span>),
      }),
      h.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableHiding: false,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.name}`} />}>
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem render={<Link href={`/dashboard/exams/${row.original.id}`} />}><ExternalLinkIcon />Open</DropdownMenuItem>
              <DropdownMenuItem render={<Link href={`/dashboard/exams/marks?exam=${row.original.id}`} />}><ClipboardCheckIcon />Marks</DropdownMenuItem>
              <DropdownMenuItem render={<Link href={`/dashboard/exams/${row.original.id}/results`} />}><FileClockIcon />Results</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }),
    ]
  }, [])

  const sorting: SortingState = [{ id: filters.sort === "startDate" ? "dates" : filters.sort, desc: filters.dir === "desc" }]
  const classes = options.classes.filter((c) => (!filters.level || c.educationLevelId === filters.level) && (!filters.program || c.programId === filters.program))
  const chips = [
    filters.q && { key: "q", label: `“${filters.q}”` },
    filters.year && { key: "year", label: options.years.find((y) => y.id === filters.year)?.name ?? "Year" },
    filters.type && { key: "type", label: options.types.find((t) => t.id === filters.type)?.name ?? "Type" },
    filters.category && { key: "category", label: ASSESSMENT_CATEGORY_LABELS[filters.category] },
    filters.level && { key: "level", label: options.levels.find((l) => l.id === filters.level)?.name ?? "Level" },
    filters.program && { key: "program", label: options.programs.find((p) => p.id === filters.program)?.name ?? "Program" },
    filters.class && { key: "class", label: options.classes.find((c) => c.id === filters.class)?.name ?? "Class" },
    filters.status && { key: "status", label: EXAM_STATUS_LABELS[filters.status] },
    filters.from && { key: "from", label: `From ${filters.from}` },
    filters.to && { key: "to", label: `To ${filters.to}` },
    filters.archived && { key: "archived", label: filters.archived === "only" ? "Archived only" : "Including archived" },
  ].filter((c): c is { key: string; label: string } => !!c)

  const toolbar = (
    <div className="flex flex-col gap-3 border-b p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchBox value={filters.q ?? ""} onSearch={(q) => setParams({ q })} placeholder="Search name, code or term" label="Search examinations" />
        <div className="flex gap-2">
          <ColumnVisibilityMenu columns={HIDEABLE.map((c) => ({ ...c, canHide: true }))} visibility={visibility} onChange={setVisibility} />
          {canExport && (
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/exams/export?${searchParams.toString()}`} />}>
              <DownloadIcon data-icon="inline-start" />
              Export
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        <FilterSelect label="Academic year" value={filters.year} allLabel="All years" onChange={(v) => setParams({ year: v ?? "all" })} options={options.years.map((y) => ({ value: y.id, label: y.name }))} />
        <FilterSelect label="Type" value={filters.type} onChange={(v) => setParams({ type: v })} options={options.types.map((t) => ({ value: t.id, label: t.name }))} />
        <FilterSelect label="Category" value={filters.category} onChange={(v) => setParams({ category: v })} options={labelOptions(ASSESSMENT_CATEGORY_LABELS)} />
        <FilterSelect label="Level" value={filters.level} onChange={(v) => setParams({ level: v })} options={options.levels.map((l) => ({ value: l.id, label: l.name }))} />
        <FilterSelect label="Program" value={filters.program} onChange={(v) => setParams({ program: v })} options={options.programs.filter((p) => !filters.level || p.educationLevelId === filters.level).map((p) => ({ value: p.id, label: p.name }))} />
        <FilterSelect label="Class" value={filters.class} onChange={(v) => setParams({ class: v })} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
        <FilterSelect label="Status" value={filters.status} onChange={(v) => setParams({ status: v })} options={labelOptions(EXAM_STATUS_LABELS)} />
        <div className="grid gap-1.5">
          <Label htmlFor="exams-from" className="text-xs text-muted-foreground">From</Label>
          <Input id="exams-from" type="date" value={filters.from ?? ""} onChange={(e) => setParams({ from: e.target.value || null })} className="h-8" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exams-to" className="text-xs text-muted-foreground">To</Label>
          <Input id="exams-to" type="date" value={filters.to ?? ""} onChange={(e) => setParams({ to: e.target.value || null })} className="h-8" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips chips={chips} onRemove={(key) => setParams({ [key]: null })} onClear={() => setParams(Object.fromEntries(chips.map((c) => [c.key, null])))} />
        {!filters.archived && (
          <Button variant="ghost" size="xs" onClick={() => setParams({ archived: "include" })}>
            Show archived
          </Button>
        )}
      </div>
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
      sorting={sorting}
      onSortingChange={(next) => {
        const s = next[0]
        if (!s) return
        setParams({ sort: s.id === "dates" ? "startDate" : s.id, dir: s.desc ? "desc" : "asc" })
      }}
      columnVisibility={visibility}
      loading={pending}
      toolbar={toolbar}
      empty={
        <Empty className="py-6">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardListIcon /></EmptyMedia>
            <EmptyTitle>No examinations</EmptyTitle>
            <EmptyDescription>{chips.length ? "No examinations match these filters." : "Create an examination to start."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  )
}
