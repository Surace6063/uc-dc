import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Settings",
}

export default async function SettingsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "settings.view")) return <AccessDenied />

  return null
}
