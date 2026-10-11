"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangleIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  HistoryIcon,
  LockIcon,
  PencilIcon,
  SaveIcon,
  SendIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { SearchBox } from "@/components/shared/filter-controls"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { saveRegisterAction } from "@/features/attendance/actions"
import { AttendanceStatusBadge, SessionStatusBadge } from "@/features/attendance/components/attendance-nav"
import { CorrectionDialog } from "@/features/attendance/components/correction-dialog"
import { RecordHistoryDialog } from "@/features/attendance/components/record-history"
import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_SHORT,
  ATTENDANCE_STATUS_TONE,
  formatDay,
} from "@/features/attendance/constants"
import { initials } from "@/features/students/constants"
import type { AttendanceStatus } from "@/lib/generated/prisma/enums"
import { cn } from "@/lib/utils"
import type { RegisterData } from "@/services/attendance/session-service"

type Mark = {
  status: AttendanceStatus | null
  checkInTime: string
  lateMinutes: string
  reason: string
  remarks: string
}

const KEY_TO_STATUS: Record<string, AttendanceStatus> = { p: "PRESENT", l: "LATE", h: "HALF_DAY", a: "ABSENT", e: "EXCUSED" }

function savedMark(student: RegisterData["students"][number]): Mark {
  const r = student.record
  return {
    status: r?.status ?? null,
    checkInTime: r?.checkInTime ?? "",
    lateMinutes: r?.lateMinutes?.toString() ?? "",
    reason: r?.reason ?? "",
    remarks: r?.remarks ?? "",
  }
}

const same = (a: Mark, b: Mark) =>
  a.status === b.status && a.checkInTime === b.checkInTime && a.lateMinutes === b.lateMinutes && a.reason === b.reason && a.remarks === b.remarks

