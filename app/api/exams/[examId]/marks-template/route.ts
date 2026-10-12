import { type NextRequest } from "next/server"
import { z } from "zod"

import { hasPermission, requireMembership } from "@/lib/authorization/context"
import { PermissionDeniedError } from "@/lib/authorization/errors"
import { withErrorHandling } from "@/lib/authorization/route"
import { marksTemplateCsv } from "@/services/exams/import-export-service"

// GET /api/exams/:examId/marks-template?subject=…: a marks CSV pre-filled
// with the students and components of the sheets the caller may fill in.
export const GET = withErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ examId: string }> }) => {
  const ctx = await requireMembership()
  if (!hasPermission(ctx, "exams.grade") && !hasPermission(ctx, "exams.marks.manage")) throw new PermissionDeniedError("exams.grade")
  const examId = z.uuid().parse((await params).examId)
  const subject = z.uuid().optional().parse(request.nextUrl.searchParams.get("subject") || undefined)
  const { csv, exam } = await marksTemplateCsv(ctx, examId, subject)
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${`${exam.name}-marks.csv`.replace(/[^\w.-]+/g, "-")}"`,
      "Cache-Control": "no-store",
    },
  })
})
