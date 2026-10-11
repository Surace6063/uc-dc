import { type NextRequest } from "next/server"
import { z } from "zod"

import { parseStudentFilters } from "@/features/students/filters"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { audit } from "@/services/audit/audit-service"
import { prisma } from "@/lib/prisma"
import { exportStudentsCsv } from "@/services/students/export-service"

const idsSchema = z.array(z.uuid()).max(1000)

// GET /api/students/export?<table filters>[&ids=a,b][&columns=x,y]
// CSV of the caller's organisation only, using exactly the table's filters.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const ctx = await requirePermission("students.view", "students.export")
  const params = request.nextUrl.searchParams
  const filters = parseStudentFilters(params)
  const ids = params.get("ids") ? idsSchema.parse(params.get("ids")!.split(",")) : undefined
  const columns = params.get("columns")?.split(",").slice(0, 50)

  const stream = await exportStudentsCsv(ctx, filters, { ids, columns })
  await audit(prisma, ctx, {
    action: "student.export",
    entityType: "student",
    summary: ids ? `Exported ${ids.length} selected students` : "Exported the filtered student list",
    metadata: { filters: Object.fromEntries(params), selected: ids?.length ?? null },
  })

  const date = new Date().toISOString().slice(0, 10)
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="students-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
