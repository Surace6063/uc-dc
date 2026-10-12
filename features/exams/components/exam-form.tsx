"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { FormAlert } from "@/components/shared/form"
import { applyServerErrors, SelectField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { saveExaminationAction } from "@/features/exams/actions"
import { examinationSchema } from "@/features/exams/schemas"
import type { ExaminationStatus, GradingScaleStatus } from "@/lib/generated/prisma/enums"

export type ExamFormOptions = {
  years: { id: string; name: string; isCurrent: boolean }[]
  types: { id: string; name: string }[]
  levels: { id: string; name: string }[]
  programs: { id: string; name: string; educationLevelId: string }[]
  scales: { id: string; name: string; version: number; status: GradingScaleStatus; isDefault: boolean }[]
  policies: { id: string; name: string; isDefault: boolean; gradingScaleId: string | null; educationLevelId: string | null }[]
}

type Values = z.input<typeof examinationSchema>

export function ExamForm({
  examId,
  status,
  initial,
  options,
}: {
  examId: string | null
  status: ExaminationStatus | null
  initial: Values | null
  options: ExamFormOptions
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const defaultPolicy = options.policies.find((p) => p.isDefault) ?? options.policies[0]
  const defaultScale = defaultPolicy?.gradingScaleId ?? options.scales.find((s) => s.isDefault)?.id ?? options.scales.find((s) => s.status === "ACTIVE")?.id ?? ""
  const form = useForm<Values, unknown, z.output<typeof examinationSchema>>({
    resolver: zodResolver(examinationSchema),
    defaultValues: initial ?? {
      academicYearId: options.years.find((y) => y.isCurrent)?.id ?? options.years[0]?.id ?? "",
      assessmentTypeId: "",
      name: "",
      code: "",
      description: "",
      educationLevelId: "",
      programId: "",
      term: "",
      startDate: "",
      endDate: "",
      resultPublicationDate: "",
      gradingScaleId: defaultScale,
      resultPolicyId: defaultPolicy?.id ?? "",
    },
  })
  const level = useWatch({ control: form.control, name: "educationLevelId" })
  // Scope, year and rules are fixed once marks can be entered.
  const frozen = status !== null && status !== "DRAFT"

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    const result = await saveExaminationAction(examId, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: result.message ?? "Saved", type: "success" })
    router.push(`/dashboard/exams/${result.data.id}`)
    router.refresh()
  })

  const scaleLabel = (s: ExamFormOptions["scales"][number]) => `${s.name} v${s.version}${s.status === "DRAFT" ? " (draft — activate before scheduling)" : ""}`

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <Card className="grid gap-4 p-5">
        <h2 className="font-semibold">Examination</h2>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <TextField control={form.control} name="name" label="Name" required placeholder="First Terminal Examination 2082" />
          <TextField control={form.control} name="code" label="Code" placeholder="FT-2082" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField control={form.control} name="academicYearId" label="Academic year" required disabled={frozen} options={options.years.map((y) => ({ value: y.id, label: y.name }))} placeholder="Choose…" />
          <SelectField control={form.control} name="assessmentTypeId" label="Assessment type" required options={options.types.map((t) => ({ value: t.id, label: t.name }))} placeholder="Choose…" />
          <TextField control={form.control} name="term" label="Term / semester" placeholder="First term" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="educationLevelId"
            label="Level"
            description="Optional: limits the subjects offered when adding them."
            options={options.levels.map((l) => ({ value: l.id, label: l.name }))}
            placeholder="Any level"
            onValueChange={() => form.setValue("programId", "")}
          />
          <SelectField
            control={form.control}
            name="programId"
            label="Program"
            options={options.programs.filter((p) => !level || p.educationLevelId === level).map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Any program"
          />
        </div>
        <TextAreaField control={form.control} name="description" label="Description" rows={2} />
      </Card>

      <Card className="grid gap-4 p-5">
        <h2 className="font-semibold">Dates</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField control={form.control} name="startDate" label="Starts (AD)" type="date" required />
          <TextField control={form.control} name="endDate" label="Ends (AD)" type="date" required />
          <TextField control={form.control} name="resultPublicationDate" label="Planned result date" type="date" />
        </div>
      </Card>

      <Card className="grid gap-4 p-5">
        <div>
          <h2 className="font-semibold">Grading and result rules</h2>
          <p className="text-sm text-muted-foreground">
            Configured under Grading & policies. They are fixed once the examination is scheduled, and the exact rules are kept with approved and published results.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="resultPolicyId"
            label="Result policy"
            required
            disabled={frozen}
            options={options.policies.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Choose…"
            onValueChange={(v) => {
              const scale = options.policies.find((p) => p.id === v)?.gradingScaleId
              if (scale) form.setValue("gradingScaleId", scale)
            }}
          />
          <SelectField control={form.control} name="gradingScaleId" label="Grading scale" required disabled={frozen} options={options.scales.map((s) => ({ value: s.id, label: scaleLabel(s) }))} placeholder="Choose…" />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner />}
          {examId ? "Save changes" : "Create examination"}
        </Button>
      </div>
    </form>
  )
}
