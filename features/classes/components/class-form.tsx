"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { FormAlert } from "@/components/shared/form"
import { applyServerErrors, SelectField, SwitchField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { groupingOptions } from "@/features/academics/components/levels-programs"
import { saveClassAction } from "@/features/classes/actions"
import { SECTION_NAME_PRESETS } from "@/features/classes/constants"
import { classFormSchema, type ClassFormInput } from "@/features/classes/schemas"
import { suggestLocalClassName } from "@/lib/education/presets"
import type { EducationStructure } from "@/services/academics/structure-service"

type Structure = Pick<EducationStructure, "levels" | "programs" | "classes">

// Create or edit a class. Levels and programs come from the organisation's
// own structure; programs are offered only for levels that use them.
export function ClassForm({
  structure,
  classId,
  initial,
  hasEnrollments = false,
}: {
  structure: Structure
  classId: string | null
  initial: ClassFormInput
  hasEnrollments?: boolean
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof classFormSchema>, unknown, z.output<typeof classFormSchema>>({
    resolver: zodResolver(classFormSchema),
    defaultValues: initial,
  })
  const levelId = useWatch({ control: form.control, name: "educationLevelId" })
  const name = useWatch({ control: form.control, name: "name" })
  const level = structure.levels.find((l) => l.id === levelId)
  const programs = structure.programs.filter((p) => p.educationLevelId === levelId && (p.isActive || p.id === initial.programId))
  const programId = useWatch({ control: form.control, name: "programId" })

  // Suggest the next order number within the chosen level/program.
  const nextSequence = React.useMemo(() => {
    const siblings = structure.classes.filter(
      (c) => c.educationLevelId === levelId && (c.programId ?? "") === (programId ?? "") && c.id !== classId
    )
    return siblings.reduce((max, c) => Math.max(max, c.sequence), 0) + 1
  }, [structure.classes, levelId, programId, classId])

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    const result = await saveClassAction(classId, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: classId ? "Class updated" : "Class created", type: "success" })
    router.push(`/dashboard/classes/${result.data.id}`)
    router.refresh()
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {error && <FormAlert tone="error">{error}</FormAlert>}

      <Card className="gap-4 p-5">
        <div>
          <h2 className="font-semibold">Where it belongs</h2>
          <p className="text-sm text-muted-foreground">
            {hasEnrollments
              ? "Students are enrolled in this class, so its level and program can't change."
              : "The education level (and program, if the level uses programs) this class is part of."}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="educationLevelId"
            label="Education level"
            required
            disabled={hasEnrollments}
            placeholder="Choose a level"
            options={structure.levels
              .filter((l) => l.isActive || l.id === initial.educationLevelId)
              .map((l) => ({ value: l.id, label: l.name }))}
            onValueChange={(value) => {
              form.setValue("programId", "")
              const next = structure.levels.find((l) => l.id === value)
              if (next && !classId) form.setValue("kind", next.groupingKind)
            }}
          />
          {level?.usesPrograms && (
            <SelectField
              control={form.control}
              name="programId"
              label="Program"
              required
              disabled={hasEnrollments}
              placeholder={programs.length ? "Choose a program" : "No programs in this level yet"}
              options={programs.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
            />
          )}
        </div>
      </Card>

      <Card className="gap-4 p-5">
        <h2 className="font-semibold">Class details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="name"
            label="Name"
            required
            placeholder="Grade 8, Class 10, First Year, Semester 3…"
          />
          <TextField
            control={form.control}
            name="localName"
            label="Name in Nepali"
            placeholder={suggestLocalClassName(name ?? "") ?? "कक्षा ८"}
            description="Optional, for registers and report cards."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <TextField control={form.control} name="code" label="Code" placeholder="G8" description="Optional, unique." />
          <SelectField control={form.control} name="kind" label="Type" options={groupingOptions} />
          <TextField
            control={form.control}
            name="sequence"
            label="Order"
            type="number"
            min={0}
            description={`Next free: ${nextSequence}. Drives promotion.`}
          />
          <TextField
            control={form.control}
            name="capacity"
            label="Class capacity"
            type="number"
            min={1}
            description="Optional total."
          />
        </div>
        <TextAreaField control={form.control} name="description" label="Description" rows={2} />
        <SwitchField
          control={form.control}
          name="isActive"
          label="Active"
          description="Inactive classes keep their students and history but take no new placements."
        />
      </Card>

      {!classId && (
        <Card className="gap-4 p-5">
          <div>
            <h2 className="font-semibold">Sections</h2>
            <p className="text-sm text-muted-foreground">
              Optional. Leave empty if this class isn&apos;t divided into sections; you can add them later.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <div className="grid gap-2">
              <TextField
                control={form.control}
                name="sections"
                label="Section names"
                placeholder="A, B, C"
                description="Separate with commas."
              />
              <div className="flex flex-wrap gap-1.5">
                {SECTION_NAME_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => form.setValue("sections", preset.names.join(", "), { shouldValidate: true })}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
            <TextField
              control={form.control}
              name="sectionCapacity"
              label="Capacity per section"
              type="number"
              min={1}
              placeholder="e.g. 40"
            />
          </div>
        </Card>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner />}
          {classId ? "Save changes" : "Create class"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={form.formState.isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
