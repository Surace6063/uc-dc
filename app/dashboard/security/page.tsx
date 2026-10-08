import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Security & Audit",
}

export default async function SecurityAuditPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "audit.view")) return <AccessDenied />

  return null
}
