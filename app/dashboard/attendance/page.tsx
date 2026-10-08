import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Attendance",
}

export default async function AttendancePage() {
  const context = await getPageContext()
  if (!hasPermission(context, "attendance.view")) return <AccessDenied />

  return null
}
