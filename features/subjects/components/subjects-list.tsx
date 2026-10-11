"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ColumnVisibilityState, RowSelectionState } from "@tanstack/react-table"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BookCheckIcon,
  BookOpenIcon,
  DownloadIcon,
  EyeIcon,
  FileUpIcon,
  LayersIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TagsIcon,
  UserRoundXIcon,
  XIcon,
} from "lucide-react"

import {
  ColumnVisibilityMenu,
  createServerColumnHelper,
  selectionColumn,
  ServerDataTable,
  type ServerColumns,
} from "@/components/server-data-table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { FilterSelect, SearchBox } from "@/components/shared/filter-controls"
import { useCan } from "@/components/shared/session-provider"
import { StatCard } from "@/components/shared/stat-card"
import { Pill, tone } from "@/components/shared/status-pill"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { toast } from "@/components/ui/toast"
import { setSubjectsArchivedAction } from "@/features/subjects/actions"
import { CategoriesDialog } from "@/features/subjects/components/categories-dialog"
import { formatCredits, REQUIREMENT_LABELS, requirementOptions } from "@/features/subjects/constants"
import { DEPENDENT_FILTERS, type SubjectFilters } from "@/features/subjects/filters"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { EducationStructure } from "@/services/academics/structure-service"
import type { AcademicYearOption } from "@/services/classes/class-service"
import type { SubjectCategoryRow } from "@/services/subjects/subject-service"
import type { SubjectListRow, SubjectStats } from "@/services/subjects/subject-query"

type Structure = Pick<EducationStructure, "levels" | "programs">

export function SubjectStatus({ isActive, archivedAt }: { isActive: boolean; archivedAt: Date | string | null }) {
  if (archivedAt) return <Pill className={tone.muted}>Archived</Pill>
  return isActive ? <Pill className={tone.green}>Active</Pill> : <Pill className={tone.amber}>Inactive</Pill>
}

