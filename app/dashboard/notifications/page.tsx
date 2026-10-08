import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Notifications",
}

export default async function NotificationsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "notifications.view")) return <AccessDenied />

  return null
}
