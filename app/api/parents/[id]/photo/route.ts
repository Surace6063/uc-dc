import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireMembership, requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { guardianPhotoUrl, uploadGuardianPhoto } from "@/services/guardians/photo-service"

type Params = { params: Promise<{ id: string }> }

// GET /api/parents/:id/photo → short-lived signed URL (staff with
// parents.view, or the guardian themselves).
export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requireMembership()
  const url = await guardianPhotoUrl(ctx, z.uuid().parse((await params).id))
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, max-age=240" } })
})

// POST /api/parents/:id/photo (multipart: file)
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("parents.update")
  await uploadGuardianPhoto(ctx, z.uuid().parse((await params).id), await request.formData())
  return new NextResponse(null, { status: 204 })
})
