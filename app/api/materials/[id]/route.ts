import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { materialTarget } from "@/services/teaching/material-service"

type Params = { params: Promise<{ id: string }> }

// GET /api/materials/:id → the material's link, or a 60-second signed URL
// for a file, issued only to its teacher or academic heads.
export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("courses.view")
  const { id } = await params
  const url = await materialTarget(ctx, z.uuid().parse(id))
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } })
})
