import { type NextRequest } from "next/server"

import { parseExamFilters } from "@/features/exams/filters"
import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"
import { exportExaminationsCsv } from "@/services/exams/import-export-service"

// GET /api/exams/export?<list filters>: the examinations list as CSV.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const ctx = await requirePermission("exams.view", "exams.export")
  const params = request.nextUrl.searchParams
  const { csv, count } = await exportExaminationsCsv(ctx, parseExamFilters(params))
  await audit(prisma, ctx, {
    action: "exam.export",
    entityType: "examination",
    summary: `Exported ${count} examination${count === 1 ? "" : "s"}`,
    metadata: { filters: Object.fromEntries(params) },
  })
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="examinations-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
