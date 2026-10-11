import { IMPORT_COLUMNS } from "@/features/students/import-template"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { csvLine } from "@/lib/csv"

// GET /api/students/import-template: the CSV template with one example row.
export const GET = withErrorHandling(async () => {
  await requirePermission("students.import")
  const body =
    "﻿" +
    csvLine(IMPORT_COLUMNS.map((c) => c.key)) +
    csvLine(IMPORT_COLUMNS.map((c) => c.example))
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="student-import-template.csv"',
    },
  })
})
