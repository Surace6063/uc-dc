"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm } from "react-hook-form"
import { CheckCircle2Icon, FileTextIcon, MoreHorizontalIcon, NotebookPenIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { SortingState } from "@tanstack/react-table"
import type { z } from "zod"

import { createServerColumnHelper, ServerDataTable, type ServerColumns } from "@/components/server-data-table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { SelectField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { labelOptions } from "@/components/shared/filter-controls"
import { StatCard } from "@/components/shared/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { ViewDialog } from "@/features/teaching/components/view-dialog"
import { deleteLessonPlanAction, saveLessonPlanAction } from "@/features/teaching/actions"
import { PlaceFields } from "@/features/teaching/components/place-fields"
import { TeachingToolbar, useTeachingFilters } from "@/features/teaching/components/teaching-toolbar"
import { LESSON_PLAN_STATUS_LABELS } from "@/features/teaching/constants"
import type { LessonPlanFilters } from "@/features/teaching/filters"
import { formatDate, teacherName } from "@/features/teaching/format"
import { lessonPlanSchema } from "@/features/teaching/schemas"
import { useActionRunner, useDialogSubmit } from "@/hooks/use-dialog-submit"
import type { LessonPlanStatus } from "@/lib/generated/prisma/enums"
import { fromDate } from "@/lib/validation"
import type { LessonPlanRow } from "@/services/teaching/lesson-plan-service"
import type { TeachingOptions } from "@/services/teaching/options-service"

type FormInput = z.input<typeof lessonPlanSchema>
type FormOutput = z.output<typeof lessonPlanSchema>

const STATUS_VARIANT: Record<LessonPlanStatus, "outline" | "secondary" | "default"> = { DRAFT: "outline", PLANNED: "secondary", DELIVERED: "default" }

export function LessonPlansView({
  rows,
  total,
  counts,
  yearId,
  filters,
  options,
  canCreate,
  canEdit,
  openNew,
}: {
  rows: LessonPlanRow[]
  total: number
  counts: Record<LessonPlanStatus, number>
  yearId: string | null
  filters: LessonPlanFilters
  options: TeachingOptions
  canCreate: boolean
  canEdit: boolean
  openNew: boolean
}) {
  const { setParams, pending } = useTeachingFilters()
  const [editing, setEditing] = React.useState<LessonPlanRow | "new" | null>(null)
  const [viewing, setViewing] = React.useState<LessonPlanRow | null>(null)
  const [removing, setRemoving] = React.useState<LessonPlanRow | null>(null)
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(lessonPlanSchema) })
  const { error, setError, run } = useDialogSubmit(form, () => setEditing(null))
  const runner = useActionRunner()
  const mine = (r: LessonPlanRow) => canEdit && r.teacherId === options.teacherId

  const open = React.useCallback(
    (plan: LessonPlanRow | null) => {
      setError(null)
      form.reset(
        plan
          ? {
              academicYearId: plan.academicYearId, classId: plan.classId, sectionId: plan.sectionId ?? "", subjectId: plan.subjectId,
              title: plan.title, topic: plan.topic ?? "", plannedDate: fromDate(plan.plannedDate), periods: plan.periods,
              objectives: plan.objectives ?? "", activities: plan.activities ?? "", resources: plan.resources ?? "", assessment: plan.assessment ?? "",
              status: plan.status, reflection: plan.reflection ?? "",
            }
          : {
              academicYearId: yearId ?? options.currentYearId ?? "", classId: filters.class ?? "", sectionId: filters.section ?? "", subjectId: filters.subject ?? "",
              title: "", topic: "", plannedDate: new Date().toISOString().slice(0, 10), periods: 1,
              objectives: "", activities: "", resources: "", assessment: "", status: "PLANNED", reflection: "",
            }
      )
      setEditing(plan ?? "new")
    },
    [form, setError, yearId, options.currentYearId, filters.class, filters.section, filters.subject]
  )

  // "?new=1" (quick actions) opens the form once.
  const opened = React.useRef(false)
  React.useEffect(() => {
    if (openNew && canCreate && !opened.current) {
      opened.current = true
      open(null)
    }
  }, [openNew, canCreate, open])

  const columns = React.useMemo<ServerColumns<LessonPlanRow>>(() => {
    const h = createServerColumnHelper<LessonPlanRow>()
    return [
      h.accessor("plannedDate", { header: "Date", meta: { cellClassName: "whitespace-nowrap" }, cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.plannedDate)}<span className="block text-xs text-muted-foreground">{row.original.periods} period{row.original.periods === 1 ? "" : "s"}</span></span> }),
      h.accessor("title", {
        header: "Lesson",
        cell: ({ row }) => (
          <button type="button" className="block min-w-48 text-left hover:underline" onClick={() => setViewing(row.original)}>
            <span className="font-medium">{row.original.title}</span>
            {row.original.topic && <span className="block text-xs text-muted-foreground">{row.original.topic}</span>}
          </button>
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
      h.accessor("status", { header: "Status", cell: ({ row }) => <Badge variant={STATUS_VARIANT[row.original.status]}>{LESSON_PLAN_STATUS_LABELS[row.original.status]}</Badge> }),
      h.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.title}`} />}>
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setViewing(row.original)}><FileTextIcon />View</DropdownMenuItem>
              {mine(row.original) && (
                <>
                  <DropdownMenuItem onClick={() => open(row.original)}><PencilIcon />Edit</DropdownMenuItem>
                  {row.original.status !== "DELIVERED" && (
                    <DropdownMenuItem onClick={() => { open(row.original); form.setValue("status", "DELIVERED") }}><CheckCircle2Icon />Mark delivered</DropdownMenuItem>
                  )}
                  <DropdownMenuItem variant="destructive" onClick={() => setRemoving(row.original)}><Trash2Icon />Delete</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }),
    ]
    // `mine` reads only canEdit and options.teacherId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.oversees, options.teacherId, canEdit, open, form])

  const sorting: SortingState = [{ id: filters.sort, desc: filters.dir === "desc" }]
  const status = filters.status

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(["PLANNED", "DELIVERED", "DRAFT"] as const).map((s) => (
          <StatCard key={s} label={LESSON_PLAN_STATUS_LABELS[s]} value={counts[s]} icon={s === "DELIVERED" ? CheckCircle2Icon : s === "PLANNED" ? NotebookPenIcon : FileTextIcon} active={status === s} onClick={() => setParams({ status: status === s ? null : s })} />
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
        onSortingChange={(next) => next[0] && ["plannedDate", "title", "status"].includes(next[0].id) && setParams({ sort: next[0].id, dir: next[0].desc ? "desc" : "asc" })}
        loading={pending}
        toolbar={
          <TeachingToolbar
            options={options}
            filters={filters}
            searchPlaceholder="Search title or topic"
            extra={[{ key: "status", label: "Status", value: filters.status, options: labelOptions(LESSON_PLAN_STATUS_LABELS) }]}
            dates={{ from: "From", to: "To" }}
            actions={
              canCreate && (
                <Button size="sm" onClick={() => open(null)}>
                  <PlusIcon data-icon="inline-start" />
                  New lesson plan
                </Button>
              )
            }
          />
        }
        empty={
          <EmptyState icon={NotebookPenIcon} title="No lesson plans" description={canCreate ? "Plan your next lesson: objectives, activities, resources and how you'll check learning." : "No lesson plans match these filters."} className="border-0 bg-transparent py-6" />
        }
      />

      <FormProvider {...form}>
        <FormDialog
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          title={editing === "new" ? "New lesson plan" : "Edit lesson plan"}
          pending={form.formState.isSubmitting}
          error={error}
          wide
          onSubmit={form.handleSubmit((values) => run(() => saveLessonPlanAction(editing === "new" || !editing ? null : editing.id, values)))}
        >
          <PlaceFields options={options} />
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem_7rem]">
            <TextField control={form.control} name="title" label="Lesson title" required placeholder="Quadratic equations: factorisation" />
            <TextField control={form.control} name="plannedDate" label="Date" type="date" required />
            <TextField control={form.control} name="periods" label="Periods" type="number" min={1} max={20} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="topic" label="Unit / topic" placeholder="Unit 3 · Algebra" />
            <SelectField control={form.control} name="status" label="Status" options={labelOptions(LESSON_PLAN_STATUS_LABELS)} />
          </div>
          <TextAreaField control={form.control} name="objectives" label="Learning objectives" rows={3} placeholder="By the end of the lesson students will be able to…" />
          <TextAreaField control={form.control} name="activities" label="Activities" rows={4} placeholder="Introduction, explanation, group work, practice…" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextAreaField control={form.control} name="resources" label="Resources" rows={2} placeholder="Textbook p. 45, worksheet, projector" />
            <TextAreaField control={form.control} name="assessment" label="Assessment" rows={2} placeholder="Exit questions, class work…" />
          </div>
          <TextAreaField control={form.control} name="reflection" label="Reflection (after teaching)" rows={2} description="What was covered, and what to change next time." />
        </FormDialog>
      </FormProvider>

      <ViewDialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)} title={viewing?.title ?? ""} description={viewing ? `${formatDate(viewing.plannedDate)} · ${[viewing.subject.name, viewing.class.name, viewing.section && `Section ${viewing.section.name}`].filter(Boolean).join(" · ")}` : undefined}>
        {viewing && (
          <dl className="grid gap-4 text-sm">
            {([
              ["Status", LESSON_PLAN_STATUS_LABELS[viewing.status] + (viewing.deliveredOn ? ` · ${formatDate(viewing.deliveredOn)}` : "")],
              ["Unit / topic", viewing.topic],
              ["Objectives", viewing.objectives],
              ["Activities", viewing.activities],
              ["Resources", viewing.resources],
              ["Assessment", viewing.assessment],
              ["Reflection", viewing.reflection],
              ...(options.oversees ? [["Teacher", teacherName(viewing.teacher)]] : []),
            ] as [string, string | null][]).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-wrap">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </ViewDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete “${removing?.title ?? ""}”?`}
        description="The lesson plan is removed permanently."
        confirmLabel="Delete"
        destructive
        onConfirm={() => (removing ? runner.run(() => deleteLessonPlanAction(removing.id)) : false)}
      />
    </div>
  )
}
