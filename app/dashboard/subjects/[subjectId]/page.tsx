import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PencilIcon } from "lucide-react"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { SubjectDetail } from "@/features/subjects/components/subject-detail"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getEducationStructure } from "@/services/academics/structure-service"
import { getSubjectDetail, listSubjectOptions } from "@/services/subjects/subject-service"

export const metadata: Metadata = {
  title: "Subject",
}

export default async function SubjectPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "subjects.view")) return <AccessDenied />
  const id = z.uuid().safeParse((await params).subjectId)
  if (!id.success) notFound()
  const [detail, subjects, structure] = await Promise.all([
    getSubjectDetail(context, id.data),
    listSubjectOptions(context),
    getEducationStructure(context),
  ])
  if (!detail) notFound()
  const { subject } = detail

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={
          <>
            {subject.name}
            {subject.localName && <span className="ml-2 text-lg font-normal text-muted-foreground">{subject.localName}</span>}
          </>
        }
        description={[subject.code, subject.category?.name, subject.educationLevel?.name, subject.program?.code]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[{ label: "Subjects & Courses", href: "/dashboard/subjects" }, { label: subject.name }]}
      >
        {hasPermission(context, "subjects.manage") && !subject.archivedAt && (
          <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/subjects/${subject.id}/edit`} />}>
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
        )}
      </PageHeader>
      <SubjectDetail detail={detail} subjects={subjects} structure={structure} />
    </div>
  )
}
