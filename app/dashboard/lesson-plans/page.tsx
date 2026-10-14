import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { LessonPlansView } from "@/features/teaching/components/lesson-plans-view"
import { parseLessonPlanFilters } from "@/features/teaching/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { listLessonPlans } from "@/services/teaching/lesson-plan-service"
import { teachingOptions } from "@/services/teaching/options-service"

export const metadata: Metadata = { title: "Lesson plans" }

export default async function LessonPlansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "courses.view")) return <AccessDenied />
  const raw = await searchParams
  const filters = parseLessonPlanFilters(raw)
  const [list, options] = await Promise.all([listLessonPlans(context, filters), teachingOptions(context)])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Lesson plans"
        description={options.oversees && !options.isTeacher ? "Lesson plans written by teachers." : "Plan lessons for the classes and subjects you teach, and note how they went."}
        breadcrumbs={[{ label: "Lesson plans" }]}
      />
      <LessonPlansView
        rows={list.rows}
        total={list.total}
        counts={list.counts}
        yearId={list.yearId}
        filters={filters}
        options={options}
        canCreate={options.isTeacher && hasPermission(context, "courses.create")}
        canEdit={hasPermission(context, "courses.update")}
        openNew={raw.new === "1"}
      />
    </div>
  )
}
