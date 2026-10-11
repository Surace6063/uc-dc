import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { StaffHeaderActions, StaffView } from "@/features/staff/components/staff-view"
import { staffName } from "@/features/staff/constants"
import { parseStaffFilters } from "@/features/staff/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { signedUrls } from "@/lib/supabase/storage"
import { getStaffFormOptions } from "@/services/staff/config-service"
import { getStaffStats, listStaff } from "@/services/staff/staff-query"
import { staffListScope } from "@/services/staff/staff-service"

export const metadata: Metadata = {
  title: "Staff",
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await getPageContext()
  const scope = await staffListScope(context)
  if (scope === null) {
    // No directory access: staff members go to their own profile instead.
    const own = await prisma.staff.findFirst({
      where: { organizationId: context.organization.id, userId: context.user.id },
      select: { id: true },
    })
    if (own) redirect(`/dashboard/staff/${own.id}`)
    return <AccessDenied />
  }

  // Filters, sort and page come from the URL and are applied on the server.
  const filters = parseStaffFilters(await searchParams)
  const canSeeEmployment = hasPermission(context, "staff.employment.view")
  const [options, list, stats, managers] = await Promise.all([
    getStaffFormOptions(context),
    listStaff(context, filters),
    getStaffStats(context),
    // For the "reports to" filter (a restricted employment detail).
    canSeeEmployment
      ? prisma.staff.findMany({
          where: { organizationId: context.organization.id, archivedAt: null, reports: { some: {} }, ...scope },
          orderBy: { firstName: "asc" },
          take: 200,
          select: { id: true, firstName: true, middleName: true, lastName: true },
        })
      : Promise.resolve([]),
  ])
  const photos = await signedUrls(list.rows.map((r) => r.profileImagePath).filter((p): p is string => !!p))
  const rows = list.rows.map(({ profileImagePath, ...row }) => ({
    ...row,
    photoUrl: profileImagePath ? (photos.get(profileImagePath) ?? null) : null,
  }))
  const departmentOnly = !hasPermission(context, "staff.view")

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Staff"
        description={
          departmentOnly
            ? "Non-teaching staff in your department."
            : "Non-teaching employees: profiles, employment, qualifications, documents and responsibilities."
        }
        breadcrumbs={[{ label: "Staff" }]}
      >
        <StaffHeaderActions />
      </PageHeader>
      <StaffView
        rows={rows}
        total={list.total}
        stats={stats}
        filters={filters}
        options={options}
        managers={managers.map((m) => ({ id: m.id, name: staffName(m) }))}
      />
    </div>
  )
}
