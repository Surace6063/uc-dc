"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { CalendarOffIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { applyServerErrors, SelectField, TextField } from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { deleteHolidayAction, saveHolidayAction } from "@/features/attendance/actions"
import { formatDay, HOLIDAY_AUDIENCE_LABELS } from "@/features/attendance/constants"
import { holidaySchema } from "@/features/attendance/schemas"
import type { HolidayRow } from "@/services/attendance/policy-service"

export function HolidaysManager({ holidays, levels, canEdit }: { holidays: HolidayRow[]; levels: { id: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<HolidayRow | "new" | null>(null)
  const [removing, setRemoving] = React.useState<HolidayRow | null>(null)

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Holidays</h2>
          <p className="text-sm text-muted-foreground">Public and school holidays (Dashain, Tihar, exam breaks…). No attendance is expected on these days.</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            Add holiday
          </Button>
        )}
      </div>
      {holidays.length === 0 ? (
        <Empty className="rounded-lg border border-dashed py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon"><CalendarOffIcon /></EmptyMedia>
            <EmptyTitle>No holidays added</EmptyTitle>
            <EmptyDescription>Weekly holidays come from the policy above; add festivals and breaks here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y rounded-lg border">
          {holidays.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{h.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDay(h.startDate)}
                  {h.endDate !== h.startDate && ` – ${formatDay(h.endDate)}`} · {HOLIDAY_AUDIENCE_LABELS[h.appliesTo]}
                  {h.educationLevel && ` · ${h.educationLevel.name} only`}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${h.name}`} onClick={() => setEditing(h)}><PencilIcon /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${h.name}`} onClick={() => setRemoving(h)}><Trash2Icon /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <HolidayDialog holiday={editing === "new" ? null : editing} levels={levels} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? "holiday"}?`}
        description="Attendance already recorded on these days is kept."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!removing) return
          const result = await deleteHolidayAction(removing.id)
          if (!result.ok) {
            toast.add({ title: "Couldn't remove", description: result.error, type: "error" })
            return false
          }
          toast.add({ title: "Holiday removed", type: "success" })
          router.refresh()
        }}
      />
    </Card>
  )
}

function HolidayDialog({ holiday, levels, onClose }: { holiday: HolidayRow | null; levels: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof holidaySchema>, unknown, z.output<typeof holidaySchema>>({
    resolver: zodResolver(holidaySchema),
    defaultValues: {
      name: holiday?.name ?? "",
      startDate: holiday?.startDate ?? "",
      endDate: holiday?.endDate ?? "",
      appliesTo: holiday?.appliesTo ?? "ALL",
      educationLevelId: holiday?.educationLevelId ?? "",
      description: holiday?.description ?? "",
    },
  })
  const submit = form.handleSubmit(async (values) => {
    const result = await saveHolidayAction(holiday?.id ?? null, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: holiday ? "Holiday updated" : "Holiday added", type: "success" })
    onClose()
    router.refresh()
  })
  return (
    <FormDialog open onOpenChange={(open) => !open && onClose()} title={holiday ? "Edit holiday" : "Add holiday"} pending={form.formState.isSubmitting} error={error} onSubmit={submit}>
      <TextField control={form.control} name="name" label="Name" required placeholder="Dashain holidays" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="startDate" label="First day" type="date" required />
        <TextField control={form.control} name="endDate" label="Last day" type="date" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField control={form.control} name="appliesTo" label="Applies to" options={Object.entries(HOLIDAY_AUDIENCE_LABELS).map(([value, label]) => ({ value, label }))} />
        <SelectField control={form.control} name="educationLevelId" label="Education level" placeholder="All levels" options={levels.map((l) => ({ value: l.id, label: l.name }))} />
      </div>
      <TextField control={form.control} name="description" label="Note" />
    </FormDialog>
  )
}
