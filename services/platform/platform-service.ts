import "server-only"

import { prisma } from "@/lib/prisma"

// Cross-organisation queries. Only call these after requirePlatformAdmin();
// they intentionally ignore tenant boundaries.

export async function getPlatformStats() {
  const [organizations, users, memberships] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.organizationMember.count(),
  ])
  return { organizations, users, memberships }
}

export function listAllOrganizations() {
  return prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      country: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  })
}

export function listAllUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      platformAdmin: { select: { id: true } },
      _count: { select: { memberships: true } },
    },
  })
}
