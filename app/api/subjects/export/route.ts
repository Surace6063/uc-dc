import { type NextRequest } from "next/server"

import { parseSubjectFilters } from "@/features/subjects/filters"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"
import { resolveAcademicYear } from "@/services/classes/class-service"
import { exportSubjectsCsv } from "@/services/subjects/import-export-service"

// GET /api/subjects/export?<list filters>: the subjects list as CSV, with
// the table's filters, for the caller's organisation only.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const ctx = await requirePermission("subjects.view", "subjects.export")
  const params = request.nextUrl.searchParams
  const filters = parseSubjectFilters(params)
  const { yearId } = await resolveAcademicYear(ctx, filters.year)
  const csv = await exportSubjectsCsv(ctx, filters, yearId)
  await audit(prisma, ctx, {
    action: "subject.export",
    entityType: "subject",
    summary: "Exported the subjects list",
    metadata: { filters: Object.fromEntries(params) },
  })
  const date = new Date().toISOString().slice(0, 10)
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subjects-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
