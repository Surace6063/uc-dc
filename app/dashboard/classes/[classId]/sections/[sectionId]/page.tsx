import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { YearSelect } from "@/features/classes/components/class-detail"
import { SectionDetail } from "@/features/classes/components/section-detail"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getEducationStructure } from "@/services/academics/structure-service"
import { listOfferedSubjects } from "@/services/subjects/offering-service"
import { getClassDetail, listAssignableTeachers, resolveAcademicYear } from "@/services/classes/class-service"

export const metadata: Metadata = {
  title: "Section",
}

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string; sectionId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await getPageContext()
  if (!hasPermission(context, "classes.view")) return <AccessDenied />

  const ids = z.object({ classId: z.uuid(), sectionId: z.uuid() }).safeParse(await params)
  if (!ids.success) notFound()
  const query = await searchParams
  const requestedYear = typeof query.year === "string" ? query.year : null

  const canSeeStudents = hasPermission(context, "students.view")
  const canAssignTeachers =
    hasPermission(context, "teachers.assignments.manage") ||
    hasPermission(context, "teachers.assignments.manage_department")

  const { years, yearId } = await resolveAcademicYear(context, requestedYear)
  const [detail, structure, teachers, subjects] = await Promise.all([
    getClassDetail(context, ids.data.classId, yearId, { includeStudents: canSeeStudents }),
    getEducationStructure(context),
    canAssignTeachers ? listAssignableTeachers(context) : Promise.resolve(null),
    listOfferedSubjects(context, yearId, ids.data.classId),
  ])
  // The section must belong to this class (and so to this organisation).
  const section = detail?.academicClass.sections.find((s) => s.id === ids.data.sectionId)
  if (!detail || !section) notFound()

  const { academicClass } = detail
  const classHref = `/dashboard/classes/${academicClass.id}${yearId ? `?year=${yearId}` : ""}`

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={`${academicClass.name} · Section ${section.name}`}
        description={[academicClass.educationLevel.name, academicClass.program?.name].filter(Boolean).join(" · ")}
        breadcrumbs={[
          { label: "Classes & Sections", href: "/dashboard/classes" },
          { label: academicClass.name, href: classHref },
          { label: `Section ${section.name}` },
        ]}
      >
        <YearSelect years={years} yearId={yearId} />
      </PageHeader>
      <SectionDetail
        detail={detail}
        sectionId={section.id}
        years={years}
        yearId={yearId}
        structure={{ classes: structure.classes, sections: structure.sections }}
        subjects={subjects}
        teachers={teachers}
        canSeeStudents={canSeeStudents}
        canAssignTeachers={canAssignTeachers}
      />
    </div>
  )
}
