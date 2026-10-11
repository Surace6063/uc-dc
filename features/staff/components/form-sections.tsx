"use client"

import { useFormContext, useWatch, type FieldValues } from "react-hook-form"

import { labelOptions } from "@/components/shared/filter-controls"
import { SelectField, SwitchField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { GENDER_LABELS } from "@/features/students/constants"
import {
  FIXED_TERM_TYPES,
  QUALIFICATION_KIND_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  STAFF_EMPLOYMENT_STATUS_LABELS,
  STAFF_EMPLOYMENT_TYPE_LABELS,
  STAFF_LEFT_STATUSES,
} from "@/features/staff/constants"
import type { StaffEmploymentStatus, StaffEmploymentType } from "@/lib/generated/prisma/enums"
import type { StaffFormOptions } from "@/services/staff/config-service"

// Sections shared by the add-staff wizard, the edit form and the profile
// dialogs. They read the form from context; `prefix` places the fields.

const path = (prefix: string, name: string) => (prefix ? `${prefix}.${name}` : name)

export function StaffPersonalFields({ prefix = "personal", showSensitive }: { prefix?: string; showSensitive: boolean }) {
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

export function StaffContactFields({ prefix = "contact", showSensitive }: { prefix?: string; showSensitive: boolean }) {
  const { control } = useFormContext<FieldValues>()
  const p = (n: string) => path(prefix, n)
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("phone")} label="Phone" type="tel" description="Mobile preferred." />
        <TextField control={control} name={p("alternatePhone")} label="Alternate phone" type="tel" />
        <TextField control={control} name={p("email")} label="Email" type="email" />
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

// Department → designation. Designations with a usual department are listed
// for that department first; any staff designation can still be chosen.
export function DepartmentDesignationFields({
  prefix = "employment",
  options,
  managers = [],
  current,
}: {
  prefix?: string
  options: StaffFormOptions
  managers?: { id: string; name: string }[]
  // Currently held (possibly inactive) choices stay selectable.
  current?: { departmentId?: string | null; designationId?: string | null }
}) {
  const { control } = useFormContext<FieldValues>()
  const p = (n: string) => path(prefix, n)
  const departmentId = useWatch({ control, name: p("departmentId") }) as string | undefined
  const departments = options.departments.filter((d) => d.isActive || d.id === current?.departmentId)
  const designations = options.designations
    .filter((d) => d.isActive || d.id === current?.designationId)
    .sort((a, b) => Number(b.departmentId === departmentId) - Number(a.departmentId === departmentId))
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <SelectField
        control={control}
        name={p("departmentId")}
        label="Department"
        placeholder={departments.length ? "Not set" : "Add departments in Staff settings"}
        options={departments.map((d) => ({ value: d.id, label: d.name }))}
      />
      <SelectField
        control={control}
        name={p("designationId")}
        label="Designation"
        placeholder={designations.length ? "Not set" : "Add designations in Staff settings"}
        description="A job title. It never grants system access."
        options={designations.map((d) => ({ value: d.id, label: d.name }))}
      />
      {managers.length > 0 && (
        <SelectField control={control} name={p("reportingToId")} label="Reports to" placeholder="No one" options={managers.map((m) => ({ value: m.id, label: m.name }))} />
      )}
    </div>
  )
}

// Type, status, dates, contract, probation and (when leaving) leaving details.
export function StaffEmploymentFields({ prefix = "employment", showNotes = true }: { prefix?: string; showNotes?: boolean }) {
  const { control } = useFormContext<FieldValues>()
  const p = (n: string) => path(prefix, n)
  const onProbation = useWatch({ control, name: p("onProbation") })
  const type = useWatch({ control, name: p("employmentType") }) as StaffEmploymentType | undefined
  const status = useWatch({ control, name: p("employmentStatus") }) as StaffEmploymentStatus | undefined
  const leaving = status ? STAFF_LEFT_STATUSES.includes(status) : false
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("dateOfJoining")} label="Date of joining (AD)" type="date" required />
        <SelectField control={control} name={p("employmentType")} label="Employment type" options={labelOptions(STAFF_EMPLOYMENT_TYPE_LABELS)} />
        <SelectField control={control} name={p("employmentStatus")} label="Employment status" options={labelOptions(STAFF_EMPLOYMENT_STATUS_LABELS)} />
      </div>
      {type && FIXED_TERM_TYPES.includes(type) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={control} name={p("contractStartDate")} label="Contract start" type="date" />
          <TextField control={control} name={p("contractEndDate")} label="Contract end" type="date" />
        </div>
      )}
      <div className="grid items-start gap-4 sm:grid-cols-3">
        <SwitchField control={control} name={p("onProbation")} label="On probation" />
        {onProbation && <TextField control={control} name={p("probationStartDate")} label="Probation starts" type="date" />}
        {onProbation && <TextField control={control} name={p("probationEndDate")} label="Probation ends" type="date" />}
      </div>
      {leaving && (
        <div className="grid gap-4 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">Leaving details</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {status === "RESIGNED" && <TextField control={control} name={p("resignationDate")} label="Resignation date" type="date" />}
            {status === "TERMINATED" && <TextField control={control} name={p("terminationDate")} label="Termination date" type="date" />}
            <TextField control={control} name={p("lastWorkingDate")} label="Last working date" type="date" />
          </div>
          <TextAreaField control={control} name={p("leavingReason")} label="Reason for leaving" rows={2} description="Restricted: visible to HR roles only." />
        </div>
      )}
      {showNotes && (
        <TextAreaField
          control={control}
          name={p("employmentNotes")}
          label="Employment notes"
          rows={2}
          description="Private to roles with employment access. Never record salary or bank details here."
        />
      )}
    </div>
  )
}

