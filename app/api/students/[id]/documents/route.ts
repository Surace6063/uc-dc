import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import {
  listStudentDocuments,
  uploadStudentDocument,
} from "@/services/students/document-service"

type Params = { params: Promise<{ id: string }> }

const idSchema = z.uuid()

// GET /api/students/:id/documents: metadata only, never file contents.
export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("students.view", "students.documents.view")
  const id = idSchema.parse((await params).id)
  return NextResponse.json({ documents: await listStudentDocuments(ctx, id) })
})

// POST /api/students/:id/documents (multipart: file, title, requirementId?)
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("students.documents.manage")
  const id = idSchema.parse((await params).id)
  const document = await uploadStudentDocument(ctx, id, await request.formData())
  return NextResponse.json({ document }, { status: 201 })
})
