import { NextResponse } from "next/server"

import { requirePermission } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { listMembers } from "@/services/organizations/member-service"

// GET /api/members: members of the caller's current organisation only.
export const GET = withErrorHandling(async () => {
  const ctx = await requirePermission("members.view")
  const members = await listMembers(ctx)
  return NextResponse.json({ organization: ctx.organization.name, members })
})
