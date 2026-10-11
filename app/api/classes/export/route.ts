import { type NextRequest } from "next/server"

import { parseClassFilters } from "@/features/classes/filters"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"
import { resolveAcademicYear } from "@/services/classes/class-service"
import { exportClassesCsv, exportSectionsCsv } from "@/services/classes/export-service"

// GET /api/classes/export?<list filters>
// The classes (or, with view=sections, sections) list as CSV, with the
// table's filters, for the caller's organisation only.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const ctx = await requirePermission("classes.view", "classes.export")
  const params = request.nextUrl.searchParams
  const filters = parseClassFilters(params)
  const { yearId } = await resolveAcademicYear(ctx, filters.year)
  const csv =
    filters.view === "sections"
      ? await exportSectionsCsv(ctx, filters, yearId)
      : await exportClassesCsv(ctx, filters, yearId)
  await audit(prisma, ctx, {
    action: "class.export",
    entityType: "class",
    summary: `Exported the ${filters.view} list`,
    metadata: { filters: Object.fromEntries(params) },
  })
  const date = new Date().toISOString().slice(0, 10)
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filters.view}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
