import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireMembership } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { teacherDocumentUrl } from "@/services/teachers/document-service"

type Params = { params: Promise<{ id: string; documentId: string }> }

// GET /api/teachers/:id/documents/:documentId → 60-second signed URL, issued
// only to staff with teachers.documents.view or the teacher themselves.
export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requireMembership()
  const { id, documentId } = await params
  const url = await teacherDocumentUrl(ctx, z.uuid().parse(id), z.uuid().parse(documentId))
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } })
})
