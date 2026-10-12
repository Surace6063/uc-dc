"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CalendarCheckIcon,
  ClipboardCheckIcon,
  FileClockIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UnlockIcon,
} from "lucide-react"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { useCan } from "@/components/shared/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { deleteExaminationAction, examTransitionAction, releaseHoldAction, removeExamSubjectAction } from "@/features/exams/actions"
import { ExamStatusBadge, SheetStatusBadge } from "@/features/exams/components/exams-nav"
import { AddSubjectsDialog, SubjectDialog } from "@/features/exams/components/subject-dialogs"
import { formatGradePoint, formatMarks, formatPercent } from "@/features/exams/calculation"
import {
  ABSENT_TREATMENT_LABELS,
  COMPONENT_TYPE_LABELS,
  formatDateTime,
  formatDay,
  GPA_METHOD_LABELS,
  PASS_RULE_LABELS,
  RANK_BASIS_LABELS,
  RANK_SCOPE_LABELS,
  RESULT_STATUS_LABELS,
} from "@/features/exams/constants"
import { fullName } from "@/features/students/constants"
import type { ExaminationDetail } from "@/services/exams/examination-service"

type Offering = { id: string; classId: string; className: string; name: string; code: string; requirement: string }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

export function ExamDetailView({ data, offerings, phase }: { data: ExaminationDetail; offerings: Offering[] | null; phase: string | null }) {
  const router = useRouter()
  const { exam, subjects, progress, publications, issues, rules } = data
  const canUpdate = useCan("exams.update")
  const canApprove = useCan("exams.approve")
  const canPublish = useCan("exams.publish")
  const canHold = canApprove || canPublish
  const [editing, setEditing] = React.useState<ExaminationDetail["subjects"][number] | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [confirm, setConfirm] = React.useState<null | "schedule" | "unschedule" | "archive" | "restore" | "delete">(null)
  const [removing, setRemoving] = React.useState<ExaminationDetail["subjects"][number] | null>(null)
  const draft = exam.status === "DRAFT"
  const required = progress.filter((p) => p.required)
  const submitted = required.filter((p) => ["SUBMITTED", "VERIFIED", "APPROVED"].includes(p.status)).length
  const approved = required.filter((p) => p.status === "APPROVED").length

  async function transition(kind: "schedule" | "unschedule" | "archive" | "restore") {
    const result = await examTransitionAction(kind, { examinationId: exam.id })
    if (!result.ok) {
      toast.add({ title: "Couldn't update the examination", description: result.error, type: "error" })
      return false
    }
    const warnings = (result.data as { warnings?: string[] } | null)?.warnings ?? []
    toast.add({
      title: { schedule: "Scheduled — marks entry is open", unschedule: "Moved back to draft", archive: "Archived", restore: "Restored" }[kind],
      description: warnings.length ? warnings.join(" ") : undefined,
      type: "success",
    })
    router.refresh()
  }

  const policy = rules.policy
  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <ExamStatusBadge status={exam.status} phase={phase} />
              <Badge variant="secondary">{exam.assessmentType.name}</Badge>
              {data.rulesSnapshotted && <Badge variant="outline">Rules snapshotted</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{exam.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canUpdate && (draft || exam.status === "SCHEDULED") && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard/exams/${exam.id}/edit`} />}>
                <PencilIcon data-icon="inline-start" />
                Edit details
              </Button>
            )}
            {canUpdate && draft && (
              <Button size="sm" onClick={() => setConfirm("schedule")} disabled={issues.errors.length > 0 || subjects.length === 0}>
                <CalendarCheckIcon data-icon="inline-start" />
                Schedule & open marks entry
              </Button>
            )}
            {canUpdate && exam.status === "SCHEDULED" && progress.every((p) => !p.sheetId) && (
              <Button variant="outline" size="sm" onClick={() => setConfirm("unschedule")}>
                <UnlockIcon data-icon="inline-start" />
                Back to draft
              </Button>
            )}
            {exam.status !== "DRAFT" && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard/exams/marks?exam=${exam.id}`} />}>
                <ClipboardCheckIcon data-icon="inline-start" />
                Marks
              </Button>
            )}
            {exam.status !== "DRAFT" && (
              <Button size="sm" variant={exam.status === "SCHEDULED" ? "outline" : "default"} nativeButton={false} render={<Link href={`/dashboard/exams/${exam.id}/results`} />}>
                <FileClockIcon data-icon="inline-start" />
                Results & publication
              </Button>
            )}
            {canUpdate && (draft || exam.status === "PUBLISHED") && (
              <Button variant="ghost" size="sm" onClick={() => setConfirm("archive")}>
                <ArchiveIcon data-icon="inline-start" />
                Archive
              </Button>
            )}
            {canUpdate && exam.status === "ARCHIVED" && (
              <Button variant="outline" size="sm" onClick={() => setConfirm("restore")}>
                <ArchiveRestoreIcon data-icon="inline-start" />
                Restore
              </Button>
            )}
            {canUpdate && draft && progress.every((p) => !p.sheetId) && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm("delete")}>
                <Trash2Icon data-icon="inline-start" />
                Delete
              </Button>
            )}
          </div>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Academic year">{exam.academicYear.name}</Field>
          <Field label="Term">{exam.term}</Field>
          <Field label="Dates">{`${formatDay(exam.startDate)} – ${formatDay(exam.endDate)}`}</Field>
          <Field label="Planned result date">{exam.resultPublicationDate ? formatDay(exam.resultPublicationDate) : null}</Field>
          <Field label="Scope">{[exam.educationLevel?.name, exam.program?.name].filter(Boolean).join(" · ")}</Field>
          <Field label="Marks sheets">{required.length ? `${submitted}/${required.length} submitted · ${approved} approved` : null}</Field>
        </dl>
        {issues.errors.length > 0 && (
          <div role="alert" className="grid gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="flex items-center gap-2 font-medium"><TriangleAlertIcon className="size-4" />Fix before scheduling or approval</p>
            <ul className="list-disc pl-6">{issues.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
        {issues.warnings.length > 0 && (
          <ul className="list-disc rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 pl-8 text-sm text-amber-800 dark:text-amber-300">
            {issues.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
      </Card>

      <Tabs defaultValue="subjects">
        <TabsList variant="line" className="overflow-x-auto">
          <TabsTrigger value="subjects">Subjects ({subjects.length})</TabsTrigger>
          <TabsTrigger value="progress">Marks progress</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="publication">Publication ({publications.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="subjects" className="grid gap-3 pt-3">
          {canUpdate && draft && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAdding(true)}>
                <PlusIcon data-icon="inline-start" />
                Add subjects
              </Button>
            </div>
          )}
          <Card className="overflow-x-auto p-0">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Subject</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Components</TableHead>
                  <TableHead>Full / pass</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Paper</TableHead>
                  <TableHead className="pr-4"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No subjects yet.{canUpdate && draft ? " Add the subjects this examination assesses." : ""}</TableCell></TableRow>
                )}
                {subjects.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4">
                      <span className="font-medium">{s.name}</span>
                      <span className="block text-xs text-muted-foreground">{s.code}{s.isCompulsory ? "" : " · optional"}{s.sectionLimited ? " · some sections" : ""}</span>
                    </TableCell>
                    <TableCell>{s.className}</TableCell>
                    <TableCell className="text-sm">
                      {s.components.map((c) => (
                        <span key={c.id} className="block whitespace-nowrap">
                          {c.name} <span className="text-muted-foreground">({COMPONENT_TYPE_LABELS[c.componentType]})</span> {c.maximumMarks}
                          {c.passMarks ? ` / ${c.passMarks}` : ""}{c.weightage ? ` · ${c.weightage}%` : ""}
                        </span>
                      ))}
                    </TableCell>
                    <TableCell className="tabular-nums">{s.maximumMarks}{s.passMarks ? ` / ${s.passMarks}` : ""}</TableCell>
                    <TableCell className="tabular-nums">{s.creditHours ?? "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{s.examDate ? formatDay(s.examDate) : "—"}{s.startTime ? <span className="block text-xs text-muted-foreground">{s.startTime}{s.endTime ? `–${s.endTime}` : ""}{s.venue ? ` · ${s.venue}` : ""}</span> : null}</TableCell>
                    <TableCell className="pr-4 text-right whitespace-nowrap">
                      {canUpdate && (draft || exam.status === "SCHEDULED") && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}><PencilIcon /></Button>
                      )}
                      {canUpdate && draft && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${s.name}`} onClick={() => setRemoving(s)}><Trash2Icon /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="progress" className="pt-3">
          <Card className="overflow-x-auto p-0">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Marks sheet</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Entered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4"><span className="sr-only">Open</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {progress.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No students are placed in this examination&apos;s classes yet.</TableCell></TableRow>}
                {progress.map((p) => (
                  <TableRow key={p.key}>
                    <TableCell className="pl-4">
                      <span className="font-medium">{p.subjectName}</span>
                      <span className="block text-xs text-muted-foreground">{p.className}{p.sectionName ? ` · Section ${p.sectionName}` : ""}{p.required ? "" : " · optional"}</span>
                      {p.returnNote && <span className="block text-xs text-amber-700 dark:text-amber-400">Returned: {p.returnNote}</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{p.students}</TableCell>
                    <TableCell className="tabular-nums">{p.expected ? `${p.entered}/${p.expected}` : p.entered}</TableCell>
                    <TableCell><SheetStatusBadge status={p.status} /></TableCell>
                    <TableCell className="pr-4 text-right">
                      {exam.status !== "DRAFT" && (
                        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/dashboard/exams/marks?exam=${exam.id}&subject=${p.examinationSubjectId}&section=${p.sectionId ?? "none"}`} />}>Open</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="pt-3">
          <Card className="grid gap-4 p-5">
            <p className="text-sm text-muted-foreground">
              {data.rulesSnapshotted
                ? "These are the rules snapshotted when the results were first approved. Later edits to the policy or grading scale don't affect this examination."
                : "Current rules of the selected policy and grading scale. They are snapshotted when the results are approved."}
            </p>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Result policy">{policy.name}</Field>
              <Field label="Subject pass decided by">{PASS_RULE_LABELS[policy.subjectPassRule]}</Field>
              <Field label="Component pass marks enforced">{policy.componentPassRequired ? "Yes" : "No"}</Field>
              <Field label="Absent components">{ABSENT_TREATMENT_LABELS[policy.absentTreatment]}</Field>
              <Field label="Optional subjects in totals">{policy.optionalInAggregate ? "Yes" : "No"}</Field>
              <Field label="GPA">{GPA_METHOD_LABELS[policy.gpaMethod]}</Field>
              <Field label="Rounding">{`${policy.percentageDecimals} decimal place(s) for percentages, ${policy.gpaDecimals} for GPA (half up, before grading)`}</Field>
              <Field label="Grace marks">{policy.graceMarksPerSubject ? `Up to ${formatMarks(policy.graceMarksPerSubject)} in up to ${policy.graceMaxSubjects} subject(s)` : "None"}</Field>
              <Field label="Ranking">{policy.rankingEnabled ? `${RANK_BASIS_LABELS[policy.rankBasis]}, ${RANK_SCOPE_LABELS[policy.rankScope].toLowerCase()}` : "Off"}</Field>
            </dl>
            <div>
              <p className="mb-2 text-sm font-medium">{rules.scale.name} v{rules.scale.version}</p>
              <div className="flex flex-wrap gap-2">
                {rules.scale.rules.map((r) => (
                  <span key={r.grade} className="rounded-md border px-2 py-1 text-xs tabular-nums">
                    <span className="font-semibold">{r.grade}</span> {formatPercent(r.min)}–{formatPercent(r.max)}%{r.gradePoint !== null ? ` · ${formatGradePoint(r.gradePoint)}` : ""}{r.isFailing ? " · failing" : ""}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="publication" className="grid gap-4 pt-3">
          <Card className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Version</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publications.length === 0 && <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">Not published yet.</TableCell></TableRow>}
                {publications.map((p) => {
                  const summary = p.summary as { students?: number; counts?: Record<string, number> }
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="pl-4 font-medium">Version {p.version}</TableCell>
                      <TableCell className="text-sm">{formatDateTime(p.publishedAt)}<span className="block text-xs text-muted-foreground">{p.publishedByName ?? ""}</span></TableCell>
                      <TableCell className="text-sm">
                        {summary.students ?? "—"}
                        <span className="block text-xs text-muted-foreground">
                          {Object.entries(summary.counts ?? {}).map(([k, v]) => `${v} ${RESULT_STATUS_LABELS[k as keyof typeof RESULT_STATUS_LABELS]?.toLowerCase() ?? k}`).join(", ")}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-72 text-sm">{p.reason ?? "—"}</TableCell>
                      <TableCell className="pr-4"><Badge variant={p.status === "ACTIVE" ? "default" : "outline"}>{p.status === "ACTIVE" ? "Current" : `Superseded ${formatDay(p.supersededAt)}`}</Badge></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
          <Card className="gap-3 p-5">
            <div>
              <h3 className="font-semibold">Withheld results</h3>
              <p className="text-sm text-muted-foreground">Withheld students get a “withheld” result without marks. Withhold a student from the results page.</p>
            </div>
            {exam.holds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No results are withheld.</p>
            ) : (
              <ul className="grid gap-2">
                {exam.holds.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                    <span><span className="font-medium">{fullName(h.student)}</span> <span className="text-muted-foreground">({h.student.admissionNumber})</span> — {h.reason}</span>
                    {canHold && ["SCHEDULED", "APPROVED", "REVISION"].includes(exam.status) && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={async () => {
                          const result = await releaseHoldAction(h.id)
                          toast.add(result.ok ? { title: "Hold released", type: "success" } : { title: "Couldn't release the hold", description: result.error, type: "error" })
                          router.refresh()
                        }}
                      >
                        <RotateCcwIcon data-icon="inline-start" />
                        Release
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="pt-3">
          <Card className="p-5">
            {data.activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ol className="grid gap-3">
                {data.activity.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p>{a.summary}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)} · {a.actor?.name || a.actor?.email || "System"}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {editing && <SubjectDialog subject={editing} examDraft={draft} examDates={{ start: exam.startDate, end: exam.endDate }} onClose={() => setEditing(null)} />}
      {adding && offerings && <AddSubjectsDialog examinationId={exam.id} offerings={offerings} onClose={() => setAdding(false)} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? ""} (${removing?.className ?? ""})?`}
        description="Its components are removed too. The subject offering itself isn't affected."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          const result = await removeExamSubjectAction(removing!.id)
          if (!result.ok) {
            toast.add({ title: "Couldn't remove the subject", description: result.error, type: "error" })
            return false
          }
          router.refresh()
        }}
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm === "schedule"
            ? "Schedule this examination?"
            : confirm === "unschedule"
              ? "Move back to draft?"
              : confirm === "archive"
                ? "Archive this examination?"
                : confirm === "restore"
                  ? "Restore this examination?"
                  : "Delete this draft examination?"
        }
        description={
          confirm === "schedule"
            ? "Subjects, components, full and pass marks become fixed and teachers can start entering marks. Only the timetable can change afterwards."
            : confirm === "unschedule"
              ? "Marks entry closes and the configuration can be edited again. Possible only while no marks have been entered."
              : confirm === "archive"
                ? "It's hidden from day-to-day lists. Published results stay available to students and guardians."
                : confirm === "restore"
                  ? "It returns to the lists with its previous status."
                  : "This can't be undone."
        }
        confirmLabel={confirm === "delete" ? "Delete" : "Confirm"}
        destructive={confirm === "delete"}
        onConfirm={async () => {
          if (confirm === "delete") {
            const result = await deleteExaminationAction(exam.id)
            if (!result.ok) {
              toast.add({ title: "Couldn't delete", description: result.error, type: "error" })
              return false
            }
            router.push("/dashboard/exams")
            return
          }
          return transition(confirm!)
        }}
      />
    </div>
  )
}
