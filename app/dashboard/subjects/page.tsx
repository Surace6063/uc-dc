import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Subjects & Courses",
}

export default async function SubjectsCoursesPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "subjects.view")) return <AccessDenied />

  return null
}
