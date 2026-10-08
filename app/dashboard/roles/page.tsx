import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Roles & Permissions",
}

export default async function RolesPermissionsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "roles.view")) return <AccessDenied />

  return null
}
