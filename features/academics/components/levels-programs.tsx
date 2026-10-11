"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { LayersIcon, SparklesIcon } from "lucide-react"

import { SelectField, SwitchField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { applyPresetAction } from "@/features/academics/actions"
import {
  ActiveBadge,
  AddButton,
  FormDialog,
  RecordTable,
  SectionHeader,
  useDeleteRecord,
  useStructureForm,
} from "@/features/academics/components/structure-kit"
import { educationLevelSchema, programSchema } from "@/features/academics/schemas"
import { EDUCATION_PRESETS, GROUPING_LABELS } from "@/lib/education/presets"
import type { GroupingKind } from "@/lib/generated/prisma/enums"
import type { EducationStructure } from "@/services/academics/structure-service"

export const groupingOptions = (Object.keys(GROUPING_LABELS) as GroupingKind[]).map((value) => ({
  value,
  label: GROUPING_LABELS[value],
}))

// ------------------------------------------------------------------ presets

function PresetPicker({ structure }: { structure: EducationStructure }) {
  const router = useRouter()
  const [pending, setPending] = React.useState<string | null>(null)
  const [withChildren, setWithChildren] = React.useState(true)
  const usedPresets = new Set(structure.levels.map((l) => l.presetKey).filter(Boolean))
  const usedCodes = new Set(structure.levels.map((l) => l.code))

  async function apply(key: string) {
    setPending(key)
    const result = await applyPresetAction({ presetKey: key, createClasses: withChildren, createPrograms: withChildren })
    setPending(null)
    if (!result.ok) {
      toast.add({ title: "Couldn't add level", description: result.error, type: "error" })
      return
    }
    toast.add({ title: "Education level added", type: "success" })
    router.refresh()
  }

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-medium">
            <SparklesIcon className="size-4 text-primary" />
            Quick start with Nepal presets
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Optional starting points. Each creates an ordinary level you can rename, reorder, disable or delete.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={withChildren} onCheckedChange={(v) => setWithChildren(Boolean(v))} />
          Also create suggested classes / programs
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {EDUCATION_PRESETS.map((preset) => {
          const added = usedPresets.has(preset.key)
          const codeTaken = !added && usedCodes.has(preset.code)
          return (
            <div key={preset.key} className="flex flex-col justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{preset.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{preset.description}</p>
              </div>
              <Button
                size="sm"
                variant={added ? "ghost" : "outline"}
                disabled={added || codeTaken || pending !== null}
                onClick={() => apply(preset.key)}
                title={codeTaken ? `The code ${preset.code} is already used.` : undefined}
              >
                {pending === preset.key && <Spinner />}
                {added ? "Added" : codeTaken ? "Code in use" : "Add level"}
              </Button>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ levels

type Level = EducationStructure["levels"][number]

export function LevelsTab({ structure, canManage }: { structure: EducationStructure; canManage: boolean }) {
  const [open, setOpen] = React.useState(false)
  const { form, recordId, open: load, submit, formError } = useStructureForm("level", educationLevelSchema, () =>
    setOpen(false)
  )
  const { confirmDelete, dialog } = useDeleteRecord("level")

  function edit(level: Level | null) {
    load(level?.id ?? null, {
      name: level?.name ?? "",
      code: level?.code ?? "",
      description: level?.description ?? "",
      groupingKind: level?.groupingKind ?? "GRADE",
      usesPrograms: level?.usesPrograms ?? false,
      isActive: level?.isActive ?? true,
      sortOrder: level?.sortOrder ?? structure.levels.length * 10,
    })
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && <PresetPicker structure={structure} />}
      <SectionHeader
        title="Education levels"
        description="The top of your structure, e.g. Basic, Secondary, +2 or Bachelor's. Levels that use programs place students in a program before a class."
        action={canManage && <AddButton onClick={() => edit(null)}>Add level</AddButton>}
      />
      <RecordTable
        rows={structure.levels}
        canManage={canManage}
        onEdit={edit}
        onDelete={(l) => confirmDelete({ id: l.id, name: l.name })}
        emptyTitle="No education levels yet"
        emptyDescription="Add a level, or start from one of the presets above."
        columns={[
          {
            header: "Level",
            cell: (l) => (
              <div className="flex items-center gap-2">
                <LayersIcon className="size-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">{l.name}</p>
                  {l.description && <p className="text-xs text-muted-foreground">{l.description}</p>}
                </div>
              </div>
            ),
          },
          { header: "Code", cell: (l) => <code className="text-xs">{l.code}</code> },
          { header: "Grouping", cell: (l) => GROUPING_LABELS[l.groupingKind] },
          {
            header: "Programs",
            cell: (l) => (l.usesPrograms ? <Badge variant="outline">{l._count.programs} programs</Badge> : "Not used"),
          },
          { header: "Classes", cell: (l) => l._count.classes, className: "tabular-nums" },
          { header: "Enrollments", cell: (l) => l._count.enrollments, className: "tabular-nums" },
          { header: "Status", cell: (l) => <ActiveBadge active={l.isActive} /> },
        ]}
      />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={recordId ? "Edit education level" : "Add education level"}
        pending={form.formState.isSubmitting}
        error={formError}
        onSubmit={submit}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <TextField control={form.control} name="name" label="Name" required placeholder="Basic Education" />
          <TextField control={form.control} name="code" label="Code" required placeholder="BASIC" />
        </div>
        <TextAreaField control={form.control} name="description" label="Description" rows={2} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="groupingKind"
            label="Classes are grouped by"
            options={groupingOptions}
          />
          <TextField control={form.control} name="sortOrder" label="Display order" type="number" min={0} />
        </div>
        <SwitchField
          control={form.control}
          name="usesPrograms"
          label="Uses programs"
          description="Turn on for +2 streams, diploma or degree programs. Can't change once classes exist."
        />
        <SwitchField
          control={form.control}
          name="isActive"
          label="Active"
          description="Inactive levels stay in history but can't receive new enrollments."
        />
      </FormDialog>
      {dialog}
    </div>
  )
}

// ----------------------------------------------------------------- programs

type Program = EducationStructure["programs"][number]

export function ProgramsTab({ structure, canManage }: { structure: EducationStructure; canManage: boolean }) {
  const [open, setOpen] = React.useState(false)
  const { form, recordId, open: load, submit, formError } = useStructureForm("program", programSchema, () =>
    setOpen(false)
  )
  const { confirmDelete, dialog } = useDeleteRecord("program")
  const programLevels = structure.levels.filter((l) => l.usesPrograms)
  const levelName = (id: string) => structure.levels.find((l) => l.id === id)?.name ?? "—"
  const facultyName = (id: string | null) => structure.faculties.find((f) => f.id === id)?.name

  function edit(program: Program | null) {
    load(program?.id ?? null, {
      educationLevelId: program?.educationLevelId ?? programLevels[0]?.id ?? "",
      facultyId: program?.facultyId ?? "",
      name: program?.name ?? "",
      code: program?.code ?? "",
      description: program?.description ?? "",
      duration: program?.duration ?? "",
      isActive: program?.isActive ?? true,
      sortOrder: program?.sortOrder ?? structure.programs.length * 10,
    })
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Programs"
        description="Streams and programs such as Science, Management, BBS or BCA, under a level that uses programs. Schools without programs can skip this."
        action={
          canManage && (
            <AddButton onClick={() => edit(null)} disabled={programLevels.length === 0}>
              Add program
            </AddButton>
          )
        }
      />
      {programLevels.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          None of your education levels use programs. Turn on “Uses programs” on a level (e.g. +2 or Bachelor&apos;s) to add programs.
        </p>
      )}
      <RecordTable
        rows={structure.programs}
        canManage={canManage}
        onEdit={edit}
        onDelete={(p) => confirmDelete({ id: p.id, name: p.name })}
        emptyTitle="No programs"
        emptyDescription="Programs appear here once added."
        columns={[
          {
            header: "Program",
            cell: (p) => (
              <div>
                <p className="font-medium">{p.name}</p>
                {facultyName(p.facultyId) && <p className="text-xs text-muted-foreground">{facultyName(p.facultyId)}</p>}
              </div>
            ),
          },
          { header: "Code", cell: (p) => <code className="text-xs">{p.code}</code> },
          { header: "Level", cell: (p) => levelName(p.educationLevelId) },
          { header: "Duration", cell: (p) => p.duration ?? "—", className: "tabular-nums" },
          { header: "Classes", cell: (p) => p._count.classes, className: "tabular-nums" },
          { header: "Enrollments", cell: (p) => p._count.enrollments, className: "tabular-nums" },
          { header: "Status", cell: (p) => <ActiveBadge active={p.isActive} /> },
        ]}
      />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={recordId ? "Edit program" : "Add program"}
        pending={form.formState.isSubmitting}
        error={formError}
        onSubmit={submit}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <TextField control={form.control} name="name" label="Name" required placeholder="Bachelor of Computer Application" />
          <TextField control={form.control} name="code" label="Code" required placeholder="BCA" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="educationLevelId"
            label="Education level"
            required
            options={programLevels.map((l) => ({ value: l.id, label: l.name }))}
          />
          <SelectField
            control={form.control}
            name="facultyId"
            label="Faculty / department"
            placeholder="None"
            options={structure.faculties.map((f) => ({ value: f.id, label: f.name }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="duration"
            label="Duration"
            type="number"
            min={1}
            description="In the level's grouping unit, e.g. 8 semesters."
          />
          <TextField control={form.control} name="sortOrder" label="Display order" type="number" min={0} />
        </div>
        <TextAreaField control={form.control} name="description" label="Description" rows={2} />
        <SwitchField control={form.control} name="isActive" label="Active" />
      </FormDialog>
      {dialog}
    </div>
  )
}
