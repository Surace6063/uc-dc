import { type NextRequest } from "next/server"
import { z } from "zod"

import { parseResultFilters } from "@/features/exams/filters"
import { hasPermission, requirePermission } from "@/lib/authorization/context"
import { PermissionDeniedError } from "@/lib/authorization/errors"
import { withErrorHandling } from "@/lib/authorization/route"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"
import { exportResultsCsv } from "@/services/exams/import-export-service"

// GET /api/exams/:examId/results/export?<results filters>: results as CSV,
// with the table's filters and only what the caller may see (published
// results within their scope, or the provisional view for reviewers).
export const GET = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ examId: string }> }) => {
  const ctx = await requirePermission("exams.export")
  if (!hasPermission(ctx, "results.view") && !hasPermission(ctx, "results.view_all")) throw new PermissionDeniedError("results.view")
  const examId = z.uuid().parse((await params).examId)
  const search = request.nextUrl.searchParams
  const { csv, count, view, version, examName } = await exportResultsCsv(ctx, examId, parseResultFilters(search))
  await audit(prisma, ctx, {
    action: "exam.results.export",
    entityType: "examination",
    entityId: examId,
    summary: `Exported ${count} ${view} result${count === 1 ? "" : "s"} of ${examName}${version ? ` (version ${version})` : ""}`,
    metadata: { filters: Object.fromEntries(search) },
  })
  const name = `${examName}-${view === "published" ? `results-v${version ?? 0}` : "provisional-results"}.csv`.replace(/[^\w.-]+/g, "-")
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  })
})
