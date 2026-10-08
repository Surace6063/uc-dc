import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Hostel",
}

export default async function HostelPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "hostel.view")) return <AccessDenied />

  return null
}
