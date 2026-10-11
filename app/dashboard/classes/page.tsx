import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { ClassesHeaderActions, ClassesView } from "@/features/classes/components/classes-list"
import { parseClassFilters } from "@/features/classes/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getEducationStructure } from "@/services/academics/structure-service"
import { getClassStats, listClasses, listSections } from "@/services/classes/class-query"
import { resolveAcademicYear } from "@/services/classes/class-service"

export const metadata: Metadata = {
  title: "Classes & Sections",
}

export default async function ClassesSectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await getPageContext()
  if (!hasPermission(context, "classes.view")) return <AccessDenied />

  // Filters, sort and page come from the URL and are applied on the server.
  const filters = parseClassFilters(await searchParams)
  const [structure, { years, yearId }] = await Promise.all([
    getEducationStructure(context),
    resolveAcademicYear(context, filters.year),
  ])
  const [stats, list] = await Promise.all([
    getClassStats(context, yearId),
    filters.view === "sections"
      ? listSections(context, filters, yearId).then((r) => ({ total: r.total, classes: [], sections: r.rows }))
      : listClasses(context, filters, yearId).then((r) => ({ total: r.total, classes: r.rows, sections: [] })),
  ])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Classes & sections"
        description="Classes, cohorts and their sections, who teaches them and how full they are in each academic year."
        breadcrumbs={[{ label: "Classes & Sections" }]}
      >
        <ClassesHeaderActions structure={structure} years={years} yearId={yearId} />
      </PageHeader>
      <ClassesView
        view={filters.view}
        classRows={list.classes}
        sectionRows={list.sections}
        total={list.total}
        stats={stats}
        filters={filters}
        structure={structure}
        yearId={yearId}
        yearName={years.find((y) => y.id === yearId)?.name ?? null}
      />
    </div>
  )
}
