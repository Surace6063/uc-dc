"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ColumnVisibilityState, RowSelectionState, SortingState } from "@tanstack/react-table"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BadgeCheckIcon,
  BriefcaseIcon,
  Building2Icon,
  CalendarClockIcon,
  CircleAlertIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  FileUpIcon,
  ListChecksIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlaneIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  UserCheckIcon,
  UserPlusIcon,
  UsersIcon,
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
  archiveStaffAction,
  bulkStaffActionAction,
  deleteStaffAction,
  restoreStaffAction,
} from "@/features/staff/actions"
import { StaffFilterToolbar } from "@/features/staff/components/staff-filters"
import { StaffStatusBadge } from "@/features/staff/components/status-badges"
import { CONTRACT_ALERT_DAYS, STAFF_EMPLOYMENT_TYPE_LABELS, staffName } from "@/features/staff/constants"
import { STAFF_DEPENDENT_FILTERS, type StaffFilters } from "@/features/staff/filters"
import { STAFF_IMPORT_TEMPLATE_URL } from "@/features/staff/import-template"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useUrlFilters } from "@/hooks/use-url-filters"
import { cn } from "@/lib/utils"
import type { StaffFormOptions } from "@/services/staff/config-service"
import type { getStaffStats, StaffListRow } from "@/services/staff/staff-query"

// Storage paths stay on the server; the page sends short-lived signed URLs.
export type StaffRow = Omit<StaffListRow, "profileImagePath"> & { photoUrl: string | null }
type Stats = Awaited<ReturnType<typeof getStaffStats>>

const VISIBILITY_KEY = "staff.table.columns"
const DEFAULT_HIDDEN: ColumnVisibilityState = { email: false, category: false, responsibilities: false }

const formatDate = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"
const daysUntil = (d: Date | string) => Math.ceil((new Date(d).getTime() - Date.now()) / 864e5)

