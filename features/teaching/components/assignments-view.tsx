"use client"

import * as React from "react"
import Link from "next/link"
import { ExternalLinkIcon, FilePenLineIcon, InboxIcon, LockIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, SendIcon, Trash2Icon, UnlockIcon } from "lucide-react"
import type { SortingState } from "@tanstack/react-table"

import { createServerColumnHelper, ServerDataTable, type ServerColumns } from "@/components/server-data-table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { labelOptions } from "@/components/shared/filter-controls"
import { StatCard } from "@/components/shared/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { deleteClassAssignmentAction, setClassAssignmentStatusAction } from "@/features/teaching/actions"
import { AssignmentFormDialog, type EditableAssignment } from "@/features/teaching/components/assignment-form-dialog"
import { TeachingToolbar, useTeachingFilters } from "@/features/teaching/components/teaching-toolbar"
import { CLASS_ASSIGNMENT_STATUS_LABELS } from "@/features/teaching/constants"
import type { ClassAssignmentFilters } from "@/features/teaching/filters"
import { formatDateTime, relativeTime, teacherName } from "@/features/teaching/format"
import { useActionRunner } from "@/hooks/use-dialog-submit"
import type { ClassAssignmentStatus } from "@/lib/generated/prisma/enums"
import type { ClassAssignmentRow } from "@/services/teaching/class-assignment-service"
import type { TeachingOptions } from "@/services/teaching/options-service"

const STATUS_VARIANT: Record<ClassAssignmentStatus, "outline" | "default" | "secondary"> = { DRAFT: "outline", PUBLISHED: "default", CLOSED: "secondary" }

