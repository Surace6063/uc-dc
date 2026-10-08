import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Quizzes & Assessments",
}

export default async function QuizzesAssessmentsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "quizzes.view")) return <AccessDenied />

  return null
}
