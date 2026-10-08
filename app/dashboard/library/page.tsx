import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Library",
}

export default async function LibraryPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "library.view")) return <AccessDenied />

  return null
}
