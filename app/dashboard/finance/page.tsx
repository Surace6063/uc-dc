import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Fees & Finance",
}

export default async function FeesFinancePage() {
  const context = await getPageContext()
  if (!hasPermission(context, "finance.view")) return <AccessDenied />

  return null
}
