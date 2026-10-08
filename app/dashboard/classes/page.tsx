import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Classes & Sections",
}

export default async function ClassesSectionsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "classes.view")) return <AccessDenied />

  return null
}
