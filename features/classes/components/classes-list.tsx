"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ColumnVisibilityState, RowSelectionState, SortingState } from "@tanstack/react-table"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BookOpenCheckIcon,
  DownloadIcon,
  EyeIcon,
  FileUpIcon,
  LayersIcon,
  LayoutGridIcon,
  ListPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import {
  ColumnVisibilityMenu,
  createServerColumnHelper,
  selectionColumn,
  ServerDataTable,
  type ServerColumns,
} from "@/components/server-data-table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { FilterSelect, SearchBox } from "@/components/shared/filter-controls"
import { applyServerErrors, SelectField, TextField } from "@/components/shared/form-fields"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { bulkCreateSectionsAction, setClassesArchivedAction } from "@/features/classes/actions"
import { OccupancyBar } from "@/features/classes/components/occupancy"
import { MEDIUM_LABELS, mediumOptions, SECTION_NAME_PRESETS, SHIFT_LABELS, shiftOptions } from "@/features/classes/constants"
import { DEPENDENT_FILTERS, type ClassFilters } from "@/features/classes/filters"
import { bulkSectionsSchema } from "@/features/classes/schemas"
import { teacherName } from "@/features/teachers/constants"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { EducationStructure } from "@/services/academics/structure-service"
import type { ClassListRow, ClassStats, SectionListRow } from "@/services/classes/class-query"
import type { AcademicYearOption } from "@/services/classes/class-service"

type Structure = Pick<EducationStructure, "levels" | "programs" | "classes">

export function StatusPill({ isActive, archivedAt }: { isActive: boolean; archivedAt: Date | string | null }) {
  if (archivedAt) return <Pill className={tone.muted}>Archived</Pill>
  return isActive ? <Pill className={tone.green}>Active</Pill> : <Pill className={tone.amber}>Inactive</Pill>
}

const classHref = (id: string, yearId: string | null, extra = "") =>
  `/dashboard/classes/${id}${yearId ? `?year=${yearId}${extra}` : extra ? `?${extra.slice(1)}` : ""}`

// -------------------------------------------------------------- header

