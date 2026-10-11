"use client"

import { useFormContext, useWatch, type FieldValues } from "react-hook-form"

import { SelectField, SwitchField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { labelOptions } from "@/components/shared/filter-controls"
import { GENDER_LABELS } from "@/features/students/constants"
import {
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  TEACHING_ROLE_LABELS,
} from "@/features/teachers/constants"
import type { EducationStructure } from "@/services/academics/structure-service"

// Sections shared by the add-teacher wizard, the edit form and the profile
// dialogs. They read the form from context; `prefix` places the fields.

const path = (prefix: string, name: string) => (prefix ? `${prefix}.${name}` : name)

export function TeacherPersonalFields({ prefix = "personal", showSensitive }: { prefix?: string; showSensitive: boolean }) {
  const { control } = useFormContext<FieldValues>()
  const p = (n: string) => path(prefix, n)
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("firstName")} label="First name" required />
        <TextField control={control} name={p("middleName")} label="Middle name" />
        <TextField control={control} name={p("lastName")} label="Last name" required />
      </div>
      <TextField
        control={control}
        name={p("nameNepali")}
        label="Name in Nepali"
        placeholder="देवनागरीमा पूरा नाम"
        description="Optional, for bilingual records."
        lang="ne"
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {showSensitive && <TextField control={control} name={p("dateOfBirth")} label="Date of birth (AD)" type="date" />}
        <SelectField control={control} name={p("gender")} label="Gender" placeholder="Not specified" options={labelOptions(GENDER_LABELS)} />
        <TextField control={control} name={p("nationality")} label="Nationality" placeholder="Nepali" />
      </div>
    </div>
  )
}

export function TeacherContactFields({ prefix = "contact", showSensitive }: { prefix?: string; showSensitive: boolean }) {
  const { control } = useFormContext<FieldValues>()
  const p = (n: string) => path(prefix, n)
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("email")} label="Email" type="email" description="Work or personal email." />
        <TextField control={control} name={p("phone")} label="Phone" type="tel" />
        <TextField control={control} name={p("alternatePhone")} label="Alternate phone" type="tel" />
      </div>
      {showSensitive && (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField control={control} name={p("emergencyContactName")} label="Emergency contact" />
          <TextField control={control} name={p("emergencyContactRelationship")} label="Relationship" placeholder="Spouse, parent…" />
          <TextField control={control} name={p("emergencyContactPhone")} label="Emergency phone" type="tel" />
        </div>
      )}
    </div>
  )
}

export function EmploymentFields({
  prefix = "employment",
  structure,
  managers = [],
  showContract = true,
}: {
  prefix?: string
  structure: EducationStructure
  managers?: { id: string; name: string }[]
  showContract?: boolean
}) {
  const { control } = useFormContext<FieldValues>()
  const p = (n: string) => path(prefix, n)
  const onProbation = useWatch({ control, name: p("onProbation") })
  const type = useWatch({ control, name: p("employmentType") })
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("dateOfJoining")} label="Date of joining (AD)" type="date" required />
        <SelectField control={control} name={p("employmentType")} label="Employment type" options={labelOptions(EMPLOYMENT_TYPE_LABELS)} />
        <SelectField control={control} name={p("employmentStatus")} label="Employment status" options={labelOptions(EMPLOYMENT_STATUS_LABELS)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          control={control}
          name={p("designationId")}
          label="Designation"
          placeholder={structure.designations.length ? "Not set" : "Add designations in Education structure"}
          options={structure.designations.filter((d) => d.isActive && d.scope !== "NON_TEACHING").map((d) => ({ value: d.id, label: d.name }))}
        />
        <SelectField
          control={control}
          name={p("departmentId")}
          label="Department / faculty"
          placeholder="Not set"
          options={structure.faculties.filter((f) => f.isActive).map((f) => ({ value: f.id, label: f.name }))}
        />
        {managers.length > 0 && (
          <SelectField control={control} name={p("reportingToId")} label="Reports to" placeholder="No one" options={managers.map((m) => ({ value: m.id, label: m.name }))} />
        )}
      </div>
      {showContract && (
        <>
          {(type === "CONTRACT" || type === "TEMPORARY" || type === "VISITING") && (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={control} name={p("contractStartDate")} label="Contract start" type="date" />
              <TextField control={control} name={p("contractEndDate")} label="Contract end" type="date" />
            </div>
          )}
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <SwitchField control={control} name={p("onProbation")} label="On probation" />
            {onProbation && <TextField control={control} name={p("probationEndDate")} label="Probation ends" type="date" />}
          </div>
          <TextAreaField control={control} name={p("employmentNotes")} label="Employment notes" rows={2} description="Visible only to roles that can see employment details. Don't record salary here." />
        </>
      )}
    </div>
  )
}

export function QualificationFields({ prefix }: { prefix: string }) {
  const { control } = useFormContext<FieldValues>()
  const p = (n: string) => path(prefix, n)
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
        <SelectField control={control} name={p("level")} label="Level" required options={labelOptions(QUALIFICATION_LEVEL_LABELS)} />
        <TextField control={control} name={p("title")} label="Qualification" required placeholder="M.Ed. in Mathematics Education" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("specialization")} label="Specialization" placeholder="Mathematics" />
        <TextField control={control} name={p("institutionName")} label="College / campus" />
        <TextField control={control} name={p("awardingBody")} label="University / board" placeholder="Tribhuvan University" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("country")} label="Country" placeholder="Nepal" />
        <TextField control={control} name={p("completionYear")} label="Completion year (AD)" type="number" />
        <TextField control={control} name={p("result")} label="Grade / GPA / %" />
      </div>
    </div>
  )
}

