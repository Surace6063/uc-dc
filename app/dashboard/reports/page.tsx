import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Reports & Analytics",
}

export default async function ReportsAnalyticsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "reports.view")) return <AccessDenied />

  return null
}
