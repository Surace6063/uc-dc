import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { ImportWizard } from "@/components/shared/import-wizard"
import { PageHeader } from "@/components/shared/page-header"
import { commitStaffImportAction, previewStaffImportAction } from "@/features/staff/actions"
import {
  STAFF_IMPORT_BATCH_SIZE,
  STAFF_IMPORT_COLUMNS,
  STAFF_IMPORT_MAX_ROWS,
  STAFF_IMPORT_TEMPLATE_URL,
} from "@/features/staff/import-template"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Import staff",
}

export default async function ImportStaffPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "staff.import") || !hasPermission(context, "staff.create")) return <AccessDenied />

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Import staff"
        description="Add many staff profiles from a CSV file (save Excel sheets as CSV UTF-8). Imports never create login accounts, grant permissions or assign responsibilities."
        breadcrumbs={[{ label: "Staff", href: "/dashboard/staff" }, { label: "Import" }]}
      />
      <ImportWizard
        columns={STAFF_IMPORT_COLUMNS}
        maxRows={STAFF_IMPORT_MAX_ROWS}
        batchSize={STAFF_IMPORT_BATCH_SIZE}
        templateUrl={STAFF_IMPORT_TEMPLATE_URL}
        preview={previewStaffImportAction}
        commit={commitStaffImportAction}
        listHref="/dashboard/staff"
        noun={{ one: "staff member", many: "staff" }}
        matchingHelp="Departments must match a code or name, and designations a name, already set up in Staff settings."
        reportName="staff-import-errors.csv"
        referenceLabel="Emp. ID"
      />
    </div>
  )
}
