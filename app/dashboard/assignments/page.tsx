import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Assignments",
}

export default async function AssignmentsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "assignments.view")) return <AccessDenied />

  return null
}
