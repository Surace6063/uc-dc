import type { Metadata } from "next"
import Link from "next/link"
import { FilePenLineIcon } from "lucide-react"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { NoStudentProfile, NotEnrolled } from "@/features/student-portal/components/no-student"
import { formatDateTime, relativeTime } from "@/features/teaching/format"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { myAssignments, mySubjects, type StudentAssignment } from "@/services/student-portal/learning-service"
import { myEnrollment, myStudent } from "@/services/student-portal/me-service"

export const metadata: Metadata = { title: "Assignments" }

const params = z.object({
  status: z.enum(["pending", "submitted", "reviewed", "overdue"]).optional().catch(undefined),
  subject: z.uuid().optional().catch(undefined),
})

const STATE: Record<StudentAssignment["state"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "To do", variant: "default" },
  returned: { label: "Returned to you", variant: "outline" },
  overdue: { label: "Overdue", variant: "destructive" },
  submitted: { label: "Submitted", variant: "secondary" },
  reviewed: { label: "Reviewed", variant: "secondary" },
}

const TABS = [
  { value: undefined, label: "All" },
  { value: "pending", label: "To do" },
  { value: "overdue", label: "Overdue" },
  { value: "submitted", label: "Submitted" },
  { value: "reviewed", label: "Reviewed" },
] as const

export default async function StudentAssignmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "assignments.view")) return <AccessDenied />
  const f = params.parse(await searchParams)
  const [student, enrollment, subjects, list] = await Promise.all([myStudent(context), myEnrollment(context), mySubjects(context), myAssignments(context, f)])
  const now = new Date()
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ status: f.status, subject: f.subject, ...o })) if (v) p.set(k, v)
    return `?${p}`
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Assignments" description="Work your teachers have set, with due dates and what you've handed in." breadcrumbs={[{ label: "Assignments" }]} />
      {!student ? (
        <NoStudentProfile />
      ) : !enrollment ? (
        <NotEnrolled />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap gap-1 rounded-lg border p-0.5" aria-label="Filter by status">
              {TABS.map((t) => (
                <Button key={t.label} size="sm" variant={f.status === t.value ? "secondary" : "ghost"} aria-current={f.status === t.value ? "page" : undefined} nativeButton={false} render={<Link href={q({ status: t.value })} />}>
                  {t.label}
                </Button>
              ))}
            </nav>
            {subjects.length > 1 && (
              <nav className="flex flex-wrap gap-1" aria-label="Filter by subject">
                <Button size="sm" variant={!f.subject ? "outline" : "ghost"} nativeButton={false} render={<Link href={q({ subject: undefined })} />}>All subjects</Button>
                {subjects.map((s) => (
                  <Button key={s.subject.id} size="sm" variant={f.subject === s.subject.id ? "outline" : "ghost"} nativeButton={false} render={<Link href={q({ subject: s.subject.id })} />}>{s.subject.name}</Button>
                ))}
              </nav>
            )}
          </div>
          {list.length === 0 ? (
            <EmptyState icon={FilePenLineIcon} title="No assignments" description={f.status || f.subject ? "Nothing matches this filter." : "Your teachers haven't set any work yet."} />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4">Assignment</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Marks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="pl-4">
                        <Link href={`/dashboard/student/assignments/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
                        <span className="block text-xs text-muted-foreground">{a.subject.name} · {a.teacher.firstName} {a.teacher.lastName}</span>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateTime(a.dueAt)}
                        <span className="block text-xs text-muted-foreground">{relativeTime(a.dueAt, now)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap gap-1.5">
                          <Badge variant={STATE[a.state].variant}>{STATE[a.state].label}</Badge>
                          {a.submission?.late && <Badge variant="outline">Late</Badge>}
                          {a.status === "CLOSED" && !a.submission && <Badge variant="outline">Closed</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">
                        {a.submission?.marks !== null && a.submission?.marks !== undefined ? `${a.submission.marks}${a.maxMarks !== null ? ` / ${a.maxMarks}` : ""}` : a.maxMarks !== null ? <span className="text-muted-foreground">/ {a.maxMarks}</span> : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
