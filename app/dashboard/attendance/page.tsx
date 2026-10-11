import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { CalendarOffIcon, ClipboardCheckIcon, FileUpIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AttendanceNav } from "@/features/attendance/components/attendance-nav"
import { AttendanceCharts } from "@/features/attendance/components/dashboard-charts"
import { DashboardCards, RaiseAlertsButton } from "@/features/attendance/components/dashboard-cards"
import { MyRegisters } from "@/features/attendance/components/register-picker"
import { formatDay } from "@/features/attendance/constants"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { canSeeAll, hasRegisterAccess } from "@/services/attendance/access-service"
import { dashboardStats, myRegistersToday } from "@/services/attendance/report-service"

export const metadata: Metadata = {
  title: "Attendance",
}

// Organisation-wide figures for those who see every class; a teacher's own
// registers for teachers; everyone else (students, parents, employees) goes
// to their own attendance.
export default async function AttendancePage() {
  const context = await getPageContext()
  if (!hasPermission(context, "attendance.view")) return <AccessDenied />

  const all = canSeeAll(context)
  if (!all && !(await hasRegisterAccess(context))) {
    if (hasPermission(context, "attendance.staff.view") || hasPermission(context, "attendance.staff.manage")) redirect("/dashboard/attendance/staff")
    redirect("/dashboard/attendance/me")
  }

  const canTake = hasPermission(context, "attendance.create") || hasPermission(context, "attendance.manage")
  const header = (
    <PageHeader title="Attendance" description="Registers, records and attendance rates across your institution." breadcrumbs={[{ label: "Attendance" }]}>
      {all && <RaiseAlertsButton />}
      {hasPermission(context, "attendance.manage") && hasPermission(context, "attendance.export") && (
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/attendance/import" />}>
          <FileUpIcon data-icon="inline-start" />
          Import
        </Button>
      )}
      {canTake && (
        <Button nativeButton={false} render={<Link href="/dashboard/attendance/take" />}>
          <ClipboardCheckIcon data-icon="inline-start" />
          Take attendance
        </Button>
      )}
    </PageHeader>
  )

  if (!all) {
    const mine = await myRegistersToday(context)
    return (
      <div className="flex min-w-0 flex-col gap-5">
        {header}
        <AttendanceNav />
        <Card className="gap-3 p-5">
          <div>
            <h2 className="font-semibold">Your registers today</h2>
            <p className="text-sm text-muted-foreground">{formatDay(mine.date)} · classes and subjects you are assigned to.</p>
          </div>
          {mine.items.length ? (
            <MyRegisters items={mine.items} yearId={mine.yearId} date={mine.date} />
          ) : (
            <p className="text-sm text-muted-foreground">You have no class or subject assignments in the current academic year.</p>
          )}
        </Card>
      </div>
    )
  }

  const stats = await dashboardStats(context)
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {header}
      <AttendanceNav />
      {stats.nonWorkingToday && (
        <p className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <CalendarOffIcon className="size-4" />
          Today is a non-working day ({stats.nonWorkingToday}); no attendance is expected.
        </p>
      )}
      {!stats.yearId ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Set a current academic year under <Link href="/dashboard/academics?tab=years" className="underline underline-offset-2">Education structure</Link> to see attendance figures.
        </p>
      ) : (
        <>
          <DashboardCards stats={stats} />
          <p className="text-xs text-muted-foreground">
            “Marked today” counts students in submitted registers for {formatDay(stats.today)} out of students actively enrolled in {stats.yearName}. Students not yet marked are shown as unmarked, never as absent.
          </p>
          <AttendanceCharts stats={stats} />
        </>
      )}
    </div>
  )
}
