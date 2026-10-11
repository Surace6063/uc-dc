import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { AttendanceNav } from "@/features/attendance/components/attendance-nav"
import { HolidaysManager } from "@/features/attendance/components/holidays-manager"
import { PolicyForm } from "@/features/attendance/components/policy-form"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { getPolicy, listHolidays } from "@/services/attendance/policy-service"

export const metadata: Metadata = {
  title: "Attendance settings",
}

export default async function AttendanceSettingsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "attendance.configure")) return <AccessDenied />

  const [policy, holidays, levels] = await Promise.all([
    getPolicy(context),
    listHolidays(context),
    prisma.educationLevel.findMany({ where: { organizationId: context.organization.id }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Attendance settings"
        description="Your institution's attendance rules and holiday calendar."
        breadcrumbs={[{ label: "Attendance", href: "/dashboard/attendance" }, { label: "Settings" }]}
      />
      <AttendanceNav />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <PolicyForm policy={policy} canEdit />
        <div className="xl:sticky xl:top-4 xl:self-start">
          <HolidaysManager holidays={holidays} levels={levels} canEdit />
        </div>
      </div>
    </div>
  )
}
