import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { submitMyAssignment } from "@/services/student-portal/learning-service"

type Params = { params: Promise<{ id: string }> }

// POST /api/assignments/:id/submission (multipart: content?, file?)
// The signed-in student hands in (or hands in again) their own work.
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("assignments.view")
  await submitMyAssignment(ctx, z.uuid().parse((await params).id), await request.formData())
  return NextResponse.json({ ok: true }, { status: 201 })
})
