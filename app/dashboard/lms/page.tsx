import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "LMS",
}

export default async function LMSPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "courses.view")) return <AccessDenied />

  return null
}
