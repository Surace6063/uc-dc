import { type NextRequest } from "next/server"

import { parseEmployeeFilters } from "@/features/attendance/filters"
import { hasPermission, requirePermission } from "@/lib/authorization/context"
import { PermissionDeniedError } from "@/lib/authorization/errors"
import { withErrorHandling } from "@/lib/authorization/route"
import { prisma } from "@/lib/prisma"
import { exportEmployeeCsv } from "@/services/attendance/import-export-service"
import { audit } from "@/services/audit/audit-service"

// GET /api/attendance/staff/export?<filters>: teacher and staff attendance.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const ctx = await requirePermission("attendance.export")
  if (!hasPermission(ctx, "attendance.staff.view") && !hasPermission(ctx, "attendance.staff.manage")) {
    throw new PermissionDeniedError("attendance.staff.view")
  }
  const params = request.nextUrl.searchParams
  const filters = parseEmployeeFilters(params)
  const { csv, count } = await exportEmployeeCsv(ctx, filters)
  await audit(prisma, ctx, {
    action: "attendance.employee.export",
    entityType: "employee_attendance",
    summary: `Exported ${count} teacher and staff attendance record${count === 1 ? "" : "s"}`,
    metadata: { filters: Object.fromEntries(params) },
  })
  const period = `${filters.from ?? "start"}_to_${filters.to ?? new Date().toISOString().slice(0, 10)}`
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="staff-attendance-${period}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
