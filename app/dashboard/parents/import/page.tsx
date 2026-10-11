import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { ImportWizard } from "@/components/shared/import-wizard"
import { PageHeader } from "@/components/shared/page-header"
import { commitGuardianImportAction, previewGuardianImportAction } from "@/features/guardians/actions"
import {
  GUARDIAN_IMPORT_BATCH_SIZE,
  GUARDIAN_IMPORT_COLUMNS,
  GUARDIAN_IMPORT_MAX_ROWS,
  GUARDIAN_IMPORT_TEMPLATE_URL,
} from "@/features/guardians/import-template"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Import guardians",
}

export default async function ImportGuardiansPage() {
  const context = await getPageContext()
  const allowed = (["parents.import", "parents.create", "parents.update", "students.view"] as const).every((p) => hasPermission(context, p))
  if (!allowed) return <AccessDenied />

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Import guardians"
        description="Add guardians and link them to students from a CSV file (save Excel sheets as CSV UTF-8). Imports never create login accounts or send invitations."
        breadcrumbs={[{ label: "Parents", href: "/dashboard/parents" }, { label: "Import" }]}
      />
      <ImportWizard
        columns={GUARDIAN_IMPORT_COLUMNS}
        maxRows={GUARDIAN_IMPORT_MAX_ROWS}
        batchSize={GUARDIAN_IMPORT_BATCH_SIZE}
        templateUrl={GUARDIAN_IMPORT_TEMPLATE_URL}
        preview={previewGuardianImportAction}
        commit={commitGuardianImportAction}
        listHref="/dashboard/parents"
        noun={{ one: "row", many: "rows" }}
        matchingHelp="One row per guardian–student link. Students are matched only by exact admission number, never by name. An existing guardian is reused only when the guardian ID matches, or the full name and phone number both match exactly; otherwise a new guardian is created."
        reportName="guardian-import-errors.csv"
        referenceLabel="Student"
        uniqueReferences={false}
      />
    </div>
  )
}
