import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Academics",
}

export default async function AcademicsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "academics.view")) return <AccessDenied />

  return null
}
