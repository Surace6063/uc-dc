"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { FormProvider, useForm } from "react-hook-form"
import { CheckCircle2Icon, ClockAlertIcon, InboxIcon, LockIcon, PencilIcon, SendIcon, Trash2Icon, UnlockIcon, UsersIcon } from "lucide-react"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ContentSection } from "@/components/shared/content-section"
import { SelectField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { localDate } from "@/features/attendance/constants"
import { deleteClassAssignmentAction, recordSubmissionAction, reviewSubmissionAction, setClassAssignmentStatusAction } from "@/features/teaching/actions"
import { AssignmentFormDialog } from "@/features/teaching/components/assignment-form-dialog"
import { LocalTable } from "@/features/teaching/components/local-table"
import { CLASS_ASSIGNMENT_STATUS_LABELS, SUBMISSION_STATUS_LABELS } from "@/features/teaching/constants"
import { formatDateTime, relativeTime } from "@/features/teaching/format"
import { recordSubmissionSchema, reviewSubmissionSchema } from "@/features/teaching/schemas"
import { useActionRunner, useDialogSubmit } from "@/hooks/use-dialog-submit"
import type { ClassAssignmentDetail } from "@/services/teaching/class-assignment-service"
import type { TeachingOptions } from "@/services/teaching/options-service"

type StudentRow = ClassAssignmentDetail["students"][number]
const fullName = (s: StudentRow["student"]) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")

export function AssignmentDetail({ detail, options, canDelete }: { detail: ClassAssignmentDetail; options: TeachingOptions | null; canDelete: boolean }) {
  const router = useRouter()
  const a = detail.assignment
  const runner = useActionRunner()
  const [editing, setEditing] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const [recording, setRecording] = React.useState<StudentRow | "pick" | null>(null)
  const [reviewing, setReviewing] = React.useState<StudentRow | null>(null)
  const [now] = React.useState(() => new Date())
  const overdue = new Date(a.dueAt) < now

  const recordForm = useForm<z.input<typeof recordSubmissionSchema>, unknown, z.output<typeof recordSubmissionSchema>>({ resolver: zodResolver(recordSubmissionSchema) })
  const record = useDialogSubmit(recordForm, () => setRecording(null))
  const reviewForm = useForm<z.input<typeof reviewSubmissionSchema>, unknown, z.output<typeof reviewSubmissionSchema>>({ resolver: zodResolver(reviewSubmissionSchema) })
  const review = useDialogSubmit(reviewForm, () => setReviewing(null))

  const missing = detail.students.filter((s) => s.enrolled && !s.submission)

  function openRecord(row: StudentRow | null) {
    record.setError(null)
    recordForm.reset({ studentId: row?.student.id ?? "", submittedOn: localDate(), content: "" })
    setRecording(row ?? "pick")
  }
  function openReview(row: StudentRow) {
    review.setError(null)
    reviewForm.reset({ status: "REVIEWED", marks: row.submission?.marks ?? "", feedback: row.submission?.feedback ?? "" })
    setReviewing(row)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={a.status === "PUBLISHED" ? "default" : a.status === "CLOSED" ? "secondary" : "outline"}>{CLASS_ASSIGNMENT_STATUS_LABELS[a.status]}</Badge>
        <span className={overdue && a.status === "PUBLISHED" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          Due {formatDateTime(a.dueAt)} ({relativeTime(a.dueAt, now)})
        </span>
        {a.maxMarks !== null && <span className="text-sm text-muted-foreground">· Full marks {a.maxMarks}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {detail.canEdit && a.status !== "CLOSED" && options && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}><PencilIcon data-icon="inline-start" />Edit</Button>
          )}
          {detail.canEdit && a.status === "DRAFT" && (
            <Button size="sm" disabled={runner.pending} onClick={() => runner.run(() => setClassAssignmentStatusAction(a.id, "PUBLISHED"))}><SendIcon data-icon="inline-start" />Publish</Button>
          )}
          {detail.canEdit && a.status === "PUBLISHED" && (
            <Button variant="outline" size="sm" disabled={runner.pending} onClick={() => runner.run(() => setClassAssignmentStatusAction(a.id, "CLOSED"))}><LockIcon data-icon="inline-start" />Close submissions</Button>
          )}
          {detail.canEdit && a.status === "CLOSED" && (
            <Button variant="outline" size="sm" disabled={runner.pending} onClick={() => runner.run(() => setClassAssignmentStatusAction(a.id, "PUBLISHED"))}><UnlockIcon data-icon="inline-start" />Reopen</Button>
          )}
          {canDelete && detail.summary.submitted === 0 && (
            <Button variant="ghost" size="sm" onClick={() => setRemoving(true)}><Trash2Icon data-icon="inline-start" />Delete</Button>
          )}
        </div>
      </div>

      <SummaryGrid columns={4}>
        <SummaryCard label="Students" value={detail.summary.students} icon={UsersIcon} />
        <SummaryCard label="Submitted" value={detail.summary.submitted} hint={detail.summary.late ? `${detail.summary.late} late` : undefined} icon={SendIcon} />
        <SummaryCard label="Awaiting review" value={detail.summary.awaitingReview} icon={InboxIcon} />
        <SummaryCard label="Not submitted" value={missing.length} hint={overdue ? "Past the due time" : undefined} icon={ClockAlertIcon} />
      </SummaryGrid>

      <ContentSection title="Instructions">
        <p className="text-sm whitespace-pre-wrap">{a.instructions || <span className="text-muted-foreground">No instructions.</span>}</p>
      </ContentSection>

      <ContentSection
        variant="plain"
        title="Students"
        description={a.status === "DRAFT" ? "Publish the assignment to start recording work." : "Work submitted online appears here; record work handed in on paper yourself."}
        actions={
          detail.canGrade && a.status !== "DRAFT" && missing.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => openRecord(null)}>Record paper submission</Button>
          )
        }
      >
        <LocalTable
          rows={detail.students}
          getRowId={(r) => r.student.id}
          searchText={(r) => `${fullName(r.student)} ${r.student.admissionNumber} ${r.rollNumber ?? ""}`}
          searchPlaceholder="Search students"
          initialSort={{ id: "roll" }}
          empty="No students are enrolled in this class."
          columns={[
            { id: "roll", header: "Roll", sortValue: (r) => r.rollNumber, cell: (r) => <span className="tabular-nums">{r.rollNumber ?? "—"}</span>, className: "w-16" },
            {
              id: "name",
              header: "Student",
              sortValue: (r) => fullName(r.student),
              cell: (r) => (
                <span className="block min-w-40">
                  <span className="font-medium">{fullName(r.student)}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{r.student.admissionNumber}{!r.enrolled && " · left the class"}</span>
                </span>
              ),
            },
            {
              id: "status",
              header: "Status",
              sortValue: (r) => (r.submission ? r.submission.status : "~"),
              cell: (r) =>
                r.submission ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={r.submission.status === "SUBMITTED" ? "default" : r.submission.status === "RETURNED" ? "destructive" : "secondary"}>{SUBMISSION_STATUS_LABELS[r.submission.status]}</Badge>
                    {r.submission.late && <Badge variant="outline" className="text-destructive">Late</Badge>}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Not submitted</span>
                ),
            },
            {
              id: "submitted",
              header: "Submitted",
              sortValue: (r) => (r.submission ? new Date(r.submission.submittedAt).getTime() : null),
              cell: (r) =>
                r.submission ? (
                  <span className="text-sm whitespace-nowrap">
                    {formatDateTime(r.submission.submittedAt)}
                    <span className="block text-xs text-muted-foreground">
                      {r.submission.recordedById ? (
                        "Handed in on paper"
                      ) : r.submission.fileName ? (
                        <a href={`/api/assignments/${a.id}/submissions/${r.submission.id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{r.submission.fileName}</a>
                      ) : (
                        "Online"
                      )}
                    </span>
                  </span>
                ) : "—",
            },
            {
              id: "marks",
              header: "Marks",
              sortValue: (r) => r.submission?.marks ?? null,
              cell: (r) => (r.submission?.marks !== null && r.submission?.marks !== undefined ? <span className="tabular-nums">{r.submission.marks}{a.maxMarks !== null ? ` / ${a.maxMarks}` : ""}</span> : "—"),
            },
            {
              id: "actions",
              header: "",
              className: "w-32 text-right",
              cell: (r) =>
                !detail.canGrade ? null : r.submission ? (
                  <Button size="xs" variant={r.submission.status === "SUBMITTED" ? "default" : "outline"} onClick={() => openReview(r)}>
                    <CheckCircle2Icon data-icon="inline-start" />
                    {r.submission.status === "SUBMITTED" ? "Review" : "Update"}
                  </Button>
                ) : r.enrolled && a.status !== "DRAFT" ? (
                  <Button size="xs" variant="ghost" onClick={() => openRecord(r)}>Record</Button>
                ) : null,
            },
          ]}
        />
      </ContentSection>

      {options && (
        <AssignmentFormDialog open={editing} onOpenChange={setEditing} assignment={a} options={options} defaults={{ academicYearId: a.academicYearId }} />
      )}

      <FormProvider {...recordForm}>
        <FormDialog
          open={recording !== null}
          onOpenChange={(o) => !o && setRecording(null)}
          title="Record paper submission"
          description="For work handed in on paper. Only the day is recorded; work from the due day counts as on time."
          pending={recordForm.formState.isSubmitting}
          error={record.error}
          onSubmit={recordForm.handleSubmit((values) => record.run(() => recordSubmissionAction(a.id, values)))}
          submitLabel="Record"
        >
          <SelectField control={recordForm.control} name="studentId" label="Student" required placeholder="Choose" options={missing.map((s) => ({ value: s.student.id, label: `${s.rollNumber ? `${s.rollNumber}. ` : ""}${fullName(s.student)}` }))} />
          <TextField control={recordForm.control} name="submittedOn" label="Handed in on" type="date" max={localDate()} />
          <TextAreaField control={recordForm.control} name="content" label="Note" rows={2} placeholder="Optional, e.g. 4 pages, diagram missing" />
        </FormDialog>
      </FormProvider>

      <FormProvider {...reviewForm}>
        <FormDialog
          open={reviewing !== null}
          onOpenChange={(o) => !o && setReviewing(null)}
          title={reviewing ? `Review: ${fullName(reviewing.student)}` : "Review"}
          description={reviewing?.submission?.content ? `Student's note: ${reviewing.submission.content}` : undefined}
          pending={reviewForm.formState.isSubmitting}
          error={review.error}
          onSubmit={reviewForm.handleSubmit((values) => reviewing?.submission && review.run(() => reviewSubmissionAction(a.id, reviewing.submission!.id, values)))}
          submitLabel="Save review"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField control={reviewForm.control} name="status" label="Outcome" options={[{ value: "REVIEWED", label: "Reviewed" }, { value: "RETURNED", label: "Return for changes" }]} />
            <TextField control={reviewForm.control} name="marks" label={a.maxMarks !== null ? `Marks (out of ${a.maxMarks})` : "Marks"} type="number" min={0} max={a.maxMarks ?? undefined} step="0.5" />
          </div>
          <TextAreaField control={reviewForm.control} name="feedback" label="Feedback" rows={3} description="Shown to the student." />
        </FormDialog>
      </FormProvider>

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Delete “${a.title}”?`}
        description="The assignment is removed permanently. Nothing has been submitted for it yet."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const ok = await runner.run(() => deleteClassAssignmentAction(a.id))
          if (ok) router.push("/dashboard/assignments")
          return ok
        }}
      />
    </div>
  )
}
