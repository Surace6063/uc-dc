import type { Metadata } from "next"
import Link from "next/link"
import { ClipboardListIcon, PenLineIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EXAM_STATUS_LABELS } from "@/features/exams/constants"
import { formatDate, formatWeekdayDate } from "@/features/teaching/format"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { myExamSchedule, myPendingSheets } from "@/services/teaching/exam-service"
import { resolveYear } from "@/services/teaching/scope-service"

export const metadata: Metadata = { title: "My examinations" }

// Papers in the subjects a teacher teaches (class teachers: their class's
// papers), with dates, and the marks sheets they still have to enter.
export default async function TeacherExamsPage({ searchParams }: { searchParams: Promise<{ year?: string; when?: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "exams.view")) return <AccessDenied />
  const sp = await searchParams
  const when = sp.when === "all" ? "all" : "upcoming"
  const yearId = await resolveYear(context, sp.year)
  const canGrade = hasPermission(context, "exams.grade") || hasPermission(context, "exams.marks.manage")
  const [papers, sheets] = await Promise.all([myExamSchedule(context, yearId, when), canGrade ? myPendingSheets(context) : []])
  const exams = new Set(papers.map((p) => p.examination.id)).size
  const returned = sheets.filter((s) => s.status === "RETURNED").length
  const qs = (w: string) => new URLSearchParams({ ...(sp.year && { year: sp.year }), ...(w === "all" && { when: "all" }) }).toString()

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Examinations" description="Exam dates for your subjects, and the marks you still have to enter." breadcrumbs={[{ label: "Examinations" }]}>
        {canGrade && (
          <Button size="sm" nativeButton={false} render={<Link href="/dashboard/exams/marks" />}>
            <PenLineIcon data-icon="inline-start" />
            Marks entry
          </Button>
        )}
      </PageHeader>

      <SummaryGrid columns={3}>
        <SummaryCard label={when === "all" ? "Examinations this year" : "Upcoming examinations"} value={exams} hint={`${papers.length} paper${papers.length === 1 ? "" : "s"} in your subjects`} icon={ClipboardListIcon} />
        <SummaryCard label="Marks sheets to enter" value={sheets.length} hint="Not started, draft or returned" icon={PenLineIcon} href="/dashboard/exams/marks" />
        <SummaryCard label="Returned for correction" value={returned} icon={PenLineIcon} href="/dashboard/exams/marks" />
      </SummaryGrid>

      <div className="flex gap-1 rounded-lg border p-0.5 self-start" role="tablist" aria-label="Which papers">
        <Button variant={when === "upcoming" ? "secondary" : "ghost"} size="sm" role="tab" aria-selected={when === "upcoming"} nativeButton={false} render={<Link href={`?${qs("upcoming")}`} />}>Upcoming</Button>
        <Button variant={when === "all" ? "secondary" : "ghost"} size="sm" role="tab" aria-selected={when === "all"} nativeButton={false} render={<Link href={`?${qs("all")}`} />}>Whole year</Button>
      </div>

      {papers.length === 0 ? (
        <EmptyState icon={ClipboardListIcon} title={when === "upcoming" ? "No upcoming papers" : "No papers this year"} description="Papers appear here once the examination office schedules examinations that include your subjects." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Examination</TableHead>
                <TableHead className="text-right">Full / pass</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {papers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-4 whitespace-nowrap">
                    <span className="font-medium">{p.examDate ? formatWeekdayDate(p.examDate) : "Date to be set"}</span>
                    <span className="block text-xs text-muted-foreground">{p.startTime ? `${p.startTime}${p.endTime ? `–${p.endTime}` : ""}` : `${formatDate(p.examination.startDate)} – ${formatDate(p.examination.endDate)}`}{p.venue ? ` · ${p.venue}` : ""}</span>
                  </TableCell>
                  <TableCell>{p.subjectOffering.subject.name}<span className="block font-mono text-xs text-muted-foreground">{p.subjectOffering.code ?? p.subjectOffering.subject.code}</span></TableCell>
                  <TableCell>{p.class.name}</TableCell>
                  <TableCell>{p.examination.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(p.maximumMarks)}{p.passMarks !== null ? ` / ${Number(p.passMarks)}` : ""}</TableCell>
                  <TableCell className="pr-4">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{EXAM_STATUS_LABELS[p.examination.status]}</Badge>
                      {canGrade && (p.examination.status === "SCHEDULED" || p.examination.status === "REVISION") && (
                        <Link href={`/dashboard/exams/marks?exam=${p.examination.id}`} className="text-xs text-primary hover:underline">Enter marks</Link>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
