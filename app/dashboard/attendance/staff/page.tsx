import type { Metadata } from "next"
import Link from "next/link"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { AttendanceNav } from "@/features/attendance/components/attendance-nav"
import { EmployeeRecordsTable } from "@/features/attendance/components/employee-records"
import { EmployeeRegisterForm } from "@/features/attendance/components/employee-register"
import { EmployeeDatePicker } from "@/features/attendance/components/employee-date-picker"
import { localDate } from "@/features/attendance/constants"
import { parseEmployeeFilters } from "@/features/attendance/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { cn } from "@/lib/utils"
import { getEmployeeRegister, listEmployeeRecords } from "@/services/attendance/employee-service"

export const metadata: Metadata = {
  title: "Teacher & staff attendance",
}

export default async function EmployeeAttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  const canManage = hasPermission(context, "attendance.staff.manage")
  if (!canManage && !hasPermission(context, "attendance.staff.view")) return <AccessDenied />

  const query = await searchParams
  const view = query.view === "records" ? "records" : "register"
  const today = localDate()
  const date = typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date) && query.date <= today ? query.date : today
  const type = query.type === "TEACHER" || query.type === "STAFF" ? query.type : undefined
  const filters = parseEmployeeFilters(query)

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Teachers & staff"
        description="Daily attendance for teachers and non-teaching staff, kept separate from student registers."
        breadcrumbs={[{ label: "Attendance", href: "/dashboard/attendance" }, { label: "Teachers & staff" }]}
      />
      <AttendanceNav />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["register", "records"] as const).map((v) => (
            <Link
              key={v}
              href={v === "records" ? "/dashboard/attendance/staff?view=records" : "/dashboard/attendance/staff"}
              aria-current={view === v ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1 text-sm", view === v ? "border-primary/50 bg-primary/5 font-medium" : "text-muted-foreground hover:bg-muted/50")}
            >
              {v === "register" ? "Daily register" : "History"}
            </Link>
          ))}
        </div>
        {view === "register" && <EmployeeDatePicker date={date} today={today} type={type} />}
      </div>
      {view === "register" ? (
        <EmployeeRegisterForm key={date + (type ?? "")} data={await getEmployeeRegister(context, date, type)} canManage={canManage} />
      ) : (
        <EmployeeRecordsTable {...(await listEmployeeRecords(context, filters))} filters={filters} />
      )}
    </div>
  )
}
