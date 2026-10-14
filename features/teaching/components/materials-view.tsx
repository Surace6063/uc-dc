"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { ExternalLinkIcon, FileIcon, FileStackIcon, LinkIcon, MoreHorizontalIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { SortingState } from "@tanstack/react-table"
import type { z } from "zod"

import { createServerColumnHelper, ServerDataTable, type ServerColumns } from "@/components/server-data-table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { SelectField, SwitchField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { labelOptions } from "@/components/shared/filter-controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { deleteMaterialAction } from "@/features/teaching/actions"
import { PlaceFields } from "@/features/teaching/components/place-fields"
import { TeachingToolbar, useTeachingFilters } from "@/features/teaching/components/teaching-toolbar"
import { formatBytes, MATERIAL_KIND_LABELS, MATERIAL_MAX_BYTES } from "@/features/teaching/constants"
import type { MaterialFilters } from "@/features/teaching/filters"
import { formatDateTime, teacherName } from "@/features/teaching/format"
import { materialSchema } from "@/features/teaching/schemas"
import { useActionRunner, useDialogSubmit } from "@/hooks/use-dialog-submit"
import type { MaterialRow } from "@/services/teaching/material-service"
import type { TeachingOptions } from "@/services/teaching/options-service"

type FormInput = z.input<typeof materialSchema>
type FormOutput = z.output<typeof materialSchema>

