import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { SubjectForm } from "@/features/subjects/components/subject-form"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getEducationStructure } from "@/services/academics/structure-service"
import { listCategories } from "@/services/subjects/subject-service"

export const metadata: Metadata = {
  title: "New subject",
}

export default async function NewSubjectPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "subjects.manage")) return <AccessDenied />
  const [structure, categories] = await Promise.all([getEducationStructure(context), listCategories(context)])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="New subject or course"
        description="A reusable definition. Which classes study it each year is set under Class subjects."
        breadcrumbs={[{ label: "Subjects & Courses", href: "/dashboard/subjects" }, { label: "New" }]}
      />
      <SubjectForm
        structure={structure}
        categories={categories}
        subjectId={null}
        initial={{
          name: "",
          localName: "",
          code: "",
          description: "",
          categoryId: "",
          requirement: "COMPULSORY",
          educationLevelId: "",
          programId: "",
          creditHours: "",
          theoryHours: "",
          practicalHours: "",
          weeklyPeriods: "",
          medium: "",
          isActive: true,
          sortOrder: 0,
        }}
      />
    </div>
  )
}
