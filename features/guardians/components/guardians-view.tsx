"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ColumnVisibilityState, RowSelectionState, SortingState } from "@tanstack/react-table"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  EyeIcon,
  FileUpIcon,
  HeartHandshakeIcon,
  KeyRoundIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserCheckIcon,
  UserXIcon,
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
import {
  archiveGuardianAction,
  bulkGuardianActionAction,
  deleteGuardianAction,
  restoreGuardianAction,
} from "@/features/guardians/actions"
import { GuardianFilterToolbar } from "@/features/guardians/components/guardian-filters"
import { InvitationBadge, PortalStatusBadge } from "@/features/guardians/components/status-badges"
import { guardianInitials, invitationState, RELATIONSHIP_LABELS } from "@/features/guardians/constants"
import type { GuardianFilters } from "@/features/guardians/filters"
import { GUARDIAN_IMPORT_TEMPLATE_URL } from "@/features/guardians/import-template"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { getGuardianStats, GuardianListRow } from "@/services/guardians/guardian-query"

// Storage paths stay on the server; the page sends short-lived signed URLs.
export type GuardianRow = Omit<GuardianListRow, "profileImagePath"> & { photoUrl: string | null }
type Stats = Awaited<ReturnType<typeof getGuardianStats>>

const VISIBILITY_KEY = "guardians.table.columns"
const DEFAULT_HIDDEN: ColumnVisibilityState = { occupation: false, createdAt: false }

const formatDate = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"

function exportHref(searchParams: URLSearchParams, extra: Record<string, string> = {}) {
  const params = new URLSearchParams(searchParams.toString())
  params.delete("page")
  params.delete("pageSize")
  for (const [k, v] of Object.entries(extra)) params.set(k, v)
  return `/api/parents/export?${params.toString()}`
}

function SummaryCards({ stats, filters, setParams }: { stats: Stats; filters: GuardianFilters; setParams: (u: Record<string, string | null>) => void }) {
  const portalOnly = (value: string) => filters.portal.length === 1 && filters.portal[0] === value
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatCard label="Total guardians" value={stats.total} hint="including archived" icon={UsersIcon}
        active={filters.view === "all" && !filters.portal.length && !filters.invitation}
        onClick={() => setParams({ view: "all", portal: null, invitation: null })} />
      <StatCard label="Active guardians" value={stats.active} hint="not archived" icon={UserCheckIcon}
        active={filters.view === "current" && !filters.portal.length && !filters.invitation}
        onClick={() => setParams({ view: null, portal: null, invitation: null })} />
      <StatCard label="With portal access" value={stats.withPortal} hint="account linked and enabled" icon={KeyRoundIcon}
        active={portalOnly("ACTIVE")} onClick={() => setParams({ view: null, portal: "ACTIVE", invitation: null })} />
      <StatCard label="Without portal access" value={stats.withoutPortal} hint="no account, invited or disabled" icon={UserXIcon}
        active={filters.portal.length === 3} onClick={() => setParams({ view: null, portal: "NONE,INVITED,DISABLED", invitation: null })} />
      <StatCard label="Pending invitations" value={stats.pendingInvitations} hint="sent and not yet accepted" icon={MailIcon}
        active={filters.invitation === "pending"} onClick={() => setParams({ view: null, portal: null, invitation: "pending" })} />
    </div>
  )
}

