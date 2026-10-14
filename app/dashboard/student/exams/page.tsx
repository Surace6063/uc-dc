import type { Metadata } from "next"
import Link from "next/link"
import { ClipboardListIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EXAM_STATUS_LABELS } from "@/features/exams/constants"
import { NoStudentProfile, NotEnrolled } from "@/features/student-portal/components/no-student"
import { formatDate, formatWeekdayDate } from "@/features/teaching/format"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { myExamPapers } from "@/services/student-portal/exam-service"
import { myEnrollment, myStudent } from "@/services/student-portal/me-service"

export const metadata: Metadata = { title: "Examination schedule" }

export default async function StudentExamsPage({ searchParams }: { searchParams: Promise<{ when?: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "exams.view")) return <AccessDenied />
  const when = (await searchParams).when === "all" ? "all" : "upcoming"
  const [student, enrollment, papers] = await Promise.all([myStudent(context), myEnrollment(context), myExamPapers(context, when)])

  // Grouped by examination, in date order.
  const byExam = new Map<string, { name: string; status: (typeof papers)[number]["examination"]["status"]; start: Date; end: Date; papers: typeof papers }>()
  for (const p of papers) {
    const g = byExam.get(p.examination.id) ?? { name: p.examination.name, status: p.examination.status, start: p.examination.startDate, end: p.examination.endDate, papers: [] }
    g.papers.push(p)
    byExam.set(p.examination.id, g)
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Examination schedule" description="Dates and times of the papers your class sits." breadcrumbs={[{ label: "Examination schedule" }]} />
      <div className="flex gap-1 self-start rounded-lg border p-0.5" role="tablist" aria-label="Which papers">
        <Button variant={when === "upcoming" ? "secondary" : "ghost"} size="sm" role="tab" aria-selected={when === "upcoming"} nativeButton={false} render={<Link href="?" />}>Upcoming</Button>
        <Button variant={when === "all" ? "secondary" : "ghost"} size="sm" role="tab" aria-selected={when === "all"} nativeButton={false} render={<Link href="?when=all" />}>Whole year</Button>
      </div>
      {!student ? (
        <NoStudentProfile />
      ) : !enrollment ? (
        <NotEnrolled />
      ) : byExam.size === 0 ? (
        <EmptyState icon={ClipboardListIcon} title={when === "upcoming" ? "No upcoming examinations" : "No examinations this year"} description="Papers appear here once the examination office publishes the schedule." />
      ) : (
        [...byExam.entries()].map(([id, g]) => (
          <section key={id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{g.name}</h2>
              <Badge variant="outline">{EXAM_STATUS_LABELS[g.status]}</Badge>
              <span className="text-sm text-muted-foreground">{formatDate(g.start)} – {formatDate(g.end)}</span>
            </div>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead className="pr-4 text-right">Full / pass marks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.papers.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-4 font-medium whitespace-nowrap">{p.examDate ? formatWeekdayDate(p.examDate) : "To be announced"}</TableCell>
                      <TableCell className="tabular-nums">{p.startTime ? `${p.startTime}${p.endTime ? `–${p.endTime}` : ""}` : "—"}</TableCell>
                      <TableCell>
                        {p.subjectOffering.subject.name}
                        {!p.isCompulsory && <Badge variant="outline" className="ml-2">Optional</Badge>}
                      </TableCell>
                      <TableCell>{p.venue ?? "—"}</TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">{Number(p.maximumMarks)}{p.passMarks !== null ? ` / ${Number(p.passMarks)}` : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ))
      )}
    </div>
  )
}
