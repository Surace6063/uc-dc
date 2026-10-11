"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useForm, type DefaultValues, type FieldValues, type UseFormReturn } from "react-hook-form"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { applyServerErrors } from "@/components/shared/form-fields"
import { FormAlert } from "@/components/shared/form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import {
  deleteStructureRecord,
  saveStructureRecord,
  type StructureEntity,
} from "@/features/academics/actions"
import { cn } from "@/lib/utils"

// Shared building blocks for the education structure tabs.

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="secondary">Active</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Inactive
    </Badge>
  )
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  )
}

export function AddButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button size="sm" {...props}>
      <PlusIcon data-icon="inline-start" />
      {children}
    </Button>
  )
}

export type ListColumn<T> = {
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
}

// A compact list of structure records with edit/delete actions.
export function RecordTable<T extends { id: string }>({
  rows,
  columns,
  canManage,
  onEdit,
  onDelete,
  extraActions,
  emptyTitle,
  emptyDescription,
}: {
  rows: T[]
  columns: ListColumn<T>[]
  canManage: boolean
  onEdit: (row: T) => void
  onDelete: (row: T) => void
  extraActions?: (row: T) => React.ReactNode
  emptyTitle: string
  emptyDescription: string
}) {
  if (rows.length === 0) {
    return (
      <Empty className="rounded-xl border border-dashed py-10">
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {columns.map((c) => (
              <TableHead key={c.header} className={cn("first:pl-4", c.className)}>
                {c.header}
              </TableHead>
            ))}
            {canManage && <TableHead className="w-12 pr-4"><span className="sr-only">Actions</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {columns.map((c) => (
                <TableCell key={c.header} className={cn("first:pl-4", c.className)}>
                  {c.cell(row)}
                </TableCell>
              ))}
              {canManage && (
                <TableCell className="pr-4 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}>
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(row)}>
                        <PencilIcon />
                        Edit
                      </DropdownMenuItem>
                      {extraActions?.(row)}
                      <DropdownMenuItem variant="destructive" onClick={() => onDelete(row)}>
                        <Trash2Icon />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// Form state + submission for one structure record (create or edit).
export function useStructureForm<Schema extends z.ZodType<FieldValues, FieldValues>>(
  entity: StructureEntity,
  schema: Schema,
  onSaved: () => void
) {
  const router = useRouter()
  const [recordId, setRecordId] = React.useState<string | null>(null)
  const [formError, setFormError] = React.useState<string | null>(null)
  const form = useForm<z.input<Schema>, unknown, z.output<Schema>>({
    resolver: zodResolver(schema as never),
  })

  const open = (id: string | null, values: z.input<Schema>) => {
    setRecordId(id)
    setFormError(null)
    form.reset(values as DefaultValues<z.input<Schema>>)
  }

  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    const result = await saveStructureRecord(entity, recordId, values)
    if (!result.ok) {
      setFormError(applyServerErrors(form as unknown as UseFormReturn<FieldValues>, result))
      return
    }
    toast.add({ title: recordId ? "Changes saved" : "Added", type: "success" })
    onSaved()
    router.refresh()
  })

  return { form, recordId, open, submit, formError }
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  error,
  onSubmit,
  children,
  submitLabel = "Save",
  wide,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  pending: boolean
  error?: string | null
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  children: React.ReactNode
  submitLabel?: string
  wide?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {error && <FormAlert tone="error">{error}</FormAlert>}
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Delete confirmation for a structure record; server errors (e.g. "in use")
// are shown as a toast and the dialog stays open.
export function useDeleteRecord(entity: StructureEntity) {
  const router = useRouter()
  const [target, setTarget] = React.useState<{ id: string; name: string } | null>(null)

  const dialog = (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => !open && setTarget(null)}
      title={`Delete ${target?.name ?? ""}?`}
      description="This can't be undone. Records that are in use can't be deleted; deactivate them instead."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        if (!target) return
        const result = await deleteStructureRecord(entity, target.id)
        if (!result.ok) {
          toast.add({ title: "Couldn't delete", description: result.error, type: "error" })
          return false
        }
        toast.add({ title: "Deleted", type: "success" })
        router.refresh()
      }}
    />
  )
  return { confirmDelete: setTarget, dialog }
}
