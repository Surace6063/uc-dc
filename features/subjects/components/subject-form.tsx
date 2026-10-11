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
import { mediumOptions } from "@/features/classes/constants"
import { saveSubjectAction } from "@/features/subjects/actions"
import { requirementOptions } from "@/features/subjects/constants"
import { subjectSchema, type SubjectInput } from "@/features/subjects/schemas"
import type { EducationStructure } from "@/services/academics/structure-service"
import type { SubjectCategoryRow } from "@/services/subjects/subject-service"

// Create or edit a subject or course. Only name and code are required:
// credits, hours, periods and level are for institutions that use them.
export function SubjectForm({
  structure,
  categories,
  subjectId,
  initial,
}: {
  structure: Pick<EducationStructure, "levels" | "programs">
  categories: SubjectCategoryRow[]
  subjectId: string | null
  initial: SubjectInput
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof subjectSchema>, unknown, z.output<typeof subjectSchema>>({
    resolver: zodResolver(subjectSchema),
    defaultValues: initial,
  })
  const levelId = useWatch({ control: form.control, name: "educationLevelId" })
  const level = structure.levels.find((l) => l.id === levelId)
  const programs = structure.programs.filter((p) => (!levelId || p.educationLevelId === levelId) && (p.isActive || p.id === initial.programId))

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    const result = await saveSubjectAction(subjectId, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: subjectId ? "Subject updated" : "Subject created", type: "success" })
    router.push(`/dashboard/subjects/${result.data.id}`)
    router.refresh()
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {error && <FormAlert tone="error">{error}</FormAlert>}

      <Card className="gap-4 p-5">
        <h2 className="font-semibold">Basic information</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_10rem]">
          <TextField control={form.control} name="name" label="Name" required placeholder="Mathematics, Business Statistics…" />
          <TextField control={form.control} name="localName" label="Name in Nepali" placeholder="गणित" />
          <TextField control={form.control} name="code" label="Code" required placeholder="MTH8" description="Unique in your organisation." />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="categoryId"
            label="Category"
            placeholder={categories.length ? "None" : "No categories yet"}
            options={categories.filter((c) => c.isActive || c.id === initial.categoryId).map((c) => ({ value: c.id, label: c.name }))}
          />
          <SelectField
            control={form.control}
            name="requirement"
            label="Default type"
            options={requirementOptions}
            description="Each class can still take it as compulsory, elective or optional."
          />
        </div>
        <TextAreaField control={form.control} name="description" label="Description" rows={3} />
        <SwitchField control={form.control} name="isActive" label="Active" description="Inactive subjects can't be added to classes or teachers." />
      </Card>

      <Card className="gap-4 p-5">
        <div>
          <h2 className="font-semibold">Academic configuration</h2>
          <p className="text-sm text-muted-foreground">All optional. Leave the level empty for a subject used at several levels.</p>
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
          {(level?.usesPrograms || (!levelId && programs.length > 0)) && (
            <SelectField
              control={form.control}
              name="programId"
              label="Program"
              placeholder="Any program"
              options={programs.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
            />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <TextField control={form.control} name="creditHours" label="Credit hours" type="number" min={0} step="0.25" placeholder="e.g. 3.75" />
          <TextField control={form.control} name="theoryHours" label="Theory hours" type="number" min={0} />
          <TextField control={form.control} name="practicalHours" label="Practical hours" type="number" min={0} />
          <TextField control={form.control} name="weeklyPeriods" label="Periods / week" type="number" min={0} max={60} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField control={form.control} name="medium" label="Language of instruction" placeholder="—" options={mediumOptions} />
          <TextField control={form.control} name="sortOrder" label="Display order" type="number" min={0} />
        </div>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner />}
          {subjectId ? "Save changes" : "Create subject"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={form.formState.isSubmitting}>
          Cancel
        </Button>
      </div>
      {!subjectId && (
        <p className="text-sm text-muted-foreground">
          After saving you can add its curriculum, prerequisites and the classes that study it.
        </p>
      )}
    </form>
  )
}
