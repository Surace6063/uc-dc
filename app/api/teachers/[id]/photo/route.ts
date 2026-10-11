import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireMembership, requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { teacherPhotoUrl, uploadTeacherPhoto } from "@/services/teachers/document-service"

type Params = { params: Promise<{ id: string }> }

// GET /api/teachers/:id/photo → short-lived signed URL (staff or the teacher).
export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requireMembership()
  const url = await teacherPhotoUrl(ctx, z.uuid().parse((await params).id))
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, max-age=240" } })
})

// POST /api/teachers/:id/photo (multipart: file)
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("teachers.update")
  await uploadTeacherPhoto(ctx, z.uuid().parse((await params).id), await request.formData())
  return new NextResponse(null, { status: 204 })
})
