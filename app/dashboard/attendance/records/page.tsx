import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { AttendanceNav } from "@/features/attendance/components/attendance-nav"
import { RecordsTable } from "@/features/attendance/components/records-table"
import { studentStatuses } from "@/features/attendance/constants"
import { parseRecordFilters } from "@/features/attendance/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { canSeeAll, myAssignments } from "@/services/attendance/access-service"
import { getPolicy } from "@/services/attendance/policy-service"
import { listRecords } from "@/services/attendance/record-query"
import { resolveAcademicYear } from "@/services/classes/class-service"

export const metadata: Metadata = {
  title: "Attendance records",
}

// Student attendance records, filtered, sorted and paginated on the server.
// Teachers see only their own classes (enforced in the query, not here).
export default async function AttendanceRecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "attendance.view_all") && !hasPermission(context, "attendance.create")) return <AccessDenied />

  const filters = parseRecordFilters(await searchParams)
  const organizationId = context.organization.id
  const [{ years }, policy, list, assignments] = await Promise.all([
    resolveAcademicYear(context, filters.year),
    getPolicy(context),
    listRecords(context, filters),
    canSeeAll(context) ? null : myAssignments(context),
  ])
  const classIds = assignments ? [...new Set(assignments.map((a) => a.classId!))] : null
  const [classes, sections, offerings] = await Promise.all([
    prisma.academicClass.findMany({
      where: { organizationId, archivedAt: null, ...(classIds && { id: { in: classIds } }) },
      orderBy: [{ educationLevel: { sortOrder: "asc" } }, { sequence: "asc" }],
      select: { id: true, name: true },
    }),
    filters.class
      ? prisma.section.findMany({ where: { organizationId, classId: filters.class, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } })
      : [],
    filters.class
      ? prisma.subjectOffering.findMany({
          where: { organizationId, classId: filters.class, ...(filters.year && { academicYearId: filters.year }) },
          orderBy: { subject: { name: "asc" } },
          select: { id: true, subject: { select: { name: true } }, academicYear: { select: { name: true } } },
        })
      : [],
  ])

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Attendance records"
        description="Every mark in submitted and draft registers. Corrections keep the original value."
        breadcrumbs={[{ label: "Attendance", href: "/dashboard/attendance" }, { label: "Records" }]}
      />
      <AttendanceNav />
      <RecordsTable
        rows={list.rows}
        total={list.total}
        filters={filters}
        options={{
          years: years.map((y) => ({ id: y.id, name: y.name })),
          classes,
          sections,
          offerings: offerings.map((o) => ({ id: o.id, name: filters.year ? o.subject.name : `${o.subject.name} (${o.academicYear.name})` })),
          statuses: studentStatuses(policy),
          correctionsDirect: hasPermission(context, "attendance.approve") || !policy.correctionsRequireApproval,
        }}
      />
    </div>
  )
}
