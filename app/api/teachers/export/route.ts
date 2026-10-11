import { type NextRequest } from "next/server"
import { z } from "zod"

import { parseTeacherFilters } from "@/features/teachers/filters"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"
import { exportTeachersCsv } from "@/services/teachers/export-service"

const idsSchema = z.array(z.uuid()).max(1000)

// GET /api/teachers/export?<table filters>[&ids=a,b]
// CSV of the caller's organisation only, using exactly the table's filters.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const ctx = await requirePermission("teachers.view", "teachers.export")
  const params = request.nextUrl.searchParams
  const filters = parseTeacherFilters(params)
  const ids = params.get("ids") ? idsSchema.parse(params.get("ids")!.split(",")) : undefined

  const stream = await exportTeachersCsv(ctx, filters, { ids })
  await audit(prisma, ctx, {
    action: "teacher.export",
    entityType: "teacher",
    summary: ids ? `Exported ${ids.length} selected teachers` : "Exported the filtered teacher list",
    metadata: { filters: Object.fromEntries(params), selected: ids?.length ?? null },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="teachers-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
