import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireMembership, requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { photoUrl, uploadStudentPhoto } from "@/services/students/document-service"

type Params = { params: Promise<{ id: string }> }

const idSchema = z.uuid()

// GET /api/students/:id/photo → short-lived signed URL. Staff with
// students.view or the student themselves may view it (the parent portal
// signs its own photo URLs after its per-link access check).
export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requireMembership()
  const url = await photoUrl(ctx, idSchema.parse((await params).id))
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, max-age=240" } })
})

// POST /api/students/:id/photo (multipart: file)
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("students.update")
  await uploadStudentPhoto(ctx, idSchema.parse((await params).id), await request.formData())
  return new NextResponse(null, { status: 204 })
})
