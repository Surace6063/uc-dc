"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ColumnVisibilityState, RowSelectionState, SortingState } from "@tanstack/react-table"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BadgeCheckIcon,
  BookOpenIcon,
  BriefcaseIcon,
  CircleAlertIcon,
  DownloadIcon,
  EyeIcon,
  FileUpIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  PresentationIcon,
  Trash2Icon,
  UserCheckIcon,
  UserPlusIcon,
  UsersIcon,
  UserXIcon,
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
import { useCan } from "@/components/shared/session-provider"
import { StatCard } from "@/components/shared/stat-card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { toast } from "@/components/ui/toast"
import { initials } from "@/features/students/constants"
import {
  archiveTeacherAction,
  bulkTeachersAction,
  deleteTeacherAction,
  restoreTeacherAction,
} from "@/features/teachers/actions"
import {
  ACADEMIC_RANK_LABELS,
  assignmentSummary,
  EMPLOYMENT_TYPE_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  QUALIFICATION_RANK,
  teacherName,
} from "@/features/teachers/constants"
import { TEACHER_DEPENDENT_FILTERS, type TeacherFilters } from "@/features/teachers/filters"
import { TEACHER_IMPORT_TEMPLATE_URL } from "@/features/teachers/import-template"
import { EmploymentStatusBadge } from "@/features/teachers/components/status-badges"
import { TeacherFilterToolbar } from "@/features/teachers/components/teacher-filters"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { EducationStructure } from "@/services/academics/structure-service"
import type { getTeacherStats, TeacherListRow } from "@/services/teachers/teacher-query"

// Storage paths stay on the server; the page sends short-lived signed URLs.
export type TeacherRow = Omit<TeacherListRow, "profileImagePath"> & { photoUrl: string | null }
type Stats = Awaited<ReturnType<typeof getTeacherStats>>

const VISIBILITY_KEY = "teachers.table.columns"
const DEFAULT_HIDDEN: ColumnVisibilityState = { email: false, type: false }

const formatDate = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"

function unique(values: (string | null | undefined)[]) {
  return [...new Set(values.filter((v): v is string => Boolean(v)))]
}

// "+2 more" style compact list for table cells.
function CompactList({ items, empty = "—" }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <span className="text-muted-foreground">{empty}</span>
  return (
    <span className="block max-w-48 truncate" title={items.join(", ")}>
      {items.slice(0, 2).join(", ")}
      {items.length > 2 && <span className="text-muted-foreground"> +{items.length - 2}</span>}
    </span>
  )
}

function SummaryCards({ stats, filters, setParams }: { stats: Stats; filters: TeacherFilters; setParams: (u: Record<string, string | null>) => void }) {
  const hiresHint = stats.newHiresRange.yearName ? `joined in ${stats.newHiresRange.yearName}` : "joined in the last 90 days"
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <StatCard label="Total teachers" value={stats.total} hint="current profiles" icon={UsersIcon}
        active={filters.view === "current" && !filters.status.length && !filters.assigned && !filters.incomplete && !filters.joinedFrom && !filters.pendingVerification}
        onClick={() => setParams({ view: null, status: null, assigned: null, incomplete: null, joinedFrom: null, joinedTo: null, pendingVerification: null })} />
      <StatCard label="Active" value={stats.active} hint="employment status" icon={UserCheckIcon}
        active={filters.status.length === 1 && filters.status[0] === "ACTIVE"} onClick={() => setParams({ status: "ACTIVE" })} />
      <StatCard label="New hires" value={stats.newHires} hint={hiresHint} icon={UserPlusIcon}
        active={filters.joinedFrom === stats.newHiresRange.from}
        onClick={() => setParams({ joinedFrom: stats.newHiresRange.from, joinedTo: stats.newHiresRange.to })} />
      <StatCard label="Teaching now" value={stats.assigned} hint="with active assignments" icon={PresentationIcon}
        active={filters.assigned === "yes"} onClick={() => setParams({ assigned: "yes" })} />
      <StatCard label="Unassigned" value={stats.unassigned} hint="active, no assignments" icon={UserXIcon}
        active={filters.assigned === "no"} onClick={() => setParams({ assigned: "no", status: "ACTIVE" })} />
      <StatCard label="Needs attention" value={stats.incomplete + stats.pending}
        hint={`${stats.incomplete} incomplete · ${stats.pending} pending verification`} icon={CircleAlertIcon}
        active={filters.incomplete === "1"} onClick={() => setParams({ incomplete: "1" })} />
    </div>
  )
}

