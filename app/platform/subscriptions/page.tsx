import type { Metadata } from "next"

import { ModulePlaceholder } from "@/components/shared/module-placeholder"
import { AccessDenied } from "@/components/shared/access-denied"
import { getPlatformPageUser } from "@/lib/authorization/page"

export const metadata: Metadata = { title: "Subscriptions · Platform" }

export default async function PlatformSubscriptionsPage() {
  if (!(await getPlatformPageUser())) return <AccessDenied />
  return <ModulePlaceholder title="Subscriptions" />
}