function useRowActions() {
  const router = useRouter()
  const [target, setTarget] = React.useState<{ row: GuardianRow; action: "archive" | "restore" | "delete" } | null>(null)
  const name = target?.row.fullName ?? ""
  const dialog = (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(o) => !o && setTarget(null)}
      title={target?.action === "archive" ? `Archive ${name}?` : target?.action === "restore" ? `Restore ${name}?` : `Permanently delete ${name}?`}
      description={
        target?.action === "archive"
          ? "The guardian is hidden from lists, can't use the parent portal and stops receiving notices. Links to students and any login account are kept, so restoring brings everything back."
          : target?.action === "restore"
            ? "The guardian appears in lists again. Portal access returns if their account is still linked and enabled."
            : "Only for records created by mistake, with no linked students and no account. This can't be undone."
      }
      confirmLabel={target?.action === "archive" ? "Archive" : target?.action === "restore" ? "Restore" : "Delete permanently"}
      destructive={target?.action === "delete"}
      onConfirm={async () => {
        if (!target) return
        const id = target.row.id
        const result =
          target.action === "archive" ? await archiveGuardianAction(id) : target.action === "restore" ? await restoreGuardianAction(id) : await deleteGuardianAction(id)
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

export function GuardiansView({
  rows,
  total,
  stats,
  filters,
  studentLabel,
}: {
  rows: GuardianRow[]
  total: number
  stats: Stats
  filters: GuardianFilters
  studentLabel: string | null
}) {
  const router = useRouter()
  const { searchParams, setParams, pending } = useUrlFilters()
  const canCreate = useCan("parents.create")
  const canUpdate = useCan("parents.update")
  const canArchive = useCan("parents.archive")
  const canDelete = useCan("parents.delete")
  const canExport = useCan("parents.export")
  const canImport = useCan("parents.import")
  const canSeeStudents = useCan("students.view")
  const canBulk = canArchive || canExport
  const [selection, setSelection] = React.useState<RowSelectionState>({})
  const [visibility, updateVisibility] = useLocalStorage<ColumnVisibilityState>(VISIBILITY_KEY, DEFAULT_HIDDEN)
  const [bulk, setBulk] = React.useState<"archive" | "restore" | null>(null)
  const rowActions = useRowActions()
  const selectedIds = Object.keys(selection).filter((id) => selection[id])

  const columns = React.useMemo<ServerColumns<GuardianRow>>(() => {
    const h = createServerColumnHelper<GuardianRow>()
    return [
      ...(canBulk ? [selectionColumn<GuardianRow>()] : []),
      h.accessor((r) => r.fullName, {
        id: "name",
        header: "Guardian",
        enableHiding: false,
        cell: ({ row }) => {
          const g = row.original
          return (
            <Link href={`/dashboard/parents/${g.id}`} className="group flex min-w-48 items-center gap-3">
              <Avatar className="size-9">
                {g.photoUrl && <AvatarImage src={g.photoUrl} alt="" />}
                <AvatarFallback className="text-xs">{guardianInitials(g.fullName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium group-hover:underline">{g.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{g.archivedAt ? "Archived" : (g.occupation ?? "")}</p>
              </div>
            </Link>
          )
        },
      }),
      h.accessor((r) => r.guardianCode ?? "", {
        id: "guardianCode",
        header: "Guardian ID",
        meta: { label: "Guardian ID", cellClassName: "font-mono text-xs whitespace-nowrap" },
        cell: ({ getValue }) => getValue() || "—",
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
        meta: { label: "Email", cellClassName: "max-w-48 truncate" },
        cell: ({ getValue }) => getValue() || "—",
      }),
      h.accessor((r) => r.occupation ?? "", {
        id: "occupation",
        header: "Occupation",
        enableSorting: false,
        meta: { label: "Occupation" },
        cell: ({ getValue }) => getValue() || "—",
      }),
      h.accessor((r) => r.childCount, {
        id: "children",
        header: "Linked students",
        meta: { label: "Linked students" },
        cell: ({ row }) => {
          const g = row.original
          if (g.childCount === 0) return <span className="text-xs text-muted-foreground">None</span>
          if (!canSeeStudents) return <span className="tabular-nums">{g.childCount}</span>
          return (
            <ul className="grid min-w-40 gap-0.5 text-sm">
              {g.children.slice(0, 2).map((c) => (
                <li key={c.id} className="truncate">
                  {c.name} <span className="text-xs text-muted-foreground">· {RELATIONSHIP_LABELS[c.relationship]}</span>
                </li>
              ))}
              {g.childCount > 2 && <li className="text-xs text-muted-foreground">+{g.childCount - 2} more</li>}
            </ul>
          )
        },
      }),
      h.accessor((r) => r.primaryFor, {
        id: "primary",
        header: "Primary for",
        enableSorting: false,
        meta: { label: "Primary contact", cellClassName: "tabular-nums whitespace-nowrap" },
        cell: ({ row }) => {
          const { primaryFor, childCount } = row.original
          if (childCount === 0) return "—"
          return primaryFor ? `${primaryFor} of ${childCount}` : <span className="text-muted-foreground">No</span>
        },
      }),
      h.accessor((r) => r.portalStatus, {
        id: "portal",
        header: "Portal",
        enableSorting: false,
        meta: { label: "Portal access" },
        cell: ({ row }) => <PortalStatusBadge status={row.original.portalStatus} />,
      }),
      h.accessor((r) => invitationState(r.latestInvitation), {
        id: "invitation",
        header: "Invitation",
        enableSorting: false,
        meta: { label: "Invitation status" },
        cell: ({ getValue }) => <InvitationBadge state={getValue()} />,
      }),
      h.accessor("createdAt", {
        header: "Created",
        meta: { label: "Created date", cellClassName: "whitespace-nowrap tabular-nums text-muted-foreground" },
        cell: ({ getValue }) => formatDate(getValue()),
      }),
      h.display({
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => {
          const g = row.original
          const archived = g.archivedAt !== null
          return (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${g.fullName}`} />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem render={<Link href={`/dashboard/parents/${g.id}`} />}>
                  <EyeIcon />
                  View profile
                </DropdownMenuItem>
                {canUpdate && !archived && (
                  <DropdownMenuItem render={<Link href={`/dashboard/parents/${g.id}/edit`} />}>
                    <PencilIcon />
                    Edit
                  </DropdownMenuItem>
                )}
                {canSeeStudents && (
                  <DropdownMenuItem render={<Link href={`/dashboard/parents/${g.id}?tab=children`} />}>
                    <HeartHandshakeIcon />
                    Linked students
                  </DropdownMenuItem>
                )}
                {canArchive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => rowActions.ask({ row: g, action: archived ? "restore" : "archive" })}>
                      {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                      {archived ? "Restore" : "Archive"}
                    </DropdownMenuItem>
                  </>
                )}
                {canDelete && archived && (
                  <>
                    {!canArchive && <DropdownMenuSeparator />}
                    <DropdownMenuItem variant="destructive" onClick={() => rowActions.ask({ row: g, action: "delete" })}>
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
  }, [canBulk, canUpdate, canArchive, canDelete, canSeeStudents, rowActions])

  const columnChoices = columns
    .filter((c) => c.id && c.id !== "select" && c.id !== "actions")
    .map((c) => ({
      id: (c.id ?? (c as { accessorKey?: string }).accessorKey) as string,
      label: c.meta?.label ?? String(c.id),
      canHide: c.enableHiding !== false,
    }))

  async function runBulk() {
    if (!bulk) return
    const result = await bulkGuardianActionAction({ action: bulk, ids: selectedIds })
    if (!result.ok) {
      toast.add({ title: "Bulk action failed", description: result.error, type: "error" })
      return false
    }
    const { succeeded, failed } = result.data
    toast.add({
      title: `${succeeded} guardian${succeeded === 1 ? "" : "s"} ${bulk === "archive" ? "archived" : "restored"}`,
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
      <GuardianFilterToolbar filters={filters} setParams={setParams} studentLabel={studentLabel} />
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
              <Button size="sm" variant="outline" nativeButton={false} render={<a href={exportHref(searchParams, { ids: selectedIds.join(",") })} />}>
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
            <span className="font-medium text-foreground tabular-nums">{total.toLocaleString()}</span> guardian{total === 1 ? "" : "s"}
            {filters.view === "archived" ? " (archived)" : ""}
            {hasFilters ? " matching" : ""}
          </p>
        )}
        <div className="flex items-center gap-2">
          <NativeSelect size="sm" value={filters.view} onChange={(e) => setParams({ view: e.target.value === "current" ? null : e.target.value })} aria-label="Which guardians">
            <NativeSelectOption value="current">Active guardians</NativeSelectOption>
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
                <HeartHandshakeIcon />
              </EmptyMedia>
              <EmptyTitle>{hasFilters ? "No guardians match these filters" : "No guardians yet"}</EmptyTitle>
              <EmptyDescription>
                {hasFilters
                  ? "Try removing some filters or searching for something else."
                  : "Guardians added during student admission appear here too. Add a guardian or import a list."}
              </EmptyDescription>
            </EmptyHeader>
            <div className="flex justify-center gap-2">
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={() => router.replace("/dashboard/parents")}>Clear filters</Button>
              )}
              {!hasFilters && canCreate && (
                <Button size="sm" nativeButton={false} render={<Link href="/dashboard/parents/new" />}>
                  <PlusIcon data-icon="inline-start" />
                  Add guardian
                </Button>
              )}
              {!hasFilters && canImport && (
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/dashboard/parents/import" />}>
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
        title={bulk === "archive" ? `Archive ${selectedIds.length} guardians?` : `Restore ${selectedIds.length} guardians?`}
        description={
          bulk === "archive"
            ? "They're hidden from lists, lose parent portal access and stop receiving notices. Student links and accounts are kept. Records already archived are skipped."
            : "They appear in lists again. Records that aren't archived are skipped."
        }
        confirmLabel={bulk === "archive" ? `Archive ${selectedIds.length}` : `Restore ${selectedIds.length}`}
        onConfirm={runBulk}
      />
      {rowActions.dialog}
      <span className="sr-only" aria-live="polite">
        {pending ? "Loading guardians" : `${total} guardians`}
      </span>
    </>
  )
}

export function GuardianHeaderActions() {
  const { searchParams } = useUrlFilters()
  const canCreate = useCan("parents.create")
  const canImport = useCan("parents.import")
  const canExport = useCan("parents.export")

  return (
    <>
      {canImport && (
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/parents/import" />}>
          <FileUpIcon data-icon="inline-start" />
          Import
        </Button>
      )}
      {canExport && (
        <Button variant="outline" nativeButton={false} render={<a href={exportHref(searchParams)} />}>
          <DownloadIcon data-icon="inline-start" />
          Export
        </Button>
      )}
      {canCreate && (
        <Button nativeButton={false} render={<Link href="/dashboard/parents/new" />}>
          <PlusIcon data-icon="inline-start" />
          Add guardian
        </Button>
      )}
      {canImport && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>More</DropdownMenuLabel>
              <DropdownMenuItem render={<a href={GUARDIAN_IMPORT_TEMPLATE_URL} />}>
                <DownloadIcon />
                Download import template
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
}
