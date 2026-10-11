import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { ImportWizard } from "@/components/shared/import-wizard"
import { PageHeader } from "@/components/shared/page-header"
import { commitTeacherImportAction, previewTeacherImportAction } from "@/features/teachers/actions"
import {
  TEACHER_IMPORT_BATCH_SIZE,
  TEACHER_IMPORT_COLUMNS,
  TEACHER_IMPORT_MAX_ROWS,
  TEACHER_IMPORT_TEMPLATE_URL,
} from "@/features/teachers/import-template"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Import teachers",
}

export default async function ImportTeachersPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "teachers.import") || !hasPermission(context, "teachers.create")) return <AccessDenied />

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Import teachers"
        description="Add many teacher profiles from a CSV file. Imports never create login accounts or teaching assignments."
        breadcrumbs={[{ label: "Teachers", href: "/dashboard/teachers" }, { label: "Import" }]}
      />
      <ImportWizard
        columns={TEACHER_IMPORT_COLUMNS}
        maxRows={TEACHER_IMPORT_MAX_ROWS}
        batchSize={TEACHER_IMPORT_BATCH_SIZE}
        templateUrl={TEACHER_IMPORT_TEMPLATE_URL}
        preview={previewTeacherImportAction}
        commit={commitTeacherImportAction}
        listHref="/dashboard/teachers"
        noun={{ one: "teacher", many: "teachers" }}
        matchingHelp="Designations and departments must match names (or department codes) already set up under Education structure."
        reportName="teacher-import-errors.csv"
        referenceLabel="Emp. ID"
      />
    </div>
  )
}
