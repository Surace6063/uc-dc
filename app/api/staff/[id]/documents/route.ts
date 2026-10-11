import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { uploadStaffDocument } from "@/services/staff/document-service"

type Params = { params: Promise<{ id: string }> }

// POST /api/staff/:id/documents (multipart: file, title, category, requirementId?)
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("staff.documents.manage")
  const id = z.uuid().parse((await params).id)
  const document = await uploadStaffDocument(ctx, id, await request.formData())
  return NextResponse.json({ document }, { status: 201 })
})
