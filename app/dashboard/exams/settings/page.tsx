import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { ExamsNav } from "@/features/exams/components/exams-nav"
import { ExamSettingsView } from "@/features/exams/components/settings-panels"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getExamSettings } from "@/services/exams/settings-service"

export const metadata: Metadata = {
  title: "Grading & policies",
}

export default async function ExamSettingsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "exams.configure")) return <AccessDenied />
  const settings = await getExamSettings(context)
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Grading & policies"
        description="Your institution's grading scales, result rules and assessment types."
        breadcrumbs={[{ label: "Examinations", href: "/dashboard/exams" }, { label: "Grading & policies" }]}
      />
      <ExamsNav />
      <ExamSettingsView settings={settings} />
    </div>
  )
}
