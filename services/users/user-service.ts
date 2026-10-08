import "server-only"

import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

export type AppUser = {
  id: string
  authUserId: string
  email: string
  name: string
  avatarUrl: string | null
  isPlatformAdmin: boolean
}

type AuthIdentity = {
  authUserId: string
  email: string
  name?: string | null
}

function toAppUser(user: {
  id: string
  authUserId: string
  email: string
  name: string | null
  avatarUrl: string | null
  platformAdmin: { id: string } | null
}): AppUser {
  return {
    id: user.id,
    authUserId: user.authUserId,
    email: user.email,
    name: user.name || user.email.split("@")[0],
    avatarUrl: user.avatarUrl,
    isPlatformAdmin: user.platformAdmin !== null,
  }
}

const userSelect = {
  id: true,
  authUserId: true,
  email: true,
  name: true,
  avatarUrl: true,
  platformAdmin: { select: { id: true } },
} as const

// Returns the application user for a verified Supabase identity, creating it
// on first sight. Called on registration and lazily on every authenticated
// request, so users confirmed by email link always get a profile.
export async function ensureAppUser(identity: AuthIdentity): Promise<AppUser> {
  const existing = await prisma.user.findUnique({
    where: { authUserId: identity.authUserId },
    select: userSelect,
  })

  if (existing) {
    // Keep the email in step with Supabase if it was changed there.
    if (existing.email !== identity.email && identity.email) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: { email: identity.email },
        select: userSelect,
      })
      return toAppUser(updated)
    }
    return toAppUser(existing)
  }

  try {
    const created = await prisma.user.create({
      data: {
        authUserId: identity.authUserId,
        email: identity.email,
        name: identity.name?.trim() || null,
      },
      select: userSelect,
    })
    return toAppUser(created)
  } catch (error) {
    // Parallel first requests (e.g. a page and its prefetches) can race to
    // create the same user; the loser simply reads the winner's row.
    if (!isUniqueViolation(error)) throw error
    const winner = await prisma.user.findUniqueOrThrow({
      where: { authUserId: identity.authUserId },
      select: userSelect,
    })
    return toAppUser(winner)
  }
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}
