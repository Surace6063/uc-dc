import type { Metadata } from "next"
import Link from "next/link"
import { AwardIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatGpa, formatMarks, formatPercent } from "@/features/exams/calculation"
import { NoStudentProfile } from "@/features/student-portal/components/no-student"
import { formatDate } from "@/features/teaching/format"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { myMarks } from "@/services/student-portal/exam-service"
import { myStudent } from "@/services/student-portal/me-service"

export const metadata: Metadata = { title: "My marks" }

// Subject-wise marks from published results only.
export default async function StudentMarksPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "results.view")) return <AccessDenied />
  const [student, marks] = await Promise.all([myStudent(context), myMarks(context)])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="My marks" description="Subject marks from your published results. Marks appear only after results are published." breadcrumbs={[{ label: "My marks" }]} />
      {!student ? (
        <NoStudentProfile />
      ) : marks.length === 0 ? (
        <EmptyState icon={AwardIcon} title="No published marks yet" description="Your marks appear here once the school publishes an examination's results." />
      ) : (
        marks.map((m) => (
          <section key={m.resultId} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">
                <Link href={`/dashboard/results/${m.resultId}`} className="hover:underline">{m.examName}</Link>
                <span className="ml-2 text-sm font-normal text-muted-foreground">{m.yearName} · published {formatDate(m.publishedAt)}</span>
              </h2>
              <Link href={`/dashboard/results/${m.resultId}`} className="text-sm text-primary hover:underline">Full result</Link>
            </div>
            {m.withheld ? (
              <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">This result is withheld. Contact the examination office.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="pl-4">Subject</TableHead>
                      <TableHead className="text-right">Marks</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead className="text-right">Grade point</TableHead>
                      <TableHead className="pr-4">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {m.subjects.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="pl-4">{s.name}<span className="block font-mono text-xs text-muted-foreground">{s.code}</span></TableCell>
                        <TableCell className="text-right tabular-nums">{s.obtained !== null ? `${formatMarks(s.obtained)} / ${formatMarks(s.maximum)}` : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.percentage !== null ? formatPercent(s.percentage, 2) : "—"}</TableCell>
                        <TableCell className="font-semibold">{s.grade ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.gradePoint !== null ? formatGpa(s.gradePoint, 2) : "—"}</TableCell>
                        <TableCell className="pr-4">
                          <Badge variant={s.status === "PASS" ? "secondary" : s.status === "FAIL" ? "destructive" : "outline"}>
                            {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        ))
      )}
    </div>
  )
}
