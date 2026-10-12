import type { Metadata } from "next"
import Link from "next/link"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AnalyticsFilters } from "@/features/exams/components/analytics-filters"
import { ExamsNav, ResultStatusBadge, SheetStatusBadge } from "@/features/exams/components/exams-nav"
import { formatGpa, formatPercent } from "@/features/exams/calculation"
import { RESULT_STATUS_LABELS } from "@/features/exams/constants"
import { parseReportFilters } from "@/features/exams/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { marksCompletion, resultAnalytics, yearComparison } from "@/services/exams/analytics-service"
import { examFilterOptions } from "@/services/exams/examination-query"

export const metadata: Metadata = {
  title: "Results analytics",
}

const pct = (v: number | null, d = 1) => (v === null ? "—" : `${formatPercent(v, d)}%`)

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3 p-0">
      <div className="px-4 pt-4">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

export default async function ResultsAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "results.view_all")) return <AccessDenied />
  const parsed = parseReportFilters(await searchParams)
  const organizationId = context.organization.id
  const options = await examFilterOptions(context)
  const year = parsed.year ?? options.years.find((y) => y.isCurrent)?.id ?? options.years[0]?.id
  if (!year) {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <PageHeader title="Results analytics" breadcrumbs={[{ label: "Examinations", href: "/dashboard/exams" }, { label: "Analytics" }]} />
        <p className="text-sm text-muted-foreground">Add an academic year first.</p>
      </div>
    )
  }
  const filters = { ...parsed, year }
  const [report, years, completion, exams, sections, subjects] = await Promise.all([
    resultAnalytics(context, filters),
    yearComparison(context),
    marksCompletion(context, year, filters.exam),
    prisma.examination.findMany({ where: { organizationId, academicYearId: year }, orderBy: { startDate: "asc" }, select: { id: true, name: true } }),
    filters.class ? prisma.section.findMany({ where: { organizationId, classId: filters.class }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, classId: true } }) : [],
    prisma.subject.findMany({ where: { organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])
  const t = report.totals

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Results analytics"
        description="From published results only, so every figure matches what students received."
        breadcrumbs={[{ label: "Examinations", href: "/dashboard/exams" }, { label: "Analytics" }]}
      />
      <ExamsNav />
      <AnalyticsFilters filters={filters} options={{ years: options.years, exams, levels: options.levels, programs: options.programs, classes: options.classes, sections, subjects }} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Results" value={t.students.toLocaleString()} />
        <Stat label="Pass rate" value={pct(t.passRate)} />
        <Stat label="Average percentage" value={pct(t.averagePercentage)} />
        <Stat label="Average GPA" value={t.averageGpa === null ? "—" : formatGpa(t.averageGpa, 2)} />
        <Stat label="Failed or absent" value={((t.counts.FAIL ?? 0) + (t.counts.ABSENT ?? 0)).toLocaleString()} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="By examination">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-4">Examination</TableHead><TableHead>Students</TableHead><TableHead>Average</TableHead><TableHead className="pr-4">Pass rate</TableHead></TableRow></TableHeader>
            <TableBody>
              {report.exams.length === 0 && <TableRow><TableCell colSpan={4} className="h-16 text-center text-muted-foreground">No published results.</TableCell></TableRow>}
              {report.exams.map((e) => (
                <TableRow key={e.examinationId}>
                  <TableCell className="pl-4"><Link href={`/dashboard/exams/${e.examinationId}/results`} className="hover:underline">{e.name}</Link></TableCell>
                  <TableCell className="tabular-nums">{e.students}</TableCell>
                  <TableCell className="tabular-nums">{pct(e.average)}</TableCell>
                  <TableCell className="pr-4 tabular-nums">{pct(e.passRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section title="By class and section">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-4">Class</TableHead><TableHead>Students</TableHead><TableHead>Average</TableHead><TableHead>Pass rate</TableHead><TableHead className="pr-4">Not passed</TableHead></TableRow></TableHeader>
            <TableBody>
              {report.classes.length === 0 && <TableRow><TableCell colSpan={5} className="h-16 text-center text-muted-foreground">No published results.</TableCell></TableRow>}
              {report.classes.map((c) => (
                <TableRow key={`${c.classId}:${c.sectionId}`}>
                  <TableCell className="pl-4">{c.label}</TableCell>
                  <TableCell className="tabular-nums">{c.students}</TableCell>
                  <TableCell className="tabular-nums">{pct(c.average)}</TableCell>
                  <TableCell className="tabular-nums">{pct(c.passRate)}</TableCell>
                  <TableCell className="pr-4 tabular-nums">{c.failed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section title="By subject" description="Average subject percentage and pass rate among students who took it.">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-4">Subject</TableHead><TableHead>Students</TableHead><TableHead>Average</TableHead><TableHead className="pr-4">Pass rate</TableHead></TableRow></TableHeader>
            <TableBody>
              {report.subjects.length === 0 && <TableRow><TableCell colSpan={4} className="h-16 text-center text-muted-foreground">No published results.</TableCell></TableRow>}
              {report.subjects.map((s) => (
                <TableRow key={s.subjectId}>
                  <TableCell className="pl-4">{s.name} <span className="text-xs text-muted-foreground">{s.code}</span></TableCell>
                  <TableCell className="tabular-nums">{s.students}</TableCell>
                  <TableCell className="tabular-nums">{pct(s.average)}</TableCell>
                  <TableCell className="pr-4 tabular-nums">{pct(s.passRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <div className="grid gap-5 sm:grid-cols-2">
          <Section title="Grades">
            <Table>
              <TableHeader><TableRow><TableHead className="pl-4">Grade</TableHead><TableHead className="pr-4">Students</TableHead></TableRow></TableHeader>
              <TableBody>
                {report.grades.length === 0 && <TableRow><TableCell colSpan={2} className="h-16 text-center text-muted-foreground">—</TableCell></TableRow>}
                {report.grades.map((g) => <TableRow key={g.grade}><TableCell className="pl-4 font-medium">{g.grade}</TableCell><TableCell className="pr-4 tabular-nums">{g.students}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </Section>
          <Section title="Results and GPA">
            <Table>
              <TableBody>
                {Object.entries(t.counts).map(([k, v]) => <TableRow key={k}><TableCell className="pl-4"><ResultStatusBadge status={k as keyof typeof RESULT_STATUS_LABELS} /></TableCell><TableCell className="pr-4 tabular-nums">{v}</TableCell></TableRow>)}
                {report.gpaBands.map((b) => <TableRow key={b.band}><TableCell className="pl-4">GPA {b.band}</TableCell><TableCell className="pr-4 tabular-nums">{b.students}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </Section>
        </div>
      </div>

      <Section title="Students who may need academic support" description={`Failed, absent, or below ${filters.support}% in a published result (lowest first, up to 50).`}>
        <Table>
          <TableHeader><TableRow><TableHead className="pl-4">Student</TableHead><TableHead>Class</TableHead><TableHead>Examination</TableHead><TableHead>%</TableHead><TableHead>Grade</TableHead><TableHead className="pr-4">Result</TableHead></TableRow></TableHeader>
          <TableBody>
            {report.support.length === 0 && <TableRow><TableCell colSpan={6} className="h-16 text-center text-muted-foreground">No students match.</TableCell></TableRow>}
            {report.support.map((s) => (
              <TableRow key={s.resultId}>
                <TableCell className="pl-4"><Link href={`/dashboard/exams/${s.examinationId}/results/${s.studentId}`} className="hover:underline">{s.name}</Link> <span className="text-xs text-muted-foreground">{s.admissionNumber}</span></TableCell>
                <TableCell>{s.className}</TableCell>
                <TableCell>{s.examName}</TableCell>
                <TableCell className="tabular-nums">{pct(s.percentage, 2)}</TableCell>
                <TableCell>{s.grade ?? "—"}</TableCell>
                <TableCell className="pr-4"><ResultStatusBadge status={s.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Marks submission by teacher" description={`Examinations still collecting marks: ${completion.submitted}/${completion.total} required sheets submitted.`}>
          <Table>
            <TableHeader><TableRow><TableHead className="pl-4">Teacher</TableHead><TableHead>Assigned</TableHead><TableHead>Submitted</TableHead><TableHead>Returned</TableHead><TableHead className="pr-4">Not started</TableHead></TableRow></TableHeader>
            <TableBody>
              {completion.teachers.length === 0 && <TableRow><TableCell colSpan={5} className="h-16 text-center text-muted-foreground">No open examinations with assigned teachers.</TableCell></TableRow>}
              {completion.teachers.map((tch) => (
                <TableRow key={tch.name}>
                  <TableCell className="pl-4">{tch.name}</TableCell>
                  <TableCell className="tabular-nums">{tch.assigned}</TableCell>
                  <TableCell className="tabular-nums">{tch.submitted}</TableCell>
                  <TableCell className="tabular-nums">{tch.returned}</TableCell>
                  <TableCell className="pr-4 tabular-nums">{tch.notStarted}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
        <Section title="Missing or incomplete marks" description="Required sheets not yet submitted.">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-4">Marks sheet</TableHead><TableHead>Entered</TableHead><TableHead className="pr-4">Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {completion.missing.length === 0 && <TableRow><TableCell colSpan={3} className="h-16 text-center text-muted-foreground">Nothing missing.</TableCell></TableRow>}
              {completion.missing.map((m) => (
                <TableRow key={`${m.examName}:${m.label}`}>
                  <TableCell className="pl-4">{m.label}<span className="block text-xs text-muted-foreground">{m.examName}</span></TableCell>
                  <TableCell className="tabular-nums">{m.entered}/{m.expected}</TableCell>
                  <TableCell className="pr-4"><SheetStatusBadge status={m.status as Parameters<typeof SheetStatusBadge>[0]["status"]} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>

      <Section title="Academic year comparison" description="All published results per year.">
        <Table>
          <TableHeader><TableRow><TableHead className="pl-4">Year</TableHead><TableHead>Results</TableHead><TableHead>Average</TableHead><TableHead className="pr-4">Pass rate</TableHead></TableRow></TableHeader>
          <TableBody>
            {years.length === 0 && <TableRow><TableCell colSpan={4} className="h-16 text-center text-muted-foreground">No published results yet.</TableCell></TableRow>}
            {years.map((y) => (
              <TableRow key={y.yearId}>
                <TableCell className="pl-4">{y.name}</TableCell>
                <TableCell className="tabular-nums">{y.students}</TableCell>
                <TableCell className="tabular-nums">{pct(y.average)}</TableCell>
                <TableCell className="pr-4 tabular-nums">{pct(y.passRate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  )
}
