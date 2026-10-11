"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ColumnVisibilityState, RowSelectionState, SortingState } from "@tanstack/react-table"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CircleAlertIcon,
  DownloadIcon,
  EyeIcon,
  FileUpIcon,
  FileTextIcon,
  GraduationCapIcon,
  MarsIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserCheckIcon,
  UserPlusIcon,
  UsersIcon,
  VenusIcon,
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
import { StatCard } from "@/components/shared/stat-card"
import { useCan } from "@/components/shared/session-provider"
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
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import {
  archiveStudentAction,
  bulkStudentsAction,
  deleteStudentAction,
  restoreStudentAction,
} from "@/features/students/actions"
import { StudentFilterToolbar } from "@/features/students/components/student-filters"
import { EnrollmentStatusBadge, StudentStatusBadge } from "@/features/students/components/status-badges"
import { useUrlFilters } from "@/hooks/use-url-filters"
import {
  fullName,
  GENDER_LABELS,
  initials,
  RELATIONSHIP_LABELS,
  STUDENT_STATUS_LABELS,
} from "@/features/students/constants"
import { DEPENDENT_FILTERS, type StudentFilters } from "@/features/students/filters"
import { IMPORT_TEMPLATE_URL } from "@/features/students/import-template"
import type { StudentStatus } from "@/lib/generated/prisma/enums"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { cn } from "@/lib/utils"
import type { EducationStructure } from "@/services/academics/structure-service"
import type { getStudentStats, StudentListRow } from "@/services/students/student-query"

// Storage paths stay on the server; the page sends a short-lived signed URL.
export type StudentRow = Omit<StudentListRow, "profileImagePath"> & { photoUrl: string | null }
type Stats = Awaited<ReturnType<typeof getStudentStats>>

const VISIBILITY_KEY = "students.table.columns"
const DEFAULT_HIDDEN: ColumnVisibilityState = { gender: false, admissionDate: false }

const formatDate = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"

// ------------------------------------------------------------- summary cards