function SummaryCards({ stats, filters, setParams }: { stats: Stats; filters: StaffFilters; setParams: (u: Record<string, string | null>) => void }) {
  const only = (list: string[], value: string) => list.length === 1 && list[0] === value
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total staff" value={stats.total} hint="current profiles" icon={UsersIcon}
          active={filters.view === "current" && !filters.status.length && !filters.joinedFrom && !filters.contractExpiring && !filters.incomplete}
          onClick={() => setParams({ view: null, status: null, joinedFrom: null, joinedTo: null, contractExpiring: null, incomplete: null, pendingVerification: null })} />
        <StatCard label="Active" value={stats.active} hint={`${stats.total ? Math.round((stats.active / stats.total) * 100) : 0}% of total`} icon={UserCheckIcon}
          active={only(filters.status, "ACTIVE")} onClick={() => setParams({ status: "ACTIVE" })} />
        <StatCard label="New hires" value={stats.newHires} hint="joined in the last 90 days" icon={UserPlusIcon}
          active={filters.joinedFrom === stats.newHiresFrom} onClick={() => setParams({ joinedFrom: stats.newHiresFrom, joinedTo: null })} />
        <StatCard label="On leave" value={stats.onLeave} hint="employment status" icon={PlaneIcon}
          active={only(filters.status, "ON_LEAVE")} onClick={() => setParams({ status: "ON_LEAVE" })} />
        {stats.contractsVisible ? (
          <StatCard label="Contracts expiring" value={stats.expiring} hint={`within ${CONTRACT_ALERT_DAYS} days`} icon={CalendarClockIcon}
            active={filters.contractExpiring === "1"} onClick={() => setParams({ contractExpiring: filters.contractExpiring ? null : "1" })} />
        ) : (
          <StatCard label="Pending verification" value={stats.pending} hint="qualifications or documents" icon={BadgeCheckIcon}
            active={filters.pendingVerification === "1"} onClick={() => setParams({ pendingVerification: "1" })} />
        )}
        <StatCard label="Incomplete profiles" value={stats.incomplete} hint="no phone, email, qualification or department" icon={CircleAlertIcon}
          active={filters.incomplete === "1"} onClick={() => setParams({ incomplete: filters.incomplete ? null : "1" })} />
      </div>
      {(stats.byDepartment.length > 0 || (stats.contractsVisible && stats.probation > 0)) && (
        <div className="flex flex-wrap gap-2">
          {stats.contractsVisible && stats.probation > 0 && (
            <button
              type="button"
              onClick={() => setParams({ probation: filters.probation === "yes" ? null : "yes" })}
              className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted/50", filters.probation === "yes" && "border-primary/50 bg-primary/5")}
            >
              <ListChecksIcon className="size-3.5 text-muted-foreground" />
              On probation
              <span className="font-semibold tabular-nums">{stats.probation}</span>
            </button>
          )}
          {stats.byDepartment.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setParams({ department: filters.department === d.id ? null : d.id })}
              className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted/50", filters.department === d.id && "border-primary/50 bg-primary/5")}
            >
              <Building2Icon className="size-3.5 text-muted-foreground" />
              {d.name}
              <span className="font-semibold tabular-nums">{d.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function useRowActions() {
  const router = useRouter()
  const [target, setTarget] = React.useState<{ row: StaffRow; action: "archive" | "restore" | "delete" } | null>(null)
  const name = target ? staffName(target.row) : ""
  const dialog = (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(o) => !o && setTarget(null)}
      title={target?.action === "archive" ? `Archive ${name}?` : target?.action === "restore" ? `Restore ${name}?` : `Permanently delete ${name}?`}
      description={
        target?.action === "archive"
          ? "The profile is hidden from lists and active responsibilities end. Employment status and history are kept; the login account is not affected. To record a resignation, change the employment status instead."
          : target?.action === "restore"
            ? "The profile appears in lists again. Ended responsibilities stay ended."
            : "Only for profiles created by mistake, with no employment history. The login account is not deleted. This can't be undone."
      }
      confirmLabel={target?.action === "archive" ? "Archive" : target?.action === "restore" ? "Restore" : "Delete permanently"}
      destructive={target?.action === "delete"}
      onConfirm={async () => {
        if (!target) return
        const id = target.row.id
        const result =
          target.action === "archive" ? await archiveStaffAction(id) : target.action === "restore" ? await restoreStaffAction(id) : await deleteStaffAction(id)
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

export function StaffView({
  rows,
  total,
  stats,
  filters,
  options,
  managers,
}: {
  rows: StaffRow[]
  total: number
  stats: Stats
  filters: StaffFilters
  options: StaffFormOptions
  managers: { id: string; name: string }[]
}) {
  const router = useRouter()
  const { searchParams, setParams, pending } = useUrlFilters(STAFF_DEPENDENT_FILTERS)
  const canCreate = useCan("staff.create")
  const canUpdate = useCan("staff.update")
  const canArchive = useCan("staff.archive")
  const canDelete = useCan("staff.delete")
  const canExport = useCan("staff.export")
  const canImport = useCan("staff.import")
  const canSeeEmployment = useCan("staff.employment.view")
  const canSeeDocuments = useCan("staff.documents.view")
  const canBulk = canArchive || canExport
  const [selection, setSelection] = React.useState<RowSelectionState>({})
  const [visibility, updateVisibility] = useLocalStorage<ColumnVisibilityState>(VISIBILITY_KEY, DEFAULT_HIDDEN)
  const [bulk, setBulk] = React.useState<"archive" | "restore" | null>(null)
  const rowActions = useRowActions()
  const selectedIds = Object.keys(selection).filter((id) => selection[id])

  const exportHref = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    params.delete("pageSize")
    for (const [k, v] of Object.entries(extra)) params.set(k, v)
    return `/api/staff/export?${params.toString()}`
  }

  const columns = React.useMemo<ServerColumns<StaffRow>>(() => {
    const h = createServerColumnHelper<StaffRow>()
    return [
      ...(canBulk ? [selectionColumn<StaffRow>()] : []),
      h.accessor((r) => r.firstName, {
        id: "name",
        header: "Staff member",
        enableHiding: false,
        cell: ({ row }) => {
          const s = row.original
          return (
            <Link href={`/dashboard/staff/${s.id}`} className="group flex min-w-52 items-center gap-3">
              <Avatar className="size-9">
                {s.photoUrl && <AvatarImage src={s.photoUrl} alt="" />}
                <AvatarFallback className="text-xs">{initials(s)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium group-hover:underline">{staffName(s)}</p>
                <p className="truncate text-xs text-muted-foreground">{s.nameNepali ?? s.email ?? ""}</p>
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
        cell: ({ getValue }) => getValue() || "—",
      }),
      h.accessor((r) => r.department?.name ?? "", {
        id: "department",
        header: "Department",
        meta: { label: "Department" },
        cell: ({ getValue }) => getValue() || <span className="text-xs text-amber-700 dark:text-amber-400">Not set</span>,
      }),
      h.accessor((r) => r.employmentType, {
        id: "type",
        header: "Type",
        enableSorting: false,
        meta: { label: "Employment type" },
        cell: ({ row }) => STAFF_EMPLOYMENT_TYPE_LABELS[row.original.employmentType],
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
      h.accessor("dateOfJoining", {
        header: "Joined",
        meta: { label: "Date of joining", cellClassName: "whitespace-nowrap tabular-nums text-muted-foreground" },
        cell: ({ getValue }) => formatDate(getValue()),
      }),
      ...(canSeeEmployment
        ? [
            h.accessor((r) => r.contractEndDate, {
              id: "contractEndDate",
              header: "Contract ends",
              meta: { label: "Contract end date", cellClassName: "whitespace-nowrap tabular-nums" },
              cell: ({ row }) => {
                const end = row.original.contractEndDate
                if (!end) return <span className="text-muted-foreground">—</span>
                const days = daysUntil(end)
                const soon = days >= 0 && days <= CONTRACT_ALERT_DAYS && !row.original.archivedAt
                return (
                  <span className={cn(soon ? "font-medium text-amber-700 dark:text-amber-400" : days < 0 ? "text-muted-foreground" : "")}>
                    {formatDate(end)}
                    {soon && <span className="block text-xs font-normal">in {days} day{days === 1 ? "" : "s"}</span>}
                  </span>
                )
              },
            }),
          ]
        : []),
      h.accessor((r) => r._count.assignments, {
        id: "responsibilities",
        header: "Responsibilities",
        enableSorting: false,
        meta: { label: "Active responsibilities", cellClassName: "tabular-nums" },
        cell: ({ getValue }) => getValue() || "—",
      }),
      h.accessor((r) => r.employmentStatus, {
        id: "status",
        header: "Status",
        enableSorting: false,
        meta: { label: "Employment status" },
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <StaffStatusBadge status={row.original.employmentStatus} archived={row.original.archivedAt !== null} />
            {row.original.onProbation && !row.original.archivedAt && <span className="text-xs text-muted-foreground">On probation</span>}
          </div>
        ),
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
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${staffName(s)}`} />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem render={<Link href={`/dashboard/staff/${s.id}`} />}>
                  <EyeIcon />
                  View profile
                </DropdownMenuItem>
                {canUpdate && !archived && (
                  <DropdownMenuItem render={<Link href={`/dashboard/staff/${s.id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </DropdownMenuItem>
                )}
                {canSeeEmployment && (
                  <DropdownMenuItem render={<Link href={`/dashboard/staff/${s.id}?tab=employment`} />}>
                    <BriefcaseIcon />
                    Employment
                  </DropdownMenuItem>
                )}
                {canSeeDocuments && (
                  <DropdownMenuItem render={<Link href={`/dashboard/staff/${s.id}?tab=documents`} />}>
                    <FileTextIcon />
                    Documents
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
  }, [canBulk, canUpdate, canArchive, canDelete, canSeeEmployment, canSeeDocuments, rowActions])

  const columnChoices = columns
    .filter((c) => c.id && c.id !== "select" && c.id !== "actions")
    .map((c) => ({
      id: (c.id ?? (c as { accessorKey?: string }).accessorKey) as string,
      label: c.meta?.label ?? String(c.id),
      canHide: c.enableHiding !== false,
    }))

  async function runBulk() {
    if (!bulk) return
    const result = await bulkStaffActionAction({ action: bulk, ids: selectedIds })
    if (!result.ok) {
      toast.add({ title: "Bulk action failed", description: result.error, type: "error" })
      return false
    }
    const { succeeded, failed } = result.data
    toast.add({
      title: `${succeeded} staff member${succeeded === 1 ? "" : "s"} ${bulk === "archive" ? "archived" : "restored"}`,
      description: failed.length
        ? `${failed.length} skipped: ${failed.slice(0, 3).map((f) => `${f.name ?? "Unknown"} (${f.reason})`).join("; ")}${failed.length > 3 ? "…" : ""}`
        : undefined,
      type: failed.length ? "warning" : "success",
    })
    setSelection({})
    router.refresh()
  }

  const sorting: SortingState = [{ id: filters.sort, desc: filters.dir === "desc" }]
  const hasFilters = searchParams.toString().replace(/(^|&)(page|pageSize|sort|dir)=[^&]*/g, "") !== ""

  const toolbar = (
    <>
      <StaffFilterToolbar options={options} managers={managers} filters={filters} setParams={setParams} />
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
            <span className="font-medium text-foreground tabular-nums">{total.toLocaleString()}</span> staff
            {filters.view === "archived" ? " (archived)" : ""}
            {hasFilters ? " matching" : ""}
          </p>
        )}
        <div className="flex items-center gap-2">
          <NativeSelect size="sm" value={filters.view} onChange={(e) => setParams({ view: e.target.value === "current" ? null : e.target.value })} aria-label="Which staff">
            <NativeSelectOption value="current">Current staff</NativeSelectOption>
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
              <EmptyTitle>{hasFilters ? "No staff match these filters" : "No staff yet"}</EmptyTitle>
              <EmptyDescription>
                {hasFilters
                  ? "Try removing some filters or searching for something else."
                  : options.departments.length === 0
                    ? "Set up departments and designations first, then add staff or import a list."
                    : "Add your first staff member or import a list."}
              </EmptyDescription>
            </EmptyHeader>
            <div className="flex justify-center gap-2">
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={() => router.replace("/dashboard/staff")}>Clear filters</Button>
              )}
              {!hasFilters && canCreate && (
                <Button size="sm" nativeButton={false} render={<Link href="/dashboard/staff/new" />}>
                  <PlusIcon data-icon="inline-start" />
                  Add staff
                </Button>
              )}
              {!hasFilters && canImport && (
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/dashboard/staff/import" />}>
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
        title={bulk === "archive" ? `Archive ${selectedIds.length} staff?` : `Restore ${selectedIds.length} staff?`}
        description={
          bulk === "archive"
            ? "Their profiles are hidden and active responsibilities end. Employment history and login accounts are kept. Records that are already archived are skipped."
            : "Their profiles appear in lists again. Records that aren't archived are skipped."
        }
        confirmLabel={bulk === "archive" ? `Archive ${selectedIds.length}` : `Restore ${selectedIds.length}`}
        onConfirm={runBulk}
      />
      {rowActions.dialog}
      <span className="sr-only" aria-live="polite">
        {pending ? "Loading staff" : `${total} staff`}
      </span>
    </>
  )
}

export function StaffHeaderActions() {
  const { searchParams } = useUrlFilters(STAFF_DEPENDENT_FILTERS)
  const canCreate = useCan("staff.create")
  const canImport = useCan("staff.import")
  const canExport = useCan("staff.export")
  const canConfigure = useCan("staff.configure")
  const exportHref = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    params.delete("pageSize")
    return `/api/staff/export?${params.toString()}`
  }

  return (
    <>
      {canImport && (
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/staff/import" />}>
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
        <Button nativeButton={false} render={<Link href="/dashboard/staff/new" />}>
          <PlusIcon data-icon="inline-start" />
          Add staff
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
              {canConfigure && (
                <DropdownMenuItem render={<Link href="/dashboard/staff/settings?tab=departments" />}>
                  <Building2Icon />
                  Departments
                </DropdownMenuItem>
              )}
              {canConfigure && (
                <DropdownMenuItem render={<Link href="/dashboard/staff/settings?tab=designations" />}>
                  <BadgeCheckIcon />
                  Designations
                </DropdownMenuItem>
              )}
              {canConfigure && (
                <DropdownMenuItem render={<Link href="/dashboard/staff/settings?tab=documents" />}>
                  <FileTextIcon />
                  Document types
                </DropdownMenuItem>
              )}
              {canConfigure && (
                <DropdownMenuItem render={<Link href="/dashboard/staff/settings?tab=numbering" />}>
                  <SettingsIcon />
                  Employee ID numbering
                </DropdownMenuItem>
              )}
              {canImport && (
                <DropdownMenuItem render={<a href={STAFF_IMPORT_TEMPLATE_URL} />}>
                  <DownloadIcon />
                  Download import template
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
}