function useRowActions() {
  const router = useRouter()
  const [target, setTarget] = React.useState<{ row: TeacherRow; action: "archive" | "restore" | "delete" } | null>(null)
  const name = target ? teacherName(target.row) : ""
  const dialog = (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(o) => !o && setTarget(null)}
      title={target?.action === "archive" ? `Archive ${name}?` : target?.action === "restore" ? `Restore ${name}?` : `Permanently delete ${name}?`}
      description={
        target?.action === "archive"
          ? "The profile is hidden from lists and their active teaching assignments end. Employment status and history are kept; the login account is not affected."
          : target?.action === "restore"
            ? "The profile appears in lists again. Ended assignments stay ended."
            : "Only for profiles created by mistake with no teaching history. The login account is not deleted. This can't be undone."
      }
      confirmLabel={target?.action === "archive" ? "Archive" : target?.action === "restore" ? "Restore" : "Delete permanently"}
      destructive={target?.action === "delete"}
      onConfirm={async () => {
        if (!target) return
        const id = target.row.id
        const result =
          target.action === "archive" ? await archiveTeacherAction(id) : target.action === "restore" ? await restoreTeacherAction(id) : await deleteTeacherAction(id)
        if (!result.ok) {
          toast.add({ title: "Couldn't complete that", description: result.error, type: "error" })
          return false
        }
        toast.add({ title: result.message ?? "Done", type: "success" })
        router.refresh()
      }}
    />
  )
  return { ask: setTarget, dialog }
}

