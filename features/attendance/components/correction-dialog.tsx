"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { applyServerErrors, SelectField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { requestCorrectionsAction } from "@/features/attendance/actions"
import { ATTENDANCE_STATUS_LABELS } from "@/features/attendance/constants"
import { correctionRequestSchema } from "@/features/attendance/schemas"
import type { AttendanceStatus } from "@/lib/generated/prisma/enums"

// Correct submitted attendance. With attendance.approve (or when the policy
// doesn't require review) the change applies at once; otherwise it becomes a
// request for someone else to review. Either way the old value is kept.
export function CorrectionDialog({
  recordIds,
  label,
  statuses,
  initialStatus,
  direct,
  onClose,
  onDone,
}: {
  recordIds: string[]
  label: string
  statuses: AttendanceStatus[]
  initialStatus?: AttendanceStatus
  // Whether the change will apply immediately (shown in the wording only;
  // the server decides).
  direct: boolean
  onClose: () => void
  onDone?: () => void
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof correctionRequestSchema>, unknown, z.output<typeof correctionRequestSchema>>({
    resolver: zodResolver(correctionRequestSchema),
    defaultValues: { recordIds, toStatus: initialStatus ?? "PRESENT", toLateMinutes: "", toReason: "", justification: "" },
  })
  const status = useWatch({ control: form.control, name: "toStatus" })

  const submit = form.handleSubmit(async (values) => {
    const result = await requestCorrectionsAction(values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    const { applied, pending, skipped } = result.data
    toast.add({
      title: applied ? `${applied} record${applied === 1 ? "" : "s"} corrected` : pending ? `${pending} correction${pending === 1 ? "" : "s"} sent for review` : "Nothing was changed",
      description: skipped.length ? skipped.slice(0, 3).map((s) => `${s.name}: ${s.reason}`).join(" ") : undefined,
      type: skipped.length ? (applied || pending ? "warning" : "error") : "success",
    })
    onDone?.()
    onClose()
    router.refresh()
  })

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={direct ? "Correct attendance" : "Request a correction"}
      description={`${label}. ${direct ? "The change applies now; the original mark is kept in the history." : "A reviewer applies or rejects it; until then the current mark stands."}`}
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
      submitLabel={direct ? "Apply correction" : "Send for review"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="toStatus"
          label="Correct status"
          required
          options={statuses.map((s) => ({ value: s, label: ATTENDANCE_STATUS_LABELS[s] }))}
        />
        {status === "LATE" && <TextField control={form.control} name="toLateMinutes" label="Minutes late" type="number" min={0} />}
      </div>
      <TextField control={form.control} name="toReason" label="Reason shown to the family" placeholder="e.g. Medical appointment" />
      <TextAreaField control={form.control} name="justification" label="Why is this being corrected?" required rows={3} placeholder="e.g. Marked absent by mistake; student arrived during assembly." />
    </FormDialog>
  )
}
