import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { documentDownloadUrl } from "@/services/students/document-service"

type Params = { params: Promise<{ id: string; documentId: string }> }

const idSchema = z.uuid()

// GET /api/students/:id/documents/:documentId → redirect to a 60-second
// signed URL, issued only after the permission and ownership checks.
export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("students.view", "students.documents.view")
  const { id, documentId } = await params
  const url = await documentDownloadUrl(ctx, idSchema.parse(id), idSchema.parse(documentId))
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } })
})