export function AssignmentsView({
  rows,
  total,
  awaitingReview,
  counts,
  yearId,
  filters,
  options,
  canCreate,
  canEdit,
  canDelete,
  openNew,
}: {
  rows: ClassAssignmentRow[]
  total: number
  awaitingReview: number
  counts: Record<ClassAssignmentStatus, number>
  yearId: string | null
  filters: ClassAssignmentFilters
  options: TeachingOptions
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  openNew: boolean
}) {
  const { setParams, pending } = useTeachingFilters()
  const [editing, setEditing] = React.useState<EditableAssignment | "new" | null>(null)
  const [removing, setRemoving] = React.useState<ClassAssignmentRow | null>(null)
  const runner = useActionRunner()
  const [now] = React.useState(() => new Date())

  const opened = React.useRef(false)
  React.useEffect(() => {
    if (openNew && canCreate && !opened.current) {
      opened.current = true
      setEditing("new")
    }
  }, [openNew, canCreate])

  const columns = React.useMemo<ServerColumns<ClassAssignmentRow>>(() => {
    const h = createServerColumnHelper<ClassAssignmentRow>()
    const mine = (r: ClassAssignmentRow) => r.teacherId === options.teacherId
    return [
      h.accessor("title", {
        header: "Assignment",
        cell: ({ row }) => (
          <Link href={`/dashboard/assignments/${row.original.id}`} className="block min-w-52 hover:underline">
            <span className="font-medium">{row.original.title}</span>
            <span className="block text-xs text-muted-foreground">
              {row.original.subject.name} · {[row.original.class.name, row.original.section && `Section ${row.original.section.name}`].filter(Boolean).join(" ")}
            </span>
          </Link>
        ),
      }),
      ...(options.oversees ? [h.display({ id: "teacher", header: "Teacher", cell: ({ row }) => teacherName(row.original.teacher) })] : []),
      h.accessor("dueAt", {
        header: "Due",
        meta: { cellClassName: "whitespace-nowrap" },
        cell: ({ row }) => {
          const past = new Date(row.original.dueAt) < now
          return (
            <span className="text-sm">
              {formatDateTime(row.original.dueAt)}
              <span className={past && row.original.status === "PUBLISHED" ? "block text-xs text-destructive" : "block text-xs text-muted-foreground"}>{relativeTime(row.original.dueAt, now)}</span>
            </span>
          )
        },
      }),
      h.display({
        id: "submissions",
        header: "Submitted",
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap tabular-nums">
            {row.original.submitted}/{row.original.students}
            {row.original.awaitingReview > 0 && <Badge className="ml-2">{row.original.awaitingReview} to review</Badge>}
          </span>
        ),
      }),
      h.accessor("status", { header: "Status", cell: ({ row }) => <Badge variant={STATUS_VARIANT[row.original.status]}>{CLASS_ASSIGNMENT_STATUS_LABELS[row.original.status]}</Badge> }),
      h.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => {
          const r = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.title}`} />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem render={<Link href={`/dashboard/assignments/${r.id}`} />}><ExternalLinkIcon />Open & review</DropdownMenuItem>
                {mine(r) && canEdit && (
                  <>
                    {r.status !== "CLOSED" && <DropdownMenuItem onClick={() => setEditing(r)}><PencilIcon />Edit</DropdownMenuItem>}
                    {r.status === "DRAFT" && <DropdownMenuItem onClick={() => runner.run(() => setClassAssignmentStatusAction(r.id, "PUBLISHED"))}><SendIcon />Publish</DropdownMenuItem>}
                    {r.status === "PUBLISHED" && <DropdownMenuItem onClick={() => runner.run(() => setClassAssignmentStatusAction(r.id, "CLOSED"))}><LockIcon />Close submissions</DropdownMenuItem>}
                    {r.status === "CLOSED" && <DropdownMenuItem onClick={() => runner.run(() => setClassAssignmentStatusAction(r.id, "PUBLISHED"))}><UnlockIcon />Reopen</DropdownMenuItem>}
                  </>
                )}
                {mine(r) && canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setRemoving(r)}><Trash2Icon />Delete</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
    ]
  }, [options.oversees, options.teacherId, canEdit, canDelete, runner, now])

  const sorting: SortingState = [{ id: filters.sort, desc: filters.dir === "desc" }]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Awaiting review" value={awaitingReview} hint="Submitted work" icon={InboxIcon} active={filters.review === "pending"} onClick={() => setParams({ review: filters.review === "pending" ? null : "pending" })} />
        {(["PUBLISHED", "DRAFT", "CLOSED"] as const).map((s) => (
          <StatCard key={s} label={CLASS_ASSIGNMENT_STATUS_LABELS[s]} value={counts[s]} icon={s === "DRAFT" ? PencilIcon : s === "CLOSED" ? LockIcon : SendIcon} active={filters.status === s} onClick={() => setParams({ status: filters.status === s ? null : s })} />
        ))}
      </div>
      <ServerDataTable
        data={rows}
        columns={columns}
        rowCount={total}
        getRowId={(r) => r.id}
        pagination={{ pageIndex: filters.page - 1, pageSize: filters.pageSize }}
        onPaginationChange={(p) => setParams({ page: p.pageIndex > 0 ? String(p.pageIndex + 1) : null, pageSize: String(p.pageSize) }, { resetPage: false })}
        sorting={sorting}
        onSortingChange={(next) => next[0] && ["dueAt", "title", "status"].includes(next[0].id) && setParams({ sort: next[0].id, dir: next[0].desc ? "desc" : "asc" })}
        loading={pending || runner.pending}
        toolbar={
          <TeachingToolbar
            options={options}
            filters={filters}
            searchPlaceholder="Search assignments"
            extra={[{ key: "status", label: "Status", value: filters.status, options: labelOptions(CLASS_ASSIGNMENT_STATUS_LABELS) }]}
            dates={{ from: "Due from", to: "Due by" }}
            actions={
              canCreate && (
                <Button size="sm" onClick={() => setEditing("new")}>
                  <PlusIcon data-icon="inline-start" />
                  New assignment
                </Button>
              )
            }
          />
        }
        empty={<EmptyState icon={FilePenLineIcon} title="No assignments" description={canCreate ? "Set homework or coursework for a class you teach." : "No assignments match these filters."} className="border-0 bg-transparent py-6" />}
      />

      <AssignmentFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        assignment={editing === "new" ? null : editing}
        options={options}
        defaults={{ academicYearId: yearId ?? options.currentYearId ?? "", classId: filters.class, sectionId: filters.section, subjectId: filters.subject }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete “${removing?.title ?? ""}”?`}
        description="Only assignments without submitted work can be deleted. Close it instead to stop submissions."
        confirmLabel="Delete"
        destructive
        onConfirm={() => (removing ? runner.run(() => deleteClassAssignmentAction(removing.id)) : false)}
      />
    </div>
  )
}
