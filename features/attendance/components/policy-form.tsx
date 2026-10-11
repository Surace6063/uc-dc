"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { applyServerErrors, SelectField, SwitchField, TextField } from "@/components/shared/form-fields"
import { FormAlert } from "@/components/shared/form"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { savePolicyAction } from "@/features/attendance/actions"
import { EXCUSED_TREATMENT_LABELS, WEEKDAY_LABELS } from "@/features/attendance/constants"
import { policySchema } from "@/features/attendance/schemas"
import type { Policy } from "@/services/attendance/policy-service"

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="gap-4 p-5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </Card>
  )
}

// The organisation's attendance rules. Nothing is assumed: each institution
// picks its registers, thresholds, weekends and how statuses count.
export function PolicyForm({ policy, canEdit }: { policy: Policy; canEdit: boolean }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof policySchema>, unknown, z.output<typeof policySchema>>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      ...policy,
      defaultStatus: policy.defaultStatus === "PRESENT" || policy.defaultStatus === "ABSENT" ? policy.defaultStatus : "",
      lockAfterDays: policy.lockAfterDays ?? "",
    },
  })
  const periodEnabled = useWatch({ control: form.control, name: "periodEnabled" })
  const employeeEnabled = useWatch({ control: form.control, name: "employeeAttendanceEnabled" })

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    const result = await savePolicyAction(values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: "Attendance policy saved", type: "success" })
    form.reset(form.getValues())
    router.refresh()
  })

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <fieldset disabled={!canEdit} className="grid gap-4">
        <Section title="Student registers" description="Which registers teachers keep. Schools usually take one daily register; colleges often take each lecture.">
          <div className="grid gap-3 md:grid-cols-2">
            <SwitchField control={form.control} name="dailyEnabled" label="Daily attendance" description="One register per class or section per day." />
            <SwitchField control={form.control} name="periodEnabled" label="Period / subject attendance" description="A register for each period of a subject." />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField control={form.control} name="dailySlots" label="Daily registers per day" options={[{ value: "1", label: "One (full day)" }, { value: "2", label: "Two (morning and afternoon)" }]} />
            {periodEnabled && <TextField control={form.control} name="maxPeriodsPerDay" label="Periods per day (at most)" type="number" min={1} max={20} />}
            <SelectField control={form.control} name="defaultStatus" label="New registers start as" placeholder="Unmarked" options={[{ value: "PRESENT", label: "Present" }, { value: "ABSENT", label: "Absent" }]} description="Only pre-fills the form; nothing is saved until submitted." />
          </div>
          <SwitchField control={form.control} name="halfDayEnabled" label="Half-day attendance" description="Offer a “Half day” status (counts as half attended)." />
        </Section>

        <Section title="Percentages and shortages" description="Every percentage — dashboards, reports, portals and alerts — uses these rules. Unmarked students are never counted as absent.">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField control={form.control} name="minimumPercentage" label="Minimum attendance (%)" type="number" min={0} max={100} />
            <TextField control={form.control} name="warningMarginPercentage" label="Warn when within (%)" type="number" min={0} max={50} description="“Approaching” the minimum." />
            <SelectField control={form.control} name="excusedTreatment" label="Excused absences and leave" options={Object.entries(EXCUSED_TREATMENT_LABELS).map(([value, label]) => ({ value, label }))} />
          </div>
          <SwitchField control={form.control} name="lateCountsAsPresent" label="Late arrivals count as attended" />
        </Section>

        <Section title="Corrections and locking" description="Changes after submission are always recorded with the original value.">
          <SwitchField control={form.control} name="correctionsRequireApproval" label="Corrections need approval" description="Teachers’ corrections wait for someone with “approve corrections”. No one approves their own." />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField control={form.control} name="lockAfterDays" label="Lock submitted registers after (days)" type="number" min={0} placeholder="Never" description="Afterwards only approvers can correct them." />
          </div>
        </Section>

        <Section title="Working days" description="Weekly holidays and the calendar decide which days expect attendance.">
          <Controller
            control={form.control}
            name="weeklyOffDays"
            render={({ field, fieldState }) => (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Weekly holidays</legend>
                <div className="flex flex-wrap gap-3">
                  {WEEKDAY_LABELS.map((label, day) => (
                    <label key={label} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={field.value.includes(day)}
                        onCheckedChange={(checked) => field.onChange(checked ? [...field.value, day] : field.value.filter((d) => d !== day))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
              </fieldset>
            )}
          />
          <SwitchField control={form.control} name="allowOnNonWorkingDays" label="Allow attendance on holidays and weekly off days" description="For make-up classes or exams on a holiday." />
        </Section>

        <Section title="Guardian notices" description="Who is told follows each guardian’s notice preferences. Messages are only delivered once an SMS, email or app channel is connected.">
          <div className="grid gap-3 md:grid-cols-2">
            <SwitchField control={form.control} name="notifyGuardiansOnAbsence" label="Notify guardians of absences" />
            <SwitchField control={form.control} name="notifyGuardiansOnLate" label="Notify guardians of late arrivals" />
          </div>
        </Section>

        <Section title="Teachers and staff" description="Daily attendance for employees. Payroll may read it but never changes it.">
          <div className="grid gap-3 md:grid-cols-2">
            <SwitchField control={form.control} name="employeeAttendanceEnabled" label="Record teacher and staff attendance" />
            {employeeEnabled && <SwitchField control={form.control} name="employeeSelfCheckIn" label="Self check-in" description="Employees with an account check in and out themselves (server time)." />}
          </div>
          {employeeEnabled && (
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField control={form.control} name="workdayStartTime" label="Working day starts" type="time" />
              <TextField control={form.control} name="lateGraceMinutes" label="Grace before “late” (minutes)" type="number" min={0} max={600} />
            </div>
          )}
        </Section>
      </fieldset>
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
            {form.formState.isSubmitting && <Spinner />}
            Save policy
          </Button>
        </div>
      )}
    </form>
  )
}
