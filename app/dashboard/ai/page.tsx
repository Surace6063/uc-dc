import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "AI Features",
}

export default async function AIFeaturesPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "ai.use")) return <AccessDenied />

  return null
}
