import { type NextRequest } from "next/server"
import { z } from "zod"

import { parseGuardianFilters } from "@/features/guardians/filters"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"
import { exportGuardiansCsv } from "@/services/guardians/export-service"

const idsSchema = z.array(z.uuid()).max(1000)

// GET /api/parents/export?<table filters>[&ids=a,b]
// CSV of the caller's organisation only, using exactly the table's filters.
// Restricted columns depend on the caller's permissions.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const ctx = await requirePermission("parents.export")
  const params = request.nextUrl.searchParams
  const filters = parseGuardianFilters(params)
  const ids = params.get("ids") ? idsSchema.parse(params.get("ids")!.split(",")) : undefined

  const stream = await exportGuardiansCsv(ctx, filters, { ids })
  await audit(prisma, ctx, {
    action: "guardian.export",
    entityType: "guardian",
    summary: ids ? `Exported ${ids.length} selected guardians` : "Exported the filtered guardian list",
    metadata: { filters: Object.fromEntries(params), selected: ids?.length ?? null },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="guardians-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
