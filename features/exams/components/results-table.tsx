"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AwardIcon, DownloadIcon, EyeIcon, MoreHorizontalIcon, PauseCircleIcon } from "lucide-react"

import { createServerColumnHelper, ServerDataTable, type ServerColumns } from "@/components/server-data-table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { FilterSelect, labelOptions, SearchBox } from "@/components/shared/filter-controls"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toast } from "@/components/ui/toast"
import { placeHoldAction } from "@/features/exams/actions"
import { ResultStatusBadge } from "@/features/exams/components/exams-nav"
import { formatGpa, formatMarks, formatPercent, type RulesSnapshot } from "@/features/exams/calculation"
import { RESULT_STATUS_LABELS } from "@/features/exams/constants"
import type { ResultFilters } from "@/features/exams/filters"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { ResultRow } from "@/services/exams/result-service"

const DEPENDENTS = { class: ["section"] } as const

export function ResultsTable({
  examinationId,
  rows,
  total,
  filters,
  view,
  canPreview,
  rules,
  subjects,
  classes,
  canExport,
  canHold,
}: {
  examinationId: string
  rows: ResultRow[]
  total: number
  filters: ResultFilters
  view: "published" | "provisional"
  canPreview: boolean
  rules: RulesSnapshot | null
  subjects: { id: string; name: string; code: string; classId: string }[]
  classes: { id: string; name: string; sections: { id: string; name: string }[] }[]
  canExport: boolean
  canHold: boolean
}) {
  const router = useRouter()
  const { setParams, pending, searchParams } = useUrlFilters(DEPENDENTS)
  const [holding, setHolding] = React.useState<ResultRow | null>(null)
  const [reason, setReason] = React.useState("")
  const decimals = rules?.policy.percentageDecimals ?? 2
  const showGpa = rules?.policy.gpaMethod !== "NONE" && rules !== null
  const showRank = view === "published" && !!rules?.policy.rankingEnabled
  // Subject columns only when one class is shown (classes differ in subjects).
  const subjectCols = React.useMemo(() => (filters.class ? subjects.filter((s) => s.classId === filters.class) : []), [subjects, filters.class])

  const columns = React.useMemo<ServerColumns<ResultRow>>(() => {
    const h = createServerColumnHelper<ResultRow>()
    return [
      h.accessor("name", {
        header: "Student",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block min-w-44">
            <span className="font-medium">{row.original.name}</span>
            <span className="block text-xs text-muted-foreground">{row.original.admissionNumber}{row.original.rollNumber ? ` · Roll ${row.original.rollNumber}` : ""}</span>
          </span>
        ),
      }),
      h.accessor((r) => r.className, { id: "class", header: "Class", enableSorting: false, cell: ({ row }) => [row.original.className, row.original.sectionName].filter(Boolean).join(" · ") }),
      ...subjectCols.map((s) =>
        h.display({
          id: `subject-${s.id}`,
          header: () => <span title={s.name}>{s.code}</span>,
          meta: { cellClassName: "tabular-nums whitespace-nowrap" },
          cell: ({ row }) => {
            if (row.original.status === "WITHHELD") return <span className="text-muted-foreground">—</span>
            const x = row.original.subjects.find((y) => y.id === s.id)
            if (!x || x.status === "NOT_TAKEN") return <span className="text-muted-foreground">—</span>
            return (
              <span className={x.status === "FAIL" || x.status === "ABSENT" ? "text-destructive" : undefined}>
                {x.obtained !== null ? formatMarks(x.obtained) : RESULT_STATUS_LABELS[x.status as keyof typeof RESULT_STATUS_LABELS]}
                {x.grade && <span className="block text-xs text-muted-foreground">{x.grade}</span>}
              </span>
            )
          },
        })
      ),
      h.display({
        id: "total",
        header: "Total",
        meta: { cellClassName: "tabular-nums whitespace-nowrap" },
        cell: ({ row }) => (row.original.totalObtained !== null ? `${formatMarks(row.original.totalObtained)} / ${formatMarks(row.original.totalMaximum)}` : "—"),
      }),
      h.accessor("percentage", { header: "%", enableSorting: false, meta: { cellClassName: "tabular-nums" }, cell: ({ getValue }) => (getValue() !== null ? formatPercent(getValue(), decimals) : "—") }),
      h.accessor("grade", { header: "Grade", enableSorting: false, cell: ({ getValue }) => <span className="font-medium">{getValue() ?? "—"}</span> }),
      ...(showGpa ? [h.accessor("gpa", { header: "GPA", enableSorting: false, meta: { cellClassName: "tabular-nums" }, cell: ({ getValue }) => (getValue() !== null ? formatGpa(getValue(), rules!.policy.gpaDecimals) : "—") })] : []),
      ...(showRank ? [h.accessor("rank", { header: "Rank", enableSorting: false, meta: { cellClassName: "tabular-nums" }, cell: ({ getValue }) => getValue() ?? "—" })] : []),
      h.accessor("status", { header: "Result", enableSorting: false, cell: ({ getValue }) => <ResultStatusBadge status={getValue()} /> }),
      h.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.name}`} />}>
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem render={<Link href={`/dashboard/exams/${examinationId}/results/${row.original.studentId}${view === "provisional" ? "?view=provisional" : ""}`} />}>
                <EyeIcon />
                {view === "provisional" ? "Provisional mark sheet" : "Mark sheet"}
              </DropdownMenuItem>
              {canHold && row.original.status !== "WITHHELD" && (
                <DropdownMenuItem onClick={() => setHolding(row.original)}>
                  <PauseCircleIcon />
                  Withhold result
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }),
    ]
  }, [subjectCols, decimals, showGpa, showRank, view, canHold, examinationId, rules])

  const sections = classes.find((c) => c.id === filters.class)?.sections ?? []
  const toolbar = (
    <div className="flex flex-col gap-3 border-b p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchBox value={filters.q ?? ""} onSearch={(q) => setParams({ q })} placeholder="Search name or admission no." label="Search results" />
        <div className="flex flex-wrap items-center gap-2">
          {canPreview && (
            <ToggleGroup value={[view]} onValueChange={(v) => v[0] && setParams({ view: v[0] === "published" ? null : String(v[0]) })} aria-label="Which results">
              <ToggleGroupItem value="published" size="sm">Published</ToggleGroupItem>
              <ToggleGroupItem value="provisional" size="sm">Provisional</ToggleGroupItem>
            </ToggleGroup>
          )}
          {canExport && (
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/exams/${examinationId}/results/export?${searchParams.toString()}`} />}>
              <DownloadIcon data-icon="inline-start" />
              Export CSV
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FilterSelect label="Class" value={filters.class} onChange={(v) => setParams({ class: v })} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
        <FilterSelect label="Section" value={filters.section} onChange={(v) => setParams({ section: v })} options={sections.map((s) => ({ value: s.id, label: s.name }))} disabled={!filters.class} />
        <FilterSelect label="Result" value={filters.status} onChange={(v) => setParams({ status: v })} options={labelOptions(RESULT_STATUS_LABELS).filter((o) => o.value !== "NOT_TAKEN")} />
        <FilterSelect
          label="Order"
          value={filters.sort === "roll" ? undefined : filters.sort}
          allLabel="Class and roll number"
          onChange={(v) => setParams({ sort: v })}
          options={[{ value: "name", label: "Name" }, { value: "percentage", label: "Percentage" }, ...(showRank ? [{ value: "rank", label: "Rank" }] : [])]}
        />
      </div>
      {view === "provisional" && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Provisional: calculated from approved marks sheets only, not published and not shown to students. Ranks appear only in published results.
        </p>
      )}
      {!filters.class && <p className="text-xs text-muted-foreground">Choose a class to see subject-wise marks.</p>}
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
        loading={pending}
        toolbar={toolbar}
        empty={
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon"><AwardIcon /></EmptyMedia>
              <EmptyTitle>{view === "published" ? "No published results" : "No results"}</EmptyTitle>
              <EmptyDescription>{view === "published" ? "Results appear here once they're approved and published." : "No students match these filters."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
      <ConfirmDialog
        open={holding !== null}
        onOpenChange={(open) => {
          if (!open) {
            setHolding(null)
            setReason("")
          }
        }}
        title={`Withhold ${holding?.name ?? ""}'s result?`}
        description="The result is published as “withheld”, without marks, until the hold is released."
        confirmLabel="Withhold"
        onConfirm={async () => {
          const result = await placeHoldAction({ examinationId, studentId: holding!.studentId, reason })
          if (!result.ok) {
            toast.add({ title: "Couldn't withhold the result", description: result.fieldErrors?.reason?.[0] ?? result.error, type: "error" })
            return false
          }
          toast.add({ title: "Result withheld", type: "success" })
          setReason("")
          router.refresh()
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="hold-reason">Reason (staff only)</Label>
          <Textarea id="hold-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} />
        </div>
      </ConfirmDialog>
    </>
  )
}
