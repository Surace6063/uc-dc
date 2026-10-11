"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { FormAlert } from "@/components/shared/form"
import { applyServerErrors, SelectField, SwitchField, TextField } from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { saveStaffSettingsAction } from "@/features/academics/actions"
import {
  ActiveBadge,
  AddButton,
  FormDialog,
  RecordTable,
  SectionHeader,
  useDeleteRecord,
  useStructureForm,
} from "@/features/academics/components/structure-kit"
import { designationSchema, staffSettingsSchema, subjectSchema } from "@/features/academics/schemas"
import type { EducationStructure } from "@/services/academics/structure-service"

type Props = { structure: EducationStructure; canManage: boolean }

// ------------------------------------------------------------------ subjects

type Subject = EducationStructure["subjects"][number]

export function SubjectsTab({ structure, canManage }: Props) {
  const [open, setOpen] = React.useState(false)
  const { form, recordId, open: load, submit, formError } = useStructureForm("subject", subjectSchema, () => setOpen(false))
  const { confirmDelete, dialog } = useDeleteRecord("subject")
  const levelId = useWatch({ control: form.control, name: "educationLevelId" })
  const level = structure.levels.find((l) => l.id === levelId)
  const levelName = (id: string | null) => structure.levels.find((l) => l.id === id)?.name
  const programName = (id: string | null) => structure.programs.find((p) => p.id === id)?.code

  function edit(subject: Subject | null) {
    load(subject?.id ?? null, {
      name: subject?.name ?? "",
      code: subject?.code ?? "",
      educationLevelId: subject?.educationLevelId ?? "",
      programId: subject?.programId ?? "",
      creditHours: subject?.creditHours ?? "",
      isActive: subject?.isActive ?? true,
      sortOrder: subject?.sortOrder ?? 0,
    })
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Subjects and courses"
        description="What teachers are assigned to teach: Mathematics, Accountancy, Data Structures… Optionally limit a subject to one level or program."
        action={canManage && <AddButton onClick={() => edit(null)}>Add subject</AddButton>}
      />
      <RecordTable
        rows={structure.subjects}
        canManage={canManage}
        onEdit={edit}
        onDelete={(s) => confirmDelete({ id: s.id, name: s.name })}
        emptyTitle="No subjects yet"
        emptyDescription="Add the subjects or courses your institution teaches."
        columns={[
          { header: "Subject", cell: (s) => <span className="font-medium">{s.name}</span> },
          { header: "Code", cell: (s) => <code className="text-xs">{s.code}</code> },
          {
            header: "Applies to",
            cell: (s) => [levelName(s.educationLevelId), programName(s.programId)].filter(Boolean).join(" · ") || "Any level",
          },
          { header: "Credits", cell: (s) => s.creditHours ?? "—", className: "tabular-nums" },
          { header: "Assignments", cell: (s) => s._count.assignments, className: "tabular-nums" },
          { header: "Status", cell: (s) => <ActiveBadge active={s.isActive} /> },
        ]}
      />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={recordId ? "Edit subject" : "Add subject"}
        pending={form.formState.isSubmitting}
        error={formError}
        onSubmit={submit}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <TextField control={form.control} name="name" label="Name" required placeholder="Mathematics" />
          <TextField control={form.control} name="code" label="Code" required placeholder="MATH" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="educationLevelId"
            label="Education level"
            placeholder="Any level"
            options={structure.levels.map((l) => ({ value: l.id, label: l.name }))}
            onValueChange={() => form.setValue("programId", "")}
          />
          {level?.usesPrograms && (
            <SelectField
              control={form.control}
              name="programId"
              label="Program"
              placeholder="Any program"
              options={structure.programs.filter((p) => p.educationLevelId === level.id).map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
          <TextField control={form.control} name="creditHours" label="Credit hours" type="number" min={0} />
        </div>
        <SwitchField control={form.control} name="isActive" label="Active" />
      </FormDialog>
      {dialog}
    </div>
  )
}

// -------------------------------------------------------------- designations

type Designation = EducationStructure["designations"][number]

export function DesignationsTab({ structure, canManage }: Props) {
  const [open, setOpen] = React.useState(false)
  const { form, recordId, open: load, submit, formError } = useStructureForm("designation", designationSchema, () =>
    setOpen(false)
  )
  const { confirmDelete, dialog } = useDeleteRecord("designation")

  function edit(d: Designation | null) {
    load(d?.id ?? null, { name: d?.name ?? "", isActive: d?.isActive ?? true, sortOrder: d?.sortOrder ?? structure.designations.length * 10 })
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Designations"
        description="Job titles used for teachers and staff, e.g. Teacher, Senior Teacher, Lecturer, Head of Department. Departments are the faculties/departments above."
        action={canManage && <AddButton onClick={() => edit(null)}>Add designation</AddButton>}
      />
      <RecordTable
        rows={structure.designations}
        canManage={canManage}
        onEdit={edit}
        onDelete={(d) => confirmDelete({ id: d.id, name: d.name })}
        emptyTitle="No designations"
        emptyDescription="Add the job titles your institution uses."
        columns={[
          { header: "Designation", cell: (d) => <span className="font-medium">{d.name}</span> },
          { header: "Teachers", cell: (d) => d._count.teachers, className: "tabular-nums" },
          { header: "Order", cell: (d) => d.sortOrder, className: "tabular-nums" },
          { header: "Status", cell: (d) => <ActiveBadge active={d.isActive} /> },
        ]}
      />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={recordId ? "Edit designation" : "Add designation"}
        pending={form.formState.isSubmitting}
        error={formError}
        onSubmit={submit}
      >
        <TextField control={form.control} name="name" label="Name" required placeholder="Senior Teacher" />
        <TextField control={form.control} name="sortOrder" label="Display order" type="number" min={0} />
        <SwitchField control={form.control} name="isActive" label="Active" />
      </FormDialog>
      {dialog}
    </div>
  )
}

// ------------------------------------------------------------- employee IDs

export function EmployeeIdSettings({ structure, canManage }: Props) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof staffSettingsSchema>, unknown, z.output<typeof staffSettingsSchema>>({
    resolver: zodResolver(staffSettingsSchema),
    defaultValues: structure.staffSettings,
  })
  const values = useWatch({ control: form.control })
  const preview = `${values.employeeIdPrefix ?? ""}${String(values.nextEmployeeSequence ?? 1).padStart(
    Number(values.employeeIdPadding) || 1,
    "0"
  )}`

  const submit = form.handleSubmit(async (data) => {
    setError(null)
    const result = await saveStaffSettingsAction(data)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: "Settings saved", type: "success" })
    router.refresh()
  })

  return (
    <Card className="max-w-2xl gap-4 p-5">
      <div>
        <h3 className="font-medium">Employee IDs</h3>
        <p className="text-sm text-muted-foreground">Unique within your organisation; generated safely when several people add teachers at once.</p>
      </div>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error && <FormAlert tone="error">{error}</FormAlert>}
        <fieldset disabled={!canManage} className="grid gap-4">
          <SelectField
            control={form.control}
            name="employeeIdMode"
            label="Employee IDs"
            options={[
              { value: "AUTOMATIC", label: "Automatic (can be overridden)" },
              { value: "MANUAL", label: "Manual (always entered)" },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField control={form.control} name="employeeIdPrefix" label="Prefix" placeholder="EMP-" />
            <TextField control={form.control} name="employeeIdPadding" label="Digits" type="number" min={1} max={10} />
            <TextField control={form.control} name="nextEmployeeSequence" label="Next number" type="number" min={1} />
          </div>
          <p className="text-sm text-muted-foreground">
            Next employee ID: <span className="font-mono font-medium text-foreground">{preview}</span>
          </p>
        </fieldset>
        {canManage && (
          <Button type="submit" className="justify-self-start" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            Save settings
          </Button>
        )}
      </form>
    </Card>
  )
}
