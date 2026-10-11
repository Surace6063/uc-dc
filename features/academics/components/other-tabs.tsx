"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { CalendarCheckIcon, StarIcon } from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { FormAlert } from "@/components/shared/form"
import { applyServerErrors, SelectField, SwitchField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { saveStudentSettingsAction, setCurrentYearAction } from "@/features/academics/actions"
import {
  ActiveBadge,
  AddButton,
  FormDialog,
  RecordTable,
  SectionHeader,
  useDeleteRecord,
  useStructureForm,
} from "@/features/academics/components/structure-kit"
import {
  academicYearSchema,
  batchSchema,
  documentRequirementSchema,
  facultySchema,
  studentSettingsSchema,
} from "@/features/academics/schemas"
import type { AcademicYearStatus } from "@/lib/generated/prisma/enums"
import type { EducationStructure } from "@/services/academics/structure-service"

type Props = { structure: EducationStructure; canManage: boolean }

const YEAR_STATUS_LABELS: Record<AcademicYearStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

// ---------------------------------------------------------- academic years

type Year = EducationStructure["years"][number]

export function YearsTab({ structure, canManage }: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const { form, recordId, open: load, submit, formError } = useStructureForm("year", academicYearSchema, () => setOpen(false))
  const { confirmDelete, dialog } = useDeleteRecord("year")

  function edit(year: Year | null) {
    load(year?.id ?? null, {
      name: year?.name ?? "",
      startDate: year?.startDate ?? "",
      endDate: year?.endDate ?? "",
      status: year?.status ?? "PLANNED",
      isCurrent: year?.isCurrent ?? structure.years.length === 0,
    })
    setOpen(true)
  }

  async function makeCurrent(year: Year) {
    const result = await setCurrentYearAction(year.id)
    if (!result.ok) {
      toast.add({ title: "Couldn't change the current year", description: result.error, type: "error" })
      return
    }
    toast.add({ title: `${year.name} is now the current year`, type: "success" })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Academic years"
        description="Each year keeps its own enrollments, so history is preserved. The current year is the default for admissions and the students list."
        action={canManage && <AddButton onClick={() => edit(null)}>Add academic year</AddButton>}
      />
      <RecordTable
        rows={structure.years}
        canManage={canManage}
        onEdit={edit}
        onDelete={(y) => confirmDelete({ id: y.id, name: y.name })}
        extraActions={(y) =>
          !y.isCurrent && y.status !== "COMPLETED" && y.status !== "ARCHIVED" ? (
            <DropdownMenuItem onClick={() => makeCurrent(y)}>
              <StarIcon />
              Set as current
            </DropdownMenuItem>
          ) : null
        }
        emptyTitle="No academic years yet"
        emptyDescription="Add the current academic year to start enrolling students."
        columns={[
          {
            header: "Year",
            cell: (y) => (
              <div className="flex items-center gap-2">
                <CalendarCheckIcon className="size-4 text-muted-foreground" />
                <span className="font-medium">{y.name}</span>
                {y.isCurrent && <Badge>Current</Badge>}
              </div>
            ),
          },
          { header: "Starts", cell: (y) => formatDate(y.startDate), className: "tabular-nums" },
          { header: "Ends", cell: (y) => formatDate(y.endDate), className: "tabular-nums" },
          { header: "Status", cell: (y) => <Badge variant="outline">{YEAR_STATUS_LABELS[y.status]}</Badge> },
          { header: "Enrollments", cell: (y) => y._count.enrollments, className: "tabular-nums" },
        ]}
      />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={recordId ? "Edit academic year" : "Add academic year"}
        description="Dates are AD. Use any name, e.g. “2083” or “2082/83”."
        pending={form.formState.isSubmitting}
        error={formError}
        onSubmit={submit}
      >
        <TextField control={form.control} name="name" label="Name" required placeholder="2083" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="startDate" label="Start date" type="date" required />
          <TextField control={form.control} name="endDate" label="End date" type="date" required />
        </div>
        <SelectField
          control={form.control}
          name="status"
          label="Status"
          options={(Object.keys(YEAR_STATUS_LABELS) as AcademicYearStatus[]).map((value) => ({
            value,
            label: YEAR_STATUS_LABELS[value],
          }))}
        />
        <SwitchField control={form.control} name="isCurrent" label="Current academic year" description="Only one year can be current." />
      </FormDialog>
      {dialog}
    </div>
  )
}

// ---------------------------------------------------------------- faculties

type Faculty = EducationStructure["faculties"][number]

export function FacultiesTab({ structure, canManage }: Props) {
  const [open, setOpen] = React.useState(false)
  const { form, recordId, open: load, submit, formError } = useStructureForm("faculty", facultySchema, () => setOpen(false))
  const { confirmDelete, dialog } = useDeleteRecord("faculty")

  function edit(f: Faculty | null) {
    load(f?.id ?? null, {
      name: f?.name ?? "",
      code: f?.code ?? "",
      description: f?.description ?? "",
      isActive: f?.isActive ?? true,
      sortOrder: f?.sortOrder ?? 0,
    })
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Faculties and departments"
        description="Optional. Group programs under a faculty or department, e.g. Faculty of Management."
        action={canManage && <AddButton onClick={() => edit(null)}>Add faculty</AddButton>}
      />
      <RecordTable
        rows={structure.faculties}
        canManage={canManage}
        onEdit={edit}
        onDelete={(f) => confirmDelete({ id: f.id, name: f.name })}
        emptyTitle="No faculties"
        emptyDescription="Most schools don't need these."
        columns={[
          { header: "Name", cell: (f) => <span className="font-medium">{f.name}</span> },
          { header: "Code", cell: (f) => <code className="text-xs">{f.code}</code> },
          { header: "Programs", cell: (f) => f._count.programs, className: "tabular-nums" },
          { header: "Status", cell: (f) => <ActiveBadge active={f.isActive} /> },
        ]}
      />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={recordId ? "Edit faculty" : "Add faculty"}
        pending={form.formState.isSubmitting}
        error={formError}
        onSubmit={submit}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <TextField control={form.control} name="name" label="Name" required />
          <TextField control={form.control} name="code" label="Code" required />
        </div>
        <TextAreaField control={form.control} name="description" label="Description" rows={2} />
        <SwitchField control={form.control} name="isActive" label="Active" />
      </FormDialog>
      {dialog}
    </div>
  )
}

// ------------------------------------------------------------------ batches

type Batch = EducationStructure["batches"][number]

export function BatchesTab({ structure, canManage }: Props) {
  const [open, setOpen] = React.useState(false)
  const { form, recordId, open: load, submit, formError } = useStructureForm("batch", batchSchema, () => setOpen(false))
  const { confirmDelete, dialog } = useDeleteRecord("batch")

  function edit(b: Batch | null) {
    load(b?.id ?? null, {
      name: b?.name ?? "",
      programId: b?.programId ?? "",
      startYear: b?.startYear ?? "",
      isActive: b?.isActive ?? true,
    })
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Batches"
        description="Optional intake groups such as “Batch 2026”, mostly used by colleges."
        action={canManage && <AddButton onClick={() => edit(null)}>Add batch</AddButton>}
      />
      <RecordTable
        rows={structure.batches}
        canManage={canManage}
        onEdit={edit}
        onDelete={(b) => confirmDelete({ id: b.id, name: b.name })}
        emptyTitle="No batches"
        emptyDescription="Add batches if your institution tracks intakes."
        columns={[
          { header: "Name", cell: (b) => <span className="font-medium">{b.name}</span> },
          { header: "Program", cell: (b) => structure.programs.find((p) => p.id === b.programId)?.name ?? "Any" },
          { header: "Start year", cell: (b) => b.startYear ?? "—", className: "tabular-nums" },
          { header: "Enrollments", cell: (b) => b._count.enrollments, className: "tabular-nums" },
          { header: "Status", cell: (b) => <ActiveBadge active={b.isActive} /> },
        ]}
      />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={recordId ? "Edit batch" : "Add batch"}
        pending={form.formState.isSubmitting}
        error={formError}
        onSubmit={submit}
      >
        <TextField control={form.control} name="name" label="Name" required placeholder="Batch 2026" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="programId"
            label="Program"
            placeholder="Any program"
            options={structure.programs.map((p) => ({ value: p.id, label: p.name }))}
          />
          <TextField control={form.control} name="startYear" label="Start year" type="number" />
        </div>
        <SwitchField control={form.control} name="isActive" label="Active" />
      </FormDialog>
      {dialog}
    </div>
  )
}

// --------------------------------------------------------- document types

type Requirement = EducationStructure["requirements"][number]

export function DocumentsTab({ structure, canManage }: Props) {
  const [open, setOpen] = React.useState(false)
  const { form, recordId, open: load, submit, formError } = useStructureForm(
    "requirement",
    documentRequirementSchema,
    () => setOpen(false)
  )
  const { confirmDelete, dialog } = useDeleteRecord("requirement")
  const audience = useWatch({ control: form.control, name: "audience" })

  function edit(r: Requirement | null) {
    load(r?.id ?? null, {
      audience: r?.audience ?? "STUDENT",
      name: r?.name ?? "",
      description: r?.description ?? "",
      educationLevelId: r?.educationLevelId ?? "",
      isRequired: r?.isRequired ?? true,
      isActive: r?.isActive ?? true,
      sortOrder: r?.sortOrder ?? 0,
    })
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Document types"
        description="Documents collected from students at admission (birth certificate, transfer certificate, …) and from teachers (CV, appointment letter, …). Required types drive the “missing documents” filters."
        action={canManage && <AddButton onClick={() => edit(null)}>Add document type</AddButton>}
      />
      <RecordTable
        rows={structure.requirements}
        canManage={canManage}
        onEdit={edit}
        onDelete={(r) => confirmDelete({ id: r.id, name: r.name })}
        emptyTitle="No document types"
        emptyDescription="Add the documents your institution requires."
        columns={[
          { header: "Document", cell: (r) => <span className="font-medium">{r.name}</span> },
          {
            header: "Applies to",
            cell: (r) =>
              r.audience === "TEACHER"
                ? "Teachers"
                : (structure.levels.find((l) => l.id === r.educationLevelId)?.name ?? "All students"),
          },
          { header: "Required", cell: (r) => (r.isRequired ? <Badge>Required</Badge> : <Badge variant="outline">Optional</Badge>) },
          { header: "Uploaded", cell: (r) => r._count.documents, className: "tabular-nums" },
          { header: "Status", cell: (r) => <ActiveBadge active={r.isActive} /> },
        ]}
      />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={recordId ? "Edit document type" : "Add document type"}
        pending={form.formState.isSubmitting}
        error={formError}
        onSubmit={submit}
      >
        <TextField control={form.control} name="name" label="Name" required placeholder="Birth certificate" />
        <SelectField
          control={form.control}
          name="audience"
          label="Collected from"
          options={[
            { value: "STUDENT", label: "Students" },
            { value: "TEACHER", label: "Teachers" },
          ]}
        />
        {audience !== "TEACHER" && (
          <SelectField
            control={form.control}
            name="educationLevelId"
            label="Applies to"
            placeholder="All students"
            options={structure.levels.map((l) => ({ value: l.id, label: l.name }))}
          />
        )}
        <TextAreaField control={form.control} name="description" label="Description" rows={2} />
        <SwitchField control={form.control} name="isRequired" label="Required" />
        <SwitchField control={form.control} name="isActive" label="Active" />
      </FormDialog>
      {dialog}
    </div>
  )
}

// ------------------------------------------------------ admission numbering

export function NumberingTab({ structure, canManage }: Props) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof studentSettingsSchema>, unknown, z.output<typeof studentSettingsSchema>>({
    resolver: zodResolver(studentSettingsSchema),
    defaultValues: structure.settings,
  })
  const values = useWatch({ control: form.control })
  const preview = `${values.admissionNumberPrefix ?? ""}${String(values.nextAdmissionSequence ?? 1).padStart(
    Number(values.admissionNumberPadding) || 1,
    "0"
  )}`

  const submit = form.handleSubmit(async (data) => {
    setError(null)
    const result = await saveStudentSettingsAction(data)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: "Settings saved", type: "success" })
    router.refresh()
  })

  const modeOptions = [
    { value: "AUTOMATIC", label: "Automatic (can be overridden)" },
    { value: "MANUAL", label: "Manual (always entered)" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Admission and roll numbers"
        description="Admission numbers are unique within your organisation. Automatic numbers are generated safely even when several people admit students at once."
      />
      <Card className="max-w-2xl p-5">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {error && <FormAlert tone="error">{error}</FormAlert>}
          <fieldset disabled={!canManage} className="grid gap-4">
            <SelectField control={form.control} name="admissionNumberMode" label="Admission numbers" options={modeOptions} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField control={form.control} name="admissionNumberPrefix" label="Prefix" placeholder="ADM-" />
              <TextField control={form.control} name="admissionNumberPadding" label="Digits" type="number" min={1} max={10} />
              <TextField control={form.control} name="nextAdmissionSequence" label="Next number" type="number" min={1} />
            </div>
            <p className="text-sm text-muted-foreground">
              Next admission number: <span className="font-mono font-medium text-foreground">{preview}</span>
            </p>
            <SelectField
              control={form.control}
              name="rollNumberMode"
              label="Roll numbers"
              options={[
                { value: "AUTOMATIC", label: "Next free number in the class/section" },
                { value: "MANUAL", label: "Entered manually (optional)" },
              ]}
            />
            <SwitchField
              control={form.control}
              name="enforceSectionCapacity"
              label="Enforce section capacity"
              description="Refuse admissions, promotions and section moves once a section (or a class without sections) reaches its capacity."
            />
          </fieldset>
          {canManage && (
            <Button type="submit" className="justify-self-start" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              Save settings
            </Button>
          )}
        </form>
      </Card>
    </div>
  )
}