export function StaffQualificationFields({ prefix }: { prefix: string }) {
  const { control } = useFormContext<FieldValues>()
  const p = (n: string) => path(prefix, n)
  const kind = useWatch({ control, name: p("kind") })
  const academic = kind === "ACADEMIC"
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[12rem_12rem_1fr]">
        <SelectField control={control} name={p("kind")} label="Type" options={labelOptions(QUALIFICATION_KIND_LABELS)} />
        <SelectField
          control={control}
          name={p("level")}
          label="Level"
          required={academic}
          placeholder={academic ? "Choose" : "Not applicable"}
          options={labelOptions(QUALIFICATION_LEVEL_LABELS)}
        />
        <TextField
          control={control}
          name={p("title")}
          label={academic ? "Qualification" : kind === "TRAINING" ? "Training" : "Certification"}
          required
          placeholder={academic ? "BBS, Bachelor in Library Science…" : "CA Inter, CCNA, First Aid…"}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("specialization")} label="Specialization" placeholder="Accounting, Library science…" />
        <TextField control={control} name={p("institutionName")} label={academic ? "College / campus" : "Provider"} />
        <TextField control={control} name={p("awardingBody")} label={academic ? "University / board" : "Issued by"} placeholder={academic ? "Tribhuvan University" : "ICAN, CTEVT…"} />
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <TextField control={control} name={p("country")} label="Country" placeholder="Nepal" />
        <TextField control={control} name={p("completionYear")} label="Year completed (AD)" type="number" />
        <TextField control={control} name={p("result")} label="Grade / GPA / %" />
        {!academic && <TextField control={control} name={p("expiryDate")} label="Valid until" type="date" />}
      </div>
    </div>
  )
}

export function StaffAssignmentFields({ prefix, options }: { prefix: string; options: StaffFormOptions }) {
  const { control } = useFormContext<FieldValues>()
  const p = (n: string) => path(prefix, n)
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem_10rem]">
        <TextField control={control} name={p("title")} label="Responsibility" required placeholder="Library management, Exam duty, Hostel supervision…" />
        <SelectField
          control={control}
          name={p("departmentId")}
          label="Department / unit"
          placeholder="Any"
          options={options.departments.filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name }))}
        />
        <TextField control={control} name={p("startDate")} label="Start date" type="date" required />
      </div>
      <TextField control={control} name={p("notes")} label="Notes" />
    </div>
  )
}

export const emptyStaffQualification = {
  kind: "ACADEMIC", level: "BACHELOR", title: "", specialization: "", institutionName: "", awardingBody: "",
  country: "Nepal", completionYear: "", expiryDate: "", result: "",
} as const

export const emptyStaffAssignment = () => ({
  title: "", departmentId: "", startDate: new Date().toISOString().slice(0, 10), notes: "",
})
