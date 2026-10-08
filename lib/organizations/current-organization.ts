import "server-only"

import { cookies } from "next/headers"

// Remembers which organisation the user is working in. The value is only a
// hint: every read re-verifies membership (see getCurrentMembership), so a
// tampered cookie can never grant access to another organisation.
const COOKIE_NAME = "current_org"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function readCurrentOrganizationId(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value
  return value && UUID.test(value) ? value : null
}

// Only callable from Server Actions and Route Handlers (where cookies can be
// written). Callers must have verified membership first.
export async function writeCurrentOrganizationId(organizationId: string) {
  ;(await cookies()).set(COOKIE_NAME, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
}

export async function clearCurrentOrganizationId() {
  ;(await cookies()).delete(COOKIE_NAME)
}
