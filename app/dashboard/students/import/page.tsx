import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { ImportWizard } from "@/components/shared/import-wizard"
import { commitImportAction, previewImportAction } from "@/features/students/actions"
import {
  IMPORT_BATCH_SIZE,
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  IMPORT_TEMPLATE_URL,
} from "@/features/students/import-template"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Import students",
}

export default async function ImportStudentsPage() {
  const context = await getPageContext()
  const allowed = ["students.import", "students.create", "students.enroll"] as const
  if (!allowed.every((p) => hasPermission(context, p))) return <AccessDenied />

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Import students"
        description="Add many students at once from a CSV file. Every row is validated against your education structure before anything is saved."
        breadcrumbs={[{ label: "Students", href: "/dashboard/students" }, { label: "Import" }]}
      />
      <ImportWizard
        columns={IMPORT_COLUMNS}
        maxRows={IMPORT_MAX_ROWS}
        batchSize={IMPORT_BATCH_SIZE}
        templateUrl={IMPORT_TEMPLATE_URL}
        preview={previewImportAction}
        commit={commitImportAction}
        listHref="/dashboard/students"
        noun={{ one: "student", many: "students" }}
        matchingHelp="Academic year, level, program, class and section must match names or codes already set up in your education structure."
        reportName="student-import-errors.csv"
        referenceLabel="Adm. no."
      />
    </div>
  )
}
