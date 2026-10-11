"use client"

import * as React from "react"

import type { PermissionKey } from "@/lib/authorization/permissions"

// Read-only copy of the server-verified context, for UI decisions only
// (showing menus, hiding buttons). Security checks always happen on the server.
export type ClientSession = {
  user: { name: string; email: string; avatarUrl: string | null; isPlatformAdmin: boolean }
  organization: { id: string; name: string; type: string }
  role: { name: string; slug: string }
  permissions: readonly PermissionKey[]
  memberships: { organizationId: string; organizationName: string; roleName: string }[]
  // The organisation's current academic year, if one is set.
  academicYear: { name: string } | null
  // The user is linked to a guardian profile here (shows the parent portal).
  guardianPortal: boolean
}

const SessionContext = React.createContext<ClientSession | null>(null)

export function SessionProvider({
  session,
  children,
}: {
  session: ClientSession
  children: React.ReactNode
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): ClientSession {
  const session = React.useContext(SessionContext)
  if (!session) throw new Error("useSession must be used inside <SessionProvider>")
  return session
}

export function useCan(permission: PermissionKey) {
  return useSession().permissions.includes(permission)
}
