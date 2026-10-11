import { STAFF_IMPORT_COLUMNS } from "@/features/staff/import-template"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { csvLine } from "@/lib/csv"

// GET /api/staff/import-template: the CSV template with one example row.
export const GET = withErrorHandling(async () => {
  await requirePermission("staff.import")
  const body = "﻿" + csvLine(STAFF_IMPORT_COLUMNS.map((c) => c.key)) + csvLine(STAFF_IMPORT_COLUMNS.map((c) => c.example))
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="staff-import-template.csv"',
    },
  })
})
