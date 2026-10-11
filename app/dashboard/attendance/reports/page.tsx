import type { Metadata } from "next"
import { FileBarChartIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AttendanceNav } from "@/features/attendance/components/attendance-nav"
import { ReportFilters } from "@/features/attendance/components/report-filters"
import { formatDay } from "@/features/attendance/constants"
import { parseReportParams } from "@/features/attendance/filters"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { cn } from "@/lib/utils"
import { canSeeAll, myAssignments } from "@/services/attendance/access-service"
import { getPolicy } from "@/services/attendance/policy-service"
import { buildReport, reportKindsFor, type Cell } from "@/services/attendance/report-table"

export const metadata: Metadata = {
  title: "Attendance reports",
}

const show = (c: Cell, numeric?: boolean, percent?: boolean) =>
  c === null || c === "" ? "—" : percent && typeof c === "number" ? `${c.toFixed(1)}%` : numeric && typeof c === "number" ? c.toLocaleString() : c

export default async function AttendanceReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  const kinds = reportKindsFor(context)
  if (kinds.length === 0) return <AccessDenied />

  const raw = parseReportParams(await searchParams)
  const params = kinds.includes(raw.kind) ? raw : { ...raw, kind: kinds[0] }
  const organizationId = context.organization.id
  const assignments = canSeeAll(context) ? null : await myAssignments(context)
  const classIds = assignments ? [...new Set(assignments.map((a) => a.classId!))] : null
  const [table, policy, years, levels, programs, classes, sections, offerings] = await Promise.all([
    buildReport(context, params),
    getPolicy(context),
    prisma.academicYear.findMany({ where: { organizationId }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    prisma.educationLevel.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.program.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, educationLevelId: true } }),
    prisma.academicClass.findMany({
      where: { organizationId, archivedAt: null, ...(classIds && { id: { in: classIds } }) },
      orderBy: [{ educationLevel: { sortOrder: "asc" } }, { sequence: "asc" }],
      select: { id: true, name: true, educationLevelId: true, programId: true },
    }),
    params.class ? prisma.section.findMany({ where: { organizationId, classId: params.class, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }) : [],
    params.class
      ? prisma.subjectOffering.findMany({
          where: { organizationId, classId: params.class, ...(params.year && { academicYearId: params.year }) },
          orderBy: { subject: { name: "asc" } },
          select: { id: true, subject: { select: { name: true } } },
        })
      : [],
  ])
  const percentIndex = table.columns.findIndex((c) => c.label === "Attendance %")

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Attendance reports"
        description="Summaries by student, class, subject and month, shortages, and teacher and staff attendance."
        breadcrumbs={[{ label: "Attendance", href: "/dashboard/attendance" }, { label: "Reports" }]}
      />
      <AttendanceNav />
      <ReportFilters
        params={params}
        period={{ from: table.period.from, to: table.period.to, yearId: table.period.yearId }}
        options={{
          kinds,
          years,
          levels,
          programs,
          classes,
          sections,
          offerings: offerings.map((o) => ({ id: o.id, name: o.subject.name })),
          periodEnabled: policy.periodEnabled,
        }}
      />
      <section className="flex min-w-0 flex-col rounded-xl border bg-card" aria-labelledby="report-title">
        <div className="border-b p-4">
          <h2 id="report-title" className="font-semibold">{table.title}</h2>
          <p className="text-sm text-muted-foreground">
            {formatDay(table.period.from)} – {formatDay(table.period.to)}
            {table.kind !== "employees" && table.period.yearName && ` · ${table.period.yearName}`} · {table.rows.length} row{table.rows.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
            {table.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
        {table.rows.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon"><FileBarChartIcon /></EmptyMedia>
              <EmptyTitle>{table.kind === "shortage" ? "No attendance shortages" : "No attendance in this period"}</EmptyTitle>
              <EmptyDescription>{table.kind === "shortage" ? "Nobody is below or close to the minimum for these filters." : "Try a wider date range or different filters."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <Table className="min-w-[900px]">
              <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                <TableRow>
                  {table.columns.map((c) => (
                    <TableHead key={c.label} className={cn("text-xs whitespace-nowrap uppercase first:pl-4 last:pr-4", c.numeric && "text-right")}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((r) => (
                  <TableRow key={r.key} className={cn(r.emphasis && "bg-muted/40 font-medium")}>
                    {r.cells.map((cell, i) => (
                      <TableCell
                        key={i}
                        className={cn(
                          "first:pl-4 last:pr-4",
                          table.columns[i]?.numeric && "text-right tabular-nums",
                          i === percentIndex && r.standing === "below" && "font-semibold text-destructive",
                          i === percentIndex && r.standing === "approaching" && "font-semibold text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {show(cell, table.columns[i]?.numeric, i === percentIndex)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
