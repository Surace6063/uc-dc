import "server-only"

import type { AuthContext } from "@/lib/authorization/context"
import { ForbiddenError, NotFoundError } from "@/lib/authorization/errors"
import { OWNER_ROLE_SLUG } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"

// Reference pattern for every organisation-owned query: the organisation ID
// always comes from the server-built AuthContext, never from the request, and
// every lookup by ID is also filtered by organisation. A record from another
// organisation is therefore indistinguishable from one that doesn't exist.
type TenantContext = Pick<AuthContext, "organization" | "user">

const memberSelect = {
  id: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
  role: { select: { id: true, name: true, slug: true } },
} as const

export function listMembers(ctx: TenantContext) {
  return prisma.organizationMember.findMany({
    where: { organizationId: ctx.organization.id },
    select: memberSelect,
    orderBy: { createdAt: "asc" },
  })
}

export async function getMember(ctx: TenantContext, memberId: string) {
  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId: ctx.organization.id },
    select: memberSelect,
  })
  if (!member) throw new NotFoundError("Member not found.")
  return member
}

export async function removeMember(ctx: TenantContext, memberId: string) {
  const member = await getMember(ctx, memberId)
  if (member.user.id === ctx.user.id) throw new ForbiddenError("You can't remove yourself.")
  if (member.role.slug === OWNER_ROLE_SLUG) throw new ForbiddenError("The owner can't be removed.")

  // deleteMany with the organisation filter, so even a race can't cross tenants.
  await prisma.organizationMember.deleteMany({
    where: { id: member.id, organizationId: ctx.organization.id },
  })
}
