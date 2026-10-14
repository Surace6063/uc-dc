import type { PermissionKey } from "@/lib/authorization/permissions"

// Signs of an administrative role. Such members keep the management
// navigation and dashboard even when they also teach or study, and their
// student access follows their role, not their teaching assignments.
const ADMINISTRATIVE: readonly PermissionKey[] = ["members.view", "roles.view", "settings.view", "results.view_all", "attendance.view_all"]

export const isAdministrative = (permissions: readonly PermissionKey[]) => permissions.some((p) => ADMINISTRATIVE.includes(p))
