import { ATTENDANCE_IMPORT_COLUMNS } from "@/features/attendance/import-template"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { csvLine } from "@/lib/csv"

// GET /api/attendance/import-template: the CSV template with one example row.
export const GET = withErrorHandling(async () => {
  await requirePermission("attendance.manage", "attendance.export")
  const body =
    "﻿" + csvLine(ATTENDANCE_IMPORT_COLUMNS.map((c) => c.key)) + csvLine(ATTENDANCE_IMPORT_COLUMNS.map((c) => c.example))
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="attendance-import-template.csv"',
    },
  })
})
