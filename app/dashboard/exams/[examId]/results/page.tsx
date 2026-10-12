import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { ExamsNav } from "@/features/exams/components/exams-nav"
import { PublicationPanel } from "@/features/exams/components/publication-panel"
import { ResultsTable } from "@/features/exams/components/results-table"
import { sheetLabel } from "@/features/exams/constants"
import { parseResultFilters } from "@/features/exams/filters"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { canSeeAllResults, hasExamStaffAccess } from "@/services/exams/access-service"
import { sheetProgress } from "@/services/exams/examination-service"
import { listExamResults, publicationCheck } from "@/services/exams/result-service"
import { loadSubjects } from "@/services/exams/rules-service"

export const metadata: Metadata = {
  title: "Results",
}

export default async function ExamResultsPage({ params, searchParams }: { params: Promise<{ examId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!hasExamStaffAccess(context)) redirect("/dashboard/results")
  if (!hasPermission(context, "results.view") && !canSeeAllResults(context)) return <AccessDenied />
  const examId = z.uuid().safeParse((await params).examId)
  if (!examId.success) notFound()
  const filters = parseResultFilters(await searchParams)
  const organizationId = context.organization.id

  let results
  try {
    results = await listExamResults(context, examId.data, filters)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const exam = results.exam
  const workflowRole = hasPermission(context, "exams.approve") || hasPermission(context, "exams.publish")
  const subjects = await loadSubjects(prisma, organizationId, exam.id)
  const classIds = [...new Set(subjects.map((s) => s.classId))]
  const [check, sections, progress] = await Promise.all([
    workflowRole && ["SCHEDULED", "REVISION", "APPROVED"].includes(exam.status) ? publicationCheck(context, exam.id) : null,
    prisma.section.findMany({ where: { organizationId, classId: { in: classIds }, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, classId: true } }),
    workflowRole && exam.status === "PUBLISHED" ? sheetProgress(prisma, organizationId, exam, subjects) : [],
  ])
  const classes = [...new Map(subjects.map((s) => [s.classId, s.class])).values()].map((c) => ({ id: c.id, name: c.name, sections: sections.filter((s) => s.classId === c.id) }))

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title={`Results: ${exam.name}`}
        description={results.view === "published" && results.publication ? `Published version ${results.publication.version}` : "Provisional results from approved marks"}
        breadcrumbs={[{ label: "Examinations", href: "/dashboard/exams" }, { label: exam.name, href: `/dashboard/exams/${exam.id}` }, { label: "Results" }]}
      />
      <ExamsNav />
      {workflowRole && exam.status !== "DRAFT" && exam.status !== "ARCHIVED" && (
        <PublicationPanel
          examinationId={exam.id}
          status={exam.status}
          check={check}
          publication={results.publication}
          approvedSheets={progress.filter((p) => p.sheetId && p.status === "APPROVED").map((p) => ({ sheetId: p.sheetId!, label: sheetLabel(p) }))}
        />
      )}
      <ResultsTable
        examinationId={exam.id}
        rows={results.rows}
        total={results.total}
        filters={filters}
        view={results.view}
        canPreview={results.canPreview}
        rules={results.rules}
        subjects={results.subjects}
        classes={classes}
        canExport={hasPermission(context, "exams.export")}
        canHold={(hasPermission(context, "exams.approve") || hasPermission(context, "exams.publish")) && ["SCHEDULED", "APPROVED", "REVISION"].includes(exam.status)}
      />
    </div>
  )
}
