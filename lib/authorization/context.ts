import "server-only"

import { cache } from "react"

import { getCurrentUser, requireAuth } from "@/lib/auth/session"
import {
  ForbiddenError,
  OrganizationNotFoundError,
  PermissionDeniedError,
} from "@/lib/authorization/errors"
import type { PermissionKey } from "@/lib/authorization/permissions"
import { readCurrentOrganizationId } from "@/lib/organizations/current-organization"
import {
  findMembership,
  findMemberships,
  type Membership,
} from "@/services/organizations/organization-service"
import type { AppUser } from "@/services/users/user-service"

// Everything a request is allowed to act on. Built only from the verified
// session and the database; nothing in it comes from the client.
export type AuthContext = {
  user: AppUser
  organization: Membership["organization"]
  membership: { id: string }
  role: Membership["role"]
  permissions: readonly PermissionKey[]
}

function toContext(user: AppUser, membership: Membership): AuthContext {
  return {
    user,
    organization: membership.organization,
    membership: { id: membership.id },
    role: membership.role,
    permissions: membership.permissions,
  }
}

// Resolves the current organisation membership:
// 1. the organisation remembered in the cookie, if the user is still a member;
// 2. otherwise the user's only organisation, if they have exactly one.
// Returns null if the user has none, or several and hasn't picked one.
export const getCurrentMembership = cache(async (): Promise<AuthContext | null> => {
  const user = await getCurrentUser()
  if (!user) return null

  const organizationId = await readCurrentOrganizationId()
  if (organizationId) {
    const membership = await findMembership(user.id, organizationId)
    if (membership) return toContext(user, membership)
  }

  const memberships = await findMemberships(user.id, 2)
  return memberships.length === 1 ? toContext(user, memberships[0]) : null
})

export async function getCurrentOrganization() {
  return (await getCurrentMembership())?.organization ?? null
}

export async function requireOrganization() {
  const { user, organization } = await requireMembership()
  return { user, organization }
}

export async function requireMembership(): Promise<AuthContext> {
  await requireAuth()
  const context = await getCurrentMembership()
  if (!context) throw new OrganizationNotFoundError()
  return context
}

export function hasPermission(
  context: Pick<AuthContext, "permissions">,
  permission: PermissionKey
) {
  return context.permissions.includes(permission)
}

// The main guard for Server Actions, Route Handlers and services:
//   const ctx = await requirePermission("students.create")
//   prisma.student.create({ data: { ..., organizationId: ctx.organization.id } })
export async function requirePermission(...required: PermissionKey[]): Promise<AuthContext> {
  const context = await requireMembership()
  const missing = required.find((permission) => !hasPermission(context, permission))
  if (missing) throw new PermissionDeniedError(missing)
  return context
}

// Prefer requirePermission. Role checks are for rare cases where the role
// itself matters (e.g. "only the owner can transfer ownership").
export async function requireRole(...roleSlugs: string[]): Promise<AuthContext> {
  const context = await requireMembership()
  if (!roleSlugs.includes(context.role.slug)) throw new ForbiddenError()
  return context
}

// Platform access is independent of any organisation membership.
export async function requirePlatformAdmin(): Promise<AppUser> {
  const user = await requireAuth()
  if (!user.isPlatformAdmin) throw new ForbiddenError()
  return user
}
