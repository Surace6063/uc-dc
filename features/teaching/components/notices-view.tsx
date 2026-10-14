"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form"
import { MegaphoneIcon, MoreHorizontalIcon, PencilIcon, PinIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { FilterSelect, labelOptions, SearchBox } from "@/components/shared/filter-controls"
import { SelectField, SwitchField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { DataTablePagination } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { localDate } from "@/features/attendance/constants"
import { deleteNoticeAction, saveNoticeAction } from "@/features/teaching/actions"
import { PlaceFields } from "@/features/teaching/components/place-fields"
import { NOTICE_AUDIENCE_LABELS } from "@/features/teaching/constants"
import type { NoticeFilters } from "@/features/teaching/filters"
import { formatDateTime } from "@/features/teaching/format"
import { noticeSchema } from "@/features/teaching/schemas"
import { useActionRunner, useDialogSubmit } from "@/hooks/use-dialog-submit"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { NoticeRow } from "@/services/teaching/notice-service"
import type { TeachingOptions } from "@/services/teaching/options-service"

type FormInput = z.input<typeof noticeSchema>
type FormOutput = z.output<typeof noticeSchema>
type ClassChoice = { id: string; name: string; sections: { id: string; name: string }[] }

const audienceLabel = (n: NoticeRow) =>
  n.audience === "CLASS" ? [n.class?.name, n.section && `Section ${n.section.name}`].filter(Boolean).join(" · ") : NOTICE_AUDIENCE_LABELS[n.audience]

export function NoticesView({
  rows,
  total,
  filters,
  options,
  years,
  allClasses,
  canManage,
  canPost,
  openNew,
}: {
  rows: NoticeRow[]
  total: number
  filters: NoticeFilters
  options: TeachingOptions
  years: { id: string; name: string; isCurrent: boolean }[]
  allClasses: ClassChoice[] | null
  canManage: boolean
  canPost: boolean
  openNew: boolean
}) {
  const { setParams, pending } = useUrlFilters({})
  const [editing, setEditing] = React.useState<NoticeRow | "new" | null>(null)
  const [removing, setRemoving] = React.useState<NoticeRow | null>(null)
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(noticeSchema) })
  const { error, setError, run } = useDialogSubmit(form, () => setEditing(null))
  const runner = useActionRunner()
  const currentYear = years.find((y) => y.isCurrent)?.id ?? options.currentYearId ?? ""

  const open = React.useCallback(
    (notice: NoticeRow | null) => {
      setError(null)
      form.reset(
        notice
          ? {
              title: notice.title, body: notice.body, audience: notice.audience, academicYearId: currentYear, classId: notice.classId ?? "", sectionId: notice.sectionId ?? "",
              pinned: notice.pinned, expiresOn: notice.expiresAt ? localDate(new Date(notice.expiresAt)) : "",
            }
          : { title: "", body: "", audience: canManage ? "EVERYONE" : "CLASS", academicYearId: currentYear, classId: "", sectionId: "", pinned: false, expiresOn: "" }
      )
      setEditing(notice ?? "new")
    },
    [form, setError, canManage, currentYear]
  )

  const opened = React.useRef(false)
  React.useEffect(() => {
    if (openNew && canPost && !opened.current) {
      opened.current = true
      open(null)
    }
  }, [openNew, canPost, open])

  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize))

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SearchBox value={filters.q ?? ""} onSearch={(q) => setParams({ q })} placeholder="Search notices" label="Search notices" />
          {canPost && (
            <Button size="sm" onClick={() => open(null)}>
              <PlusIcon data-icon="inline-start" />
              Post a notice
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FilterSelect label="Audience" value={filters.audience} onChange={(v) => setParams({ audience: v })} options={labelOptions(NOTICE_AUDIENCE_LABELS)} />
          <FilterSelect label="Show" value={filters.view === "mine" ? "mine" : undefined} allLabel="All notices" onChange={(v) => setParams({ view: v })} options={[{ value: "mine", label: "Posted by me" }]} />
          <FilterSelect label="Expired" value={filters.expired} allLabel="Hide expired" onChange={(v) => setParams({ expired: v })} options={[{ value: "show", label: "Include expired" }]} />
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon={MegaphoneIcon} title="No notices" description={filters.q || filters.audience || filters.view === "mine" ? "No notices match these filters." : "Announcements for you will appear here."} />
      ) : (
        <ul className={pending ? "grid gap-3 opacity-60" : "grid gap-3"} aria-busy={pending}>
          {rows.map((n) => {
            const expired = n.expiresAt && new Date(n.expiresAt) < new Date()
            return (
              <li key={n.id}>
                <Card className="gap-2 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
                        {n.pinned && <PinIcon className="size-4 text-primary" aria-label="Pinned" />}
                        {n.title}
                        {expired && <Badge variant="outline">Expired</Badge>}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {audienceLabel(n)} · {n.author?.name ?? "Office"} · {formatDateTime(n.publishedAt)}
                        {n.expiresAt && !expired && ` · until ${formatDateTime(n.expiresAt)}`}
                      </p>
                    </div>
                    {n.canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${n.title}`} />}>
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => open(n)}><PencilIcon />Edit</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setRemoving(n)}><Trash2Icon />Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      {total > filters.pageSize && (
        <Card className="p-0">
          <DataTablePagination pageIndex={filters.page - 1} pageSize={filters.pageSize} pageCount={pageCount} total={total} onPageChange={(p) => setParams({ page: p > 0 ? String(p + 1) : null }, { resetPage: false })} />
        </Card>
      )}

      <FormProvider {...form}>
        <FormDialog
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          title={editing === "new" ? "Post a notice" : "Edit notice"}
          description={canManage ? undefined : "You can post notices to classes you teach."}
          pending={form.formState.isSubmitting}
          error={error}
          wide
          onSubmit={form.handleSubmit((values) => run(() => saveNoticeAction(editing === "new" || !editing ? null : editing.id, values)))}
          submitLabel={editing === "new" ? "Post" : "Save"}
        >
          <TextField control={form.control} name="title" label="Title" required placeholder="Unit test schedule" />
          <TextAreaField control={form.control} name="body" label="Notice" required rows={6} />
          {canManage && allClasses ? <AudienceFields classes={allClasses} /> : <PlaceFields options={options} subject="none" />}
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="expiresOn" label="Show until" type="date" description="Optional. Hidden after this day." />
            <SwitchField control={form.control} name="pinned" label="Pin to the top" />
          </div>
        </FormDialog>
      </FormProvider>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete “${removing?.title ?? ""}”?`}
        description="The notice disappears for everyone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => (removing ? runner.run(() => deleteNoticeAction(removing.id)) : false)}
      />
    </div>
  )
}

// The office: any audience, or any class (and section).
function AudienceFields({ classes }: { classes: ClassChoice[] }) {
  const { control, setValue } = useFormContext<FormInput>()
  const audience = useWatch({ control, name: "audience" })
  const classId = useWatch({ control, name: "classId" }) ?? ""
  const cls = classes.find((c) => c.id === classId)
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <SelectField control={control} name="audience" label="Audience" options={labelOptions(NOTICE_AUDIENCE_LABELS)} onValueChange={() => { setValue("classId", ""); setValue("sectionId", "") }} />
      {audience === "CLASS" && (
        <>
          <SelectField control={control} name="classId" label="Class" required placeholder="Choose" options={classes.map((c) => ({ value: c.id, label: c.name }))} onValueChange={() => setValue("sectionId", "")} />
          <SelectField control={control} name="sectionId" label="Section" placeholder="Whole class" options={(cls?.sections ?? []).map((s) => ({ value: s.id, label: `Section ${s.name}` }))} disabled={!cls} />
        </>
      )}
    </div>
  )
}
