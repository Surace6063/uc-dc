"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { FormAlert } from "@/components/shared/form"
import { applyServerErrors, SwitchField, TextField } from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { AddressFields } from "@/features/students/components/form-sections"
import { checkEmployeeIdAction, updateTeacherAction } from "@/features/teachers/actions"
import { TeacherContactFields, TeacherPersonalFields } from "@/features/teachers/components/form-sections"
import { updateTeacherSchema, type UpdateTeacherInput } from "@/features/teachers/schemas"

// Personal, contact and address details. Employment, qualifications,
// assignments and documents are managed on the profile, where history is kept.
export function EditTeacherForm({
  teacherId,
  initial,
  showSensitive,
}: {
  teacherId: string
  initial: UpdateTeacherInput
  showSensitive: boolean
}) {
  const router = useRouter()
  const [formError, setFormError] = React.useState<string | null>(null)
  const form = useForm<UpdateTeacherInput, unknown, z.output<typeof updateTeacherSchema>>({
    resolver: zodResolver(updateTeacherSchema),
    defaultValues: initial,
    mode: "onTouched",
  })
  const sameAsPermanent = useWatch({ control: form.control, name: "sameAsPermanent" })

  async function checkEmployeeId() {
    const value = form.getValues("employeeId")?.trim()
    if (!value || value === initial.employeeId) return
    const result = await checkEmployeeIdAction(value, teacherId)
    if (result.ok && !result.data.available) {
      form.setError("employeeId", { type: "server", message: "This employee ID is already used in your organisation." })
    }
  }

  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    const result = await updateTeacherAction(teacherId, values)
    if (!result.ok) {
      setFormError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: "Teacher updated", type: "success" })
    router.push(`/dashboard/teachers/${teacherId}`)
    router.refresh()
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {formError && <FormAlert tone="error">{formError}</FormAlert>}
        <Card className="gap-4 p-5 sm:p-6">
          <h2 className="text-base font-semibold">Personal details</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField control={form.control} name="employeeId" label="Employee ID" required onBlur={checkEmployeeId} />
          </div>
          <TeacherPersonalFields showSensitive={showSensitive} />
        </Card>
        <Card className="gap-4 p-5 sm:p-6">
          <h2 className="text-base font-semibold">Contact</h2>
          <TeacherContactFields showSensitive={showSensitive} />
        </Card>
        {showSensitive && (
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
        )}
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
