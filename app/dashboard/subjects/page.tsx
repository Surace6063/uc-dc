import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { SubjectsHeaderActions, SubjectsView } from "@/features/subjects/components/subjects-list"
import { parseSubjectFilters } from "@/features/subjects/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getEducationStructure } from "@/services/academics/structure-service"
import { resolveAcademicYear } from "@/services/classes/class-service"
import { getSubjectStats, listSubjects } from "@/services/subjects/subject-query"
import { listCategories } from "@/services/subjects/subject-service"

export const metadata: Metadata = {
  title: "Subjects & Courses",
}

export default async function SubjectsCoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await getPageContext()
  if (!hasPermission(context, "subjects.view")) return <AccessDenied />

  // Filters, sort and page come from the URL and are applied on the server.
  const filters = parseSubjectFilters(await searchParams)
  const [structure, categories, { years, yearId }] = await Promise.all([
    getEducationStructure(context),
    listCategories(context),
    resolveAcademicYear(context, filters.year),
  ])
  const [stats, list] = await Promise.all([getSubjectStats(context, yearId), listSubjects(context, filters, yearId)])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Subjects & courses"
        description="Reusable subject and course definitions, their curricula, and which classes study them each year."
        breadcrumbs={[{ label: "Subjects & Courses" }]}
      >
        <SubjectsHeaderActions years={years} yearId={yearId} categories={categories} />
      </PageHeader>
      <SubjectsView
        rows={list.rows}
        total={list.total}
        stats={stats}
        filters={filters}
        structure={structure}
        categories={categories}
        yearName={years.find((y) => y.id === yearId)?.name ?? null}
      />
    </div>
  )
}