export function CertificationFields({ prefix }: { prefix: string }) {
  const { control } = useFormContext<FieldValues>()
  const p = (n: string) => path(prefix, n)
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={control} name={p("name")} label="Certification / training" required placeholder="Teacher Professional Development (TPD)" />
        <TextField control={control} name={p("issuingOrganization")} label="Issued by" placeholder="CEHRD, British Council…" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("issueDate")} label="Issue date" type="date" />
        <TextField control={control} name={p("expiryDate")} label="Expiry date" type="date" />
        <TextField control={control} name={p("reference")} label="Certificate no." />
      </div>
    </div>
  )
}

// Year → level → program → class → section, plus subject and batch, each
// narrowed by the choices above. Everything except the year is optional so
// schools, +2 colleges and universities can describe what applies.
export function AssignmentFields({ prefix, structure, showDates = true }: { prefix: string; structure: EducationStructure; showDates?: boolean }) {
  const { control, setValue } = useFormContext<FieldValues>()
  const p = (n: string) => path(prefix, n)
  const levelId = useWatch({ control, name: p("educationLevelId") })
  const programId = useWatch({ control, name: p("programId") })
  const classId = useWatch({ control, name: p("classId") })
  const level = structure.levels.find((l) => l.id === levelId)
  const clear = (...names: string[]) => names.forEach((n) => setValue(p(n), ""))

  const programs = structure.programs.filter((x) => x.isActive && (!levelId || x.educationLevelId === levelId))
  const classes = structure.classes.filter(
    (c) => c.isActive && (!levelId || c.educationLevelId === levelId) && (!programId || c.programId === programId)
  )
  const sections = structure.sections.filter((s) => s.isActive && s.classId === classId)
  const subjects = structure.subjects.filter(
    (s) => s.isActive && (!levelId || !s.educationLevelId || s.educationLevelId === levelId) && (!programId || !s.programId || s.programId === programId)
  )
  const batches = structure.batches.filter((b) => b.isActive && (!programId || !b.programId || b.programId === programId))
  const showPrograms = level ? level.usesPrograms : structure.levels.some((l) => l.usesPrograms)

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          control={control}
          name={p("academicYearId")}
          label="Academic year"
          required
          placeholder="Choose"
          options={structure.years.filter((y) => y.status !== "ARCHIVED").map((y) => ({ value: y.id, label: `${y.name}${y.isCurrent ? " (current)" : ""}` }))}
        />
        <SelectField
          control={control}
          name={p("educationLevelId")}
          label="Education level"
          placeholder="Any"
          options={structure.levels.filter((l) => l.isActive).map((l) => ({ value: l.id, label: l.name }))}
          onValueChange={() => clear("programId", "classId", "sectionId", "subjectId", "batchId")}
        />
        {showPrograms && (
          <SelectField
            control={control}
            name={p("programId")}
            label="Program"
            placeholder="Any"
            options={programs.map((x) => ({ value: x.id, label: `${x.name} (${x.code})` }))}
            onValueChange={() => clear("classId", "sectionId", "subjectId", "batchId")}
          />
        )}
        <SelectField
          control={control}
          name={p("classId")}
          label="Class / semester"
          placeholder="Any (whole level or program)"
          options={classes.map((c) => {
            const program = structure.programs.find((x) => x.id === c.programId)
            return { value: c.id, label: `${c.name}${program && !programId ? ` (${program.code})` : ""}` }
          })}
          onValueChange={() => clear("sectionId")}
        />
        {sections.length > 0 && (
          <SelectField control={control} name={p("sectionId")} label="Section" placeholder="All sections" options={sections.map((s) => ({ value: s.id, label: s.name }))} />
        )}
        <SelectField
          control={control}
          name={p("subjectId")}
          label="Subject / course"
          placeholder={structure.subjects.length ? "None" : "Add subjects in Education structure"}
          options={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
        />
        {batches.length > 0 && (
          <SelectField control={control} name={p("batchId")} label="Batch" placeholder="None" options={batches.map((b) => ({ value: b.id, label: b.name }))} />
        )}
        <SelectField control={control} name={p("role")} label="Role" options={labelOptions(TEACHING_ROLE_LABELS)} />
        <TextField control={control} name={p("weeklyPeriods")} label="Periods / hours per week" type="number" min={0} />
        {showDates && <TextField control={control} name={p("startDate")} label="Start date" type="date" required />}
      </div>
      <TextField control={control} name={p("notes")} label="Notes" />
    </div>
  )
}

export const emptyQualification = {
  level: "BACHELOR", title: "", specialization: "", institutionName: "", awardingBody: "", country: "Nepal", completionYear: "", result: "",
} as const

export const emptyCertification = { name: "", issuingOrganization: "", issueDate: "", expiryDate: "", reference: "" }

export function emptyAssignment(structure: EducationStructure) {
  return {
    academicYearId: structure.years.find((y) => y.isCurrent)?.id ?? "",
    educationLevelId: "", programId: "", classId: "", sectionId: "", subjectId: "", batchId: "",
    role: "SUBJECT_TEACHER" as const, startDate: new Date().toISOString().slice(0, 10), weeklyPeriods: "", notes: "",
  }
}
