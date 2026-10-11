import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { TeacherForm } from "@/features/teachers/components/teacher-form"
import { teacherName } from "@/features/teachers/constants"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { getEducationStructure } from "@/services/academics/structure-service"
import { listLinkableUsers } from "@/services/teachers/teacher-service"

export const metadata: Metadata = {
  title: "Add teacher",
}

export default async function NewTeacherPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "teachers.create")) return <AccessDenied />

  const canLink = hasPermission(context, "members.view")
  const [structure, managers, linkableUsers] = await Promise.all([
    getEducationStructure(context),
    prisma.teacher.findMany({
      where: { organizationId: context.organization.id, archivedAt: null, employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] } },
      orderBy: { firstName: "asc" },
      take: 500,
      select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true },
    }),
    canLink ? listLinkableUsers(context) : Promise.resolve(null),
  ])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Add teacher"
        description="Create a teacher profile with employment details, qualifications and, optionally, teaching assignments."
        breadcrumbs={[{ label: "Teachers", href: "/dashboard/teachers" }, { label: "Add teacher" }]}
      />
      <TeacherForm
        structure={structure}
        managers={managers.map((m) => ({ id: m.id, name: `${teacherName(m)} (${m.employeeId})` }))}
        linkableUsers={linkableUsers}
        permissions={{
          sensitive: hasPermission(context, "teachers.sensitive.view"),
          assignments: hasPermission(context, "teachers.assignments.manage"),
          documents: hasPermission(context, "teachers.documents.manage"),
        }}
      />
    </div>
  )
}
