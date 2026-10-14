import type { Metadata } from "next"
import Link from "next/link"
import { AwardIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, formatDateTime } from "@/features/teaching/format"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { myPublishedResults } from "@/services/teaching/exam-service"
import { resolveYear } from "@/services/teaching/scope-service"

export const metadata: Metadata = { title: "Results" }

// Published results of the classes a teacher teaches. Only the active
// published version is counted; drafts and provisional figures never are.
export default async function TeacherResultsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "results.view")) return <AccessDenied />
  const yearId = await resolveYear(context, (await searchParams).year)
  const results = await myPublishedResults(context, yearId)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Results" description="Published examination results for the classes you teach." breadcrumbs={[{ label: "Results" }]} />
      {results.length === 0 ? (
        <EmptyState icon={AwardIcon} title="No published results" description="Results appear here once the examination office publishes an examination that includes your classes." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Examination</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Passed</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Other</TableHead>
                <TableHead className="text-right">Pass rate</TableHead>
                <TableHead className="text-right">Average</TableHead>
                <TableHead className="pr-4">Published</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4">
                    <Link href={`/dashboard/exams/${r.id}/results`} className="font-medium hover:underline">{r.name}</Link>
                    <span className="block text-xs text-muted-foreground">{formatDate(r.startDate)} – {formatDate(r.endDate)}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.students}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.pass}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.fail}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground" title="Absent, withheld, incomplete or exempt">{r.other}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.passRate === null ? "—" : `${r.passRate}%`}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.averagePercentage === null ? "—" : `${r.averagePercentage}%`}</TableCell>
                  <TableCell className="pr-4 text-sm whitespace-nowrap">{formatDateTime(r.publishedAt)}{r.version && r.version > 1 ? <span className="block text-xs text-muted-foreground">Version {r.version}</span> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Pass rate is passed ÷ (passed + failed). Absent, withheld, incomplete and exempt students are counted under Other.</p>
    </div>
  )
}
