import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { uploadTeacherDocument } from "@/services/teachers/document-service"

type Params = { params: Promise<{ id: string }> }

// POST /api/teachers/:id/documents (multipart: file, title, category, requirementId?)
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("teachers.documents.manage")
  const id = z.uuid().parse((await params).id)
  const document = await uploadTeacherDocument(ctx, id, await request.formData())
  return NextResponse.json({ document }, { status: 201 })
})
