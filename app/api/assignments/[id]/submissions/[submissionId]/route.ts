import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { submissionFileUrl } from "@/services/teaching/class-assignment-service"

type Params = { params: Promise<{ id: string; submissionId: string }> }

// GET /api/assignments/:id/submissions/:submissionId → 60-second signed URL
// for the submitted file (its student, the teacher, or academic heads).
export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("assignments.view")
  const { id, submissionId } = await params
  const url = await submissionFileUrl(ctx, z.uuid().parse(id), z.uuid().parse(submissionId))
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } })
})
