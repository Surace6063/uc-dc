import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Subscription & Usage",
}

export default async function SubscriptionUsagePage() {
  const context = await getPageContext()
  if (!hasPermission(context, "subscription.view")) return <AccessDenied />

  return null
}
