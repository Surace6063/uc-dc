"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm } from "react-hook-form"

import { FormAlert } from "@/components/shared/form"
import { applyServerErrors, SelectField, SwitchField, TextField } from "@/components/shared/form-fields"
import { labelOptions } from "@/components/shared/filter-controls"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { updatePortalPreferencesAction } from "@/features/guardians/actions"
import { CONTACT_METHOD_LABELS, LANGUAGE_SUGGESTIONS } from "@/features/guardians/constants"
import { portalPreferencesSchema, type PortalPreferencesInput } from "@/features/guardians/schemas"
import type { z } from "zod"

// What a guardian may change about themselves. Fee notices and portal access
// are set by the school and aren't offered here.
export function PortalPreferencesForm({
  initial,
  students,
}: {
  initial: PortalPreferencesInput
  students: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<PortalPreferencesInput, unknown, z.output<typeof portalPreferencesSchema>>({
    resolver: zodResolver(portalPreferencesSchema),
    defaultValues: initial,
  })

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    const result = await updatePortalPreferencesAction(values)
    if (!result.ok) return setError(applyServerErrors(form, result))
    toast.add({ title: "Preferences saved", type: "success" })
    form.reset(values as PortalPreferencesInput)
    router.refresh()
  })

  return (
    <Card className="gap-4 p-5">
      <div>
        <h2 className="text-base font-semibold">My contact preferences</h2>
        <p className="text-sm text-muted-foreground">How the school reaches you, and which notices you receive for each child.</p>
      </div>
      <FormProvider {...form}>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {error && <FormAlert tone="error">{error}</FormAlert>}
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField control={form.control} name="preferredContactMethod" label="Preferred contact" placeholder="No preference" options={labelOptions(CONTACT_METHOD_LABELS)} />
            <TextField control={form.control} name="preferredLanguage" label="Preferred language" list="portal-languages" />
            <datalist id="portal-languages">
              {LANGUAGE_SUGGESTIONS.map((l) => <option key={l} value={l} />)}
            </datalist>
            <TextField control={form.control} name="alternatePhone" label="Alternate phone" type="tel" />
          </div>
          {students.map((child, i) => (
            <fieldset key={child.id} className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Notices about {child.name}</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                <SwitchField control={form.control} name={`children.${i}.receivesAcademicNotifications`} label="Academic" description="Homework, exams, results" />
                <SwitchField control={form.control} name={`children.${i}.receivesAttendanceNotifications`} label="Attendance" description="Absences and late arrivals" />
                <SwitchField control={form.control} name={`children.${i}.receivesGeneralAnnouncements`} label="General" description="School notices and events" />
              </div>
            </fieldset>
          ))}
          <p className="text-xs text-muted-foreground">To change your phone number, email, fee notices or which children you can see, contact the school.</p>
          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
              {form.formState.isSubmitting && <Spinner />}
              Save preferences
            </Button>
          </div>
        </form>
      </FormProvider>
    </Card>
  )
}
