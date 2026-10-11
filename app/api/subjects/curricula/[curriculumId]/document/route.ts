import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { curriculumDocumentUrl, uploadCurriculumDocument } from "@/services/subjects/curriculum-service"

type Params = { params: Promise<{ curriculumId: string }> }

// GET: redirects to a short-lived signed URL of the official syllabus file.
export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("subjects.view")
  const url = await curriculumDocumentUrl(ctx, z.uuid().parse((await params).curriculumId))
  return NextResponse.redirect(url)
})

// POST (multipart: file): uploads or replaces a draft's syllabus file.
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("subjects.manage")
  await uploadCurriculumDocument(ctx, z.uuid().parse((await params).curriculumId), await request.formData())
  return NextResponse.json({ ok: true }, { status: 201 })
})
