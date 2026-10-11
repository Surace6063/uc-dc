import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { ImportWizard } from "@/components/shared/import-wizard"
import { PageHeader } from "@/components/shared/page-header"
import { commitClassImportAction, previewClassImportAction } from "@/features/classes/actions"
import {
  CLASS_IMPORT_BATCH_SIZE,
  CLASS_IMPORT_COLUMNS,
  CLASS_IMPORT_MAX_ROWS,
  CLASS_IMPORT_TEMPLATE_URL,
} from "@/features/classes/import-template"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Import classes",
}

export default async function ImportClassesPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "classes.manage")) return <AccessDenied />

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Import classes and sections"
        description="Add many classes and their sections from a CSV file. Imports never enroll students or assign teachers."
        breadcrumbs={[{ label: "Classes & Sections", href: "/dashboard/classes" }, { label: "Import" }]}
      />
      <ImportWizard
        columns={CLASS_IMPORT_COLUMNS}
        maxRows={CLASS_IMPORT_MAX_ROWS}
        batchSize={CLASS_IMPORT_BATCH_SIZE}
        templateUrl={CLASS_IMPORT_TEMPLATE_URL}
        preview={previewClassImportAction}
        commit={commitClassImportAction}
        listHref="/dashboard/classes"
        noun={{ one: "class", many: "classes" }}
        matchingHelp="Education levels and programs are matched by their exact codes, as set up under Education structure. An existing class (same level, program and name) only gets the sections it doesn't have yet."
        reportName="class-import-errors.csv"
        referenceLabel="Code"
      />
    </div>
  )
}
