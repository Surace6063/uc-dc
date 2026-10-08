import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { getMember, removeMember } from "@/services/organizations/member-service"

type Params = { params: Promise<{ id: string }> }

const idSchema = z.uuid()

// GET /api/members/:id: 404 for members of any other organisation.
export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("members.view")
  const id = idSchema.parse((await params).id)
  return NextResponse.json({ member: await getMember(ctx, id) })
})

// DELETE /api/members/:id: requires members.delete, scoped to the caller's org.
export const DELETE = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const ctx = await requirePermission("members.delete")
  const id = idSchema.parse((await params).id)
  await removeMember(ctx, id)
  return new NextResponse(null, { status: 204 })
})
