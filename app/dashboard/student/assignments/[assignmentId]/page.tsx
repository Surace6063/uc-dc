import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { ContentSection } from "@/components/shared/content-section"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { SubmitWork } from "@/features/student-portal/components/submit-work"
import { SUBMISSION_STATUS_LABELS } from "@/features/teaching/constants"
import { formatDateTime, relativeTime } from "@/features/teaching/format"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { getMyAssignment } from "@/services/student-portal/learning-service"

export const metadata: Metadata = { title: "Assignment" }

export default async function StudentAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "assignments.view")) return <AccessDenied />
  const id = z.uuid().safeParse((await params).assignmentId)
  if (!id.success) notFound()
  let a
  try {
    a = await getMyAssignment(context, id.data)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const s = a.submission
  const overdue = new Date(a.dueAt) < new Date()

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={a.title}
        description={`${a.subject.name} · ${a.teacher.firstName} ${a.teacher.lastName}`}
        breadcrumbs={[{ label: "Assignments", href: "/dashboard/student/assignments" }, { label: a.title }]}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={overdue && !s ? "text-destructive" : "text-muted-foreground"}>Due {formatDateTime(a.dueAt)} ({relativeTime(a.dueAt)})</span>
        {a.maxMarks !== null && <span className="text-muted-foreground">· Full marks {a.maxMarks}</span>}
        {a.status === "CLOSED" && <Badge variant="outline">Closed for submissions</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ContentSection title="Instructions" className="lg:col-span-2">
          <p className="text-sm whitespace-pre-wrap">{a.instructions || <span className="text-muted-foreground">No instructions were given.</span>}</p>
        </ContentSection>

        <ContentSection title="Your work">
          {s ? (
            <dl className="grid gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={s.status === "REVIEWED" ? "secondary" : s.status === "RETURNED" ? "destructive" : "default"}>{s.status === "SUBMITTED" ? "Submitted" : SUBMISSION_STATUS_LABELS[s.status]}</Badge>
                {s.late && <Badge variant="outline">Late</Badge>}
              </div>
              <div><dt className="text-xs text-muted-foreground">Handed in</dt><dd>{formatDateTime(s.submittedAt)}{s.recordedById ? " · on paper" : ""}</dd></div>
              {s.fileName && (
                <div><dt className="text-xs text-muted-foreground">File</dt><dd><a href={`/api/assignments/${a.id}/submissions/${s.id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{s.fileName}</a></dd></div>
              )}
              {s.content && <div><dt className="text-xs text-muted-foreground">Your answer / note</dt><dd className="whitespace-pre-wrap">{s.content}</dd></div>}
              {(s.status === "REVIEWED" || s.status === "RETURNED") && (
                <>
                  {s.marks !== null && <div><dt className="text-xs text-muted-foreground">Marks</dt><dd className="text-lg font-semibold tabular-nums">{s.marks}{a.maxMarks !== null ? ` / ${a.maxMarks}` : ""}</dd></div>}
                  {s.feedback && <div><dt className="text-xs text-muted-foreground">Teacher&apos;s feedback</dt><dd className="whitespace-pre-wrap">{s.feedback}</dd></div>}
                </>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{a.status === "CLOSED" ? "Not submitted. This assignment is closed." : "You haven't handed in anything yet."}</p>
          )}
        </ContentSection>
      </div>

      {a.canSubmit && (
        <ContentSection title={s ? (s.status === "RETURNED" ? "Hand in again" : "Replace your submission") : "Hand in your work"} description="Write your answer, attach a PDF or photo of your work, or both.">
          <SubmitWork assignmentId={a.id} hasFile={!!s?.fileName} previousContent={s?.content ?? ""} />
        </ContentSection>
      )}
    </div>
  )
}
