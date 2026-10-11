import type { Metadata } from "next"
import Link from "next/link"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { ClassPicker, ClassSubjects } from "@/features/subjects/components/class-subjects"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getEducationStructure } from "@/services/academics/structure-service"
import { listAssignableTeachers, resolveAcademicYear } from "@/services/classes/class-service"
import { classOfferingCounts, getClassSubjects, teacherWorkload } from "@/services/subjects/offering-service"

export const metadata: Metadata = {
  title: "Class subjects",
}

// Which subjects each class studies in an academic year, in which sections,
// and who teaches them: year → level → class → subjects → teachers.
export default async function ClassSubjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await getPageContext()
  if (!hasPermission(context, "subjects.view")) return <AccessDenied />

  const query = await searchParams
  const requestedYear = typeof query.year === "string" ? query.year : null
  const classParam = z.uuid().safeParse(query.class)
  const classId = classParam.success ? classParam.data : null
  const canAssign =
    hasPermission(context, "teachers.assignments.manage") ||
    hasPermission(context, "teachers.assignments.manage_department")

  const [{ years, yearId }, structure] = await Promise.all([
    resolveAcademicYear(context, requestedYear),
    getEducationStructure(context),
  ])
  const year = years.find((y) => y.id === yearId) ?? null
  const [counts, data, teachers, workload] = await Promise.all([
    classOfferingCounts(context, yearId),
    yearId && classId ? getClassSubjects(context, yearId, classId) : Promise.resolve(null),
    canAssign && classId ? listAssignableTeachers(context) : Promise.resolve(null),
    canAssign && yearId && classId ? teacherWorkload(context, yearId) : Promise.resolve({}),
  ])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={data ? `${data.academicClass.name} subjects` : "Class subjects"}
        description={
          data
            ? [data.academicClass.educationLevel.name, data.academicClass.program?.name].filter(Boolean).join(" · ")
            : "Choose a year and class to set its subjects, sections and teachers."
        }
        breadcrumbs={[{ label: "Subjects & Courses", href: "/dashboard/subjects" }, { label: "Class subjects" }]}
      >
        {data && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/dashboard/classes/${data.academicClass.id}${yearId ? `?year=${yearId}` : ""}`} />}
          >
            Open class
          </Button>
        )}
      </PageHeader>
      {years.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Add an academic year (e.g. 2082/83) under{" "}
          <Link href="/dashboard/academics?tab=years" className="underline underline-offset-2">
            Education structure
          </Link>{" "}
          first.
        </p>
      ) : (
        <>
          <ClassPicker structure={structure} years={years} yearId={yearId} classId={classId} counts={counts} />
          {data && year && (
            <ClassSubjects
              key={`${yearId}:${classId}`}
              data={data}
              year={year}
              years={years}
              teachers={teachers}
              workload={workload}
              canAssign={canAssign}
            />
          )}
        </>
      )}
    </div>
  )
}
