"use client"

import * as React from "react"

import { FieldError, FormAlert, SubmitButton } from "@/components/shared/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { createOrganization } from "@/features/organizations/actions"
import { organizationTypeLabels } from "@/features/organizations/schemas"

export function CreateOrganizationForm() {
  const [state, action, pending] = React.useActionState(createOrganization, undefined)
  const failed = state && !state.ok ? state : undefined
  const values = failed?.values

  return (
    <form action={action} className="space-y-5" noValidate>
      {failed && <FormAlert tone="error">{failed.error}</FormAlert>}

      <div className="space-y-2">
        <Label htmlFor="name">Organisation name</Label>
        <Input
          key={`name-${values?.name}`}
          id="name"
          name="name"
          placeholder="e.g. ABC International School"
          defaultValue={values?.name}
          aria-invalid={failed?.fieldErrors?.name ? true : undefined}
          aria-describedby="name-error"
          required
          className="h-11"
        />
        <FieldError id="name-error" errors={failed?.fieldErrors?.name} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">Type</Label>
        <NativeSelect
          key={`type-${values?.type}`}
          id="type"
          name="type"
          defaultValue={values?.type ?? "SCHOOL"}
          aria-invalid={failed?.fieldErrors?.type ? true : undefined}
          aria-describedby="type-error"
          className="h-11 w-full"
        >
          {Object.entries(organizationTypeLabels).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldError id="type-error" errors={failed?.fieldErrors?.type} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="country">
          Country <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          key={`country-${values?.country}`}
          id="country"
          name="country"
          autoComplete="country-name"
          placeholder="e.g. Nepal"
          defaultValue={values?.country}
          aria-describedby="country-error"
          className="h-11"
        />
        <FieldError id="country-error" errors={failed?.fieldErrors?.country} />
      </div>

      <SubmitButton pending={pending} pendingLabel="Creating organisation…">
        Create organisation
      </SubmitButton>
    </form>
  )
}
