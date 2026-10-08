import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Teachers",
}

export default async function TeachersPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "teachers.view")) return <AccessDenied />

  return null
}
