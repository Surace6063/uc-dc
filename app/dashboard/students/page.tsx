import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Students",
}

export default async function StudentsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "students.view")) return <AccessDenied />

  return null
}
