import "server-only"

import { cache } from "react"

import { UnauthenticatedError } from "@/lib/authorization/errors"
import { createClient } from "@/lib/supabase/server"
import { ensureAppUser, type AppUser } from "@/services/users/user-service"

// Supabase owns credentials; this resolves the verified identity for the
// current request. getClaims() checks the JWT signature, so it can be trusted
// (unlike getSession(), which only reads the cookie).
const getAuthIdentity = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub || !claims.email) return null

  const name = claims.user_metadata?.name ?? claims.user_metadata?.full_name
  return {
    authUserId: claims.sub,
    email: claims.email,
    name: typeof name === "string" ? name : null,
  }
})

// The application user for this request, or null when signed out.
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const identity = await getAuthIdentity()
  return identity ? ensureAppUser(identity) : null
})

export async function requireAuth(): Promise<AppUser> {
  const user = await getCurrentUser()
  if (!user) throw new UnauthenticatedError()
  return user
}
