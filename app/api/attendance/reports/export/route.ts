import { type NextRequest } from "next/server"

import { parseReportParams } from "@/features/attendance/filters"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { prisma } from "@/lib/prisma"
import { buildReport, reportCsv } from "@/services/attendance/report-table"
import { audit } from "@/services/audit/audit-service"

// GET /api/attendance/reports/export?kind=…&<filters>: one report as CSV,
// with its reporting period and calculation notes at the top.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const ctx = await requirePermission("attendance.export")
  const params = parseReportParams(request.nextUrl.searchParams)
  const table = await buildReport(ctx, params)
  await audit(prisma, ctx, {
    action: "attendance.report.export",
    entityType: "attendance_report",
    summary: `Exported the ${table.title.toLowerCase()} attendance report (${table.period.from} to ${table.period.to})`,
    metadata: { params: Object.fromEntries(request.nextUrl.searchParams) },
  })
  return new Response("﻿" + reportCsv(table), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${table.kind}-${table.period.from}_to_${table.period.to}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
