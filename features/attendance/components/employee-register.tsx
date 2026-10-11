"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AlertTriangleIcon, BriefcaseIcon, CheckCheckIcon, SaveIcon } from "lucide-react"

import { SearchBox } from "@/components/shared/filter-controls"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { saveEmployeeRegisterAction } from "@/features/attendance/actions"
import { AttendanceStatusBadge } from "@/features/attendance/components/attendance-nav"
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_TONE } from "@/features/attendance/constants"
import type { AttendanceStatus } from "@/lib/generated/prisma/enums"
import { cn } from "@/lib/utils"
import type { EmployeeRegister } from "@/services/attendance/employee-service"

type Mark = { status: AttendanceStatus | null; checkInTime: string; checkOutTime: string; reason: string }

const keyOf = (p: { type: string; id: string }) => `${p.type}:${p.id}`

export function EmployeeRegisterForm({ data, canManage }: { data: EmployeeRegister; canManage: boolean }) {
  const router = useRouter()
  const editable = canManage && data.enabled && !data.isFuture && (!data.nonWorkingDay || data.policy.allowOnNonWorkingDays)
  const saved = React.useMemo(
    () =>
      new Map(
        data.people.map((p) => [
          keyOf(p),
          { status: p.record?.status ?? null, checkInTime: p.record?.checkInTime ?? "", checkOutTime: p.record?.checkOutTime ?? "", reason: p.record?.reason ?? "" } as Mark,
        ])
      ),
    [data.people]
  )
  const [marks, setMarks] = React.useState(saved)
  const [query, setQuery] = React.useState("")
  const [justification, setJustification] = React.useState("")
  const [pending, setPending] = React.useState(false)

  const changed = data.people.filter((p) => JSON.stringify(marks.get(keyOf(p))) !== JSON.stringify(saved.get(keyOf(p))))
  const statusChangedOnPastDay = data.isPast && changed.some((p) => p.record && marks.get(keyOf(p))!.status !== p.record.status)
  const q = query.trim().toLowerCase()
  const visible = data.people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.employeeId.toLowerCase().includes(q))

  function set(key: string, patch: Partial<Mark>) {
    setMarks((prev) => new Map(prev).set(key, { ...prev.get(key)!, ...patch }))
  }

  async function save() {
    setPending(true)
    const result = await saveEmployeeRegisterAction({
      date: data.date,
      justification,
      entries: changed.map((p) => {
        const m = marks.get(keyOf(p))!
        return { employeeType: p.type, employeeId: p.id, status: m.status, checkInTime: m.checkInTime, checkOutTime: m.checkOutTime, reason: m.reason }
      }),
    })
    setPending(false)
    if (!result.ok) {
      toast.add({ title: "Couldn't save", description: result.fieldErrors ? Object.values(result.fieldErrors).flat()[0] : result.error, type: "error" })
      return
    }
    const r = result.data
    toast.add({ title: "Attendance saved", description: `${r.created} new, ${r.updated} changed${r.corrected ? ` (${r.corrected} kept as corrections)` : ""}.`, type: "success" })
    setJustification("")
    router.refresh()
  }

  if (data.people.length === 0) {
    return (
      <Empty className="rounded-xl border py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon"><BriefcaseIcon /></EmptyMedia>
          <EmptyTitle>No one employed on this date</EmptyTitle>
          <EmptyDescription>Teachers and staff appear here from their date of joining.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {!data.enabled && <Banner>Teacher and staff attendance is turned off in the attendance policy.</Banner>}
      {data.nonWorkingDay && <Banner>{data.date} is a non-working day ({data.nonWorkingDay}).</Banner>}
      <div className="flex flex-col rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchBox value={query} onSearch={(v) => setQuery(v ?? "")} placeholder="Name or employee ID" label="Search people" />
          {editable && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMarks((prev) => {
                const next = new Map(prev)
                for (const p of data.people) if (!next.get(keyOf(p))!.status) next.set(keyOf(p), { ...next.get(keyOf(p))!, status: "PRESENT" })
                return next
              })}
            >
              <CheckCheckIcon data-icon="inline-start" />
              Mark unmarked present
            </Button>
          )}
        </div>
        <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
          Working day starts {data.policy.workdayStartTime}; a check-in more than {data.policy.lateGraceMinutes} minutes later is recorded as late. Unrecorded days are never counted as absent.
        </p>
        <ul className="divide-y">
          {visible.map((p) => {
            const key = keyOf(p)
            const m = marks.get(key)!
            const dirty = JSON.stringify(m) !== JSON.stringify(saved.get(key))
            return (
              <li key={key} className={cn("flex flex-wrap items-center gap-3 px-3 py-2.5", dirty && "bg-amber-500/5")}>
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground"><span className="font-mono">{p.employeeId}</span> · {p.type === "TEACHER" ? "Teacher" : "Staff"} · {p.role}{p.record?.source === "SELF_SERVICE" && " · Self check-in"}{p.record?.corrected && " · Corrected"}</p>
                </div>
                {editable ? (
                  <>
                    <div role="radiogroup" aria-label={`Status for ${p.name}`} className="flex flex-wrap gap-1">
                      {data.statuses.map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={m.status === s}
                          onClick={() => set(key, { status: m.status === s ? (p.record && data.isPast ? m.status : null) : s })}
                          className={cn("h-8 rounded-md border px-2 text-xs font-semibold", m.status === s ? cn(ATTENDANCE_STATUS_TONE[s], "border-current") : "text-muted-foreground hover:bg-muted")}
                        >
                          {ATTENDANCE_STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="time" aria-label={`Check-in for ${p.name}`} value={m.checkInTime} onChange={(e) => set(key, { checkInTime: e.target.value })} className="h-8 w-28" />
                      <Input type="time" aria-label={`Check-out for ${p.name}`} value={m.checkOutTime} onChange={(e) => set(key, { checkOutTime: e.target.value })} className="h-8 w-28" />
                      <Input aria-label={`Reason for ${p.name}`} placeholder="Reason" value={m.reason} maxLength={200} onChange={(e) => set(key, { reason: e.target.value })} className="h-8 w-36" />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    {p.record ? <AttendanceStatusBadge status={p.record.status} /> : <span className="text-xs text-muted-foreground">Not recorded</span>}
                    {p.record?.checkInTime && <span className="text-xs text-muted-foreground tabular-nums">{p.record.checkInTime}–{p.record.checkOutTime ?? "…"}</span>}
                    {p.record?.lateMinutes ? <span className="text-xs text-muted-foreground">+{p.record.lateMinutes} min</span> : null}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      {editable && (
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 sm:flex-row sm:items-end sm:justify-between">
          {statusChangedOnPastDay ? (
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="employee-justification">Why are you changing an earlier day? (kept with the correction)</Label>
              <Input id="employee-justification" value={justification} onChange={(e) => setJustification(e.target.value)} maxLength={500} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{changed.length ? `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}` : "No unsaved changes"}</p>
          )}
          <Button onClick={save} disabled={pending || changed.length === 0 || (statusChangedOnPastDay && !justification.trim())}>
            {pending ? <Spinner /> : <SaveIcon data-icon="inline-start" />}
            Save
          </Button>
        </div>
      )}
    </div>
  )
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  )
}
