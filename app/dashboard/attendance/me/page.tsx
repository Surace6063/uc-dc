import type { Metadata } from "next"
import Link from "next/link"
import { CalendarCheckIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { AttendanceStatusBadge } from "@/features/attendance/components/attendance-nav"
import { SelfCheckIn } from "@/features/attendance/components/self-check-in"
import { StudentAttendanceOverviewView } from "@/features/attendance/components/student-overview"
import { formatDay, localTime } from "@/features/attendance/constants"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { getGuardianAccountState } from "@/services/guardians/portal-service"
import { myEmployeeAttendance, myStudentAttendance } from "@/services/attendance/portal-service"

export const metadata: Metadata = {
  title: "My attendance",
}

// The signed-in user's own attendance: as a student (their linked student
// profile) and/or as a teacher or staff member (their linked employee
// profile). Nothing here takes an ID from the request.
export default async function MyAttendancePage() {
  const context = await getPageContext()
  if (!hasPermission(context, "attendance.view")) return <AccessDenied />

  const [student, employee, guardian] = await Promise.all([myStudentAttendance(context), myEmployeeAttendance(context), getGuardianAccountState(context)])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="My attendance" description="Your own attendance record." breadcrumbs={[{ label: "Attendance", href: "/dashboard/attendance" }, { label: "My attendance" }]} />

      {employee && (
        <section className="grid gap-4">
          <Card className="flex-row flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <h2 className="font-semibold">{employee.name}</h2>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono">{employee.employeeId}</span> · {employee.type === "TEACHER" ? "Teacher" : "Staff"} ·{" "}
                {employee.today
                  ? `Today: ${employee.today.checkInAt ? `in ${localTime(employee.today.checkInAt)}` : "recorded"}${employee.today.checkOutAt ? `, out ${localTime(employee.today.checkOutAt)}` : ""}`
                  : "Not checked in today"}
              </p>
            </div>
            {employee.selfCheckIn ? (
              <SelfCheckIn checkedIn={!!employee.today?.checkInAt} checkedOut={!!employee.today?.checkOutAt} />
            ) : (
              <p className="text-sm text-muted-foreground">Your attendance is recorded by the office.</p>
            )}
          </Card>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Attendance (60 days)", employee.summary.percentage === null ? "—" : `${employee.summary.percentage.toFixed(1)}%`],
              ["Present", employee.summary.present],
              ["Late", employee.summary.late],
              ["On leave / absent", `${employee.summary.onLeave} / ${employee.summary.absent}`],
            ].map(([label, value]) => (
              <Card key={label} className="gap-1 p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
              </Card>
            ))}
          </div>
          {employee.rows.length > 0 && (
            <Card className="gap-3 p-5">
              <h3 className="font-semibold">Last 60 days</h3>
              <ul className="divide-y text-sm">
                {employee.rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{formatDay(r.date)}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.checkInAt && `${localTime(r.checkInAt)}–${r.checkOutAt ? localTime(r.checkOutAt) : "…"}`}
                      {r.lateMinutes ? ` · ${r.lateMinutes} min late` : ""}
                      <AttendanceStatusBadge status={r.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {student && (
        <section className="grid gap-3">
          {employee && <h2 className="text-lg font-semibold">As a student</h2>}
          <StudentAttendanceOverviewView data={student} who="You" />
        </section>
      )}

      {!student && !employee && (
        <Empty className="rounded-xl border py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon"><CalendarCheckIcon /></EmptyMedia>
            <EmptyTitle>No attendance linked to your account</EmptyTitle>
            <EmptyDescription>
              {guardian === "active" ? (
                <>Your children&apos;s attendance is under <Link href="/dashboard/family" className="underline underline-offset-2">My children</Link>.</>
              ) : (
                "Your account is not linked to a student, teacher or staff profile here. Ask the school office if it should be."
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