export function TeachersView({
  rows,
  total,
  stats,
  filters,
  structure,
  yearId,
}: {
  rows: TeacherRow[]
  total: number
  stats: Stats
  filters: TeacherFilters
  structure: EducationStructure
  yearId: string | null
}) {
  const router = useRouter()
  const { searchParams, setParams, pending } = useUrlFilters(TEACHER_DEPENDENT_FILTERS)
  const canCreate = useCan("teachers.create")
  const canUpdate = useCan("teachers.update")
  const canArchive = useCan("teachers.archive")
  const canDelete = useCan("teachers.delete")
  const canExport = useCan("teachers.export")
  const canImport = useCan("teachers.import")
  const canBulk = canArchive || canExport
  const [selection, setSelection] = React.useState<RowSelectionState>({})
  const [visibility, updateVisibility] = useLocalStorage<ColumnVisibilityState>(VISIBILITY_KEY, DEFAULT_HIDDEN)
  const [bulk, setBulk] = React.useState<"archive" | "restore" | null>(null)
  const rowActions = useRowActions()
  const selectedIds = Object.keys(selection).filter((id) => selection[id])
  const yearName = structure.years.find((y) => y.id === yearId)?.name ?? null

  const exportHref = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    params.delete("pageSize")
    for (const [k, v] of Object.entries(extra)) params.set(k, v)
    return `/api/teachers/export?${params.toString()}`
  }

  const columns = React.useMemo<ServerColumns<TeacherRow>>(() => {
    const h = createServerColumnHelper<TeacherRow>()
    return [
      ...(canBulk ? [selectionColumn<TeacherRow>()] : []),
      h.accessor((r) => r.firstName, {
        id: "name",
        header: "Teacher",
        enableHiding: false,
        cell: ({ row }) => {
          const t = row.original
          return (
            <Link href={`/dashboard/teachers/${t.id}`} className="group flex min-w-52 items-center gap-3">
              <Avatar className="size-9">
                {t.photoUrl && <AvatarImage src={t.photoUrl} alt="" />}
                <AvatarFallback className="text-xs">{initials(t)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium group-hover:underline">{teacherName(t)}</p>
                <p className="truncate text-xs text-muted-foreground">{t.nameNepali ?? t.email ?? ""}</p>
              </div>
            </Link>
          )
        },
      }),
      h.accessor("employeeId", { header: "Emp. ID", meta: { label: "Employee ID", cellClassName: "font-mono text-xs" } }),
      h.accessor((r) => r.designation?.name ?? "", {
        id: "designation",
        header: "Designation",
        meta: { label: "Designation" },
        cell: ({ getValue, row }) => (
          <div className="grid">
            <span>{getValue() || "—"}</span>
            {row.original.academicRank && <span className="text-xs text-muted-foreground">{ACADEMIC_RANK_LABELS[row.original.academicRank]}</span>}
          </div>
        ),
      }),
      h.accessor((r) => r.department?.name ?? "", {
        id: "department",
        header: "Department",
        meta: { label: "Department" },
        cell: ({ getValue }) => getValue() || "—",
      }),
      h.accessor((r) => r.qualifications.length, {
        id: "qualification",
        header: "Qualification",
        enableSorting: false,
        meta: { label: "Qualification summary" },
        cell: ({ row }) => {
          const best = [...row.original.qualifications].sort((a, b) => QUALIFICATION_RANK[b.level] - QUALIFICATION_RANK[a.level])[0]
          if (!best) return <span className="text-xs text-amber-700 dark:text-amber-400">Not recorded</span>
          return (
            <div className="max-w-44">
              <p className="truncate text-sm" title={best.title}>{best.title}</p>
              <p className="text-xs text-muted-foreground">
                {QUALIFICATION_LEVEL_LABELS[best.level]}
                {best.verificationStatus === "VERIFIED" ? " · verified" : ""}
              </p>
            </div>
          )
        },
      }),
      h.accessor((r) => r._count.assignments, {
        id: "classes",
        header: "Classes / programs",
        enableSorting: false,
        meta: { label: "Assigned classes or programs" },
        cell: ({ row }) => (
          <CompactList
            empty="None"
            items={unique(row.original.assignments.map((a) => assignmentSummary({ ...a, subject: null })))}
          />
        ),
      }),
      h.accessor((r) => r._count.assignments, {
        id: "subjects",
        header: "Subjects",
        enableSorting: false,
        meta: { label: "Assigned subjects" },
        cell: ({ row }) => <CompactList items={unique(row.original.assignments.map((a) => a.subject?.name))} />,
      }),
      h.accessor((r) => r.phone ?? "", {
        id: "phone",
        header: "Phone",
        enableSorting: false,
        meta: { label: "Phone", cellClassName: "whitespace-nowrap tabular-nums" },
        cell: ({ getValue }) => getValue() || <span className="text-xs text-amber-700 dark:text-amber-400">Missing</span>,
      }),
      h.accessor((r) => r.email ?? "", {
        id: "email",
        header: "Email",
        enableSorting: false,
        meta: { label: "Email" },
        cell: ({ getValue }) => getValue() || "—",
      }),
      h.accessor((r) => r.employmentType, {
        id: "type",
        header: "Type",
        enableSorting: false,
        meta: { label: "Employment type" },
        cell: ({ row }) => EMPLOYMENT_TYPE_LABELS[row.original.employmentType],
      }),
      h.accessor("dateOfJoining", {
        header: "Joined",
        meta: { label: "Joining date", cellClassName: "whitespace-nowrap tabular-nums text-muted-foreground" },
        cell: ({ getValue }) => formatDate(getValue()),
      }),
      h.accessor((r) => r.employmentStatus, {
        id: "status",
        header: "Status",
        enableSorting: false,
        meta: { label: "Employment status" },
        cell: ({ row }) => <EmploymentStatusBadge status={row.original.employmentStatus} archived={row.original.archivedAt !== null} />,
      }),
      h.display({
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => {
          const t = row.original
          const archived = t.archivedAt !== null
          return (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${teacherName(t)}`} />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem render={<Link href={`/dashboard/teachers/${t.id}`} />}>
                  <EyeIcon />
                  View profile
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href={`/dashboard/teachers/${t.id}?tab=assignments`} />}>
                  <BookOpenIcon />
                  Teaching assignments
                </DropdownMenuItem>
                {canUpdate && !archived && (
                  <DropdownMenuItem render={<Link href={`/dashboard/teachers/${t.id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </DropdownMenuItem>
                )}
                {canArchive && (
                  <DropdownMenuItem onClick={() => rowActions.ask({ row: t, action: archived ? "restore" : "archive" })}>
                    {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                    {archived ? "Restore" : "Archive"}
                  </DropdownMenuItem>
                )}
                {canDelete && archived && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => rowActions.ask({ row: t, action: "delete" })}>
                      <Trash2Icon />
                      Delete permanently
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
    ]
  }, [canBulk, canUpdate, canArchive, canDelete, rowActions])

  const columnChoices = columns
    .filter((c) => c.id && c.id !== "select" && c.id !== "actions")
    .map((c) => ({
      id: (c.id ?? (c as { accessorKey?: string }).accessorKey) as string,
      label: c.meta?.label ?? String(c.id),
      canHide: c.enableHiding !== false,
    }))

  async function runBulk() {
    if (!bulk) return
    const result = await bulkTeachersAction({ action: bulk, ids: selectedIds })
    if (!result.ok) {
      toast.add({ title: "Bulk action failed", description: result.error, type: "error" })
      return false
    }
    const { succeeded, failed } = result.data
    toast.add({
      title: `${succeeded} teacher${succeeded === 1 ? "" : "s"} ${bulk === "archive" ? "archived" : "restored"}`,
      description: failed.length ? `${failed.length} skipped: ${failed.slice(0, 3).map((f) => `${f.name ?? "Unknown"} (${f.reason})`).join("; ")}` : undefined,
      type: failed.length ? "warning" : "success",
    })
    setSelection({})
    router.refresh()
  }

  const sorting: SortingState = [{ id: filters.sort, desc: filters.dir === "desc" }]
  const hasFilters = searchParams.toString().replace(/(^|&)(year|page|pageSize|sort|dir)=[^&]*/g, "") !== ""

  const toolbar = (
    <>
      <TeacherFilterToolbar structure={structure} filters={filters} setParams={setParams} />
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        {selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{selectedIds.length} selected</span>
            {canArchive && filters.view !== "archived" && (
              <Button size="sm" variant="outline" onClick={() => setBulk("archive")}>
                <ArchiveIcon data-icon="inline-start" />
                Archive
              </Button>
            )}
            {canArchive && filters.view !== "current" && (
              <Button size="sm" variant="outline" onClick={() => setBulk("restore")}>
                <ArchiveRestoreIcon data-icon="inline-start" />
                Restore
              </Button>
            )}
            {canExport && selectedIds.length <= 1000 && (
              <Button size="sm" variant="outline" nativeButton={false} render={<a href={exportHref({ ids: selectedIds.join(",") })} />}>
                <DownloadIcon data-icon="inline-start" />
                Export selected
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelection({})}>
              <XIcon data-icon="inline-start" />
              Clear
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{total.toLocaleString()}</span> {total === 1 ? "teacher" : "teachers"}
            {filters.view === "archived" ? " (archived)" : ""} · assignments in {yearName ?? "all years"}
          </p>
        )}
        <div className="flex items-center gap-2">
          <NativeSelect size="sm" value={filters.view} onChange={(e) => setParams({ view: e.target.value === "current" ? null : e.target.value })} aria-label="Which teachers">
            <NativeSelectOption value="current">Current teachers</NativeSelectOption>
            <NativeSelectOption value="archived">Archived</NativeSelectOption>
            <NativeSelectOption value="all">All records</NativeSelectOption>
          </NativeSelect>
          <ColumnVisibilityMenu columns={columnChoices} visibility={visibility} onChange={updateVisibility} />
        </div>
      </div>
    </>
  )

  return (
    <>
      <SummaryCards stats={stats} filters={filters} setParams={setParams} />
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
          if (s) setParams({ sort: s.id, dir: s.desc ? "desc" : "asc" })
        }}
        rowSelection={canBulk ? selection : undefined}
        onRowSelectionChange={canBulk ? setSelection : undefined}
        columnVisibility={visibility}
        loading={pending}
        toolbar={toolbar}
        rowClassName={(r) => (r.archivedAt ? "opacity-70" : undefined)}
        empty={
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BriefcaseIcon />
              </EmptyMedia>
              <EmptyTitle>{hasFilters ? "No teachers match these filters" : "No teachers yet"}</EmptyTitle>
              <EmptyDescription>{hasFilters ? "Try removing some filters." : "Add your first teacher or import a list."}</EmptyDescription>
            </EmptyHeader>
            <div className="flex justify-center gap-2">
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={() => router.replace("/dashboard/teachers")}>Clear filters</Button>
              )}
              {!hasFilters && canCreate && (
                <Button size="sm" nativeButton={false} render={<Link href="/dashboard/teachers/new" />}>
                  <PlusIcon data-icon="inline-start" />
                  Add teacher
                </Button>
              )}
              {!hasFilters && canImport && (
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/dashboard/teachers/import" />}>
                  <FileUpIcon data-icon="inline-start" />
                  Import
                </Button>
              )}
            </div>
          </Empty>
        }
      />
      <ConfirmDialog
        open={bulk !== null}
        onOpenChange={(o) => !o && setBulk(null)}
        title={bulk === "archive" ? `Archive ${selectedIds.length} teachers?` : `Restore ${selectedIds.length} teachers?`}
        description={
          bulk === "archive"
            ? "Their profiles are hidden and active teaching assignments end. History and login accounts are kept."
            : "Their profiles appear in lists again."
        }
        confirmLabel={bulk === "archive" ? "Archive" : "Restore"}
        onConfirm={runBulk}
      />
      {rowActions.dialog}
    </>
  )
}

