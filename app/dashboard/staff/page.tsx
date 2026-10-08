import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Staff",
}

export default async function StaffPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "staff.view")) return <AccessDenied />

  return null
}
