import { GUARDIAN_IMPORT_COLUMNS } from "@/features/guardians/import-template"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { csvLine } from "@/lib/csv"

// GET /api/parents/import-template: the CSV template with one example row.
export const GET = withErrorHandling(async () => {
  await requirePermission("parents.import")
  const body = "﻿" + csvLine(GUARDIAN_IMPORT_COLUMNS.map((c) => c.key)) + csvLine(GUARDIAN_IMPORT_COLUMNS.map((c) => c.example))
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="guardian-import-template.csv"',
    },
  })
})
