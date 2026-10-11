"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, InboxIcon, XIcon } from "lucide-react"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Pill } from "@/components/shared/status-pill"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { cancelCorrectionAction, reviewCorrectionsAction } from "@/features/attendance/actions"
import { AttendanceStatusBadge } from "@/features/attendance/components/attendance-nav"
import { CORRECTION_STATUS_LABELS, CORRECTION_STATUS_TONE, formatDay } from "@/features/attendance/constants"
import type { CorrectionRow } from "@/services/attendance/correction-service"

const when = (d: Date | string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

export function CorrectionsList({ rows, canReview }: { rows: CorrectionRow[]; canReview: boolean }) {
  const router = useRouter()
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [decision, setDecision] = React.useState<{ ids: string[]; approve: boolean } | null>(null)
  const [note, setNote] = React.useState("")
  // Reviewers can't act on their own requests (enforced on the server too).
  const reviewable = rows.filter((r) => r.status === "PENDING" && !r.mine)

  if (rows.length === 0) {
    return (
      <Empty className="rounded-xl border py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon"><InboxIcon /></EmptyMedia>
          <EmptyTitle>No corrections</EmptyTitle>
          <EmptyDescription>Corrections to submitted attendance, and requests waiting for review, appear here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex min-w-0 flex-col rounded-xl border bg-card">
      {canReview && reviewable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <span className="text-sm text-muted-foreground">{selected.size ? `${selected.size} selected` : `${reviewable.length} waiting for your review`}</span>
          {selected.size > 0 && (
            <>
              <Button size="sm" onClick={() => setDecision({ ids: [...selected], approve: true })}>
                <CheckIcon data-icon="inline-start" />
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDecision({ ids: [...selected], approve: false })}>
                <XIcon data-icon="inline-start" />
                Reject
              </Button>
            </>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              {canReview && (
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    aria-label="Select all pending"
                    checked={reviewable.length > 0 && reviewable.every((r) => selected.has(r.id))}
                    onCheckedChange={(checked) => setSelected(checked ? new Set(reviewable.map((r) => r.id)) : new Set())}
                  />
                </TableHead>
              )}
              <TableHead>Student</TableHead>
              <TableHead>Register</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Why</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead className="pr-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                {canReview && (
                  <TableCell className="pl-4">
                    {r.status === "PENDING" && !r.mine && (
                      <Checkbox
                        aria-label={`Select correction for ${r.studentName}`}
                        checked={selected.has(r.id)}
                        onCheckedChange={(checked) =>
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (checked) next.add(r.id)
                            else next.delete(r.id)
                            return next
                          })
                        }
                      />
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <span className="font-medium">{r.studentName}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{r.admissionNumber}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDay(r.date)}
                  <span className="block text-xs text-muted-foreground">{r.register}</span>
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <AttendanceStatusBadge status={r.fromStatus} />
                    <span aria-hidden>→</span>
                    <AttendanceStatusBadge status={r.toStatus} />
                  </span>
                  {r.toReason && <span className="block text-xs text-muted-foreground">Reason: {r.toReason}</span>}
                </TableCell>
                <TableCell className="max-w-64 text-sm">{r.justification}</TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                  {r.requestedBy}
                  <span className="block">{when(r.createdAt)}</span>
                </TableCell>
                <TableCell className="pr-4">
                  <div className="flex flex-col items-start gap-1">
                    <Pill className={CORRECTION_STATUS_TONE[r.status]}>{CORRECTION_STATUS_LABELS[r.status]}</Pill>
                    {r.reviewedBy && r.status !== "PENDING" && <span className="text-xs text-muted-foreground">by {r.reviewedBy}</span>}
                    {r.reviewNote && r.reviewNote !== "Applied directly" && <span className="max-w-48 text-xs text-muted-foreground">{r.reviewNote}</span>}
                    {r.status === "PENDING" && r.mine && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={async () => {
                          const result = await cancelCorrectionAction(r.id)
                          toast.add({ title: result.ok ? "Request cancelled" : "Couldn't cancel", description: result.ok ? undefined : result.error, type: result.ok ? "success" : "error" })
                          router.refresh()
                        }}
                      >
                        Cancel request
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={decision !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDecision(null)
            setNote("")
          }
        }}
        title={`${decision?.approve ? "Approve" : "Reject"} ${decision?.ids.length === 1 ? "this correction" : `${decision?.ids.length ?? 0} corrections`}?`}
        description={decision?.approve ? "Approved changes are applied now. The original marks stay in each record's history." : "The current marks stay as they are."}
        confirmLabel={decision?.approve ? "Approve" : "Reject"}
        destructive={decision ? !decision.approve : false}
        onConfirm={async () => {
          if (!decision) return
          const result = await reviewCorrectionsAction({ correctionIds: decision.ids, decision: decision.approve ? "APPROVE" : "REJECT", note })
          if (!result.ok) {
            toast.add({ title: "Couldn't review", description: result.error, type: "error" })
            return false
          }
          const { approved, rejected, skipped } = result.data
          toast.add({
            title: decision.approve ? `${approved} approved` : `${rejected} rejected`,
            description: [decision.approve && rejected ? `${rejected} were out of date and rejected.` : null, ...skipped.slice(0, 3).map((s) => `${s.name}: ${s.reason}`)].filter(Boolean).join(" ") || undefined,
            type: skipped.length ? "warning" : "success",
          })
          setSelected(new Set())
          setNote("")
          router.refresh()
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="review-note">Note (optional)</Label>
          <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
        </div>
      </ConfirmDialog>
    </div>
  )
}
