import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireMembership, requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { staffPhotoUrl, uploadStaffPhoto } from "@/services/staff/document-service"

type Params = { params: Promise<{ id: string }> }

// GET /api/staff/:id/photo → short-lived signed URL (permitted viewers only).
export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requireMembership()
  const url = await staffPhotoUrl(ctx, z.uuid().parse((await params).id))
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, max-age=240" } })
})

// POST /api/staff/:id/photo (multipart: file)
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("staff.update")
  await uploadStaffPhoto(ctx, z.uuid().parse((await params).id), await request.formData())
  return new NextResponse(null, { status: 204 })
})
