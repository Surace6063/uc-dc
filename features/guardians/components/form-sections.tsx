"use client"

import * as React from "react"
import { CheckIcon, SearchIcon } from "lucide-react"
import { useFormContext, useWatch, type FieldValues } from "react-hook-form"

import { labelOptions } from "@/components/shared/filter-controls"
import { SelectField, SwitchField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { searchStudentsForLinkingAction } from "@/features/guardians/actions"
import {
  CONTACT_METHOD_LABELS,
  GENDER_LABELS,
  LANGUAGE_SUGGESTIONS,
  LINK_FLAGS,
  RELATIONSHIP_LABELS,
} from "@/features/guardians/constants"
import type { GuardianProfileInput, LinkSettingsInput } from "@/features/guardians/schemas"
import { AddressFields, emptyAddress } from "@/features/students/components/form-sections"

// Sections shared by the create and edit forms and the link dialogs. They
// read the form from context and take a `prefix` so they work in any form.

const p = (prefix: string, name: string) => (prefix ? `${prefix}.${name}` : name)

export function GuardianPersonalFields({ prefix = "profile", showSensitive }: { prefix?: string; showSensitive: boolean }) {
  const { control } = useFormContext<FieldValues>()
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p(prefix, "fullName")} label="Full name" required autoComplete="off" className="sm:col-span-2" />
        <TextField control={control} name={p(prefix, "guardianCode")} label="Guardian ID" placeholder="Generated if blank" autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField control={control} name={p(prefix, "gender")} label="Gender" placeholder="Not specified" options={labelOptions(GENDER_LABELS)} />
        {showSensitive && <TextField control={control} name={p(prefix, "dateOfBirth")} label="Date of birth (AD)" type="date" description="Optional." />}
        <TextField control={control} name={p(prefix, "nationality")} label="Nationality" placeholder="Nepali" />
      </div>
    </div>
  )
}

export function GuardianContactFields({ prefix = "profile" }: { prefix?: string }) {
  const { control } = useFormContext<FieldValues>()
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={control} name={p(prefix, "phone")} label="Phone" type="tel" required placeholder="98XXXXXXXX" description="Mobile or landline; +977 or other country codes are fine." />
        <TextField control={control} name={p(prefix, "alternatePhone")} label="Alternate phone" type="tel" />
        <TextField control={control} name={p(prefix, "email")} label="Email" type="email" description="Optional. Needed only for a portal account." />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField control={control} name={p(prefix, "preferredContactMethod")} label="Preferred contact" placeholder="No preference" options={labelOptions(CONTACT_METHOD_LABELS)} />
        <TextField control={control} name={p(prefix, "preferredLanguage")} label="Preferred language" placeholder="Nepali" list="guardian-languages" />
        <datalist id="guardian-languages">
          {LANGUAGE_SUGGESTIONS.map((l) => <option key={l} value={l} />)}
        </datalist>
      </div>
    </div>
  )
}

export function GuardianProfessionalFields({ prefix = "profile" }: { prefix?: string }) {
  const { control } = useFormContext<FieldValues>()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField control={control} name={p(prefix, "occupation")} label="Occupation" placeholder="Business, farmer, teacher, abroad…" />
      <TextField control={control} name={p(prefix, "workplace")} label="Workplace" />
    </div>
  )
}

export function GuardianAddressFields({ prefix = "profile" }: { prefix?: string }) {
  const { control } = useFormContext<FieldValues>()
  const same = useWatch({ control, name: p(prefix, "sameAsPermanent") })
  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <h3 className="text-sm font-medium">Permanent address</h3>
        <AddressFields prefix={p(prefix, "permanentAddress")} />
      </div>
      <SwitchField control={control} name={p(prefix, "sameAsPermanent")} label="Temporary address is the same" description="Turn off if the guardian currently lives elsewhere." />
      {!same && (
        <div className="grid gap-3">
          <h3 className="text-sm font-medium">Temporary address</h3>
          <AddressFields prefix={p(prefix, "temporaryAddress")} />
        </div>
      )}
      <TextAreaField control={control} name={p(prefix, "address")} label="Address notes" rows={2} description="Free text, e.g. directions or an address entered at admission." />
    </div>
  )
}

