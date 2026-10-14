"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form"
import { CalendarClockIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { SelectField, TextField } from "@/components/shared/form-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { deleteTimetableSlotAction, saveTimetableSlotAction } from "@/features/teaching/actions"
import { PlaceFields } from "@/features/teaching/components/place-fields"
import { SCHOOL_WEEK, WEEKDAYS } from "@/features/teaching/constants"
import { timetableSlotSchema } from "@/features/teaching/schemas"
import { useActionRunner, useDialogSubmit } from "@/hooks/use-dialog-submit"
import { cn } from "@/lib/utils"
import type { TeachingOptions } from "@/services/teaching/options-service"
import type { TimetableManagerOptions, TimetableSlotRow } from "@/services/teaching/timetable-service"

type FormInput = z.input<typeof timetableSlotSchema>
type FormOutput = z.output<typeof timetableSlotSchema>

export function TimetableView({
  yearId,
  mode,
  classId,
  sectionId,
  slots,
  options,
  managerOptions,
  classChoices,
  myTeacherId,
  canManage,
  notFound,
}: {
  yearId: string | null
  mode: "mine" | "class" | "pick"
  classId: string | null
  sectionId: string | null
  slots: TimetableSlotRow[]
  options: TeachingOptions
  managerOptions: TimetableManagerOptions | null
  classChoices: { id: string; name: string; sections: { id: string; name: string }[] }[]
  myTeacherId: string | null
  canManage: boolean
  notFound: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [editing, setEditing] = React.useState<TimetableSlotRow | "new" | null>(null)
  const [removing, setRemoving] = React.useState<TimetableSlotRow | null>(null)
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(timetableSlotSchema) })
  const { error, setError, run } = useDialogSubmit(form, () => setEditing(null))
  const runner = useActionRunner()

  const canAdd = !!yearId && (canManage || options.places.some((p) => p.academicYearId === yearId))
  const editable = (s: TimetableSlotRow) => canManage || (!!myTeacherId && s.teacherId === myTeacherId)
  const days = slots.some((s) => s.dayOfWeek === 6) ? [...SCHOOL_WEEK, 6] : [...SCHOOL_WEEK]
  const currentClass = classChoices.find((c) => c.id === classId)

  function go(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    router.push(next.size ? `${pathname}?${next}` : pathname)
  }

  function open(slot: TimetableSlotRow | null, day?: number) {
    setError(null)
    form.reset(
      slot
        ? {
            academicYearId: slot.academicYearId, classId: slot.classId, sectionId: slot.sectionId ?? "", subjectId: slot.subjectId ?? "",
            teacherId: slot.teacherId ?? "", dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime, room: slot.room ?? "", note: slot.note ?? "",
          }
        : {
            academicYearId: yearId ?? "", classId: classId ?? "", sectionId: sectionId ?? "", subjectId: "", teacherId: canManage ? "" : (myTeacherId ?? ""),
            dayOfWeek: day ?? 0, startTime: "10:00", endTime: "10:45", room: "", note: "",
          }
    )
    setEditing(slot ?? "new")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          {myTeacherId && (
            <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Whose timetable">
              <Button variant={mode === "mine" ? "secondary" : "ghost"} size="sm" role="tab" aria-selected={mode === "mine"} onClick={() => go({ class: null, section: null })}>
                My week
              </Button>
              <Button
                variant={mode === "class" ? "secondary" : "ghost"}
                size="sm"
                role="tab"
                aria-selected={mode === "class"}
                disabled={classChoices.length === 0}
                onClick={() => classChoices[0] && go({ class: classId ?? classChoices[0].id, section: null })}
              >
                By class
              </Button>
            </div>
          )}
          {(mode !== "mine" || !myTeacherId) && classChoices.length > 0 && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="tt-class" className="text-xs text-muted-foreground">Class</Label>
                <NativeSelect id="tt-class" value={classId ?? ""} onChange={(e) => go({ class: e.target.value || null, section: null })} className="min-w-40">
                  <NativeSelectOption value="">Choose a class</NativeSelectOption>
                  {classChoices.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              {currentClass && currentClass.sections.length > 0 && (
                <div className="grid gap-1.5">
                  <Label htmlFor="tt-section" className="text-xs text-muted-foreground">Section</Label>
                  <NativeSelect id="tt-section" value={sectionId ?? ""} onChange={(e) => go({ section: e.target.value || null })} className="min-w-32">
                    <NativeSelectOption value="">All sections</NativeSelectOption>
                    {currentClass.sections.map((s) => (
                      <NativeSelectOption key={s.id} value={s.id}>Section {s.name}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              )}
            </>
          )}
        </div>
        {canAdd && mode !== "pick" && (
          <Button size="sm" onClick={() => open(null)}>
            <PlusIcon data-icon="inline-start" />
            Add period
          </Button>
        )}
      </div>

      {notFound && <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">You can only open timetables of classes you teach.</p>}

      {!yearId ? (
        <EmptyState icon={CalendarClockIcon} title="No academic year" description="Choose an academic year from the header, or ask the office to set the current year." />
      ) : mode === "pick" ? (
        <EmptyState icon={CalendarClockIcon} title="Choose a class" description={classChoices.length ? "Pick a class above to see and edit its week." : "There are no classes to show."} />
      ) : slots.length === 0 ? (
        <EmptyState
          icon={CalendarClockIcon}
          title={mode === "mine" ? "Your timetable is empty" : "No periods for this class yet"}
          description={canAdd ? "Add the weekly periods you teach. Clashes with your other periods or the class's are refused." : "The academic coordinator sets up the timetable."}
        >
          {canAdd && (
            <Button size="sm" onClick={() => open(null)}>
              <PlusIcon data-icon="inline-start" />
              Add period
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className={cn("grid gap-3 md:grid-cols-3", days.length === 7 ? "xl:grid-cols-7" : "xl:grid-cols-6")}>
          {days.map((d) => {
            const daySlots = slots.filter((s) => s.dayOfWeek === d)
            return (
              <Card key={d} className="gap-2 p-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{WEEKDAYS[d].label}</h2>
                  {canAdd && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Add a period on ${WEEKDAYS[d].label}`} onClick={() => open(null, d)}>
                      <PlusIcon />
                    </Button>
                  )}
                </div>
                {daySlots.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">No periods</p>
                ) : (
                  <ul className="grid gap-2">
                    {daySlots.map((s) => (
                      <li key={s.id} className="relative rounded-lg border bg-muted/20 p-2.5 pr-8">
                        <p className="text-xs font-semibold tabular-nums">{s.startTime}–{s.endTime}</p>
                        <p className="truncate text-sm font-medium">{s.subject?.name ?? "Class period"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {mode === "mine"
                            ? [s.class.name, s.section && `Sec ${s.section.name}`].filter(Boolean).join(" · ")
                            : s.teacher ? `${s.teacher.firstName} ${s.teacher.lastName}` : "No teacher"}
                          {s.room && ` · ${s.room}`}
                        </p>
                        {mode === "class" && !sectionId && s.section && <Badge variant="outline" className="mt-1">Section {s.section.name}</Badge>}
                        {editable(s) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="absolute top-1.5 right-1.5" aria-label="Period actions" />}>
                              <MoreHorizontalIcon />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => open(s)}><PencilIcon />Edit</DropdownMenuItem>
                              <DropdownMenuItem variant="destructive" onClick={() => setRemoving(s)}><Trash2Icon />Remove</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <FormProvider {...form}>
        <FormDialog
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          title={editing === "new" ? "Add period" : "Edit period"}
          description={canManage ? undefined : "Periods you add are yours, for classes and subjects you teach."}
          pending={form.formState.isSubmitting}
          error={error}
          wide
          onSubmit={form.handleSubmit((values) => run(() => saveTimetableSlotAction(editing === "new" || !editing ? null : editing.id, values)))}
        >
          {canManage && managerOptions ? <ManagerPlaceFields options={managerOptions} years={options.years} /> : <PlaceFields options={options} subject="optional" />}
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField control={form.control} name="dayOfWeek" label="Day" required options={WEEKDAYS.map((d) => ({ value: String(d.value), label: d.label }))} />
            <TextField control={form.control} name="startTime" label="Starts" type="time" required />
            <TextField control={form.control} name="endTime" label="Ends" type="time" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="room" label="Room" placeholder="Room 204, Lab 2…" />
            <TextField control={form.control} name="note" label="Note" />
          </div>
        </FormDialog>
      </FormProvider>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this period?"
        description={removing ? `${WEEKDAYS[removing.dayOfWeek].label} ${removing.startTime}–${removing.endTime}, ${removing.subject?.name ?? "class period"} (${removing.class.name}).` : undefined}
        confirmLabel="Remove"
        destructive
        onConfirm={() => (removing ? runner.run(() => deleteTimetableSlotAction(removing.id)) : false)}
      />
    </div>
  )
}

// Coordinators place a period in any class, with any subject and teacher.
function ManagerPlaceFields({ options, years }: { options: TimetableManagerOptions; years: TeachingOptions["years"] }) {
  const { control, setValue } = useFormContext<FormInput>()
  const classId = useWatch({ control, name: "classId" }) ?? ""
  const cls = options.classes.find((c) => c.id === classId)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField control={control} name="academicYearId" label="Academic year" required placeholder="Choose" options={years.map((y) => ({ value: y.id, label: `${y.name}${y.isCurrent ? " (current)" : ""}` }))} />
      <SelectField control={control} name="classId" label="Class" required placeholder="Choose" options={options.classes.map((c) => ({ value: c.id, label: c.name }))} onValueChange={() => setValue("sectionId", "")} />
      <SelectField control={control} name="sectionId" label="Section" placeholder="Whole class" options={(cls?.sections ?? []).map((s) => ({ value: s.id, label: `Section ${s.name}` }))} disabled={!cls} />
      <SelectField control={control} name="subjectId" label="Subject" placeholder="No subject" options={options.subjects.map((s) => ({ value: s.id, label: s.name }))} />
      <SelectField control={control} name="teacherId" label="Teacher" placeholder="No teacher" options={options.teachers.map((t) => ({ value: t.id, label: `${t.firstName} ${t.lastName} (${t.employeeId})` }))} className="sm:col-span-2" />
    </div>
  )
}
