"use client"

import * as React from "react"
import { SearchIcon, UserRoundCheckIcon, XIcon } from "lucide-react"
import { useFormContext, useWatch, type FieldValues } from "react-hook-form"

import {
  SelectField,
  SwitchField,
  TextAreaField,
  TextField,
} from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { searchGuardiansAction } from "@/features/students/actions"
import {
  ADMISSION_TYPE_LABELS,
  ENROLLMENT_TYPE_LABELS,
  GENDER_LABELS,
  RELATIONSHIP_LABELS,
} from "@/features/students/constants"
import { BLOOD_GROUPS } from "@/features/students/schemas"
import { districtsOf, PROVINCES } from "@/lib/nepal/locations"
import type { EducationStructure } from "@/services/academics/structure-service"

// Form sections shared by the admission wizard, the edit form and the
// enrollment dialogs. They read the form from context and take a `prefix`
// (e.g. "personal", "enrollment", "next") so the same fields work in any form.

const options = <K extends string>(labels: Record<K, string>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }))

function useForm() {
  return useFormContext<FieldValues>()
}

export function PersonalFields({ prefix = "personal", showSensitive }: { prefix?: string; showSensitive: boolean }) {
  const { control } = useForm()
  const p = (name: string) => (prefix ? `${prefix}.${name}` : name)
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("firstName")} label="First name" required autoComplete="off" />
        <TextField control={control} name={p("middleName")} label="Middle name" autoComplete="off" />
        <TextField control={control} name={p("lastName")} label="Last name" required autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("dateOfBirth")} label="Date of birth (AD)" type="date" />
        <SelectField control={control} name={p("gender")} label="Gender" placeholder="Not specified" options={options(GENDER_LABELS)} />
        <TextField control={control} name={p("nationality")} label="Nationality" placeholder="Nepali" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("email")} label="Email" type="email" description="Optional; for older students." />
        <TextField control={control} name={p("phone")} label="Phone" type="tel" />
        <TextField control={control} name={p("alternatePhone")} label="Alternate phone" type="tel" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          control={control}
          name={p("bloodGroup")}
          label="Blood group"
          placeholder="Unknown"
          options={BLOOD_GROUPS.map((g) => ({ value: g, label: g }))}
        />
        <TextField control={control} name={p("motherTongue")} label="Mother tongue" placeholder="Nepali, Maithili, Newari…" />
      </div>
      {showSensitive && (
        <TextAreaField
          control={control}
          name={p("medicalNotes")}
          label="Medical notes"
          rows={2}
          description="Restricted: only visible to roles allowed to see sensitive details. Record only what the school needs."
        />
      )}
    </div>
  )
}

export function AddressFields({ prefix, disabled }: { prefix: string; disabled?: boolean }) {
  const { control, setValue } = useForm()
  const p = (name: string) => (prefix ? `${prefix}.${name}` : name)
  const province = useWatch({ control, name: p("province") })
  const provinceId = Number(province) || null
  return (
    <fieldset disabled={disabled} className="grid gap-4 disabled:opacity-60">
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          control={control}
          name={p("province")}
          label="Province"
          placeholder="Choose"
          options={PROVINCES.map((pr) => ({ value: String(pr.id), label: `${pr.id}. ${pr.name}` }))}
          onValueChange={() => setValue(p("district"), "")}
          disabled={disabled}
        />
        <SelectField
          control={control}
          name={p("district")}
          label="District"
          placeholder={provinceId ? "Choose" : "Choose a province first"}
          options={districtsOf(provinceId).map((d) => ({ value: d, label: d }))}
          disabled={disabled || !provinceId}
        />
        <TextField control={control} name={p("municipality")} label="Municipality / rural municipality" />
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <TextField control={control} name={p("wardNumber")} label="Ward no." type="number" min={1} max={40} />
        <TextField control={control} name={p("tole")} label="Tole / locality" />
        <TextField control={control} name={p("street")} label="Street / house" />
        <TextField control={control} name={p("postalCode")} label="Postal code" />
      </div>
    </fieldset>
  )
}

