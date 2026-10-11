import { type NextRequest } from "next/server"

import { parseRecordFilters } from "@/features/attendance/filters"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { prisma } from "@/lib/prisma"
import { exportRecordsCsv } from "@/services/attendance/import-export-service"
import { audit } from "@/services/audit/audit-service"

// GET /api/attendance/export?<records filters>: student attendance records as
// CSV, with the table's filters and only what the caller may see.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const ctx = await requirePermission("attendance.view", "attendance.export")
  const params = request.nextUrl.searchParams
  const filters = parseRecordFilters(params)
  const { csv, count } = await exportRecordsCsv(ctx, filters)
  await audit(prisma, ctx, {
    action: "attendance.export",
    entityType: "student_attendance",
    summary: `Exported ${count} attendance record${count === 1 ? "" : "s"}`,
    metadata: { filters: Object.fromEntries(params) },
  })
  const period = `${filters.from ?? "start"}_to_${filters.to ?? new Date().toISOString().slice(0, 10)}`
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-records-${period}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
