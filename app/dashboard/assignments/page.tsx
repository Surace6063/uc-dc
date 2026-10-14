import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { AssignmentsView } from "@/features/teaching/components/assignments-view"
import { parseClassAssignmentFilters } from "@/features/teaching/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { listClassAssignments } from "@/services/teaching/class-assignment-service"
import { teachingOptions } from "@/services/teaching/options-service"

export const metadata: Metadata = {
  title: "Assignments",
}

// Homework and coursework set for classes. Teachers see what they set;
// academic heads see every teacher's.
export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "assignments.view")) return <AccessDenied />
  const raw = await searchParams
  const filters = parseClassAssignmentFilters(raw)
  const [list, options] = await Promise.all([listClassAssignments(context, filters), teachingOptions(context)])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Assignments" description="Set work for your classes, record what's handed in and review it." breadcrumbs={[{ label: "Assignments" }]} />
      <AssignmentsView
        rows={list.rows}
        total={list.total}
        awaitingReview={list.awaitingReview}
        counts={list.counts}
        yearId={list.yearId}
        filters={filters}
        options={options}
        canCreate={options.isTeacher && hasPermission(context, "assignments.create")}
        canEdit={hasPermission(context, "assignments.update")}
        canDelete={hasPermission(context, "assignments.delete")}
        openNew={raw.new === "1"}
      />
    </div>
  )
}
