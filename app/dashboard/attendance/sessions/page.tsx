import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { AttendanceNav } from "@/features/attendance/components/attendance-nav"
import { SessionsTable } from "@/features/attendance/components/sessions-table"
import { parseSessionFilters } from "@/features/attendance/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { canSeeAll, myAssignments } from "@/services/attendance/access-service"
import { listSessions } from "@/services/attendance/session-service"
import { resolveAcademicYear } from "@/services/classes/class-service"

export const metadata: Metadata = {
  title: "Attendance registers",
}

export default async function AttendanceSessionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "attendance.view_all") && !hasPermission(context, "attendance.create")) return <AccessDenied />

  const filters = parseSessionFilters(await searchParams)
  const [{ years }, list, assignments] = await Promise.all([
    resolveAcademicYear(context, filters.year),
    listSessions(context, filters),
    canSeeAll(context) ? null : myAssignments(context),
  ])
  const classIds = assignments ? [...new Set(assignments.map((a) => a.classId!))] : null
  const classes = await prisma.academicClass.findMany({
    where: { organizationId: context.organization.id, archivedAt: null, ...(classIds && { id: { in: classIds } }) },
    orderBy: [{ educationLevel: { sortOrder: "asc" } }, { sequence: "asc" }],
    select: { id: true, name: true },
  })

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Registers"
        description="Each daily or period register, its status and who took it. Drafts still need submitting."
        breadcrumbs={[{ label: "Attendance", href: "/dashboard/attendance" }, { label: "Registers" }]}
      />
      <AttendanceNav />
      <SessionsTable rows={list.rows} total={list.total} filters={filters} options={{ years: years.map((y) => ({ id: y.id, name: y.name })), classes }} />
    </div>
  )
}
