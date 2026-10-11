import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { CurriculumEditor } from "@/features/subjects/components/curriculum-editor"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getEducationStructure } from "@/services/academics/structure-service"
import { getCurriculum } from "@/services/subjects/curriculum-service"

export const metadata: Metadata = {
  title: "Curriculum",
}

export default async function CurriculumPage({
  params,
}: {
  params: Promise<{ subjectId: string; curriculumId: string }>
}) {
  const context = await getPageContext()
  if (!hasPermission(context, "subjects.view")) return <AccessDenied />
  const ids = z.object({ subjectId: z.uuid(), curriculumId: z.uuid() }).safeParse(await params)
  if (!ids.success) notFound()
  const [curriculum, structure] = await Promise.all([
    getCurriculum(context, ids.data.curriculumId),
    getEducationStructure(context),
  ])
  if (!curriculum || curriculum.subject.id !== ids.data.subjectId) notFound()

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={curriculum.name}
        description={`${curriculum.subject.name} (${curriculum.subject.code})`}
        breadcrumbs={[
          { label: "Subjects & Courses", href: "/dashboard/subjects" },
          { label: curriculum.subject.name, href: `/dashboard/subjects/${curriculum.subject.id}?tab=curriculum` },
          { label: `Curriculum ${curriculum.version}` },
        ]}
      />
      <CurriculumEditor curriculum={curriculum} structure={structure} />
    </div>
  )
}