export function AdmissionFields({
  prefix = "admission",
  automaticNumbering,
}: {
  prefix?: string
  automaticNumbering: boolean
}) {
  const { control } = useForm()
  const p = (name: string) => (prefix ? `${prefix}.${name}` : name)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        control={control}
        name={p("admissionNumber")}
        label="Admission number"
        required={!automaticNumbering}
        placeholder={automaticNumbering ? "Generated automatically" : ""}
        description={automaticNumbering ? "Leave blank to generate the next number." : "Unique within your organisation."}
      />
      <TextField control={control} name={p("admissionDate")} label="Admission date (AD)" type="date" required />
      <SelectField control={control} name={p("admissionType")} label="Admission type" options={options(ADMISSION_TYPE_LABELS)} />
      <TextField control={control} name={p("previousSchool")} label="Previous school / college" />
    </div>
  )
}

// Year → level → program (if the level uses programs) → class → section,
// each list filtered by the choices above it. Changing a parent clears the
// children that no longer fit. The server re-validates every relationship.
export function PlacementFields({
  prefix,
  structure,
  showType = true,
  showDate = true,
  rollNumberAutomatic,
}: {
  prefix: string
  structure: EducationStructure
  showType?: boolean
  showDate?: boolean
  rollNumberAutomatic: boolean
}) {
  const { control, setValue } = useForm()
  const p = (name: string) => (prefix ? `${prefix}.${name}` : name)
  const levelId = useWatch({ control, name: p("educationLevelId") })
  const programId = useWatch({ control, name: p("programId") })
  const classId = useWatch({ control, name: p("classId") })

  const level = structure.levels.find((l) => l.id === levelId)
  const years = structure.years.filter((y) => y.status !== "ARCHIVED")
  const levels = structure.levels.filter((l) => l.isActive)
  const programs = structure.programs.filter((p) => p.isActive && p.educationLevelId === levelId)
  const classes = structure.classes.filter(
    (c) => c.isActive && c.educationLevelId === levelId && (level?.usesPrograms ? c.programId === programId : c.programId === null)
  )
  const sections = structure.sections.filter((s) => s.isActive && s.classId === classId)
  const batches = structure.batches.filter((b) => b.isActive && (!b.programId || b.programId === programId))
  const clear = (...names: string[]) => names.forEach((n) => setValue(p(n), "", { shouldValidate: false }))

  const groupLabel = classes[0]?.kind === "SEMESTER" ? "Semester" : classes[0]?.kind === "YEAR" ? "Year" : "Class"

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={control}
          name={p("academicYearId")}
          label="Academic year"
          required
          placeholder="Choose"
          options={years.map((y) => ({ value: y.id, label: `${y.name}${y.isCurrent ? " (current)" : ""}` }))}
        />
        <SelectField
          control={control}
          name={p("educationLevelId")}
          label="Education level"
          required
          placeholder="Choose"
          options={levels.map((l) => ({ value: l.id, label: l.name }))}
          onValueChange={() => clear("programId", "classId", "sectionId", "batchId")}
        />
        {level?.usesPrograms && (
          <SelectField
            control={control}
            name={p("programId")}
            label="Program"
            required
            placeholder={programs.length ? "Choose" : "No programs in this level"}
            options={programs.map((pr) => ({ value: pr.id, label: `${pr.name} (${pr.code})` }))}
            onValueChange={() => clear("classId", "sectionId", "batchId")}
          />
        )}
        <SelectField
          control={control}
          name={p("classId")}
          label={groupLabel}
          required
          placeholder={!levelId ? "Choose a level first" : level?.usesPrograms && !programId ? "Choose a program first" : classes.length ? "Choose" : "No classes configured"}
          options={classes.map((c) => ({ value: c.id, label: c.name }))}
          disabled={!levelId || (level?.usesPrograms && !programId)}
          onValueChange={() => clear("sectionId")}
        />
        {sections.length > 0 && (
          <SelectField
            control={control}
            name={p("sectionId")}
            label="Section"
            placeholder="No section"
            options={sections.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}
        {batches.length > 0 && (
          <SelectField
            control={control}
            name={p("batchId")}
            label="Batch"
            placeholder="No batch"
            options={batches.map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
        <TextField
          control={control}
          name={p("rollNumber")}
          label="Roll number"
          placeholder={rollNumberAutomatic ? "Next free number" : ""}
          description={rollNumberAutomatic ? "Leave blank to assign automatically." : undefined}
        />
        {showDate && <TextField control={control} name={p("enrollmentDate")} label="Enrollment date (AD)" type="date" />}
        {showType && (
          <SelectField control={control} name={p("enrollmentType")} label="Enrollment type" options={options(ENROLLMENT_TYPE_LABELS)} />
        )}
      </div>
      {structure.levels.length === 0 || structure.years.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Set up academic years, levels and classes under Academics → Education structure first.
        </p>
      ) : null}
    </div>
  )
}

type GuardianMatch = { id: string; fullName: string; phone: string | null; email: string | null; children: string[] }

// One guardian: link an existing guardian (siblings) or enter a new one.
export function GuardianFields({ prefix, onRemove }: { prefix: string; onRemove?: () => void }) {
  const { control, setValue } = useForm()
  const p = (name: string) => (prefix ? `${prefix}.${name}` : name)
  const guardianId = useWatch({ control, name: p("guardianId") })
  const linkedName = useWatch({ control, name: p("fullName") })
  const [query, setQuery] = React.useState("")
  const [matches, setMatches] = React.useState<GuardianMatch[]>([])
  const [searching, setSearching] = React.useState(false)

  async function search() {
    if (query.trim().length < 2) return
    setSearching(true)
    const result = await searchGuardiansAction(query)
    setSearching(false)
    setMatches(result.ok ? result.data : [])
  }

  function link(match: GuardianMatch) {
    setValue(p("guardianId"), match.id)
    setValue(p("fullName"), match.fullName)
    setValue(p("phone"), match.phone ?? "")
    setValue(p("email"), match.email ?? "")
    setMatches([])
    setQuery("")
  }

  function unlink() {
    setValue(p("guardianId"), "")
    setValue(p("fullName"), "")
    setValue(p("phone"), "")
    setValue(p("email"), "")
  }

  return (
    <div className="grid gap-4 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        {guardianId ? (
          <p className="flex items-center gap-2 text-sm">
            <UserRoundCheckIcon className="size-4 text-emerald-600" />
            Linked to existing guardian <span className="font-medium">{linkedName}</span>
            <Button type="button" size="xs" variant="ghost" onClick={unlink}>
              Change
            </Button>
          </p>
        ) : (
          <div className="flex w-full max-w-md items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    search()
                  }
                }}
                placeholder="Find an existing guardian (siblings)…"
                className="h-8 pl-8"
                aria-label="Search existing guardians"
              />
            </div>
            <Button type="button" size="sm" variant="outline" onClick={search} disabled={searching}>
              Search
            </Button>
          </div>
        )}
        {onRemove && (
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove guardian" onClick={onRemove}>
            <XIcon />
          </Button>
        )}
      </div>
      {matches.length > 0 && (
        <ul className="grid gap-1 rounded-lg border p-1">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => link(m)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span>
                  <span className="font-medium">{m.fullName}</span>
                  {m.phone && <span className="text-muted-foreground"> · {m.phone}</span>}
                </span>
                {m.children.length > 0 && (
                  <span className="truncate text-xs text-muted-foreground">Guardian of {m.children.join(", ")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p("fullName")} label="Full name" required disabled={Boolean(guardianId)} />
        <SelectField control={control} name={p("relationship")} label="Relationship" required options={options(RELATIONSHIP_LABELS)} />
        <TextField control={control} name={p("phone")} label="Phone" type="tel" disabled={Boolean(guardianId)} />
      </div>
      {!guardianId && (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField control={control} name={p("alternatePhone")} label="Alternate phone" type="tel" />
          <TextField control={control} name={p("email")} label="Email" type="email" />
          <TextField control={control} name={p("occupation")} label="Occupation" />
          <TextField control={control} name={p("address")} label="Address" className="sm:col-span-3" />
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <SwitchField control={control} name={p("isPrimary")} label="Primary contact" />
        <SwitchField control={control} name={p("isEmergencyContact")} label="Emergency contact" />
        <SwitchField control={control} name={p("receivesAcademicNotifications")} label="Academic notifications" />
        <SwitchField control={control} name={p("receivesBillingNotifications")} label="Billing notifications" />
      </div>
    </div>
  )
}

export const emptyGuardian = {
  guardianId: "",
  fullName: "",
  phone: "",
  alternatePhone: "",
  email: "",
  occupation: "",
  address: "",
  relationship: "FATHER",
  isPrimary: false,
  isEmergencyContact: true,
  receivesAcademicNotifications: true,
  receivesBillingNotifications: false,
} as const

export const emptyAddress = {
  province: "",
  district: "",
  municipality: "",
  wardNumber: "",
  tole: "",
  street: "",
  postalCode: "",
}
