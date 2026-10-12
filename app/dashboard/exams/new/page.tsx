import type { Metadata } from "next"
import Link from "next/link"
import { SettingsIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { ExamForm } from "@/features/exams/components/exam-form"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { examFormOptions } from "@/services/exams/examination-query"

export const metadata: Metadata = {
  title: "New examination",
}

export default async function NewExaminationPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "exams.create")) return <AccessDenied />
  const options = await examFormOptions(context)
  const missing = [
    !options.years.length && "an academic year",
    !options.types.length && "an assessment type",
    !options.scales.length && "a grading scale",
    !options.policies.length && "a result policy",
  ].filter(Boolean)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="New examination"
        description="Set the examination's details; subjects and components are added next."
        breadcrumbs={[{ label: "Examinations", href: "/dashboard/exams" }, { label: "New" }]}
      />
      {missing.length ? (
        <Empty className="rounded-xl border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon"><SettingsIcon /></EmptyMedia>
            <EmptyTitle>Set up examinations first</EmptyTitle>
            <EmptyDescription>Add {missing.join(", ")} before creating an examination.</EmptyDescription>
          </EmptyHeader>
          {hasPermission(context, "exams.configure") && (
            <EmptyContent>
              <Button nativeButton={false} render={<Link href="/dashboard/exams/settings" />}>Open grading & policies</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <ExamForm examId={null} status={null} initial={null} options={options} />
      )}
    </div>
  )
}
