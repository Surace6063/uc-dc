import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { ImportWizard } from "@/components/shared/import-wizard"
import { PageHeader } from "@/components/shared/page-header"
import { commitAttendanceImportAction, previewAttendanceImportAction } from "@/features/attendance/actions"
import {
  ATTENDANCE_IMPORT_BATCH_SIZE,
  ATTENDANCE_IMPORT_COLUMNS,
  ATTENDANCE_IMPORT_MAX_ROWS,
  ATTENDANCE_IMPORT_TEMPLATE_URL,
} from "@/features/attendance/import-template"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Import attendance",
}

export default async function ImportAttendancePage() {
  const context = await getPageContext()
  if (!hasPermission(context, "attendance.manage") || !hasPermission(context, "attendance.export")) return <AccessDenied />

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Import attendance"
        description="Add student attendance from a CSV file, e.g. a paper register typed up later. Imports never change marks that already exist."
        breadcrumbs={[{ label: "Attendance", href: "/dashboard/attendance" }, { label: "Import" }]}
      />
      <ImportWizard
        columns={ATTENDANCE_IMPORT_COLUMNS}
        maxRows={ATTENDANCE_IMPORT_MAX_ROWS}
        batchSize={ATTENDANCE_IMPORT_BATCH_SIZE}
        templateUrl={ATTENDANCE_IMPORT_TEMPLATE_URL}
        preview={previewAttendanceImportAction}
        commit={commitAttendanceImportAction}
        listHref="/dashboard/attendance/records"
        noun={{ one: "mark", many: "marks" }}
        matchingHelp="Students are matched only by exact admission number; their class and section on that date come from their enrollment. Subjects are matched by exact code. Rows for a student who already has a mark for that day and register are refused (use a correction instead)."
        reportName="attendance-import-errors.csv"
        referenceLabel="Admission no."
        uniqueReferences={false}
      />
    </div>
  )
}