export function RegisterForm({ data, photos }: { data: RegisterData; photos: Record<string, string> }) {
  const router = useRouter()
  const editable = data.canTake && !data.blockedByCalendar && !data.isFuture
  const markable = data.students.filter((s) => !s.markedElsewhere)

  // Fresh registers start with the policy's default status (a convenience:
  // nothing is recorded until someone saves).
  const initial = React.useMemo(() => {
    const map = new Map<string, Mark>()
    for (const s of data.students) {
      const saved = savedMark(s)
      if (!data.session && editable && !s.markedElsewhere && s.eligible && data.defaultStatus) saved.status = data.defaultStatus
      map.set(s.studentId, saved)
    }
    return map
  }, [data, editable])
  const saved = React.useMemo(() => new Map(data.students.map((s) => [s.studentId, savedMark(s)])), [data.students])

  const [marks, setMarks] = React.useState(initial)
  const [query, setQuery] = React.useState("")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const [notes, setNotes] = React.useState(data.session?.notes ?? "")
  const [pending, setPending] = React.useState<"draft" | "submit" | null>(null)
  const [confirmSubmit, setConfirmSubmit] = React.useState(false)
  const [confirmBulk, setConfirmBulk] = React.useState<{ status: AttendanceStatus | null; ids: string[] } | null>(null)
  const [correcting, setCorrecting] = React.useState<{ ids: string[]; label: string; status?: AttendanceStatus } | null>(null)
  const [history, setHistory] = React.useState<string | null>(null)
  const rowRefs = React.useRef(new Map<string, HTMLDivElement>())

  const dirtyIds = data.students.filter((s) => !same(marks.get(s.studentId)!, saved.get(s.studentId)!)).map((s) => s.studentId)
  const dirty = editable && (dirtyIds.length > 0 || notes !== (data.session?.notes ?? ""))

  // Warn before leaving with unsaved marks.
  React.useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  const q = query.trim().toLowerCase()
  const visible = data.students.filter(
    (s) => !q || s.name.toLowerCase().includes(q) || s.admissionNumber.toLowerCase().includes(q) || (s.rollNumber ?? "").toLowerCase() === q
  )

  const counts = { unmarked: 0 } as Record<AttendanceStatus | "unmarked", number>
  for (const s of markable) {
    const status = marks.get(s.studentId)!.status
    const key = status ?? "unmarked"
    counts[key] = (counts[key] ?? 0) + 1
  }

  function setMark(id: string, patch: Partial<Mark>) {
    setMarks((prev) => {
      const next = new Map(prev)
      next.set(id, { ...next.get(id)!, ...patch })
      return next
    })
  }

  function applyBulk(status: AttendanceStatus | null, ids: string[]) {
    setMarks((prev) => {
      const next = new Map(prev)
      for (const id of ids) next.set(id, { ...next.get(id)!, status })
      return next
    })
    setSelected(new Set())
  }

  // Bulk changes that would overwrite different marks ask first.
  function bulk(status: AttendanceStatus | null, ids: string[]) {
    const targets = ids.filter((id) => !data.students.find((s) => s.studentId === id)?.markedElsewhere)
    const overwrites = targets.filter((id) => {
      const current = marks.get(id)!.status
      return current !== null && current !== status
    })
    if (overwrites.length > 0) setConfirmBulk({ status, ids: targets })
    else applyBulk(status, targets)
  }

  function focusRow(index: number) {
    const s = visible[Math.max(0, Math.min(visible.length - 1, index))]
    if (s) rowRefs.current.get(s.studentId)?.focus()
  }

  function onRowKey(e: React.KeyboardEvent, index: number, studentId: string) {
    if (e.target !== e.currentTarget) return
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault()
      focusRow(index + 1)
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault()
      focusRow(index - 1)
    } else if (editable && KEY_TO_STATUS[e.key.toLowerCase()] && data.statuses.includes(KEY_TO_STATUS[e.key.toLowerCase()])) {
      e.preventDefault()
      setMark(studentId, { status: KEY_TO_STATUS[e.key.toLowerCase()] })
      focusRow(index + 1)
    } else if (editable && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault()
      setMark(studentId, { status: null })
    }
  }

  async function save(submit: boolean) {
    setPending(submit ? "submit" : "draft")
    const entries = data.students
      .filter((s) => !s.markedElsewhere)
      .filter((s) => submit || dirtyIds.includes(s.studentId) || !data.session)
      .map((s) => {
        const m = marks.get(s.studentId)!
        return {
          studentId: s.studentId,
          status: m.status,
          checkInTime: m.checkInTime,
          lateMinutes: m.lateMinutes,
          reason: m.reason,
          remarks: m.remarks,
        }
      })
      // A new register only needs the students someone marked.
      .filter((e) => data.session || e.status !== null)
    const result = await saveRegisterAction({
      scope: data.scope,
      sessionId: data.session?.id ?? null,
      expectedUpdatedAt: data.session?.updatedAt ?? null,
      entries,
      submit,
      notes,
    })
    setPending(null)
    if (!result.ok) {
      toast.add({ title: submit ? "Couldn't submit attendance" : "Couldn't save the draft", description: result.error === "Please check the form and try again." ? Object.values(result.fieldErrors ?? {}).flat()[0] : result.error, type: "error" })
      return false
    }
    const r = result.data
    toast.add({
      title: submit ? "Attendance submitted" : "Draft saved",
      description: [
        `${r.marked} marked${r.unmarked ? `, ${r.unmarked} unmarked (not counted)` : ""}.`,
        r.notices ? `Guardian notices: ${r.notices.recipients} guardian${r.notices.recipients === 1 ? "" : "s"} to inform; ${r.notices.sent} sent${r.notices.unreached ? `, ${r.notices.unreached} not reached (no delivery channel is set up)` : ""}.` : null,
      ].filter(Boolean).join(" "),
      type: "success",
    })
    router.refresh()
  }

  const allSelected = visible.length > 0 && visible.every((s) => selected.has(s.studentId))
  const selectedIds = [...selected]
  const readOnly = !editable
  const canCorrectRows = data.canCorrect

  if (data.students.length === 0) {
    return (
      <Empty className="rounded-xl border py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon"><UsersIcon /></EmptyMedia>
          <EmptyTitle>No students in this register</EmptyTitle>
          <EmptyDescription>
            No student was placed in this class{data.scope.sectionId ? " and section" : ""} on {formatDay(data.scope.date)}. Check the class roster, or pick another date.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {data.title}
            {data.session ? <SessionStatusBadge status={data.session.status} locked={data.session.locked} /> : <span className="text-xs font-normal text-muted-foreground">Not started</span>}
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatDay(data.scope.date)} · {data.yearName} · {markable.length} student{markable.length === 1 ? "" : "s"}
          </p>
        </div>
        {dirty && (
          <span role="status" className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            <span className="size-1.5 rounded-full bg-current" />
            Unsaved changes
          </span>
        )}
      </div>

      {data.warnings.map((w) => (
        <p key={w} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          {w}
        </p>
      ))}
      {data.session && data.session.status !== "DRAFT" && (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <LockIcon className="mt-0.5 size-4 shrink-0" />
          {data.session.locked
            ? "This register is locked. Someone who approves corrections can reopen it."
            : canCorrectRows
              ? "This register has been submitted. Use “Correct” on a student (or select several) to change a mark; the original is kept."
              : "This register has been submitted."}
        </p>
      )}

      <div className="flex min-w-0 flex-col rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchBox value={query} onSearch={(v) => setQuery(v ?? "")} placeholder="Name, admission no. or roll" label="Search students" />
          {editable ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => bulk("PRESENT", markable.map((s) => s.studentId))}>
                <CheckCheckIcon data-icon="inline-start" />
                Mark all present
              </Button>
              {selectedIds.length > 0 && (
                <>
                  <span className="text-sm font-medium">{selectedIds.length} selected:</span>
                  {data.statuses.filter((s) => s !== "PRESENT").map((s) => (
                    <Button key={s} size="sm" variant="outline" onClick={() => bulk(s, selectedIds)}>
                      {ATTENDANCE_STATUS_LABELS[s]}
                    </Button>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => bulk("PRESENT", selectedIds)}>Present</Button>
                  <Button size="sm" variant="ghost" onClick={() => bulk(null, selectedIds)}>
                    <XIcon data-icon="inline-start" />
                    Reset
                  </Button>
                </>
              )}
            </div>
          ) : canCorrectRows && selectedIds.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{selectedIds.length} selected</span>
              <Button size="sm" variant="outline" onClick={() => setCorrecting({ ids: data.students.filter((s) => selected.has(s.studentId) && s.record).map((s) => s.record!.id), label: `${selectedIds.length} students` })}>
                <PencilIcon data-icon="inline-start" />
                Correct selected
              </Button>
            </div>
          ) : null}
        </div>

        {editable && (
          <p className="hidden border-b px-3 py-1.5 text-xs text-muted-foreground md:block">
            Keyboard: focus a row, then <Kbd>P</Kbd> present · <Kbd>A</Kbd> absent · <Kbd>L</Kbd> late · <Kbd>E</Kbd> excused
            {data.statuses.includes("HALF_DAY") && <> · <Kbd>H</Kbd> half day</>} · <Kbd>↑</Kbd>/<Kbd>↓</Kbd> move · <Kbd>Del</Kbd> clear
          </p>
        )}

        <div role="grid" aria-label="Attendance register" aria-readonly={readOnly} className="divide-y">
          <div role="row" className="flex items-center gap-3 bg-muted/60 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {(editable || canCorrectRows) && (
              <Checkbox
                aria-label="Select all shown students"
                checked={allSelected}
                indeterminate={!allSelected && visible.some((s) => selected.has(s.studentId))}
                onCheckedChange={(checked) => setSelected(checked ? new Set(visible.filter((s) => !s.markedElsewhere).map((s) => s.studentId)) : new Set())}
              />
            )}
            <span className="w-10">Roll</span>
            <span className="flex-1">Student</span>
            <span className="hidden sm:block">Status</span>
          </div>
          {visible.map((s, index) => {
            const mark = marks.get(s.studentId)!
            const isDirty = editable && dirtyIds.includes(s.studentId)
            const open = expanded.has(s.studentId)
            const photo = s.profileImagePath ? photos[s.profileImagePath] : undefined
            return (
              <div key={s.studentId} role="row" className={cn(isDirty && "bg-amber-500/5", s.markedElsewhere && "opacity-60")}>
                <div
                  ref={(el) => {
                    if (el) rowRefs.current.set(s.studentId, el)
                    else rowRefs.current.delete(s.studentId)
                  }}
                  tabIndex={s.markedElsewhere ? -1 : 0}
                  onKeyDown={(e) => onRowKey(e, index, s.studentId)}
                  aria-label={`${s.name}, ${mark.status ? ATTENDANCE_STATUS_LABELS[mark.status] : "unmarked"}`}
                  className="flex flex-wrap items-center gap-3 px-3 py-2 outline-none focus-visible:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                >
                  {(editable || canCorrectRows) && (
                    <Checkbox
                      aria-label={`Select ${s.name}`}
                      disabled={!!s.markedElsewhere || (!editable && !s.record)}
                      checked={selected.has(s.studentId)}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (checked) next.add(s.studentId)
                          else next.delete(s.studentId)
                          return next
                        })
                      }
                    />
                  )}
                  <span className="w-10 font-mono text-xs text-muted-foreground tabular-nums">{s.rollNumber ?? "—"}</span>
                  <div className="flex min-w-48 flex-1 items-center gap-2.5">
                    <Avatar className="size-8">
                      {photo && <AvatarImage src={photo} alt="" />}
                      <AvatarFallback className="text-[10px]">{initials(s)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{s.admissionNumber}</span>
                        {s.sectionName && !data.scope.sectionId && ` · Section ${s.sectionName}`}
                        {s.markedElsewhere && ` · Marked in ${s.markedElsewhere === "whole class" ? "the whole-class register" : `section ${s.markedElsewhere}`}`}
                        {!s.eligible && " · No longer placed here"}
                        {s.record?.corrected && " · Corrected"}
                        {s.record?.pendingCorrection && " · Correction pending"}
                      </p>
                    </div>
                  </div>
                  {editable && !s.markedElsewhere ? (
                    <div role="radiogroup" aria-label={`Status for ${s.name}`} className="flex flex-wrap gap-1">
                      {data.statuses.map((status) => {
                        const active = mark.status === status
                        return (
                          <button
                            key={status}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            tabIndex={-1}
                            title={ATTENDANCE_STATUS_LABELS[status]}
                            onClick={() => setMark(s.studentId, { status: active ? null : status })}
                            className={cn(
                              "h-8 min-w-9 rounded-md border px-2 text-xs font-semibold transition-colors",
                              active ? cn(ATTENDANCE_STATUS_TONE[status], "border-current") : "text-muted-foreground hover:bg-muted"
                            )}
                          >
                            <span className="sm:hidden lg:inline">{ATTENDANCE_STATUS_LABELS[status]}</span>
                            <span className="hidden sm:inline lg:hidden">{ATTENDANCE_STATUS_SHORT[status]}</span>
                          </button>
                        )
                      })}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        tabIndex={-1}
                        aria-label={`More details for ${s.name}`}
                        aria-expanded={open}
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev)
                            if (open) next.delete(s.studentId)
                            else next.add(s.studentId)
                            return next
                          })
                        }
                      >
                        <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {mark.status ? <AttendanceStatusBadge status={mark.status} /> : <span className="text-xs text-muted-foreground">Unmarked</span>}
                      {s.record?.checkInTime && <span className="text-xs text-muted-foreground tabular-nums">{s.record.checkInTime}</span>}
                      {s.record?.lateMinutes ? <span className="text-xs text-muted-foreground">+{s.record.lateMinutes} min</span> : null}
                      {canCorrectRows && s.record && !s.record.pendingCorrection && (
                        <Button size="xs" variant="outline" onClick={() => setCorrecting({ ids: [s.record!.id], label: s.name, status: s.record!.status })}>
                          Correct
                        </Button>
                      )}
                      {s.record && (s.record.corrected || s.record.pendingCorrection) && (
                        <Button size="icon-xs" variant="ghost" aria-label={`History for ${s.name}`} onClick={() => setHistory(s.record!.id)}>
                          <HistoryIcon />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {editable && open && (
                  <div className="grid gap-3 border-t border-dashed bg-muted/20 px-3 py-3 sm:grid-cols-4">
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      Check-in time
                      <Input type="time" value={mark.checkInTime} onChange={(e) => setMark(s.studentId, { checkInTime: e.target.value })} className="h-8" />
                    </label>
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      Minutes late
                      <Input type="number" min={0} max={1440} disabled={mark.status !== "LATE"} value={mark.lateMinutes} onChange={(e) => setMark(s.studentId, { lateMinutes: e.target.value })} className="h-8" />
                    </label>
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      Reason (shared with family)
                      <Input value={mark.reason} maxLength={200} onChange={(e) => setMark(s.studentId, { reason: e.target.value })} className="h-8" />
                    </label>
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      Staff note (internal)
                      <Input value={mark.remarks} maxLength={500} onChange={(e) => setMark(s.studentId, { remarks: e.target.value })} className="h-8" />
                    </label>
                  </div>
                )}
              </div>
            )
          })}
          {visible.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No student matches “{query}”.</p>}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:flex-row lg:items-center lg:justify-between">
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {data.statuses.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <dt className="text-muted-foreground">{ATTENDANCE_STATUS_LABELS[s]}</dt>
              <dd className="font-semibold tabular-nums">{counts[s] ?? 0}</dd>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <dt className="text-muted-foreground">Unmarked</dt>
            <dd className={cn("font-semibold tabular-nums", counts.unmarked > 0 && "text-amber-700 dark:text-amber-400")}>{counts.unmarked}</dd>
          </div>
        </dl>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Register note (optional)" aria-label="Register note" className="h-9 w-full sm:w-56" />
            <Button variant="outline" onClick={() => save(false)} disabled={pending !== null || !dirty}>
              {pending === "draft" ? <Spinner /> : <SaveIcon data-icon="inline-start" />}
              Save draft
            </Button>
            <Button onClick={() => setConfirmSubmit(true)} disabled={pending !== null || markable.every((s) => !marks.get(s.studentId)!.status)}>
              {pending === "submit" ? <Spinner /> : <SendIcon data-icon="inline-start" />}
              Submit
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Submit this register?"
        description={
          <>
            {data.statuses.map((s) => `${counts[s] ?? 0} ${ATTENDANCE_STATUS_LABELS[s].toLowerCase()}`).join(", ")}.
            {counts.unmarked > 0 && ` ${counts.unmarked} student${counts.unmarked === 1 ? " is" : "s are"} unmarked and won't be counted either way.`}{" "}
            After submitting, changes need a correction.
          </>
        }
        confirmLabel="Submit attendance"
        onConfirm={() => save(true)}
      />
      <ConfirmDialog
        open={confirmBulk !== null}
        onOpenChange={(open) => !open && setConfirmBulk(null)}
        title={confirmBulk?.status ? `Mark ${confirmBulk.ids.length} students ${ATTENDANCE_STATUS_LABELS[confirmBulk.status].toLowerCase()}?` : `Clear ${confirmBulk?.ids.length ?? 0} marks?`}
        description="Some of these students already have a different mark in this form. It isn't saved until you save or submit."
        confirmLabel="Apply"
        onConfirm={() => {
          if (confirmBulk) applyBulk(confirmBulk.status, confirmBulk.ids)
        }}
      />
      {correcting && (
        <CorrectionDialog
          recordIds={correcting.ids}
          label={correcting.label}
          statuses={data.statuses}
          initialStatus={correcting.status}
          direct={data.correctionsDirect}
          onClose={() => setCorrecting(null)}
          onDone={() => setSelected(new Set())}
        />
      )}
      {history && <RecordHistoryDialog recordId={history} onClose={() => setHistory(null)} />}
    </div>
  )
}