export function MaterialsView({
  rows,
  total,
  yearId,
  filters,
  options,
  canCreate,
  canDelete,
  openNew,
}: {
  rows: MaterialRow[]
  total: number
  yearId: string | null
  filters: MaterialFilters
  options: TeachingOptions
  canCreate: boolean
  canDelete: boolean
  openNew: boolean
}) {
  const { setParams, pending } = useTeachingFilters()
  const [adding, setAdding] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const [fileError, setFileError] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState<MaterialRow | null>(null)
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(materialSchema) })
  const kind = useWatch({ control: form.control, name: "kind" })
  const { error, setError, run } = useDialogSubmit(form, () => setAdding(false))
  const runner = useActionRunner()

  const open = React.useCallback(() => {
    setError(null)
    setFile(null)
    setFileError(null)
    form.reset({
      academicYearId: yearId ?? options.currentYearId ?? "", classId: filters.class ?? "", sectionId: filters.section ?? "", subjectId: filters.subject ?? "",
      title: "", description: "", kind: "FILE", url: "", sharedWithStudents: true,
    })
    setAdding(true)
  }, [form, setError, yearId, options.currentYearId, filters.class, filters.section, filters.subject])

  const opened = React.useRef(false)
  React.useEffect(() => {
    if (openNew && canCreate && !opened.current) {
      opened.current = true
      open()
    }
  }, [openNew, canCreate, open])

  const submit = form.handleSubmit(async (values) => {
    if (values.kind === "FILE" && !file) {
      setFileError("Choose a file to upload.")
      return
    }
    const data = new FormData()
    for (const [k, v] of Object.entries(values)) data.set(k, v === null || v === undefined ? "" : String(v))
    if (values.kind === "FILE" && file) data.set("file", file)
    await run(async () => {
      const res = await fetch("/api/materials", { method: "POST", body: data }).catch(() => null)
      if (res?.ok) return { ok: true, message: "Material shared." }
      const body = await res?.json().catch(() => null)
      const fieldErrors = body?.error?.fieldErrors as Record<string, string[] | undefined> | undefined
      if (fieldErrors?.file) setFileError(fieldErrors.file[0] ?? null)
      return { ok: false, error: body?.error?.message ?? "The upload failed. Please try again.", fieldErrors }
    })
  })

  const columns = React.useMemo<ServerColumns<MaterialRow>>(() => {
    const h = createServerColumnHelper<MaterialRow>()
    return [
      h.accessor("title", {
        header: "Material",
        cell: ({ row }) => (
          <a href={`/api/materials/${row.original.id}`} target="_blank" rel="noopener noreferrer" className="flex min-w-56 items-start gap-2.5 hover:underline">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {row.original.kind === "LINK" ? <LinkIcon className="size-4" /> : <FileIcon className="size-4" />}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{row.original.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {row.original.kind === "LINK" ? (row.original.url ?? "") : [row.original.fileName, formatBytes(row.original.sizeBytes)].filter(Boolean).join(" · ")}
              </span>
            </span>
          </a>
        ),
      }),
      h.display({
        id: "place",
        header: "Class & subject",
        cell: ({ row }) => (
          <span className="block text-sm">
            {row.original.subject.name}
            <span className="block text-xs text-muted-foreground">{[row.original.class.name, row.original.section && `Section ${row.original.section.name}`].filter(Boolean).join(" · ")}</span>
          </span>
        ),
      }),
      ...(options.oversees ? [h.display({ id: "teacher", header: "Teacher", cell: ({ row }) => teacherName(row.original.teacher) })] : []),
      h.display({ id: "shared", header: "Students", cell: ({ row }) => (row.original.sharedWithStudents ? <Badge variant="secondary">Shared</Badge> : <Badge variant="outline">Private</Badge>) }),
      h.accessor("createdAt", { header: "Added", meta: { cellClassName: "whitespace-nowrap text-sm" }, cell: ({ row }) => formatDateTime(row.original.createdAt) }),
      h.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.title}`} />}>
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem render={<a href={`/api/materials/${row.original.id}`} target="_blank" rel="noopener noreferrer" />}><ExternalLinkIcon />Open</DropdownMenuItem>
              {canDelete && row.original.teacherId === options.teacherId && (
                <DropdownMenuItem variant="destructive" onClick={() => setRemoving(row.original)}><Trash2Icon />Delete</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }),
    ]
  }, [options.oversees, options.teacherId, canDelete])

  const sorting: SortingState = [{ id: filters.sort, desc: filters.dir === "desc" }]

  return (
    <div className="flex flex-col gap-4">
      <ServerDataTable
        data={rows}
        columns={columns}
        rowCount={total}
        getRowId={(r) => r.id}
        pagination={{ pageIndex: filters.page - 1, pageSize: filters.pageSize }}
        onPaginationChange={(p) => setParams({ page: p.pageIndex > 0 ? String(p.pageIndex + 1) : null, pageSize: String(p.pageSize) }, { resetPage: false })}
        sorting={sorting}
        onSortingChange={(next) => next[0] && ["createdAt", "title"].includes(next[0].id) && setParams({ sort: next[0].id, dir: next[0].desc ? "desc" : "asc" })}
        loading={pending}
        toolbar={
          <TeachingToolbar
            options={options}
            filters={filters}
            searchPlaceholder="Search title, description or file"
            extra={[{ key: "kind", label: "Type", value: filters.kind, options: labelOptions(MATERIAL_KIND_LABELS) }]}
            actions={
              canCreate && (
                <Button size="sm" onClick={open}>
                  <PlusIcon data-icon="inline-start" />
                  Share material
                </Button>
              )
            }
          />
        }
        empty={<EmptyState icon={FileStackIcon} title="No materials" description={canCreate ? "Share notes, worksheets, slides or useful links with a class." : "No materials match these filters."} className="border-0 bg-transparent py-6" />}
      />

      <FormProvider {...form}>
        <FormDialog open={adding} onOpenChange={setAdding} title="Share material" pending={form.formState.isSubmitting} error={error} wide onSubmit={submit} submitLabel="Share">
          <PlaceFields options={options} />
          <TextField control={form.control} name="title" label="Title" required placeholder="Chapter 4 notes" />
          <TextAreaField control={form.control} name="description" label="Description" rows={2} />
          <SelectField control={form.control} name="kind" label="Type" options={[{ value: "FILE", label: "Upload a file" }, { value: "LINK", label: "Add a link" }]} />
          {kind === "LINK" ? (
            <TextField control={form.control} name="url" label="Web address" type="url" required placeholder="https://…" />
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="material-file">File <span className="text-destructive">*</span></Label>
              <Input
                id="material-file"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                aria-invalid={fileError ? true : undefined}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setFile(f)
                  setFileError(f && f.size > MATERIAL_MAX_BYTES ? `The file must be ${MATERIAL_MAX_BYTES / 1024 / 1024} MB or smaller.` : null)
                }}
              />
              <p className="text-xs text-muted-foreground">PDF or image (JPG, PNG, WebP), up to {MATERIAL_MAX_BYTES / 1024 / 1024} MB. For Word or PowerPoint files, share a Drive link.</p>
              {fileError && <p className="text-sm text-destructive">{fileError}</p>}
            </div>
          )}
          <SwitchField control={form.control} name="sharedWithStudents" label="Share with the class's students" description="Students see shared materials in their portal." />
        </FormDialog>
      </FormProvider>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete “${removing?.title ?? ""}”?`}
        description="The material and its file are removed permanently."
        confirmLabel="Delete"
        destructive
        onConfirm={() => (removing ? runner.run(() => deleteMaterialAction(removing.id)) : false)}
      />
    </div>
  )
}
