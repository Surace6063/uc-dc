import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Documents",
}

export default async function DocumentsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "documents.view")) return <AccessDenied />

  return null
}
