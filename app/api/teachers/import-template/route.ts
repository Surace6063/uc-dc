import { TEACHER_IMPORT_COLUMNS } from "@/features/teachers/import-template"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { csvLine } from "@/lib/csv"

// GET /api/teachers/import-template: the CSV template with one example row.
export const GET = withErrorHandling(async () => {
  await requirePermission("teachers.import")
  const body =
    "﻿" + csvLine(TEACHER_IMPORT_COLUMNS.map((c) => c.key)) + csvLine(TEACHER_IMPORT_COLUMNS.map((c) => c.example))
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="teacher-import-template.csv"',
    },
  })
})
