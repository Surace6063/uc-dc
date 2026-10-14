"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { FormProvider, useForm } from "react-hook-form"
import type { z } from "zod"

import { SelectField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { localDate, localTime } from "@/features/attendance/constants"
import { saveClassAssignmentAction } from "@/features/teaching/actions"
import { PlaceFields } from "@/features/teaching/components/place-fields"
import { classAssignmentSchema } from "@/features/teaching/schemas"
import { useDialogSubmit } from "@/hooks/use-dialog-submit"
import type { TeachingOptions } from "@/services/teaching/options-service"

type FormInput = z.input<typeof classAssignmentSchema>
type FormOutput = z.output<typeof classAssignmentSchema>

export type EditableAssignment = {
  id: string
  academicYearId: string
  classId: string
  sectionId: string | null
  subjectId: string
  title: string
  instructions?: string | null
  dueAt: Date
  maxMarks: number | null
  status: "DRAFT" | "PUBLISHED" | "CLOSED"
}

// Create or edit a class assignment. A new one opens on its own page.
export function AssignmentFormDialog({
  open,
  onOpenChange,
  assignment,
  options,
  defaults,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignment: EditableAssignment | null
  options: TeachingOptions
  defaults: { academicYearId: string; classId?: string; sectionId?: string; subjectId?: string }
}) {
  const router = useRouter()
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(classAssignmentSchema) })
  const { error, setError, run } = useDialogSubmit(form, () => onOpenChange(false))

  React.useEffect(() => {
    if (!open) return
    setError(null)
    const week = new Date(Date.now() + 7 * 86_400_000)
    form.reset(
      assignment
        ? {
            academicYearId: assignment.academicYearId, classId: assignment.classId, sectionId: assignment.sectionId ?? "", subjectId: assignment.subjectId,
            title: assignment.title, instructions: assignment.instructions ?? "", dueDate: localDate(new Date(assignment.dueAt)), dueTime: localTime(new Date(assignment.dueAt)),
            maxMarks: assignment.maxMarks ?? "", status: assignment.status === "CLOSED" ? "PUBLISHED" : assignment.status,
          }
        : {
            academicYearId: defaults.academicYearId, classId: defaults.classId ?? "", sectionId: defaults.sectionId ?? "", subjectId: defaults.subjectId ?? "",
            title: "", instructions: "", dueDate: localDate(week), dueTime: "23:59", maxMarks: "", status: "PUBLISHED",
          }
    )
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <FormProvider {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={assignment ? "Edit assignment" : "New assignment"}
        description={assignment ? undefined : "Published work is visible to the class's students; drafts only to you."}
        pending={form.formState.isSubmitting}
        error={error}
        wide
        onSubmit={form.handleSubmit((values) =>
          run(async () => {
            const result = await saveClassAssignmentAction(assignment?.id ?? null, values)
            if (result.ok && !assignment) router.push(`/dashboard/assignments/${result.data.id}`)
            return result
          })
        )}
      >
        <PlaceFields options={options} />
        <TextField control={form.control} name="title" label="Title" required placeholder="Exercise 5.2, questions 1–10" />
        <TextAreaField control={form.control} name="instructions" label="Instructions" rows={5} placeholder="What to do, how to submit, what you'll look for…" />
        <div className="grid gap-4 sm:grid-cols-4">
          <TextField control={form.control} name="dueDate" label="Due date" type="date" required className="sm:col-span-2" />
          <TextField control={form.control} name="dueTime" label="Time" type="time" required />
          <TextField control={form.control} name="maxMarks" label="Full marks" type="number" min={0} step="0.5" description="Optional" />
        </div>
        <SelectField control={form.control} name="status" label="Status" options={[{ value: "PUBLISHED", label: "Published: set for the class" }, { value: "DRAFT", label: "Draft: only you can see it" }]} />
      </FormDialog>
    </FormProvider>
  )
}
