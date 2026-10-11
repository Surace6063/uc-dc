import { CLASS_IMPORT_COLUMNS } from "@/features/classes/import-template"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { csvLine } from "@/lib/csv"

// GET /api/classes/import-template: the CSV template with one example row.
export const GET = withErrorHandling(async () => {
  await requirePermission("classes.manage")
  const body =
    "﻿" + csvLine(CLASS_IMPORT_COLUMNS.map((c) => c.key)) + csvLine(CLASS_IMPORT_COLUMNS.map((c) => c.example))
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="class-import-template.csv"',
    },
  })
})