export function TeachersHeaderActions({ years, yearId }: { years: EducationStructure["years"]; yearId: string | null }) {
  const { searchParams, setParams } = useUrlFilters(TEACHER_DEPENDENT_FILTERS)
  const canCreate = useCan("teachers.create")
  const canImport = useCan("teachers.import")
  const canExport = useCan("teachers.export")
  const canConfigure = useCan("academics.manage")
  const exportHref = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    params.delete("pageSize")
    return `/api/teachers/export?${params.toString()}`
  }

  return (
    <>
      <NativeSelect
        value={searchParams.get("year") === "all" ? "all" : (yearId ?? "all")}
        onChange={(e) => setParams({ year: e.target.value })}
        aria-label="Academic year for assignments"
      >
        {years.map((y) => (
          <NativeSelectOption key={y.id} value={y.id}>
            {y.name}
            {y.isCurrent ? " (current)" : ""}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value="all">All years</NativeSelectOption>
      </NativeSelect>
      {canImport && (
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/teachers/import" />}>
          <FileUpIcon data-icon="inline-start" />
          Import
        </Button>
      )}
      {canExport && (
        <Button variant="outline" nativeButton={false} render={<a href={exportHref()} />}>
          <DownloadIcon data-icon="inline-start" />
          Export
        </Button>
      )}
      {canCreate && (
        <Button nativeButton={false} render={<Link href="/dashboard/teachers/new" />}>
          <PlusIcon data-icon="inline-start" />
          Add teacher
        </Button>
      )}
      {(canConfigure || canImport) && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>More</DropdownMenuLabel>
              {canImport && (
                <DropdownMenuItem render={<a href={TEACHER_IMPORT_TEMPLATE_URL} />}>
                  <DownloadIcon />
                  Download import template
                </DropdownMenuItem>
              )}
              {canConfigure && (
                <DropdownMenuItem render={<Link href="/dashboard/academics?tab=designations" />}>
                  <BadgeCheckIcon />
                  Designations
                </DropdownMenuItem>
              )}
              {canConfigure && (
                <DropdownMenuItem render={<Link href="/dashboard/academics?tab=subjects" />}>
                  <BookOpenIcon />
                  Subjects
                </DropdownMenuItem>
              )}
              {canConfigure && (
                <DropdownMenuItem render={<Link href="/dashboard/academics?tab=numbering" />}>
                  <PencilIcon />
                  Employee ID numbering
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
}
