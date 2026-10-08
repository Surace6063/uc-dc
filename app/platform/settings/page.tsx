import type { Metadata } from "next"

import { ModulePlaceholder } from "@/components/shared/module-placeholder"
import { AccessDenied } from "@/components/shared/access-denied"
import { getPlatformPageUser } from "@/lib/authorization/page"

export const metadata: Metadata = { title: "Settings · Platform" }

export default async function PlatformSettingsPage() {
  if (!(await getPlatformPageUser())) return <AccessDenied />
  return <ModulePlaceholder title="System settings" />
}