// Relationship, contact roles, notifications and portal permission for one
// guardian ↔ student link.
export function LinkSettingsFields({ prefix }: { prefix: string }) {
  const { control } = useFormContext<FieldValues>()
  return (
    <div className="grid gap-3">
      <SelectField control={control} name={p(prefix, "relationship")} label="Relationship to the student" required options={labelOptions(RELATIONSHIP_LABELS)} className="sm:max-w-xs" />
      <div className="grid gap-2 sm:grid-cols-2">
        {LINK_FLAGS.map((flag) => (
          <SwitchField key={flag.key} control={control} name={p(prefix, flag.key)} label={flag.label} description={flag.description} />
        ))}
      </div>
      <TextField control={control} name={p(prefix, "notes")} label="Notes" placeholder="e.g. Lives with the student on weekdays" />
    </div>
  )
}

export function defaultLinkSettings(overrides: Partial<LinkSettingsInput> = {}): LinkSettingsInput {
  return {
    relationship: "FATHER",
    isPrimary: false,
    isEmergencyContact: true,
    canPickupStudent: false,
    receivesAcademicNotifications: true,
    receivesAttendanceNotifications: true,
    receivesBillingNotifications: false,
    receivesGeneralAnnouncements: true,
    // Set deliberately per student; a profile alone never grants access.
    canAccessStudentPortalData: false,
    notes: "",
    ...overrides,
  }
}

export const emptyProfile: GuardianProfileInput = {
  guardianCode: "",
  fullName: "",
  gender: "",
  dateOfBirth: "",
  nationality: "Nepali",
  phone: "",
  alternatePhone: "",
  email: "",
  preferredContactMethod: "",
  preferredLanguage: "",
  occupation: "",
  workplace: "",
  address: "",
  permanentAddress: { ...emptyAddress },
  sameAsPermanent: true,
  temporaryAddress: { ...emptyAddress },
}

export type StudentOption = {
  id: string
  name: string
  admissionNumber: string
  placement: string | null
  guardianCount: number
  alreadyLinked: boolean
}

// Search students by name or admission number. Results are already scoped to
// the organisation on the server; nothing is linked until the form is saved.
export function StudentPicker({
  guardianId,
  excludeIds,
  onPick,
}: {
  guardianId?: string
  excludeIds: string[]
  onPick: (student: StudentOption) => void
}) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<StudentOption[] | null>(null)
  const [searching, setSearching] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function search() {
    if (query.trim().length < 2) return setError("Type at least 2 characters.")
    setError(null)
    setSearching(true)
    const result = await searchStudentsForLinkingAction(query, guardianId)
    setSearching(false)
    if (!result.ok) return setError(result.error)
    setResults(result.data)
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
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
            placeholder="Student name or admission number…"
            className="h-9 pl-8"
            aria-label="Search students to link"
          />
        </div>
        <Button type="button" variant="outline" onClick={search} disabled={searching}>
          Search
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {results && (
        results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching students.</p>
        ) : (
          <ul className="grid gap-1 rounded-lg border p-1" aria-label="Matching students">
            {results.map((s) => {
              const picked = excludeIds.includes(s.id)
              const disabled = picked || s.alreadyLinked
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(s)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground"> · {s.admissionNumber}</span>
                      {s.placement && <span className="block truncate text-xs text-muted-foreground">{s.placement}</span>}
                    </span>
                    {s.alreadyLinked ? (
                      <Badge variant="secondary">Already linked</Badge>
                    ) : picked ? (
                      <CheckIcon className="size-4 text-emerald-600" />
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {s.guardianCount ? `${s.guardianCount} guardian${s.guardianCount === 1 ? "" : "s"}` : "No guardians"}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )
      )}
    </div>
  )
}