function SummaryCards({
  stats,
  filters,
  setParams,
  yearName,
}: {
  stats: Stats
  filters: StudentFilters
  setParams: (u: Record<string, string | null>) => void
  yearName: string | null
}) {
  const scope = yearName ? `in ${yearName}` : "across all years"
  const isOnly = (key: keyof StudentFilters, value: string) => {
    const v = filters[key]
    return Array.isArray(v) ? v.length === 1 && v[0] === value : v === value
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total students"
          value={stats.total}
          hint={scope}
          icon={UsersIcon}
          active={
            filters.view === "current" && !filters.status.length && !filters.incomplete && !filters.enrollmentType && !filters.gender
          }
          onClick={() => setParams({ view: null, status: null, incomplete: null, enrollmentType: null, gender: null })}
        />
        <StatCard
          label="Active"
          value={stats.active}
          hint={`${stats.total ? Math.round((stats.active / stats.total) * 100) : 0}% of total`}
          icon={UserCheckIcon}
          active={isOnly("status", "ACTIVE")}
          onClick={() => setParams({ view: null, status: "ACTIVE" })}
        />
        <StatCard
          label="New admissions"
          value={stats.newAdmissions}
          hint={stats.newAdmissionsInYear ? scope : "in the last 12 months"}
          icon={UserPlusIcon}
          active={filters.enrollmentType === "NEW_ADMISSION"}
          onClick={() =>
            stats.newAdmissionsInYear
              ? setParams({ view: null, enrollmentType: "NEW_ADMISSION" })
              : setParams({ view: null, admittedFrom: new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10) })
          }
        />
        <StatCard
          label="Male"
          value={stats.male}
          hint={`${stats.total ? Math.round((stats.male / stats.total) * 100) : 0}% of total`}
          icon={MarsIcon}
          active={filters.gender === "MALE"}
          onClick={() => setParams({ view: null, gender: filters.gender === "MALE" ? null : "MALE" })}
        />
        <StatCard
          label="Female"
          value={stats.female}
          hint={`${stats.total ? Math.round((stats.female / stats.total) * 100) : 0}% of total`}
          icon={VenusIcon}
          active={filters.gender === "FEMALE"}
          onClick={() => setParams({ view: null, gender: filters.gender === "FEMALE" ? null : "FEMALE" })}
        />
        <StatCard
          label="Archived"
          value={stats.archived}
          hint={scope}
          icon={ArchiveIcon}
          active={filters.view === "archived"}
          onClick={() => setParams({ view: "archived" })}
        />
      </div>
      {(stats.byLevel.length > 1 || stats.incomplete > 0) && (
        <div className="flex flex-wrap gap-2">
          {stats.incomplete > 0 && (
            <button
              type="button"
              title="No date of birth, permanent address or guardian contact"
              onClick={() => setParams({ view: null, incomplete: filters.incomplete ? null : "1" })}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted/50",
                filters.incomplete === "1" && "border-primary/50 bg-primary/5"
              )}
            >
              <CircleAlertIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
              Incomplete records
              <span className="font-semibold tabular-nums">{stats.incomplete}</span>
            </button>
          )}
          {stats.byLevel.length > 1 && stats.byLevel.map((level) => (
            <button
              key={level.id}
              type="button"
              onClick={() => setParams({ level: filters.level === level.id ? null : level.id })}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted/50",
                filters.level === level.id && "border-primary/50 bg-primary/5"
              )}
            >
              <GraduationCapIcon className="size-3.5 text-muted-foreground" />
              {level.name}
              <span className="font-semibold tabular-nums">{level.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ actions

function useStudentRowActions() {
  const router = useRouter()
  const [target, setTarget] = React.useState<{ row: StudentRow; action: "archive" | "restore" | "delete" } | null>(null)

  const run = async () => {
    if (!target) return
    const id = target.row.id
    const result =
      target.action === "archive"
        ? await archiveStudentAction(id)
        : target.action === "restore"
          ? await restoreStudentAction(id)
          : await deleteStudentAction(id)
    if (!result.ok) {
      toast.add({ title: "Couldn't complete that", description: result.error, type: "error" })
      return false
    }
    toast.add({ title: result.message ?? "Done", type: "success" })
    router.refresh()
  }

  const name = target ? fullName(target.row) : ""
  const dialog = (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => !open && setTarget(null)}
      title={
        target?.action === "archive"
          ? `Archive ${name}?`
          : target?.action === "restore"
            ? `Restore ${name}?`
            : `Permanently delete ${name}?`
      }
      description={
        target?.action === "archive"
          ? "Archived students are hidden from lists and can't be edited. Their academic history is kept and they can be restored."
          : target?.action === "restore"
            ? "The student will appear in lists again."
            : "This removes the student, their guardian links and documents. Only records created by mistake without academic history can be deleted. This can't be undone."
      }
      confirmLabel={target?.action === "archive" ? "Archive" : target?.action === "restore" ? "Restore" : "Delete permanently"}
      destructive={target?.action === "delete"}
      onConfirm={run}
    />
  )
  return { ask: setTarget, dialog }
}

function BulkStatusFields({
  status,
  onStatus,
  reason,
  onReason,
}: {
  status: StudentStatus
  onStatus: (s: StudentStatus) => void
  reason: string
  onReason: (r: string) => void
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="bulk-status">New status</Label>
        <NativeSelect id="bulk-status" value={status} onChange={(e) => onStatus(e.target.value as StudentStatus)} className="w-full">
          {(Object.keys(STUDENT_STATUS_LABELS) as StudentStatus[]).map((s) => (
            <NativeSelectOption key={s} value={s}>
              {STUDENT_STATUS_LABELS[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bulk-reason">Reason (optional)</Label>
        <Textarea id="bulk-reason" rows={2} maxLength={300} value={reason} onChange={(e) => onReason(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">
        Withdrawn, transferred and graduated students have their open enrollments closed. Students whose current status
        can&apos;t change to this one are skipped and reported.
      </p>
    </div>
  )
}

// --------------------------------------------------------------------- view

export function StudentsView({
  rows,
  total,
  stats,
  filters,
  structure,
  yearId,
}: {
  rows: StudentRow[]
  total: number
  stats: Stats
  filters: StudentFilters
  structure: EducationStructure
  yearId: string | null
}) {
  const router = useRouter()
  const { searchParams, setParams, pending } = useUrlFilters(DEPENDENT_FILTERS)
  const canCreate = useCan("students.create")
  const canUpdate = useCan("students.update")
  const canArchive = useCan("students.archive")
  const canDelete = useCan("students.delete")
  const canEnroll = useCan("students.enroll")
  const canImport = useCan("students.import")
  const canExport = useCan("students.export")
  const canViewDocuments = useCan("students.documents.view")
  const canBulk = canArchive || (canUpdate && canEnroll) || canExport

  const [selection, setSelection] = React.useState<RowSelectionState>({})
  // Column choices are a per-browser convenience.
  const [visibility, updateVisibility] = useLocalStorage<ColumnVisibilityState>(VISIBILITY_KEY, DEFAULT_HIDDEN)
  const [bulk, setBulk] = React.useState<"archive" | "restore" | "status" | null>(null)
  // Set when a single row's "Change status" opens the bulk dialog.
  const [bulkTarget, setBulkTarget] = React.useState<StudentRow | null>(null)
  const [bulkStatus, setBulkStatus] = React.useState<StudentStatus>("WITHDRAWN")
  const [bulkReason, setBulkReason] = React.useState("")
  const rowActions = useStudentRowActions()

  const selectedIds = Object.keys(selection).filter((id) => selection[id])
  const yearName = structure.years.find((y) => y.id === yearId)?.name ?? null
  const exportQuery = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    params.delete("pageSize")
    for (const [k, v] of Object.entries(extra)) params.set(k, v)
    return `/api/students/export?${params.toString()}`
  }

  const columns = React.useMemo<ServerColumns<StudentRow>>(() => {
    const h = createServerColumnHelper<StudentRow>()
    const enrollment = (r: StudentRow) => r.enrollments[0]
    return [
      ...(canBulk ? [selectionColumn<StudentRow>()] : []),
      h.accessor((r) => r.firstName, {
        id: "name",
        header: "Student",
        enableHiding: false,
        meta: { label: "Student" },
        cell: ({ row }) => {
          const s = row.original
          return (
            <Link href={`/dashboard/students/${s.id}`} className="group flex min-w-48 items-center gap-3">
              <Avatar className="size-9">
                {s.photoUrl && <AvatarImage src={s.photoUrl} alt="" />}
                <AvatarFallback className="text-xs">{initials(s)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium group-hover:underline">{fullName(s)}</p>
                {s.email && <p className="truncate text-xs text-muted-foreground">{s.email}</p>}
              </div>
            </Link>
          )
        },
      }),
      h.accessor("admissionNumber", {
        header: "Adm. no.",
        meta: { label: "Admission number", cellClassName: "font-mono text-xs" },
      }),
      h.accessor((r) => enrollment(r)?.educationLevel.name ?? "", {
        id: "level",
        header: "Level",
        enableSorting: false,
        meta: { label: "Education level" },
        cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">Not enrolled</span>,
      }),
      h.accessor((r) => enrollment(r)?.program?.code ?? "", {
        id: "program",
        header: "Program",
        enableSorting: false,
        meta: { label: "Program" },
        cell: ({ getValue }) => getValue() || "—",
      }),
      h.accessor((r) => enrollment(r)?.class.name ?? "", {
        id: "class",
        header: "Class",
        enableSorting: false,
        meta: { label: "Class / cohort" },
        cell: ({ getValue }) => getValue() || "—",
      }),
      h.accessor((r) => enrollment(r)?.section?.name ?? "", {
        id: "section",
        header: "Sec.",
        enableSorting: false,
        meta: { label: "Section" },
        cell: ({ getValue }) => getValue() || "—",
      }),
      h.accessor((r) => enrollment(r)?.rollNumber ?? "", {
        id: "roll",
        header: "Roll",
        enableSorting: false,
        meta: { label: "Roll number", cellClassName: "tabular-nums" },
        cell: ({ getValue }) => getValue() || "—",
      }),
      h.accessor((r) => r.gender ?? "", {
        id: "gender",
        header: "Gender",
        meta: { label: "Gender" },
        cell: ({ row }) => (row.original.gender ? GENDER_LABELS[row.original.gender] : "—"),
      }),
      h.accessor((r) => r.guardians[0]?.guardian.phone ?? "", {
        id: "guardian",
        header: "Guardian",
        enableSorting: false,
        meta: { label: "Guardian contact" },
        cell: ({ row }) => {
          const g = row.original.guardians[0]
          if (!g) return <span className="text-xs text-amber-700 dark:text-amber-400">No guardian</span>
          return (
            <div className="min-w-32">
              <p className="truncate text-sm">{g.guardian.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {RELATIONSHIP_LABELS[g.relationship]}
                {g.guardian.phone ? ` · ${g.guardian.phone}` : ""}
              </p>
            </div>
          )
        },
      }),
      h.accessor("admissionDate", {
        header: "Admitted",
        meta: { label: "Admission date", cellClassName: "whitespace-nowrap tabular-nums text-muted-foreground" },
        cell: ({ getValue }) => formatDate(getValue()),
      }),
      h.accessor((r) => r.status, {
        id: "status",
        header: "Status",
        enableSorting: false,
        meta: { label: "Status" },
        cell: ({ row }) => {
          const s = row.original
          const e = enrollment(s)
          return (
            <div className="flex flex-col items-start gap-1">
              <StudentStatusBadge status={s.status} archived={s.archivedAt !== null} />
              {e && e.status !== "ACTIVE" && <EnrollmentStatusBadge status={e.status} />}
            </div>
          )
        },
      }),
      h.display({
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => {
          const s = row.original
          const archived = s.archivedAt !== null
          return (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${fullName(s)}`} />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem render={<Link href={`/dashboard/students/${s.id}`} />}>
                  <EyeIcon />
                  View profile
                </DropdownMenuItem>
                {canUpdate && !archived && (
                  <DropdownMenuItem render={<Link href={`/dashboard/students/${s.id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </DropdownMenuItem>
                )}
                {canEnroll && !archived && (
                  <DropdownMenuItem render={<Link href={`/dashboard/students/${s.id}?tab=enrollment`} />}>
                    <GraduationCapIcon />
                    Manage enrollment
                  </DropdownMenuItem>
                )}
                {canViewDocuments && (
                  <DropdownMenuItem render={<Link href={`/dashboard/students/${s.id}?tab=documents`} />}>
                    <FileTextIcon />
                    Documents
                  </DropdownMenuItem>
                )}
                {canUpdate && canEnroll && !archived && (
                  <DropdownMenuItem
                    onClick={() => {
                      setBulkTarget(s)
                      setBulk("status")
                    }}
                  >
                    <RefreshCwIcon />
                    Change status
                  </DropdownMenuItem>
                )}
                {canArchive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => rowActions.ask({ row: s, action: archived ? "restore" : "archive" })}>
                      {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                      {archived ? "Restore" : "Archive"}
                    </DropdownMenuItem>
                  </>
                )}
                {canDelete && archived && (
                  <>
                    {!canArchive && <DropdownMenuSeparator />}
                    <DropdownMenuItem variant="destructive" onClick={() => rowActions.ask({ row: s, action: "delete" })}>
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
  }, [canBulk, canUpdate, canArchive, canDelete, canEnroll, canViewDocuments, rowActions])

  const columnChoices = columns
    .filter((c) => c.id && c.id !== "select" && c.id !== "actions")
    .map((c) => ({
      id: (c.id ?? (c as { accessorKey?: string }).accessorKey) as string,
      label: c.meta?.label ?? String(c.id),
      canHide: c.enableHiding !== false,
    }))

  async function runBulk() {
    if (!bulk) return
    const ids = bulkTarget ? [bulkTarget.id] : selectedIds
    const result = await bulkStudentsAction(
      bulk === "status" ? { action: "status", ids, status: bulkStatus, reason: bulkReason } : { action: bulk, ids }
    )
    if (!result.ok) {
      toast.add({ title: bulkTarget ? "Couldn't change status" : "Bulk action failed", description: result.error, type: "error" })
      return false
    }
    const { succeeded, failed } = result.data
    if (bulkTarget) {
      // A single student: report the outcome plainly instead of as counts.
      if (failed.length) {
        toast.add({ title: "Status not changed", description: failed[0].reason, type: "error" })
        return false
      }
      toast.add({ title: `${fullName(bulkTarget)} is now ${STUDENT_STATUS_LABELS[bulkStatus].toLowerCase()}`, type: "success" })
      setBulkReason("")
      router.refresh()
      return
    }
    toast.add({
      title: `${succeeded} student${succeeded === 1 ? "" : "s"} updated`,
      description: failed.length
        ? `${failed.length} skipped: ${failed
            .slice(0, 3)
            .map((f) => `${f.name ?? "Unknown"} (${f.reason})`)
            .join("; ")}${failed.length > 3 ? "…" : ""}`
        : undefined,
      type: failed.length ? "warning" : "success",
    })
    setSelection({})
    setBulkReason("")
    router.refresh()
  }

  const sorting: SortingState = [{ id: filters.sort, desc: filters.dir === "desc" }]
  const hasFilters = searchParams.toString().replace(/(^|&)(year|page|pageSize|sort|dir)=[^&]*/g, "") !== ""

  const toolbar = (
    <>
      <StudentFilterToolbar structure={structure} filters={filters} setParams={setParams} />
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
            {canUpdate && canEnroll && filters.view !== "archived" && (
              <Button size="sm" variant="outline" onClick={() => setBulk("status")}>
                <UserCheckIcon data-icon="inline-start" />
                Change status
              </Button>
            )}
            {canExport && selectedIds.length <= 1000 && (
              <Button size="sm" variant="outline" nativeButton={false} render={<a href={exportQuery({ ids: selectedIds.join(",") })} />}>
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
            <span className="font-medium text-foreground tabular-nums">{total.toLocaleString()}</span>{" "}
            {total === 1 ? "student" : "students"}
            {filters.view === "archived" ? " (archived)" : ""}
            {yearName ? ` · ${yearName}` : " · all years"}
          </p>
        )}
        <div className="flex items-center gap-2">
          <NativeSelect
            size="sm"
            value={filters.view}
            onChange={(e) => setParams({ view: e.target.value === "current" ? null : e.target.value })}
            aria-label="Which students"
          >
            <NativeSelectOption value="current">Current students</NativeSelectOption>
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
      <SummaryCards stats={stats} filters={filters} setParams={setParams} yearName={yearName} />

      <ServerDataTable
        data={rows}
        columns={columns}
        rowCount={total}
        getRowId={(r) => r.id}
        pagination={{ pageIndex: filters.page - 1, pageSize: filters.pageSize }}
        onPaginationChange={(p) =>
          setParams({ page: p.pageIndex > 0 ? String(p.pageIndex + 1) : null, pageSize: String(p.pageSize) }, { resetPage: false })
        }
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
                <GraduationCapIcon />
              </EmptyMedia>
              <EmptyTitle>{hasFilters ? "No students match these filters" : "No students yet"}</EmptyTitle>
              <EmptyDescription>
                {hasFilters
                  ? "Try removing some filters or searching for something else."
                  : yearName
                    ? `No one is enrolled in ${yearName} yet.`
                    : "Admit your first student to get started."}
              </EmptyDescription>
            </EmptyHeader>
            <div className="flex justify-center gap-2">
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={() => router.replace("/dashboard/students")}>
                  Clear filters
                </Button>
              )}
              {canCreate && !hasFilters && (
                <Button size="sm" nativeButton={false} render={<Link href="/dashboard/students/new" />}>
                  <PlusIcon data-icon="inline-start" />
                  Add student
                </Button>
              )}
              {!hasFilters && canImport && (
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/dashboard/students/import" />}>
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
        onOpenChange={(open) => {
          if (open) return
          setBulk(null)
          setBulkTarget(null)
        }}
        title={
          bulk === "archive"
            ? `Archive ${selectedIds.length} students?`
            : bulk === "restore"
              ? `Restore ${selectedIds.length} students?`
              : bulkTarget
                ? `Change status of ${fullName(bulkTarget)}`
                : `Change status of ${selectedIds.length} students`
        }
        description={
          bulk === "archive"
            ? "They'll be hidden from lists; their history is kept and they can be restored."
            : bulk === "restore"
              ? "They'll appear in lists again."
              : undefined
        }
        confirmLabel={bulk === "archive" ? "Archive" : bulk === "restore" ? "Restore" : "Apply"}
        onConfirm={runBulk}
      >
        {bulk === "status" && (
          <BulkStatusFields status={bulkStatus} onStatus={setBulkStatus} reason={bulkReason} onReason={setBulkReason} />
        )}
      </ConfirmDialog>
      {rowActions.dialog}

      <span className="sr-only" aria-live="polite">
        {pending ? "Loading students" : `${total} students`}
      </span>
    </>
  )
}

// Header actions for the students page (year selector, add, import, export).
export function StudentsHeaderActions({
  years,
  yearId,
}: {
  years: EducationStructure["years"]
  yearId: string | null
}) {
  const { searchParams, setParams } = useUrlFilters(DEPENDENT_FILTERS)
  const canCreate = useCan("students.create")
  const canImport = useCan("students.import")
  const canExport = useCan("students.export")
  const canConfigure = useCan("academics.manage")

  const exportHref = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    params.delete("pageSize")
    return `/api/students/export?${params.toString()}`
  }

  return (
    <>
      <NativeSelect
        value={searchParams.get("year") === "all" ? "all" : (yearId ?? "all")}
        onChange={(e) => setParams({ year: e.target.value })}
        aria-label="Academic year"
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
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/students/import" />}>
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
        <Button nativeButton={false} render={<Link href="/dashboard/students/new" />}>
          <PlusIcon data-icon="inline-start" />
          Add student
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
                <DropdownMenuItem render={<a href={IMPORT_TEMPLATE_URL} />}>
                  <DownloadIcon />
                  Download import template
                </DropdownMenuItem>
              )}
              {canConfigure && (
                <DropdownMenuItem render={<Link href="/dashboard/academics" />}>
                  <GraduationCapIcon />
                  Education structure
                </DropdownMenuItem>
              )}
              {canConfigure && (
                <DropdownMenuItem render={<Link href="/dashboard/academics?tab=numbering" />}>
                  <PencilIcon />
                  Admission numbering
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
}
