"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { FormAlert } from "@/components/shared/form"
import { applyServerErrors, SwitchField } from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { updateStudentAction } from "@/features/students/actions"
import { AddressFields, AdmissionFields, PersonalFields } from "@/features/students/components/form-sections"
import { updateStudentSchema, type UpdateStudentInput } from "@/features/students/schemas"

// Edits identity, addresses and admission details. Guardians and academic
// placement are managed on the profile, where history is preserved.
export function EditStudentForm({
  studentId,
  initial,
  showSensitive,
}: {
  studentId: string
  initial: UpdateStudentInput
  showSensitive: boolean
}) {
  const router = useRouter()
  const [formError, setFormError] = React.useState<string | null>(null)
  const form = useForm<UpdateStudentInput, unknown, z.output<typeof updateStudentSchema>>({
    resolver: zodResolver(updateStudentSchema),
    defaultValues: initial,
    mode: "onTouched",
  })
  const sameAsPermanent = useWatch({ control: form.control, name: "sameAsPermanent" })

  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    const result = await updateStudentAction(studentId, values)
    if (!result.ok) {
      setFormError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: "Student updated", type: "success" })
    router.push(`/dashboard/students/${studentId}`)
    router.refresh()
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {formError && <FormAlert tone="error">{formError}</FormAlert>}
        <Card className="gap-4 p-5 sm:p-6">
          <h2 className="text-base font-semibold">Personal details</h2>
          <PersonalFields showSensitive={showSensitive} />
        </Card>
        <Card className="gap-4 p-5 sm:p-6">
          <h2 className="text-base font-semibold">Address</h2>
          <h3 className="text-sm font-medium">Permanent</h3>
          <AddressFields prefix="permanentAddress" />
          <SwitchField control={form.control} name="sameAsPermanent" label="Temporary address is the same as permanent" />
          {!sameAsPermanent && (
            <>
              <h3 className="text-sm font-medium">Temporary</h3>
              <AddressFields prefix="temporaryAddress" />
            </>
          )}
        </Card>
        <Card className="gap-4 p-5 sm:p-6">
          <h2 className="text-base font-semibold">Admission</h2>
          <AdmissionFields automaticNumbering={false} />
        </Card>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={form.formState.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
            {form.formState.isSubmitting && <Spinner />}
            Save changes
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
