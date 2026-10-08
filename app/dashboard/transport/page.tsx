import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Transport",
}

export default async function TransportPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "transport.view")) return <AccessDenied />

  return null
}
