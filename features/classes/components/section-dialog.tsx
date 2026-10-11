"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import {
  applyServerErrors,
  SelectField,
  SwitchField,
  TextAreaField,
  TextField,
} from "@/components/shared/form-fields"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { sectionSchema } from "@/features/academics/schemas"
import { saveSectionAction, setSectionArchivedAction } from "@/features/classes/actions"
import { mediumOptions, shiftOptions } from "@/features/classes/constants"
import type { ClassDetailData } from "@/services/classes/class-service"

type Section = ClassDetailData["academicClass"]["sections"][number]

// Create or edit one section of a class.
export function SectionDialog({
  classId,
  section,
  nextSortOrder,
  onClose,
}: {
  classId: string
  section: Section | null
  nextSortOrder: number
  onClose: () => void
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof sectionSchema>, unknown, z.output<typeof sectionSchema>>({
    resolver: zodResolver(sectionSchema),
    defaultValues: {
      classId,
      name: section?.name ?? "",
      code: section?.code ?? "",
      description: section?.description ?? "",
      capacity: section?.capacity ?? "",
      shift: section?.shift ?? "",
      medium: section?.medium ?? "",
      room: section?.room ?? "",
      isActive: section?.isActive ?? true,
      sortOrder: section?.sortOrder ?? nextSortOrder,
    },
  })

  const submit = form.handleSubmit(async (values) => {
    const result = await saveSectionAction(section?.id ?? null, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: section ? "Section updated" : "Section added", type: "success" })
    onClose()
    router.refresh()
  })

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={section ? `Edit section ${section.name}` : "Add section"}
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={form.control} name="name" label="Name" required placeholder="A, क, Rose…" />
        <TextField control={form.control} name="code" label="Code" placeholder="8A" />
        <TextField control={form.control} name="capacity" label="Capacity" type="number" min={1} placeholder="40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField control={form.control} name="shift" label="Shift" placeholder="—" options={shiftOptions} />
        <SelectField control={form.control} name="medium" label="Medium" placeholder="—" options={mediumOptions} />
        <TextField control={form.control} name="room" label="Room" placeholder="101" />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <TextAreaField control={form.control} name="description" label="Description" rows={2} />
        <TextField control={form.control} name="sortOrder" label="Order" type="number" min={0} />
      </div>
      {!section?.archivedAt && <SwitchField control={form.control} name="isActive" label="Active" description="Inactive sections take no new students." />}
    </FormDialog>
  )
}

// Archive/restore confirmation for a section.
export function useSectionArchive() {
  const router = useRouter()
  const [target, setTarget] = React.useState<Section | null>(null)
  const archiving = target ? !target.archivedAt : true
  const dialog = (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => !open && setTarget(null)}
      title={`${archiving ? "Archive" : "Restore"} section ${target?.name ?? ""}?`}
      description={
        archiving
          ? "It's hidden from day-to-day lists and takes no new students; past enrollments are kept. Move its students to another section first. Its active teaching assignments end today."
          : "The section becomes active again."
      }
      confirmLabel={archiving ? "Archive" : "Restore"}
      onConfirm={async () => {
        if (!target) return
        const result = await setSectionArchivedAction(target.id, archiving)
        if (!result.ok) {
          toast.add({ title: `Couldn't ${archiving ? "archive" : "restore"} the section`, description: result.error, type: "error" })
          return false
        }
        toast.add({ title: archiving ? "Section archived" : "Section restored", type: "success" })
        router.refresh()
      }}
    />
  )
  return { ask: setTarget, dialog }
}
