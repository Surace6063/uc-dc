"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form"
import type { z } from "zod"

import { labelOptions } from "@/components/shared/filter-controls"
import { applyServerErrors, SelectField, SwitchField, TextField } from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { addExamSubjectsAction, saveExamSubjectAction } from "@/features/exams/actions"
import { COMPONENT_TYPE_LABELS } from "@/features/exams/constants"
import { addSubjectsSchema, examinationSubjectSchema } from "@/features/exams/schemas"
import type { ExaminationDetail } from "@/services/exams/examination-service"

type SubjectValues = z.input<typeof examinationSubjectSchema>
type AddValues = z.input<typeof addSubjectsSchema>
type ComponentRow = { name: string; componentType: string; maximumMarks: string | number; passMarks?: string | number | null; weightage?: string | number | null }

// Theory/practical/... rows, shared by both dialogs.
function ComponentRows({ control, name, disabled }: { control: Control<SubjectValues> | Control<AddValues>; name: "components"; disabled?: boolean }) {
  const c = control as unknown as Control<{ components: ComponentRow[] }>
  const { fields, append, remove } = useFieldArray({ control: c, name })
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Components</p>
        {!disabled && (
          <Button type="button" variant="outline" size="xs" onClick={() => append({ name: "", componentType: "PRACTICAL", maximumMarks: "", passMarks: "", weightage: "" })} disabled={fields.length >= 10}>
            <PlusIcon data-icon="inline-start" />
            Add component
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Full marks of the components add up to the subject&apos;s full marks. Or give every component a weightage (adding up to 100%) to combine them as percentages.
        Component pass marks only count when the result policy requires component passes.
      </p>
      {fields.map((field, i) => (
        <div key={field.id} className="grid grid-cols-2 items-end gap-2 rounded-lg border p-2 sm:grid-cols-[1.4fr_1.2fr_0.8fr_0.8fr_0.8fr_auto]">
          <TextField control={c} name={`components.${i}.name`} label="Name" placeholder="Theory" disabled={disabled} />
          <SelectField control={c} name={`components.${i}.componentType`} label="Type" options={labelOptions(COMPONENT_TYPE_LABELS)} disabled={disabled} />
          <TextField control={c} name={`components.${i}.maximumMarks`} label="Full marks" inputMode="decimal" disabled={disabled} />
          <TextField control={c} name={`components.${i}.passMarks`} label="Pass" inputMode="decimal" disabled={disabled} />
          <TextField control={c} name={`components.${i}.weightage`} label="Weight %" inputMode="decimal" disabled={disabled} />
          {!disabled && (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove component" onClick={() => remove(i)} disabled={fields.length <= 1}>
              <Trash2Icon />
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}

const emptyComponent = { name: "Theory", componentType: "THEORY" as const, maximumMarks: "100", passMarks: "", weightage: "" }

export function SubjectDialog({ subject, examDraft, examDates, onClose }: { subject: ExaminationDetail["subjects"][number]; examDraft: boolean; examDates: { start: string; end: string }; onClose: () => void }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<SubjectValues, unknown, z.output<typeof examinationSubjectSchema>>({
    resolver: zodResolver(examinationSubjectSchema),
    defaultValues: {
      maximumMarks: subject.maximumMarks,
      passMarks: subject.passMarks ?? "",
      creditHours: subject.creditHours ?? "",
      isCompulsory: subject.isCompulsory,
      examDate: subject.examDate ?? "",
      startTime: subject.startTime ?? "",
      endTime: subject.endTime ?? "",
      venue: subject.venue ?? "",
      sequence: subject.sequence,
      components: subject.components.map((c) => ({ name: c.name, componentType: c.componentType, maximumMarks: c.maximumMarks, passMarks: c.passMarks ?? "", weightage: c.weightage ?? "" })),
    },
  })
  const components = useWatch({ control: form.control, name: "components" })
  const total = (components ?? []).reduce((sum, c) => sum + (Number(c.maximumMarks) || 0), 0)

  const submit = form.handleSubmit(async (values) => {
    const result = await saveExamSubjectAction(subject.id, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: result.data.scheduleOnly ? "Timetable updated" : "Subject saved", type: "success" })
    onClose()
    router.refresh()
  })

  return (
    <FormDialog open onOpenChange={(open) => !open && onClose()} title={`${subject.name} · ${subject.className}`} pending={form.formState.isSubmitting} error={error} onSubmit={submit} wide>
      {!examDraft && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">The examination is scheduled, so only the timetable (date, time and venue) can change.</p>}
      <div className="grid gap-4 sm:grid-cols-4">
        <TextField control={form.control} name="maximumMarks" label="Full marks" inputMode="decimal" required disabled={!examDraft} description={components?.every((c) => c.weightage === "" || c.weightage === null) ? `Components: ${total}` : "Scale for weighted parts"} />
        <TextField control={form.control} name="passMarks" label="Pass marks" inputMode="decimal" disabled={!examDraft} />
        <TextField control={form.control} name="creditHours" label="Credit hours" inputMode="decimal" disabled={!examDraft} description="For credit-weighted GPA" />
        <TextField control={form.control} name="sequence" label="Order" type="number" min={0} />
      </div>
      {examDraft && <SwitchField control={form.control} name="isCompulsory" label="Compulsory" description="Optional subjects apply only to students who have marks in them and never fail the overall result." />}
      <div className="grid gap-4 sm:grid-cols-4">
        <TextField control={form.control} name="examDate" label="Paper date" type="date" min={examDates.start} max={examDates.end} />
        <TextField control={form.control} name="startTime" label="Starts" type="time" />
        <TextField control={form.control} name="endTime" label="Ends" type="time" />
        <TextField control={form.control} name="venue" label="Venue" placeholder="Hall A" />
      </div>
      <ComponentRows control={form.control} name="components" disabled={!examDraft} />
    </FormDialog>
  )
}

export function AddSubjectsDialog({
  examinationId,
  offerings,
  onClose,
}: {
  examinationId: string
  offerings: { id: string; classId: string; className: string; name: string; code: string; requirement: string }[]
  onClose: () => void
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<AddValues, unknown, z.output<typeof addSubjectsSchema>>({
    resolver: zodResolver(addSubjectsSchema),
    defaultValues: { examinationId, offeringIds: [], passMarks: "", components: [emptyComponent] },
  })
  const selected = useWatch({ control: form.control, name: "offeringIds" }) ?? []
  const byClass = new Map<string, typeof offerings>()
  for (const o of offerings) byClass.set(o.className, [...(byClass.get(o.className) ?? []), o])
  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(selected)
    for (const id of ids) {
      if (on) next.add(id)
      else next.delete(id)
    }
    form.setValue("offeringIds", [...next], { shouldValidate: form.formState.isSubmitted })
  }

  const submit = form.handleSubmit(async (values) => {
    const result = await addExamSubjectsAction(values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: `${result.data.added} subject${result.data.added === 1 ? "" : "s"} added`, description: "Adjust full and pass marks per subject if they differ.", type: "success" })
    onClose()
    router.refresh()
  })

  return (
    <FormDialog open onOpenChange={(open) => !open && onClose()} title="Add subjects" description="Subjects offered to classes in this examination's academic year." pending={form.formState.isSubmitting} error={error ?? form.formState.errors.offeringIds?.message ?? null} onSubmit={submit} submitLabel={`Add ${selected.length || ""} subject${selected.length === 1 ? "" : "s"}`} wide>
      {offerings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every subject offered this year is already in the examination, or no class has subject offerings yet (set them under Subjects &amp; Courses).</p>
      ) : (
        <div className="grid max-h-64 gap-3 overflow-y-auto rounded-lg border p-3">
          {[...byClass.entries()].map(([className, list]) => {
            const all = list.every((o) => selected.includes(o.id))
            return (
              <fieldset key={className} className="grid gap-1.5">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={all} indeterminate={!all && list.some((o) => selected.includes(o.id))} onCheckedChange={(on) => toggle(list.map((o) => o.id), on)} />
                  {className}
                </label>
                <div className="grid gap-1 pl-6 sm:grid-cols-2">
                  {list.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={selected.includes(o.id)} onCheckedChange={(on) => toggle([o.id], on)} />
                      {o.name}
                      <span className="text-xs text-muted-foreground">{o.code}{o.requirement !== "COMPULSORY" ? " · optional" : ""}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )
          })}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={form.control} name="passMarks" label="Pass marks (each subject)" inputMode="decimal" />
      </div>
      <ComponentRows control={form.control} name="components" />
    </FormDialog>
  )
}
