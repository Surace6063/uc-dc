"use client"

import { useFormContext, useWatch, type FieldValues } from "react-hook-form"

import { SelectField } from "@/components/shared/form-fields"
import type { TeachingOptions } from "@/services/teaching/options-service"

// Year → class → section → subject for teaching forms, offering only what
// the teacher is assigned to teach (the server checks the same rule).
// A whole-class assignment allows "Whole class" or any one section.

export function placeChoices(options: TeachingOptions, yearId: string, classId: string, sectionId: string) {
  const inYear = options.places.filter((p) => p.academicYearId === yearId)
  const classes = [...new Map(inYear.map((p) => [p.classId, { value: p.classId, label: p.className }])).values()]
  const forClass = inYear.filter((p) => p.classId === classId)
  const whole = forClass.some((p) => p.sectionId === null)
  const sections = whole
    ? [{ value: "", label: "Whole class" }, ...(forClass[0]?.sections ?? []).map((s) => ({ value: s.id, label: `Section ${s.name}` }))]
    : forClass.filter((p) => p.sectionId).map((p) => ({ value: p.sectionId!, label: `Section ${p.sectionName}` }))
  // Subjects taught to the whole class, or to the chosen section.
  const subjects = [
    ...new Map(
      forClass
        .filter((p) => p.sectionId === null || p.sectionId === (sectionId || null))
        .flatMap((p) => p.subjects)
        .map((s) => [s.id, { value: s.id, label: s.name }])
    ).values(),
  ]
  return { classes, sections, subjects, whole }
}

export function PlaceFields({
  options,
  subject = "required",
}: {
  options: TeachingOptions
  // "required" (lesson plans, materials, assignments), "optional"
  // (timetable periods) or "none" (class notices).
  subject?: "required" | "optional" | "none"
}) {
  const { control, setValue } = useFormContext<FieldValues>()
  const yearId = useWatch({ control, name: "academicYearId" }) ?? ""
  const classId = useWatch({ control, name: "classId" }) ?? ""
  const sectionId = useWatch({ control, name: "sectionId" }) ?? ""
  const years = options.years.filter((y) => options.places.some((p) => p.academicYearId === y.id))
  const { classes, sections, subjects } = placeChoices(options, yearId, classId, sectionId)
  const clear = (...names: string[]) => names.forEach((n) => setValue(n, "", { shouldValidate: false }))

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        control={control}
        name="academicYearId"
        label="Academic year"
        required
        placeholder="Choose"
        options={years.map((y) => ({ value: y.id, label: `${y.name}${y.isCurrent ? " (current)" : ""}` }))}
        onValueChange={() => clear("classId", "sectionId", "subjectId")}
      />
      <SelectField
        control={control}
        name="classId"
        label="Class"
        required
        placeholder={classes.length ? "Choose" : "No classes assigned this year"}
        options={classes}
        onValueChange={() => clear("sectionId", "subjectId")}
      />
      <SelectField
        control={control}
        name="sectionId"
        label="Section"
        placeholder={sections[0]?.value === "" ? "Whole class" : "Choose"}
        options={sections.filter((s) => s.value !== "")}
        disabled={!classId}
        onValueChange={() => clear("subjectId")}
      />
      {subject !== "none" && (
        <SelectField
          control={control}
          name="subjectId"
          label="Subject"
          required={subject === "required"}
          placeholder={subject === "optional" ? "No subject" : subjects.length ? "Choose" : "No subjects assigned here"}
          options={subjects}
          disabled={!classId}
        />
      )}
    </div>
  )
}