export function ClassesHeaderActions({
  structure,
  years,
  yearId,
}: {
  structure: Structure
  years: AcademicYearOption[]
  yearId: string | null
}) {
  const { searchParams, setParams } = useUrlFilters(DEPENDENT_FILTERS)
  const canManage = useCan("classes.manage")
  const canExport = useCan("classes.export")
  const canViewStructure = useCan("academics.view")
  const [bulkOpen, setBulkOpen] = React.useState(false)

  const exportHref = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    params.delete("pageSize")
    if (yearId) params.set("year", yearId)
    return `/api/classes/export?${params.toString()}`
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
      {canViewStructure && (
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/academics?tab=levels" />}>
          <Settings2Icon data-icon="inline-start" />
          Structure
        </Button>
      )}
      {canExport && (
        <Button variant="outline" nativeButton={false} render={<a href={exportHref()} />}>
          <DownloadIcon data-icon="inline-start" />
          Export
        </Button>
      )}
      {canManage && (
        <>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/classes/import" />}>
            <FileUpIcon data-icon="inline-start" />
            Import
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)} disabled={structure.classes.length === 0}>
            <ListPlusIcon data-icon="inline-start" />
            Add sections
          </Button>
          <Button nativeButton={false} render={<Link href="/dashboard/classes/new" />} disabled={structure.levels.length === 0}>
            <PlusIcon data-icon="inline-start" />
            New class
          </Button>
          {bulkOpen && <BulkSectionsDialog structure={structure} open onOpenChange={setBulkOpen} />}
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- view

export function ClassesView({
  view,
  classRows,
  sectionRows,
  total,
  stats,
  filters,
  structure,
  yearId,
  yearName,
}: {
  view: "classes" | "sections"
  classRows: ClassListRow[]
  sectionRows: SectionListRow[]
  total: number
  stats: ClassStats
  filters: ClassFilters
  structure: Structure
  yearId: string | null
  yearName: string | null
}) {
  const { searchParams, setParams, pending } = useUrlFilters(DEPENDENT_FILTERS)
  const router = useRouter()

  if (structure.levels.length === 0) {
    return (
      <Empty className="rounded-xl border border-dashed py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LayoutGridIcon />
          </EmptyMedia>
          <EmptyTitle>Set up your education levels first</EmptyTitle>
          <EmptyDescription>
            Classes belong to an education level you define — for example ECD, Basic, Secondary, +2 or a bachelor&apos;s
            program — under{" "}
            <Link href="/dashboard/academics?tab=levels" className="underline underline-offset-2">
              Education structure
            </Link>
            .
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const programs = structure.programs.filter((p) => !filters.level || p.educationLevelId === filters.level)
  const classes = structure.classes.filter(
    (c) => (!filters.level || c.educationLevelId === filters.level) && (!filters.program || c.programId === filters.program)
  )
  const isOnly = (key: "status" | "running", value: string | undefined) => filters[key] === value

  const filtersBar = (
    <div className="flex flex-col gap-3 border-b p-4">
      <div className="flex flex-wrap items-end gap-3">
        <SearchBox
          value={filters.q ?? ""}
          onSearch={(q) => setParams({ q })}
          placeholder={view === "classes" ? "Search class name or code" : "Search section or class"}
          label="Search"
        />
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <div className="sm:w-44">
            <FilterSelect
              label="Education level"
              value={filters.level}
              onChange={(v) => setParams({ level: v })}
              options={structure.levels.map((l) => ({ value: l.id, label: l.name }))}
            />
          </div>
          {programs.length > 0 && (
            <div className="sm:w-44">
              <FilterSelect
                label="Program"
                value={filters.program}
                onChange={(v) => setParams({ program: v })}
                options={programs.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
              />
            </div>
          )}
          {view === "sections" && (
            <div className="sm:w-44">
              <FilterSelect
                label="Class"
                value={filters.class}
                onChange={(v) => setParams({ class: v })}
                options={classes.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
          )}
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
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button
          size="xs"
          variant={filters.mine ? "default" : "outline"}
          onClick={() => setParams({ mine: filters.mine ? null : "1" })}
        >
          <BookOpenCheckIcon data-icon="inline-start" />
          Classes I teach
        </Button>
        {searchParams.toString().replace(/(^|&)(year|view|page|pageSize|sort|dir)=[^&]*/g, "") !== "" && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => router.replace(`/dashboard/classes?view=${view}${yearId ? `&year=${yearId}` : ""}`)}
          >
            <XIcon data-icon="inline-start" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Classes"
          value={stats.total}
          hint={stats.archived ? `${stats.archived} archived` : "Not archived"}
          icon={LayoutGridIcon}
          active={view === "classes" && isOnly("status", "current") && !filters.running}
          onClick={() => setParams({ view: "classes", status: null, running: null })}
        />
        <StatCard
          label="Active classes"
          value={stats.active}
          hint="Open for new placements"
          icon={LayoutGridIcon}
          active={view === "classes" && isOnly("status", "active")}
          onClick={() => setParams({ view: "classes", status: "active", running: null })}
        />
        <StatCard
          label={yearName ? `Running in ${yearName}` : "Running this year"}
          value={stats.running}
          hint="Classes with students enrolled"
          icon={BookOpenCheckIcon}
          active={view === "classes" && filters.running === "1"}
          onClick={() => setParams({ view: "classes", running: "1", status: null })}
        />
        <StatCard
          label="Sections"
          value={stats.sections}
          hint="In classes that aren't archived"
          icon={LayersIcon}
          active={view === "sections"}
          onClick={() => setParams({ view: "sections", status: null })}
        />
        <StatCard
          label="Students enrolled"
          value={stats.enrolled}
          hint={`${stats.girls} girls · ${stats.boys} boys${yearName ? ` · ${yearName}` : ""}`}
          icon={UsersIcon}
        />
      </div>

      <Tabs value={view} onValueChange={(v) => setParams({ view: v === "classes" ? null : String(v) })}>
        <TabsList>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "classes" ? (
        <ClassesTable rows={classRows} total={total} filters={filters} yearId={yearId} filtersBar={filtersBar} loading={pending} />
      ) : (
        <SectionsTable rows={sectionRows} total={total} filters={filters} yearId={yearId} filtersBar={filtersBar} loading={pending} />
      )}
    </div>
  )
}

function usePaging(filters: ClassFilters) {
  const { setParams } = useUrlFilters(DEPENDENT_FILTERS)
  return {
    pagination: { pageIndex: filters.page - 1, pageSize: filters.pageSize },
    onPaginationChange: (p: { pageIndex: number; pageSize: number }) =>
      setParams({ page: p.pageIndex > 0 ? String(p.pageIndex + 1) : null, pageSize: String(p.pageSize) }, { resetPage: false }),
    onSortingChange: (next: SortingState) => {
      const s = next[0]
      if (s) setParams({ sort: s.id, dir: s.desc ? "desc" : "asc" })
    },
  }
}

function columnChoices<T extends object>(columns: ServerColumns<T>) {
  return columns
    .filter((c) => c.id && c.id !== "select" && c.id !== "actions")
    .map((c) => ({ id: c.id as string, label: c.meta?.label ?? String(c.id), canHide: c.enableHiding !== false }))
}

// ------------------------------------------------------------- classes

function ClassesTable({
  rows,
  total,
  filters,
  yearId,
  filtersBar,
  loading,
}: {
  rows: ClassListRow[]
  total: number
  filters: ClassFilters
  yearId: string | null
  filtersBar: React.ReactNode
  loading: boolean
}) {
  const router = useRouter()
  const canManage = useCan("classes.manage")
  const paging = usePaging(filters)
  const [selection, setSelection] = React.useState<RowSelectionState>({})
  const [visibility, setVisibility] = useLocalStorage<ColumnVisibilityState>("classes.table.columns", { kind: false })
  const [confirm, setConfirm] = React.useState<{ ids: string[]; archive: boolean } | null>(null)
  const selectedIds = Object.keys(selection).filter((id) => selection[id])

  const columns = React.useMemo<ServerColumns<ClassListRow>>(() => {
    const h = createServerColumnHelper<ClassListRow>()
    return [
      ...(canManage ? [selectionColumn<ClassListRow>()] : []),
      h.accessor("name", {
        header: "Class",
        enableHiding: false,
        meta: { label: "Class" },
        cell: ({ row }) => (
          <Link href={classHref(row.original.id, yearId)} className="min-w-36 font-medium hover:underline">
            {row.original.name}
            {row.original.localName && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">{row.original.localName}</span>
            )}
          </Link>
        ),
      }),
      h.accessor((r) => r.code ?? "", {
        id: "code",
        header: "Code",
        meta: { label: "Code", cellClassName: "font-mono text-xs" },
        cell: ({ getValue }) => getValue() || "—",
      }),
      h.accessor((r) => r.educationLevel.name, {
        id: "order",
        header: "Level",
        meta: { label: "Education level" },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {row.original.educationLevel.name}
            {row.original.program && <span className="text-muted-foreground"> · {row.original.program.code}</span>}
          </span>
        ),
      }),
      h.accessor("sectionCount", {
        id: "sections",
        header: "Sections",
        enableSorting: false,
        meta: { label: "Sections", cellClassName: "tabular-nums" },
        cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">None</span>,
      }),
      h.accessor("enrolled", {
        id: "enrolled",
        header: "Students",
        enableSorting: false,
        meta: { label: "Enrolled students", cellClassName: "w-44" },
        cell: ({ row }) =>
          row.original.capacity ? (
            <OccupancyBar enrolled={row.original.enrolled} capacity={row.original.capacity} />
          ) : (
            <span className="tabular-nums">{row.original.enrolled}</span>
          ),
      }),
      h.accessor((r) => r.classTeachers.length, {
        id: "classTeacher",
        header: "Class teacher",
        enableSorting: false,
        meta: { label: "Class teacher" },
        cell: ({ row }) => {
          const { classTeachers, classTeacherSlots } = row.original
          if (classTeachers.length === 0) return <span className="text-xs text-muted-foreground">Not assigned</span>
          if (classTeacherSlots === 1) return teacherName(classTeachers[0])
          return (
            <span className="text-sm">
              {classTeachers.length}/{classTeacherSlots} sections
            </span>
          )
        },
      }),
      h.accessor("kind", {
        header: "Type",
        enableSorting: false,
        meta: { label: "Type" },
        cell: ({ getValue }) => getValue().toLowerCase(),
      }),
      h.accessor((r) => (r.archivedAt ? "archived" : r.isActive ? "active" : "inactive"), {
        id: "status",
        header: "Status",
        enableSorting: false,
        meta: { label: "Status" },
        cell: ({ row }) => <StatusPill isActive={row.original.isActive} archivedAt={row.original.archivedAt} />,
      }),
      h.display({
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => {
          const c = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`} />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem render={<Link href={classHref(c.id, yearId)} />}>
                  <EyeIcon />
                  Open
                </DropdownMenuItem>
                {canManage && !c.archivedAt && (
                  <DropdownMenuItem render={<Link href={`/dashboard/classes/${c.id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setConfirm({ ids: [c.id], archive: !c.archivedAt })}>
                      {c.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                      {c.archivedAt ? "Restore" : "Archive"}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
    ]
  }, [canManage, yearId])

  async function run() {
    if (!confirm) return
    const result = await setClassesArchivedAction(confirm.ids, confirm.archive)
    if (!result.ok) {
      toast.add({ title: "Couldn't update classes", description: result.error, type: "error" })
      return false
    }
    const { succeeded, failed } = result.data
    const verb = confirm.archive ? "archived" : "restored"
    toast.add({
      title: succeeded ? `${succeeded} class${succeeded === 1 ? "" : "es"} ${verb}` : `Nothing ${verb}`,
      description: failed.length
        ? failed.slice(0, 3).map((f) => `${f.name}: ${f.reason}`).join(" ") + (failed.length > 3 ? " …" : "")
        : undefined,
      type: failed.length ? (succeeded ? "warning" : "error") : "success",
    })
    setSelection({})
    router.refresh()
  }

  const toolbar = (
    <>
      {filtersBar}
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
            <span className="font-medium text-foreground tabular-nums">{total}</span> {total === 1 ? "class" : "classes"}
          </p>
        )}
        <ColumnVisibilityMenu columns={columnChoices(columns)} visibility={visibility} onChange={setVisibility} />
      </div>
    </>
  )

  return (
    <>
      <ServerDataTable
        data={rows}
        columns={columns}
        rowCount={total}
        getRowId={(r) => r.id}
        pagination={paging.pagination}
        onPaginationChange={paging.onPaginationChange}
        sorting={[{ id: filters.classSort, desc: filters.dir === "desc" }]}
        onSortingChange={paging.onSortingChange}
        rowSelection={canManage ? selection : undefined}
        onRowSelectionChange={canManage ? setSelection : undefined}
        columnVisibility={visibility}
        loading={loading}
        toolbar={toolbar}
        rowClassName={(r) => (r.archivedAt ? "opacity-70" : undefined)}
        empty={
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyTitle>No classes found</EmptyTitle>
              <EmptyDescription>
                {canManage ? "Change the filters, or add a class with “New class”." : "Try changing the filters."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`${confirm?.archive ? "Archive" : "Restore"} ${
          confirm?.ids.length === 1 ? "this class" : `${confirm?.ids.length ?? 0} classes`
        }?`}
        description={
          confirm?.archive
            ? "Archived classes are hidden from day-to-day lists and take no new students. Every past enrollment is kept. Classes that still have students placed in them are skipped; active teaching assignments of archived classes end today."
            : "Restored classes become active again."
        }
        confirmLabel={confirm?.archive ? "Archive" : "Restore"}
        onConfirm={run}
      />
    </>
  )
}

// ------------------------------------------------------------ sections

function SectionsTable({
  rows,
  total,
  filters,
  yearId,
  filtersBar,
  loading,
}: {
  rows: SectionListRow[]
  total: number
  filters: ClassFilters
  yearId: string | null
  filtersBar: React.ReactNode
  loading: boolean
}) {
  const paging = usePaging(filters)
  const [visibility, setVisibility] = useLocalStorage<ColumnVisibilityState>("sections.table.columns", {})

  const columns = React.useMemo<ServerColumns<SectionListRow>>(() => {
    const h = createServerColumnHelper<SectionListRow>()
    const sectionHref = (r: SectionListRow) =>
      `/dashboard/classes/${r.class.id}/sections/${r.id}${yearId ? `?year=${yearId}` : ""}`
    return [
      h.accessor((r) => r.class.name, {
        id: "class",
        header: "Class",
        enableHiding: false,
        meta: { label: "Class" },
        cell: ({ row }) => (
          <Link href={classHref(row.original.class.id, yearId)} className="whitespace-nowrap hover:underline">
            {row.original.class.name}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {row.original.class.educationLevel.name}
              {row.original.class.program ? ` · ${row.original.class.program.code}` : ""}
            </span>
          </Link>
        ),
      }),
      h.accessor("name", {
        header: "Section",
        enableHiding: false,
        meta: { label: "Section" },
        cell: ({ row }) => (
          <Link href={sectionHref(row.original)} className="font-medium hover:underline">
            {row.original.name}
            {row.original.code && (
              <span className="ml-1.5 font-mono text-xs text-muted-foreground">{row.original.code}</span>
            )}
          </Link>
        ),
      }),
      h.accessor((r) => r.shift ?? "", {
        id: "details",
        header: "Shift · medium",
        enableSorting: false,
        meta: { label: "Shift and medium" },
        cell: ({ row }) =>
          [row.original.shift && SHIFT_LABELS[row.original.shift], row.original.medium && MEDIUM_LABELS[row.original.medium]]
            .filter(Boolean)
            .join(" · ") || "—",
      }),
      h.accessor((r) => r.room ?? "", {
        id: "room",
        header: "Room",
        enableSorting: false,
        meta: { label: "Room" },
        cell: ({ getValue }) => getValue() || "—",
      }),
      h.accessor((r) => (r.classTeacher ? teacherName(r.classTeacher) : ""), {
        id: "classTeacher",
        header: "Class teacher",
        enableSorting: false,
        meta: { label: "Class teacher" },
        cell: ({ getValue }) => getValue() || <span className="text-xs text-muted-foreground">Not assigned</span>,
      }),
      h.accessor("girls", { header: "Girls", enableSorting: false, meta: { label: "Girls", cellClassName: "tabular-nums" } }),
      h.accessor("boys", { header: "Boys", enableSorting: false, meta: { label: "Boys", cellClassName: "tabular-nums" } }),
      h.accessor((r) => r.capacity ?? 0, {
        id: "capacity",
        header: "Seats",
        meta: { label: "Seats", cellClassName: "w-44" },
        cell: ({ row }) => <OccupancyBar enrolled={row.original.enrolled} capacity={row.original.capacity} />,
      }),
      h.accessor((r) => (r.archivedAt ? "archived" : r.isActive ? "active" : "inactive"), {
        id: "status",
        header: "Status",
        enableSorting: false,
        meta: { label: "Status" },
        cell: ({ row }) => <StatusPill isActive={row.original.isActive} archivedAt={row.original.archivedAt} />,
      }),
    ]
  }, [yearId])

  return (
    <ServerDataTable
      data={rows}
      columns={columns}
      rowCount={total}
      getRowId={(r) => r.id}
      pagination={paging.pagination}
      onPaginationChange={paging.onPaginationChange}
      sorting={[{ id: filters.sectionSort, desc: filters.dir === "desc" }]}
      onSortingChange={paging.onSortingChange}
      columnVisibility={visibility}
      loading={loading}
      rowClassName={(r) => (r.archivedAt ? "opacity-70" : undefined)}
      toolbar={
        <>
          {filtersBar}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{total}</span>{" "}
              {total === 1 ? "section" : "sections"}
            </p>
            <ColumnVisibilityMenu columns={columnChoices(columns)} visibility={visibility} onChange={setVisibility} />
          </div>
        </>
      }
      empty={
        <Empty className="py-6">
          <EmptyHeader>
            <EmptyTitle>No sections found</EmptyTitle>
            <EmptyDescription>
              Classes without sections are fine. Add sections from a class page, or with “Add sections”.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  )
}

// ------------------------------------------------------- bulk sections

// Adds the same sections (A, B, C or क, ख, ग …) to every class of a level.
function BulkSectionsDialog({
  structure,
  open,
  onOpenChange,
}: {
  structure: Structure
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof bulkSectionsSchema>, unknown, z.output<typeof bulkSectionsSchema>>({
    resolver: zodResolver(bulkSectionsSchema),
    defaultValues: {
      educationLevelId: structure.levels.find((l) => l.isActive)?.id ?? structure.levels[0]?.id ?? "",
      programId: "",
      names: "A, B",
      capacity: "",
      shift: "",
      medium: "",
    },
  })
  const levelId = useWatch({ control: form.control, name: "educationLevelId" })
  const level = structure.levels.find((l) => l.id === levelId)

  const submit = form.handleSubmit(async (values) => {
    const result = await bulkCreateSectionsAction(values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({
      title: result.data.created
        ? `${result.data.created} sections added across ${result.data.classes} classes`
        : "Every class already has these sections",
      type: "success",
    })
    onOpenChange(false)
    router.refresh()
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add sections to classes"
      description="Creates the same sections in every active class of a level or program. Sections a class already has are skipped."
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
      submitLabel="Add sections"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="educationLevelId"
          label="Education level"
          required
          options={structure.levels.map((l) => ({ value: l.id, label: l.name }))}
          onValueChange={() => form.setValue("programId", "")}
        />
        {level?.usesPrograms && (
          <SelectField
            control={form.control}
            name="programId"
            label="Program"
            placeholder="All programs"
            options={structure.programs
              .filter((p) => p.educationLevelId === level.id)
              .map((p) => ({ value: p.id, label: p.name }))}
          />
        )}
      </div>
      <div className="grid gap-2">
        <TextField control={form.control} name="names" label="Section names" required description="Separate with commas." />
        <div className="flex flex-wrap gap-1.5">
          {SECTION_NAME_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="xs"
              variant="outline"
              onClick={() => form.setValue("names", preset.names.join(", "), { shouldValidate: true })}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={form.control} name="capacity" label="Capacity" type="number" min={1} placeholder="e.g. 40" />
        <SelectField control={form.control} name="shift" label="Shift" placeholder="—" options={shiftOptions} />
        <SelectField control={form.control} name="medium" label="Medium" placeholder="—" options={mediumOptions} />
      </div>
    </FormDialog>
  )
}
