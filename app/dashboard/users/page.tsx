import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Users & Access",
}

export default async function UsersAccessPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "members.view")) return <AccessDenied />

  return null
}
