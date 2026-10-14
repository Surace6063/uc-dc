import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireMembership } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { myDocumentUrl } from "@/services/student-portal/record-service"

type Params = { params: Promise<{ documentId: string }> }

// GET /api/me/documents/:documentId → 60-second signed URL for one of the
// signed-in student's own documents.
export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requireMembership()
  const url = await myDocumentUrl(ctx, z.uuid().parse((await params).documentId))
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } })
})
