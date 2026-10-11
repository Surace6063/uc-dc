import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { SubjectForm } from "@/features/subjects/components/subject-form"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { getEducationStructure } from "@/services/academics/structure-service"
import { listCategories } from "@/services/subjects/subject-service"

export const metadata: Metadata = {
  title: "Edit subject",
}

export default async function EditSubjectPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "subjects.manage")) return <AccessDenied />
  const id = z.uuid().safeParse((await params).subjectId)
  if (!id.success) notFound()
  const [subject, structure, categories] = await Promise.all([
    prisma.subject.findFirst({ where: { id: id.data, organizationId: context.organization.id } }),
    getEducationStructure(context),
    listCategories(context),
  ])
  if (!subject) notFound()
  if (subject.archivedAt) return <AccessDenied title="Archived subjects can't be edited. Restore the subject first." />

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title={`Edit ${subject.name}`}
        breadcrumbs={[
          { label: "Subjects & Courses", href: "/dashboard/subjects" },
          { label: subject.name, href: `/dashboard/subjects/${subject.id}` },
          { label: "Edit" },
        ]}
      />
      <SubjectForm
        structure={structure}
        categories={categories}
        subjectId={subject.id}
        initial={{
          name: subject.name,
          localName: subject.localName ?? "",
          code: subject.code,
          description: subject.description ?? "",
          categoryId: subject.categoryId ?? "",
          requirement: subject.requirement,
          educationLevelId: subject.educationLevelId ?? "",
          programId: subject.programId ?? "",
          creditHours: subject.creditHours ?? "",
          theoryHours: subject.theoryHours ?? "",
          practicalHours: subject.practicalHours ?? "",
          weeklyPeriods: subject.weeklyPeriods ?? "",
          medium: subject.medium ?? "",
          isActive: subject.isActive,
          sortOrder: subject.sortOrder,
        }}
      />
    </div>
  )
}
