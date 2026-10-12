import type { Metadata } from "next"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { ImportWizard } from "@/components/shared/import-wizard"
import { PageHeader } from "@/components/shared/page-header"
import { commitMarksImportAction, previewMarksImportAction } from "@/features/exams/actions"
import { ExamSelect } from "@/features/exams/components/exam-select"
import { ExamsNav } from "@/features/exams/components/exams-nav"
import { MARKS_IMPORT_BATCH_SIZE, MARKS_IMPORT_COLUMNS, MARKS_IMPORT_MAX_ROWS, marksTemplateUrl } from "@/features/exams/import-template"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { marksPicker } from "@/services/exams/marks-service"

export const metadata: Metadata = {
  title: "Import marks",
}

export default async function ImportMarksPage({ searchParams }: { searchParams: Promise<{ exam?: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "exams.grade") && !hasPermission(context, "exams.marks.manage")) return <AccessDenied />
  const requested = z.uuid().optional().catch(undefined).parse((await searchParams).exam)
  // Examinations open for marks that the caller can enter something in.
  const { exams } = await marksPicker(context, requested)
  const open = exams.filter((e) => e.status === "SCHEDULED" || e.status === "REVISION")
  const exam = open.find((e) => e.id === requested)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Import marks"
        description="Add marks from a spreadsheet (CSV). Imported marks go into draft sheets for checking and submitting; existing marks are never overwritten."
        breadcrumbs={[{ label: "Examinations", href: "/dashboard/exams" }, { label: "Import marks" }]}
      />
      <ExamsNav />
      <ExamSelect exams={open.map((e) => ({ id: e.id, name: `${e.name} · ${e.academicYear.name}` }))} value={exam?.id} />
      {exam ? (
        <ImportWizard
          key={exam.id}
          columns={MARKS_IMPORT_COLUMNS}
          maxRows={MARKS_IMPORT_MAX_ROWS}
          batchSize={MARKS_IMPORT_BATCH_SIZE}
          templateUrl={marksTemplateUrl(exam.id)}
          preview={previewMarksImportAction.bind(null, exam.id)}
          commit={commitMarksImportAction.bind(null, exam.id)}
          listHref={`/dashboard/exams/marks?exam=${exam.id}`}
          noun={{ one: "mark", many: "marks" }}
          matchingHelp="Students are matched only by exact admission number; their class and section come from their enrollment, and the subject by its code within that class. You can only import marks for subjects and sections you may enter. Marks already entered are never changed (use the marks grid). Download the template for a pre-filled list of your students."
          reportName="marks-import-errors.csv"
          referenceLabel="Admission no."
          uniqueReferences={false}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{open.length ? "Choose the examination to import marks into." : "No examination is open for marks entry."}</p>
      )}
    </div>
  )
}
