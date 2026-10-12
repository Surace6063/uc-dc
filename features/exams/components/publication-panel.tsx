"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { BadgeCheckIcon, CircleAlertIcon, MegaphoneIcon, RotateCcwIcon, ShieldCheckIcon, Undo2Icon } from "lucide-react"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { useCan } from "@/components/shared/session-provider"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { approveExaminationAction, openRevisionAction, publishResultsAction, revokeApprovalAction } from "@/features/exams/actions"
import { ExamStatusBadge } from "@/features/exams/components/exams-nav"
import { formatPercent } from "@/features/exams/calculation"
import { formatDateTime, RESULT_STATUS_LABELS } from "@/features/exams/constants"
import type { ExaminationStatus } from "@/lib/generated/prisma/enums"
import type { PublicationCheck } from "@/services/exams/result-service"

type Sheet = { sheetId: string; label: string }

export function PublicationPanel({
  examinationId,
  status,
  check,
  publication,
  approvedSheets,
}: {
  examinationId: string
  status: ExaminationStatus
  check: PublicationCheck | null
  publication: { version: number; publishedAt: Date } | null
  approvedSheets: Sheet[]
}) {
  const router = useRouter()
  const canApprove = useCan("exams.approve")
  const canPublish = useCan("exams.publish")
  const [dialog, setDialog] = React.useState<null | "approve" | "revoke" | "publish" | "revision">(null)
  const [reason, setReason] = React.useState("")
  const [notify, setNotify] = React.useState(true)
  const [sheets, setSheets] = React.useState<string[]>([])

  function close() {
    setDialog(null)
    setReason("")
    setSheets([])
  }

  async function confirm() {
    const values = { examinationId, reason, notifyGuardians: notify, sheetIds: sheets }
    const result =
      dialog === "approve"
        ? await approveExaminationAction(values)
        : dialog === "revoke"
          ? await revokeApprovalAction(values)
          : dialog === "publish"
            ? await publishResultsAction(values)
            : await openRevisionAction(values)
    if (!result.ok) {
      toast.add({ title: "Couldn't complete this step", description: result.fieldErrors?.reason?.[0] ?? result.error, type: "error" })
      return false
    }
    if (dialog === "publish" && result.data && "version" in result.data) {
      const n = result.data.notices
      toast.add({
        title: `Results published (version ${result.data.version})`,
        description: `${result.data.students} students.${n ? ` Notices prepared for ${n.recipients} guardian${n.recipients === 1 ? "" : "s"}; ${n.sent} sent — no SMS/email channel is configured yet, so ${n.unreached} weren't reached.` : ""}`,
        type: "success",
      })
    } else {
      toast.add({ title: result.message ?? "Done", type: "success" })
    }
    close()
    router.refresh()
  }

  const counts = check?.summary.counts ?? {}
  const blocked = (check?.errors.length ?? 0) > 0
  return (
    <Card className="gap-4 p-5 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Approval & publication</h2>
            <ExamStatusBadge status={status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {publication ? `Version ${publication.version} published ${formatDateTime(publication.publishedAt)}. ` : "Not published yet. "}
            {status === "REVISION" && "A correction is in progress; students and guardians still see the published version."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canApprove && (status === "SCHEDULED" || status === "REVISION") && (
            <Button onClick={() => setDialog("approve")} disabled={blocked}>
              <ShieldCheckIcon data-icon="inline-start" />
              Approve results
            </Button>
          )}
          {canApprove && status === "APPROVED" && (
            <Button variant="outline" onClick={() => setDialog("revoke")}>
              <Undo2Icon data-icon="inline-start" />
              Revoke approval
            </Button>
          )}
          {canPublish && status === "APPROVED" && (
            <Button onClick={() => setDialog("publish")} disabled={blocked}>
              <MegaphoneIcon data-icon="inline-start" />
              {publication ? "Publish revised results" : "Publish results"}
            </Button>
          )}
          {canApprove && status === "PUBLISHED" && (
            <Button variant="outline" onClick={() => setDialog("revision")}>
              <RotateCcwIcon data-icon="inline-start" />
              Correct published results
            </Button>
          )}
        </div>
      </div>

      {check && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><span className="font-medium tabular-nums">{check.summary.students}</span> students</span>
            <span><span className="font-medium tabular-nums">{check.summary.approvedSheets}/{check.summary.sheets}</span> marks sheets approved</span>
            {Object.entries(counts).map(([k, v]) => (
              <span key={k}><span className="font-medium tabular-nums">{v}</span> {RESULT_STATUS_LABELS[k as keyof typeof RESULT_STATUS_LABELS].toLowerCase()}</span>
            ))}
            {check.summary.passRate !== null && <span>Pass rate <span className="font-medium tabular-nums">{formatPercent(check.summary.passRate, 1)}%</span></span>}
            {check.changedFromPrevious !== null && <span><span className="font-medium tabular-nums">{check.changedFromPrevious}</span> results differ from the published version</span>}
          </div>
          {check.errors.length > 0 ? (
            <div role="alert" className="grid gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <p className="flex items-center gap-2 font-medium"><CircleAlertIcon className="size-4" />Can&apos;t be approved or published yet</p>
              <ul className="list-disc pl-6">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><BadgeCheckIcon className="size-4" />All checks passed.</p>
          )}
          {check.warnings.length > 0 && (
            <ul className="list-disc rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 pl-8 text-sm text-amber-800 dark:text-amber-300">
              {check.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && close()}
        title={
          dialog === "approve" ? "Approve these results?" : dialog === "revoke" ? "Revoke the approval?" : dialog === "publish" ? (publication ? `Publish version ${publication.version + 1}?` : "Publish these results?") : "Correct the published results?"
        }
        description={
          dialog === "approve"
            ? "The policy and grading scale are snapshotted now, so later changes to them won't affect this examination."
            : dialog === "revoke"
              ? "Marks sheets can be returned for correction again."
              : dialog === "publish"
                ? "Students and linked guardians will see these results. A published version is never changed; corrections publish a new version."
                : "The current version stays visible until a revised one is published. Choose the marks sheets to send back to their teachers."
        }
        confirmLabel={dialog === "approve" ? "Approve" : dialog === "revoke" ? "Revoke" : dialog === "publish" ? "Publish" : "Open correction"}
        onConfirm={confirm}
      >
        {(dialog === "revoke" || dialog === "revision" || (dialog === "publish" && publication)) && (
          <div className="grid gap-1.5">
            <Label htmlFor="publication-reason">{dialog === "publish" ? "What does this version correct?" : "Reason"}</Label>
            <Textarea id="publication-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} />
          </div>
        )}
        {dialog === "publish" && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={notify} onCheckedChange={(v) => setNotify(v)} />
            Prepare notices for guardians who receive academic notifications
          </label>
        )}
        {dialog === "revision" && (
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-2">
            {approvedSheets.length === 0 && <p className="text-sm text-muted-foreground">No approved marks sheets.</p>}
            {approvedSheets.map((s) => (
              <label key={s.sheetId} className="flex items-center gap-2 text-sm">
                <Checkbox checked={sheets.includes(s.sheetId)} onCheckedChange={(on) => setSheets((prev) => (on ? [...prev, s.sheetId] : prev.filter((x) => x !== s.sheetId)))} />
                {s.label}
              </label>
            ))}
          </div>
        )}
      </ConfirmDialog>
    </Card>
  )
}
