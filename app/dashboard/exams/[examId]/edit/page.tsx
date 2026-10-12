import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { ExamForm } from "@/features/exams/components/exam-form"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { fromDate } from "@/lib/validation"
import { examFormOptions } from "@/services/exams/examination-query"

export const metadata: Metadata = {
  title: "Edit examination",
}

export default async function EditExaminationPage({ params }: { params: Promise<{ examId: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "exams.update")) return <AccessDenied />
  const examId = z.uuid().safeParse((await params).examId)
  if (!examId.success) notFound()
  const exam = await prisma.examination.findFirst({ where: { id: examId.data, organizationId: context.organization.id } })
  if (!exam) notFound()
  if (exam.status !== "DRAFT" && exam.status !== "SCHEDULED") {
    return <AccessDenied title="This examination can no longer be edited" />
  }
  const options = await examFormOptions(context)
  // Keep the examination's own (possibly now inactive) choices selectable.
  if (!options.scales.some((s) => s.id === exam.gradingScaleId)) {
    const scale = await prisma.gradingScale.findUniqueOrThrow({ where: { id: exam.gradingScaleId }, select: { id: true, name: true, version: true, status: true, isDefault: true } })
    options.scales.push(scale)
  }
  if (!options.policies.some((p) => p.id === exam.resultPolicyId)) {
    const policy = await prisma.resultPolicy.findUniqueOrThrow({ where: { id: exam.resultPolicyId }, select: { id: true, name: true, isDefault: true, gradingScaleId: true, educationLevelId: true } })
    options.policies.push(policy)
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title={`Edit ${exam.name}`}
        breadcrumbs={[{ label: "Examinations", href: "/dashboard/exams" }, { label: exam.name, href: `/dashboard/exams/${exam.id}` }, { label: "Edit" }]}
      />
      <ExamForm
        examId={exam.id}
        status={exam.status}
        options={options}
        initial={{
          academicYearId: exam.academicYearId,
          assessmentTypeId: exam.assessmentTypeId,
          name: exam.name,
          code: exam.code ?? "",
          description: exam.description ?? "",
          educationLevelId: exam.educationLevelId ?? "",
          programId: exam.programId ?? "",
          term: exam.term ?? "",
          startDate: fromDate(exam.startDate),
          endDate: fromDate(exam.endDate),
          resultPublicationDate: fromDate(exam.resultPublicationDate),
          gradingScaleId: exam.gradingScaleId,
          resultPolicyId: exam.resultPolicyId,
        }}
      />
    </div>
  )
}