export function SubjectsHeaderActions({
  years,
  yearId,
  categories,
}: {
  years: AcademicYearOption[]
  yearId: string | null
  categories: SubjectCategoryRow[]
}) {
  const { searchParams, setParams } = useUrlFilters(DEPENDENT_FILTERS)
  const canManage = useCan("subjects.manage")
  const canExport = useCan("subjects.export")
  const [categoriesOpen, setCategoriesOpen] = React.useState(false)

  const exportHref = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    params.delete("pageSize")
    if (yearId) params.set("year", yearId)
    return `/api/subjects/export?${params.toString()}`
  }

  return (
    <>
      {years.length > 0 && (
        <NativeSelect value={yearId ?? ""} onChange={(e) => setParams({ year: e.target.value })} aria-label="Academic year">
          {years.map((y) => (
            <NativeSelectOption key={y.id} value={y.id}>
              {y.name}
              {y.isCurrent ? " (current)" : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      <Button
        variant="outline"
        nativeButton={false}
        render={<Link href={`/dashboard/subjects/class-subjects${yearId ? `?year=${yearId}` : ""}`} />}
      >
        <LayersIcon data-icon="inline-start" />
        Class subjects
      </Button>
      {canManage && (
        <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
          <TagsIcon data-icon="inline-start" />
          Categories
        </Button>
      )}
      {canExport && (
        <Button variant="outline" nativeButton={false} render={<a href={exportHref()} />}>
          <DownloadIcon data-icon="inline-start" />
          Export
        </Button>
      )}
      {canManage && canExport && (
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/subjects/import" />}>
          <FileUpIcon data-icon="inline-start" />
          Import
        </Button>
      )}
      {canManage && (
        <Button nativeButton={false} render={<Link href="/dashboard/subjects/new" />}>
          <PlusIcon data-icon="inline-start" />
          New subject
        </Button>
      )}
      {categoriesOpen && <CategoriesDialog categories={categories} onClose={() => setCategoriesOpen(false)} />}
    </>
  )
}

export function SubjectsView({
  rows,
  total,
  stats,
  filters,
  structure,
  categories,
  yearName,
}: {
  rows: SubjectListRow[]
  total: number
  stats: SubjectStats
  filters: SubjectFilters
  structure: Structure
  categories: SubjectCategoryRow[]
  yearName: string | null
}) {
  const router = useRouter()
  const { searchParams, setParams, pending } = useUrlFilters(DEPENDENT_FILTERS)
  const canManage = useCan("subjects.manage")
  const [selection, setSelection] = React.useState<RowSelectionState>({})
  const [visibility, setVisibility] = useLocalStorage<ColumnVisibilityState>("subjects.table.columns", { updatedAt: false })
  const [confirm, setConfirm] = React.useState<{ ids: string[]; archive: boolean } | null>(null)
  const selectedIds = Object.keys(selection).filter((id) => selection[id])
  const programs = structure.programs.filter((p) => !filters.level || p.educationLevelId === filters.level)

  const columns = React.useMemo<ServerColumns<SubjectListRow>>(() => {
    const h = createServerColumnHelper<SubjectListRow>()
    return [
      ...(canManage ? [selectionColumn<SubjectListRow>()] : []),
      h.accessor("name", {
        header: "Subject",
        enableHiding: false,
        meta: { label: "Subject" },
        cell: ({ row }) => (
          <Link href={`/dashboard/subjects/${row.original.id}`} className="block min-w-40 hover:underline">
            <span className="font-medium">{row.original.name}</span>
            {row.original.localName && <span className="ml-1.5 text-xs text-muted-foreground">{row.original.localName}</span>}
          </Link>
        ),
      }),
      h.accessor("code", { header: "Code", meta: { label: "Code", cellClassName: "font-mono text-xs" } }),
      h.accessor((r) => r.category?.name ?? "", {
        id: "category",
        header: "Category",
        enableSorting: false,
        meta: { label: "Category" },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {row.original.category?.name ?? <span className="text-muted-foreground">—</span>}
            <span className="block text-xs text-muted-foreground">{REQUIREMENT_LABELS[row.original.requirement]}</span>
          </span>
        ),
      }),
      h.accessor((r) => r.educationLevel?.name ?? "", {
        id: "level",
        header: "Applies to",
        enableSorting: false,
        meta: { label: "Level / program" },
        cell: ({ row }) =>
          [row.original.educationLevel?.name, row.original.program?.code].filter(Boolean).join(" · ") || (
            <span className="text-muted-foreground">Any level</span>
          ),
      }),
      h.accessor((r) => r.creditHours ?? 0, {
        id: "credits",
        header: "Credits",
        meta: { label: "Credits / periods", cellClassName: "whitespace-nowrap tabular-nums" },
        cell: ({ row }) =>
          [formatCredits(row.original.creditHours), row.original.weeklyPeriods ? `${row.original.weeklyPeriods}/wk` : null]
            .filter(Boolean)
            .join(" · ") || "—",
      }),
      h.accessor("offerings", {
        header: "Offered",
        enableSorting: false,
        meta: { label: "Classes this year", cellClassName: "tabular-nums" },
        cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
      }),
      h.accessor("teachers", {
        header: "Teachers",
        enableSorting: false,
        meta: { label: "Teachers this year", cellClassName: "tabular-nums" },
        cell: ({ row }) =>
          row.original.teachers ? (
            row.original.teachers
          ) : row.original.offerings ? (
            <span className="text-xs text-amber-700 dark:text-amber-400">None</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }),
      h.accessor((r) => (r.archivedAt ? "archived" : r.isActive ? "active" : "inactive"), {
        id: "status",
        header: "Status",
        enableSorting: false,
        meta: { label: "Status" },
        cell: ({ row }) => <SubjectStatus isActive={row.original.isActive} archivedAt={row.original.archivedAt} />,
      }),
      h.accessor((r) => r.updatedAt, {
        id: "updatedAt",
        header: "Updated",
        meta: { label: "Updated", cellClassName: "whitespace-nowrap text-muted-foreground" },
        cell: ({ getValue }) => new Date(getValue()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      }),
      h.display({
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => {
          const s = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.name}`} />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem render={<Link href={`/dashboard/subjects/${s.id}`} />}>
                  <EyeIcon />
                  Open
                </DropdownMenuItem>
                {canManage && !s.archivedAt && (
                  <DropdownMenuItem render={<Link href={`/dashboard/subjects/${s.id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setConfirm({ ids: [s.id], archive: !s.archivedAt })}>
                      {s.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                      {s.archivedAt ? "Restore" : "Archive"}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
    ]
  }, [canManage])

  const columnChoices = columns
    .filter((c) => c.id && c.id !== "select" && c.id !== "actions")
    .map((c) => ({ id: c.id as string, label: c.meta?.label ?? String(c.id), canHide: c.enableHiding !== false }))

  async function run() {
    if (!confirm) return
    const result = await setSubjectsArchivedAction(confirm.ids, confirm.archive)
    if (!result.ok) {
      toast.add({ title: "Couldn't update subjects", description: result.error, type: "error" })
      return false
    }
    const { succeeded, failed } = result.data
    toast.add({
      title: `${succeeded} subject${succeeded === 1 ? "" : "s"} ${confirm.archive ? "archived" : "restored"}`,
      description: failed.length ? failed.slice(0, 3).map((f) => `${f.name}: ${f.reason}`).join(" ") : undefined,
      type: failed.length ? (succeeded ? "warning" : "error") : "success",
    })
    setSelection({})
    router.refresh()
  }

  const hasFilters = searchParams.toString().replace(/(^|&)(year|page|pageSize|sort|dir)=[^&]*/g, "") !== ""

  const toolbar = (
    <>
      <div className="flex flex-col gap-3 border-b p-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox value={filters.q ?? ""} onSearch={(q) => setParams({ q })} placeholder="Search name or code" label="Search subjects" />
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <div className="sm:w-40">
              <FilterSelect
                label="Education level"
                value={filters.level}
                onChange={(v) => setParams({ level: v })}
                options={structure.levels.map((l) => ({ value: l.id, label: l.name }))}
              />
            </div>
            {programs.length > 0 && (
              <div className="sm:w-40">
                <FilterSelect
                  label="Program"
                  value={filters.program}
                  onChange={(v) => setParams({ program: v })}
                  options={programs.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
                />
              </div>
            )}
            {categories.length > 0 && (
              <div className="sm:w-40">
                <FilterSelect
                  label="Category"
                  value={filters.category}
                  onChange={(v) => setParams({ category: v })}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
            )}
            <div className="sm:w-36">
              <FilterSelect
                label="Type"
                value={filters.requirement}
                onChange={(v) => setParams({ requirement: v })}
                options={requirementOptions}
              />
            </div>
            <div className="sm:w-36">
              <FilterSelect
                label={yearName ? `Offered in ${yearName}` : "Offered"}
                value={filters.offered}
                onChange={(v) => setParams({ offered: v })}
                allLabel="Any"
                options={[
                  { value: "yes", label: "Offered" },
                  { value: "no", label: "Not offered" },
                ]}
              />
            </div>
            <div className="sm:w-36">
              <FilterSelect
                label="Status"
                value={filters.status === "current" ? undefined : filters.status}
                onChange={(v) => setParams({ status: v })}
                allLabel="Not archived"
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                  { value: "archived", label: "Archived" },
                  { value: "all", label: "All" },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        {selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{selectedIds.length} selected</span>
            {filters.status !== "archived" && (
              <Button size="sm" variant="outline" onClick={() => setConfirm({ ids: selectedIds, archive: true })}>
                <ArchiveIcon data-icon="inline-start" />
                Archive
              </Button>
            )}
            {(filters.status === "archived" || filters.status === "all") && (
              <Button size="sm" variant="outline" onClick={() => setConfirm({ ids: selectedIds, archive: false })}>
                <ArchiveRestoreIcon data-icon="inline-start" />
                Restore
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelection({})}>
              <XIcon data-icon="inline-start" />
              Clear
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{total}</span> {total === 1 ? "subject" : "subjects"}
            {hasFilters && (
              <Button size="xs" variant="ghost" className="ml-2" onClick={() => router.replace("/dashboard/subjects")}>
                Clear filters
              </Button>
            )}
          </p>
        )}
        <ColumnVisibilityMenu columns={columnChoices} visibility={visibility} onChange={setVisibility} />
      </div>
    </>
  )

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Subjects & courses"
          value={stats.total}
          hint={stats.archived ? `${stats.archived} archived` : "Not archived"}
          icon={BookOpenIcon}
          active={filters.status === "current" && !filters.offered}
          onClick={() => setParams({ status: null, offered: null })}
        />
        <StatCard
          label="Active"
          value={stats.active}
          hint="Available for new classes"
          icon={BookCheckIcon}
          active={filters.status === "active"}
          onClick={() => setParams({ status: "active" })}
        />
        <StatCard
          label={yearName ? `Offered in ${yearName}` : "Offered this year"}
          value={stats.offered}
          hint="Subjects taught in at least one class"
          icon={LayersIcon}
          active={filters.offered === "yes"}
          onClick={() => setParams({ offered: "yes" })}
        />
        <StatCard label="Class offerings" value={stats.offerings} hint="Subject × class this year" icon={LayersIcon} />
        <StatCard
          label="Without a teacher"
          value={stats.withoutTeacher}
          hint="Class offerings with no teacher"
          icon={UserRoundXIcon}
          onClick={() => router.push("/dashboard/subjects/class-subjects")}
        />
      </div>

      <ServerDataTable
        data={rows}
        columns={columns}
        rowCount={total}
        getRowId={(r) => r.id}
        pagination={{ pageIndex: filters.page - 1, pageSize: filters.pageSize }}
        onPaginationChange={(p) =>
          setParams({ page: p.pageIndex > 0 ? String(p.pageIndex + 1) : null, pageSize: String(p.pageSize) }, { resetPage: false })
        }
        sorting={[{ id: filters.sort, desc: filters.dir === "desc" }]}
        onSortingChange={(next) => {
          const s = next[0]
          if (s) setParams({ sort: s.id, dir: s.desc ? "desc" : "asc" })
        }}
        rowSelection={canManage ? selection : undefined}
        onRowSelectionChange={canManage ? setSelection : undefined}
        columnVisibility={visibility}
        loading={pending}
        toolbar={toolbar}
        rowClassName={(r) => (r.archivedAt ? "opacity-70" : undefined)}
        empty={
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpenIcon />
              </EmptyMedia>
              <EmptyTitle>{hasFilters ? "No subjects match these filters" : "No subjects yet"}</EmptyTitle>
              <EmptyDescription>
                {hasFilters
                  ? "Try removing some filters."
                  : "Add the subjects or courses you teach — Nepali, English, Mathematics, Accountancy, Data Structures… — or import them from a CSV file."}
              </EmptyDescription>
            </EmptyHeader>
            {canManage && !hasFilters && (
              <div className="flex justify-center gap-2">
                <Button size="sm" nativeButton={false} render={<Link href="/dashboard/subjects/new" />}>
                  <PlusIcon data-icon="inline-start" />
                  New subject
                </Button>
              </div>
            )}
          </Empty>
        }
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`${confirm?.archive ? "Archive" : "Restore"} ${confirm?.ids.length === 1 ? "this subject" : `${confirm?.ids.length ?? 0} subjects`}?`}
        description={
          confirm?.archive
            ? "Archived subjects can't be added to classes or teachers. Every past offering, curriculum and teaching assignment is kept. Subjects still offered in a running or planned year are skipped."
            : "Restored subjects become active again."
        }
        confirmLabel={confirm?.archive ? "Archive" : "Restore"}
        onConfirm={run}
      />
    </div>
  )
}
