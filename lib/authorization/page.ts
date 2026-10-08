import "server-only"

import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth/session"
import { getCurrentMembership, type AuthContext } from "@/lib/authorization/context"
import { findMemberships } from "@/services/organizations/organization-service"
import type { AppUser } from "@/services/users/user-service"

// Where a signed-in user belongs when they have no current organisation.
export async function homePathFor(user: AppUser) {
  const memberships = await findMemberships(user.id, 2)
  if (memberships.length === 0) return user.isPlatformAdmin ? "/platform" : "/onboarding"
  return memberships.length === 1 ? "/dashboard" : "/organizations/select"
}

// For Server Components: like requireMembership(), but redirects instead of
// throwing: signed out → /login, no organisation → /onboarding, several and
// none picked → /organizations/select.
export async function getPageContext(): Promise<AuthContext> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const context = await getCurrentMembership()
  if (context) return context

  redirect(await homePathFor(user))
}

export async function getPageUser(): Promise<AppUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

// For platform pages: the platform admin, or null (render <AccessDenied />).
// Pages render alongside their layout, so each page checks for itself.
export async function getPlatformPageUser(): Promise<AppUser | null> {
  const user = await getPageUser()
  return user.isPlatformAdmin ? user : null
}
