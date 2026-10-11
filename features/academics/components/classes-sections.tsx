"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { ListPlusIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { applyServerErrors, SelectField, SwitchField, TextField } from "@/components/shared/form-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { toast } from "@/components/ui/toast"
import { generateClassesAction } from "@/features/academics/actions"
import { groupingOptions } from "@/features/academics/components/levels-programs"
import {
  ActiveBadge,
  AddButton,
  FormDialog,
  SectionHeader,
  useDeleteRecord,
  useStructureForm,
} from "@/features/academics/components/structure-kit"
import { academicClassSchema, generateClassesSchema, sectionSchema } from "@/features/academics/schemas"
import { GROUPING_LABELS } from "@/lib/education/presets"
import type { EducationStructure } from "@/services/academics/structure-service"

type Class = EducationStructure["classes"][number]
type Section = EducationStructure["sections"][number]

// Classes grouped by level → program, each with its sections inline.
export function ClassesTab({ structure, canManage }: { structure: EducationStructure; canManage: boolean }) {
  const router = useRouter()
  const [levelFilter, setLevelFilter] = React.useState("")
  const [classOpen, setClassOpen] = React.useState(false)
  const [sectionOpen, setSectionOpen] = React.useState(false)
  const [generateOpen, setGenerateOpen] = React.useState(false)

  const classForm = useStructureForm("class", academicClassSchema, () => setClassOpen(false))
  const sectionForm = useStructureForm("section", sectionSchema, () => setSectionOpen(false))
  const deleteClass = useDeleteRecord("class")
  const deleteSection = useDeleteRecord("section")

  const generateForm = useForm<z.input<typeof generateClassesSchema>, unknown, z.output<typeof generateClassesSchema>>({
    resolver: zodResolver(generateClassesSchema),
  })
  const [generateError, setGenerateError] = React.useState<string | null>(null)

  const classLevelId = useWatch({ control: classForm.form.control, name: "educationLevelId" })
  const generateLevelId = useWatch({ control: generateForm.control, name: "educationLevelId" })

  const levels = structure.levels.filter((l) => !levelFilter || l.id === levelFilter)
  const programsOf = (levelId: string) => structure.programs.filter((p) => p.educationLevelId === levelId)
  const sectionsOf = (classId: string) => structure.sections.filter((s) => s.classId === classId)
  const levelById = (id: string | undefined) => structure.levels.find((l) => l.id === id)

  function editClass(c: Class | null, preset?: { levelId: string; programId: string | null }) {
    const level = levelById(c?.educationLevelId ?? preset?.levelId) ?? structure.levels[0]
    classForm.open(c?.id ?? null, {
      educationLevelId: c?.educationLevelId ?? preset?.levelId ?? level?.id ?? "",
      programId: c?.programId ?? preset?.programId ?? "",
      name: c?.name ?? "",
      kind: c?.kind ?? level?.groupingKind ?? "GRADE",
      sequence: c?.sequence ?? 1,
      isActive: c?.isActive ?? true,
    })
    setClassOpen(true)
  }

  function editSection(s: Section | null, classId?: string) {
    sectionForm.open(s?.id ?? null, {
      classId: s?.classId ?? classId ?? "",
      name: s?.name ?? "",
      capacity: s?.capacity ?? "",
      isActive: s?.isActive ?? true,
      sortOrder: s?.sortOrder ?? 0,
    })
    setSectionOpen(true)
  }

  function openGenerate(levelId: string, programId: string | null) {
    const level = levelById(levelId)
    const program = structure.programs.find((p) => p.id === programId)
    setGenerateError(null)
    generateForm.reset({
      educationLevelId: levelId,
      programId: programId ?? "",
      kind: level?.groupingKind ?? "SEMESTER",
      count: program?.duration ?? "",
      startAt: level?.groupingKind === "GRADE" && level.usesPrograms ? 11 : 1,
    })
    setGenerateOpen(true)
  }

  const generate = generateForm.handleSubmit(async (values) => {
    const result = await generateClassesAction(values)
    if (!result.ok) {
      setGenerateError(applyServerErrors(generateForm, result))
      return
    }
    toast.add({ title: `${result.data.created} classes created`, type: "success" })
    setGenerateOpen(false)
    router.refresh()
  })

  const classGroup = (levelId: string, programId: string | null, title: string) => {
    const classes = structure.classes.filter((c) => c.educationLevelId === levelId && c.programId === programId)
    return (
      <div key={programId ?? levelId} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{title}</p>
          {canManage && (
            <div className="flex gap-1">
              <Button size="xs" variant="ghost" onClick={() => openGenerate(levelId, programId)}>
                <ListPlusIcon data-icon="inline-start" />
                Generate
              </Button>
              <Button size="xs" variant="ghost" onClick={() => editClass(null, { levelId, programId })}>
                <PlusIcon data-icon="inline-start" />
                Class
              </Button>
            </div>
          )}
        </div>
        {classes.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">No classes yet.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {classes.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {GROUPING_LABELS[c.kind]} · order {c.sequence} · {c._count.enrollments} enrollments
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {!c.isActive && <ActiveBadge active={false} />}
                    {canManage && (
                      <>
                        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => editClass(c)}>
                          <PencilIcon />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Delete ${c.name}`}
                          onClick={() => deleteClass.confirmDelete({ id: c.id, name: c.name })}
                        >
                          <Trash2Icon />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {sectionsOf(c.id).map((s) =>
                    canManage ? (
                      <button key={s.id} type="button" onClick={() => editSection(s)} title="Edit section">
                        <Badge variant={s.isActive ? "secondary" : "outline"}>
                          {s.name}
                          {s.capacity ? ` · ${s.capacity}` : ""}
                        </Badge>
                      </button>
                    ) : (
                      <Badge key={s.id} variant="secondary">
                        {s.name}
                      </Badge>
                    )
                  )}
                  {canManage && (
                    <Button size="xs" variant="ghost" onClick={() => editSection(null, c.id)}>
                      <PlusIcon data-icon="inline-start" />
                      Section
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const classLevel = levelById(classLevelId)
  const generateLevel = levelById(generateLevelId)

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Classes and sections"
        description="Grades, semesters, years or other groupings within each level or program, and the sections inside them (A, B, Morning, …)."
        action={
          <>
            <NativeSelect value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} aria-label="Filter by level">
              <NativeSelectOption value="">All levels</NativeSelectOption>
              {structure.levels.map((l) => (
                <NativeSelectOption key={l.id} value={l.id}>
                  {l.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {canManage && (
              <AddButton onClick={() => editClass(null)} disabled={structure.levels.length === 0}>
                Add class
              </AddButton>
            )}
          </>
        }
      />

      {structure.levels.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Add an education level first.
        </p>
      )}

      {levels.map((level) => (
        <Card key={level.id} className="gap-4 p-5">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{level.name}</h3>
            {!level.isActive && <ActiveBadge active={false} />}
          </div>
          {level.usesPrograms ? (
            programsOf(level.id).length === 0 ? (
              <p className="text-sm text-muted-foreground">Add programs to this level to create their classes.</p>
            ) : (
              programsOf(level.id).map((p) => classGroup(level.id, p.id, `${p.name} (${p.code})`))
            )
          ) : (
            classGroup(level.id, null, "Classes")
          )}
        </Card>
      ))}

      <FormDialog
        open={classOpen}
        onOpenChange={setClassOpen}
        title={classForm.recordId ? "Edit class" : "Add class"}
        pending={classForm.form.formState.isSubmitting}
        error={classForm.formError}
        onSubmit={classForm.submit}
      >
        <TextField control={classForm.form.control} name="name" label="Name" required placeholder="Grade 1, Semester 1, Year 2…" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={classForm.form.control}
            name="educationLevelId"
            label="Education level"
            required
            options={structure.levels.map((l) => ({ value: l.id, label: l.name }))}
            onValueChange={() => classForm.form.setValue("programId", "")}
          />
          {classLevel?.usesPrograms && (
            <SelectField
              control={classForm.form.control}
              name="programId"
              label="Program"
              required
              placeholder="Choose a program"
              options={programsOf(classLevel.id).map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField control={classForm.form.control} name="kind" label="Type" options={groupingOptions} />
          <TextField
            control={classForm.form.control}
            name="sequence"
            label="Order"
            type="number"
            min={0}
            description="Used to suggest the next class when promoting."
          />
        </div>
        <SwitchField control={classForm.form.control} name="isActive" label="Active" />
      </FormDialog>

      <FormDialog
        open={sectionOpen}
        onOpenChange={setSectionOpen}
        title={sectionForm.recordId ? "Edit section" : "Add section"}
        pending={sectionForm.form.formState.isSubmitting}
        error={sectionForm.formError}
        onSubmit={sectionForm.submit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={sectionForm.form.control} name="name" label="Name" required placeholder="A, Morning…" />
          <TextField control={sectionForm.form.control} name="capacity" label="Capacity" type="number" min={1} />
        </div>
        <SelectField
          control={sectionForm.form.control}
          name="classId"
          label="Class"
          required
          options={structure.classes.map((c) => {
            const program = structure.programs.find((p) => p.id === c.programId)
            return { value: c.id, label: `${c.name}${program ? ` (${program.code})` : ""} · ${levelById(c.educationLevelId)?.name ?? ""}` }
          })}
        />
        <SwitchField control={sectionForm.form.control} name="isActive" label="Active" />
        {sectionForm.recordId && (
          <Button
            type="button"
            variant="ghost"
            className="justify-self-start text-destructive"
            onClick={() => {
              const s = structure.sections.find((x) => x.id === sectionForm.recordId)
              if (s) {
                setSectionOpen(false)
                deleteSection.confirmDelete({ id: s.id, name: `section ${s.name}` })
              }
            }}
          >
            <Trash2Icon data-icon="inline-start" />
            Delete section
          </Button>
        )}
      </FormDialog>

      <FormDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        title="Generate classes"
        description="Creates a numbered series, e.g. Semester 1–8. Existing names are skipped."
        pending={generateForm.formState.isSubmitting}
        error={generateError}
        onSubmit={generate}
        submitLabel="Generate"
      >
        <p className="text-sm">
          {generateLevel?.name}
          {generateForm.getValues("programId")
            ? ` · ${structure.programs.find((p) => p.id === generateForm.getValues("programId"))?.name ?? ""}`
            : ""}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField control={generateForm.control} name="kind" label="Type" options={groupingOptions} />
          <TextField control={generateForm.control} name="count" label="How many" type="number" min={1} max={20} required />
          <TextField control={generateForm.control} name="startAt" label="Start at" type="number" min={1} />
        </div>
      </FormDialog>

      {deleteClass.dialog}
      {deleteSection.dialog}
    </div>
  )
}
