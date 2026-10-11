import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { ClassForm } from "@/features/classes/components/class-form"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { getEducationStructure } from "@/services/academics/structure-service"

export const metadata: Metadata = {
  title: "Edit class",
}

export default async function EditClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "classes.manage")) return <AccessDenied />

  const id = z.uuid().safeParse((await params).classId)
  if (!id.success) notFound()
  const structure = await getEducationStructure(context)
  const academicClass = structure.classes.find((c) => c.id === id.data)
  if (!academicClass) notFound()
  if (academicClass.archivedAt) {
    return <AccessDenied title="Archived classes can't be edited. Restore the class first." />
  }
  const enrollments = await prisma.enrollment.count({
    where: { organizationId: context.organization.id, classId: academicClass.id },
  })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title={`Edit ${academicClass.name}`}
        breadcrumbs={[
          { label: "Classes & Sections", href: "/dashboard/classes" },
          { label: academicClass.name, href: `/dashboard/classes/${academicClass.id}` },
          { label: "Edit" },
        ]}
      />
      <ClassForm
        structure={structure}
        classId={academicClass.id}
        hasEnrollments={enrollments > 0}
        initial={{
          educationLevelId: academicClass.educationLevelId,
          programId: academicClass.programId ?? "",
          name: academicClass.name,
          localName: academicClass.localName ?? "",
          code: academicClass.code ?? "",
          description: academicClass.description ?? "",
          kind: academicClass.kind,
          sequence: academicClass.sequence,
          capacity: academicClass.capacity ?? "",
          isActive: academicClass.isActive,
        }}
      />
    </div>
  )
}
