import { type NextRequest } from "next/server"
import { z } from "zod"

import { parseStaffFilters } from "@/features/staff/filters"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"
import { exportStaffCsv } from "@/services/staff/export-service"

const idsSchema = z.array(z.uuid()).max(1000)

// GET /api/staff/export?<table filters>[&ids=a,b]
// CSV of the caller's organisation (and scope) only, using exactly the
// table's filters. Restricted columns depend on the caller's permissions.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const ctx = await requirePermission("staff.export")
  const params = request.nextUrl.searchParams
  const filters = parseStaffFilters(params)
  const ids = params.get("ids") ? idsSchema.parse(params.get("ids")!.split(",")) : undefined

  const stream = await exportStaffCsv(ctx, filters, { ids })
  await audit(prisma, ctx, {
    action: "staff.export",
    entityType: "staff",
    summary: ids ? `Exported ${ids.length} selected staff` : "Exported the filtered staff list",
    metadata: { filters: Object.fromEntries(params), selected: ids?.length ?? null },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="staff-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
