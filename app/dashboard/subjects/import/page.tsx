import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { ImportWizard } from "@/components/shared/import-wizard"
import { PageHeader } from "@/components/shared/page-header"
import { commitSubjectImportAction, previewSubjectImportAction } from "@/features/subjects/actions"
import {
  SUBJECT_IMPORT_BATCH_SIZE,
  SUBJECT_IMPORT_COLUMNS,
  SUBJECT_IMPORT_MAX_ROWS,
  SUBJECT_IMPORT_TEMPLATE_URL,
} from "@/features/subjects/import-template"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Import subjects",
}

export default async function ImportSubjectsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "subjects.manage") || !hasPermission(context, "subjects.export")) return <AccessDenied />

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Import subjects and courses"
        description="Add or update subjects from a CSV file. Imports never change curricula, class offerings or teachers."
        breadcrumbs={[{ label: "Subjects & Courses", href: "/dashboard/subjects" }, { label: "Import" }]}
      />
      <ImportWizard
        columns={SUBJECT_IMPORT_COLUMNS}
        maxRows={SUBJECT_IMPORT_MAX_ROWS}
        batchSize={SUBJECT_IMPORT_BATCH_SIZE}
        templateUrl={SUBJECT_IMPORT_TEMPLATE_URL}
        preview={previewSubjectImportAction}
        commit={commitSubjectImportAction}
        listHref="/dashboard/subjects"
        noun={{ one: "subject", many: "subjects" }}
        matchingHelp="Rows are matched to existing subjects by code and update them. Education levels and programs must match their exact codes, and categories their exact names."
        reportName="subject-import-errors.csv"
        referenceLabel="Code"
      />
    </div>
  )
}
