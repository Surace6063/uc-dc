import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PencilIcon } from "lucide-react"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { ClassDetail, YearSelect } from "@/features/classes/components/class-detail"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getEducationStructure } from "@/services/academics/structure-service"
import { listOfferedSubjects } from "@/services/subjects/offering-service"
import {
  getClassDetail,
  getClassHistory,
  listAssignableTeachers,
  resolveAcademicYear,
} from "@/services/classes/class-service"

export const metadata: Metadata = {
  title: "Class",
}

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await getPageContext()
  if (!hasPermission(context, "classes.view")) return <AccessDenied />

  const classId = z.uuid().safeParse((await params).classId)
  if (!classId.success) notFound()
  const query = await searchParams
  const requestedYear = typeof query.year === "string" ? query.year : null

  const canSeeStudents = hasPermission(context, "students.view")
  const canAssignTeachers =
    hasPermission(context, "teachers.assignments.manage") ||
    hasPermission(context, "teachers.assignments.manage_department")

  const { years, yearId } = await resolveAcademicYear(context, requestedYear)
  const [detail, history, structure, teachers, subjects] = await Promise.all([
    getClassDetail(context, classId.data, yearId, { includeStudents: canSeeStudents }),
    getClassHistory(context, classId.data),
    getEducationStructure(context),
    canAssignTeachers ? listAssignableTeachers(context) : Promise.resolve(null),
    listOfferedSubjects(context, yearId, classId.data),
  ])
  if (!detail) notFound()

  const { academicClass } = detail
  const placement = [academicClass.educationLevel.name, academicClass.program?.name].filter(Boolean).join(" · ")

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={
          <>
            {academicClass.name}
            {academicClass.localName && (
              <span className="ml-2 text-lg font-normal text-muted-foreground">{academicClass.localName}</span>
            )}
          </>
        }
        description={`${placement}${academicClass.code ? ` · ${academicClass.code}` : ""}`}
        breadcrumbs={[{ label: "Classes & Sections", href: "/dashboard/classes" }, { label: academicClass.name }]}
      >
        <YearSelect years={years} yearId={yearId} />
        {hasPermission(context, "classes.manage") && !academicClass.archivedAt && (
          <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/classes/${academicClass.id}/edit`} />}>
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
        )}
      </PageHeader>
      <ClassDetail
        detail={detail}
        history={history}
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
