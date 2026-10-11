"use client"

import * as React from "react"

import { Pill } from "@/components/shared/status-pill"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { recordHistoryAction } from "@/features/attendance/actions"
import { AttendanceStatusBadge } from "@/features/attendance/components/attendance-nav"
import { CORRECTION_STATUS_LABELS, CORRECTION_STATUS_TONE } from "@/features/attendance/constants"
import type { recordHistory } from "@/services/attendance/correction-service"

type History = Awaited<ReturnType<typeof recordHistory>>

const when = (d: Date | string) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
const who = (u: { name: string | null; email: string } | null) => u?.name || u?.email || "—"

// Every change to one attendance record, newest first. Loaded on demand; the
// server checks the caller may see the record.
export function RecordHistoryDialog({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const [history, setHistory] = React.useState<History | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    recordHistoryAction(recordId).then((result) => {
      if (!live) return
      if (result.ok) setHistory(result.data)
      else setError(result.error)
    })
    return () => {
      live = false
    }
  }, [recordId])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record history</DialogTitle>
          <DialogDescription>Original marks are never overwritten; each change is listed here.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !history ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <ol className="grid gap-3">
            {history.corrections.map((c) => (
              <li key={c.id} className="grid gap-1.5 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <AttendanceStatusBadge status={c.fromStatus} />
                  <span aria-hidden>→</span>
                  <AttendanceStatusBadge status={c.toStatus} />
                  <Pill className={CORRECTION_STATUS_TONE[c.status]}>{CORRECTION_STATUS_LABELS[c.status]}</Pill>
                </div>
                <p>{c.justification}</p>
                <p className="text-xs text-muted-foreground">
                  Requested by {who(c.requestedBy)} on {when(c.createdAt)}
                  {c.reviewedAt && c.status !== "CANCELLED" && ` · ${c.status === "REJECTED" ? "Rejected" : "Applied"} by ${who(c.reviewedBy)} on ${when(c.reviewedAt)}`}
                </p>
                {c.reviewNote && c.reviewNote !== "Applied directly" && <p className="text-xs text-muted-foreground">Note: {c.reviewNote}</p>}
              </li>
            ))}
            <li className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              First marked by {who(history.markedBy)} on {when(history.createdAt)}
            </li>
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}
