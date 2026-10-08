import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Communication",
}

export default async function CommunicationPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "communication.view")) return <AccessDenied />

  return null
}
