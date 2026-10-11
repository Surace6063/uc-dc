import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { StaffForm } from "@/features/staff/components/staff-form"
import { staffName } from "@/features/staff/constants"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { getStaffFormOptions } from "@/services/staff/config-service"
import { listLinkableStaffUsers } from "@/services/staff/staff-service"

export const metadata: Metadata = {
  title: "Add staff",
}

export default async function NewStaffPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "staff.create")) return <AccessDenied />

  const canLink = hasPermission(context, "members.view")
  const [options, managers, linkableUsers] = await Promise.all([
    getStaffFormOptions(context),
    prisma.staff.findMany({
      where: { organizationId: context.organization.id, archivedAt: null, employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] } },
      orderBy: { firstName: "asc" },
      take: 500,
      select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true },
    }),
    canLink ? listLinkableStaffUsers(context) : Promise.resolve(null),
  ])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Add staff member"
        description="Create a staff profile. This never creates a login account; you can link an existing member's account at the end."
        breadcrumbs={[{ label: "Staff", href: "/dashboard/staff" }, { label: "Add staff" }]}
      />
      <StaffForm
        options={options}
        managers={managers.map((m) => ({ id: m.id, name: `${staffName(m)} (${m.employeeId})` }))}
        linkableUsers={linkableUsers}
        permissions={{
          sensitive: hasPermission(context, "staff.sensitive.view"),
          assignments: hasPermission(context, "staff.assignments.manage"),
          documents: hasPermission(context, "staff.documents.manage"),
        }}
      />
    </div>
  )
}
