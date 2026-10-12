import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/shared/page-header"
import { ExamDetailView } from "@/features/exams/components/exam-detail"
import { ExamsNav } from "@/features/exams/components/exams-nav"
import { examPhase, localDate } from "@/features/exams/constants"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { hasExamStaffAccess } from "@/services/exams/access-service"
import { availableOfferings, getExaminationDetail } from "@/services/exams/examination-service"

export const metadata: Metadata = {
  title: "Examination",
}

export default async function ExaminationPage({ params }: { params: Promise<{ examId: string }> }) {
  const context = await getPageContext()
  if (!hasExamStaffAccess(context)) redirect("/dashboard/results")
  const examId = z.uuid().safeParse((await params).examId)
  if (!examId.success) notFound()
  let data
  try {
    data = await getExaminationDetail(context, examId.data)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const offerings = data.exam.status === "DRAFT" && hasPermission(context, "exams.update") ? await availableOfferings(context, data.exam.id) : null
  const phase = examPhase({ status: data.exam.status, startDate: data.exam.startDate, endDate: data.exam.endDate }, localDate())

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title={data.exam.name} description={[data.exam.code, data.exam.academicYear.name].filter(Boolean).join(" · ")} breadcrumbs={[{ label: "Examinations", href: "/dashboard/exams" }, { label: data.exam.name }]} />
      <ExamsNav />
      <ExamDetailView data={data} offerings={offerings} phase={phase} />
    </div>
  )
}
