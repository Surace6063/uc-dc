import type { PermissionKey } from "@/lib/authorization/permissions"

// Permissions required for each bulk action: the same as its single-record
// version, so bulk operations can never do more than one-by-one edits.
export const BULK_PERMISSIONS = {
  archive: ["students.archive"],
  restore: ["students.archive"],
  status: ["students.update", "students.enroll"],
} as const satisfies Record<string, readonly PermissionKey[]>

export type BulkAction = keyof typeof BULK_PERMISSIONS
