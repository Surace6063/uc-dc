import type { Metadata } from "next"
import { CalendarClockIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { localDate, weekday } from "@/features/attendance/constants"
import { NoStudentProfile, NotEnrolled } from "@/features/student-portal/components/no-student"
import { SCHOOL_WEEK, WEEKDAYS } from "@/features/teaching/constants"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { cn } from "@/lib/utils"
import { myTimetable } from "@/services/student-portal/learning-service"
import { myEnrollment, myStudent } from "@/services/student-portal/me-service"

export const metadata: Metadata = { title: "Class timetable" }

export default async function StudentTimetablePage() {
  const context = await getPageContext()
  if (!hasPermission(context, "academics.view")) return <AccessDenied />
  const [student, enrollment, slots] = await Promise.all([myStudent(context), myEnrollment(context), myTimetable(context)])
  const days = slots.some((s) => s.dayOfWeek === 6) ? [...SCHOOL_WEEK, 6] : [...SCHOOL_WEEK]
  const today = weekday(localDate())

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Class timetable" description={enrollment ? `${enrollment.class.name}${enrollment.section ? ` · Section ${enrollment.section.name}` : ""} · times are Nepal time` : undefined} breadcrumbs={[{ label: "Class timetable" }]} />
      {!student ? (
        <NoStudentProfile />
      ) : !enrollment ? (
        <NotEnrolled />
      ) : slots.length === 0 ? (
        <EmptyState icon={CalendarClockIcon} title="No timetable yet" description="Your class's weekly timetable hasn't been set up yet." />
      ) : (
        <div className={cn("grid gap-3 md:grid-cols-3", days.length === 7 ? "xl:grid-cols-7" : "xl:grid-cols-6")}>
          {days.map((d) => {
            const daySlots = slots.filter((s) => s.dayOfWeek === d)
            return (
              <Card key={d} className={cn("gap-2 p-3", d === today && "border-primary/40")}>
                <h2 className="flex items-center justify-between text-sm font-semibold">
                  {WEEKDAYS[d].label}
                  {d === today && <Badge>Today</Badge>}
                </h2>
                {daySlots.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">No periods</p>
                ) : (
                  <ul className="grid gap-2">
                    {daySlots.map((s) => (
                      <li key={s.id} className="rounded-lg border bg-muted/20 p-2.5">
                        <p className="text-xs font-semibold tabular-nums">{s.startTime}–{s.endTime}</p>
                        <p className="truncate text-sm font-medium">{s.subject?.name ?? "Class period"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[s.teacher && `${s.teacher.firstName} ${s.teacher.lastName}`, s.room].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
