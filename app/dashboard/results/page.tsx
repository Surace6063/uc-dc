import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Grades & Results",
}

export default async function GradesResultsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "results.view")) return <AccessDenied />

  return null
}
