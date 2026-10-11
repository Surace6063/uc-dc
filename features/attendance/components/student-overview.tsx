import { TriangleAlertIcon } from "lucide-react"

import { Card } from "@/components/ui/card"
import { AttendanceStatusBadge, PercentBadge } from "@/features/attendance/components/attendance-nav"
import { formatDay } from "@/features/attendance/constants"
import type { StudentAttendanceOverview } from "@/services/attendance/portal-service"

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })

// One student's attendance as the student or a guardian sees it: totals,
// subjects, months and recent marks. No internal notes or who marked what.
export function StudentAttendanceOverviewView({ data, who }: { data: StudentAttendanceOverview; who: string }) {
  if (!data.enrollment || !data.summary) {
    return <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{who} isn&apos;t enrolled in a class right now, so there is no attendance to show.</p>
  }
  const s = data.summary
  return (
    <div className="grid gap-4">
      {(data.standing === "below" || data.standing === "approaching") && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          {data.standing === "below"
            ? `Attendance is ${s.percentage?.toFixed(1)}%, below the required ${data.policy.minimumPercentage}%.`
            : `Attendance is ${s.percentage?.toFixed(1)}%, close to the required minimum of ${data.policy.minimumPercentage}%.`}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card className="gap-1 p-4">
          <p className="text-sm text-muted-foreground">Attendance</p>
          <p className="text-2xl font-semibold"><PercentBadge value={s.percentage} standing={data.standing} /></p>
          <p className="text-xs text-muted-foreground">{data.enrollment.yearName} · {[data.enrollment.className, data.enrollment.sectionName].filter(Boolean).join(" ")}</p>
        </Card>
        {[
          ["Present", s.present],
          ["Late", s.late],
          ["Absent", s.absent],
          ["Excused / leave", s.excused + s.onLeave],
        ].map(([label, value]) => (
          <Card key={label} className="gap-1 p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.bySubject.length > 0 && (
          <Card className="gap-3 p-5">
            <h3 className="font-semibold">By subject</h3>
            <ul className="divide-y text-sm">
              {data.bySubject.map((sub) => (
                <li key={sub.name} className="flex items-center justify-between py-2">
                  <span>{sub.name}</span>
                  <span className="text-muted-foreground">
                    {sub.summary.attended} of {sub.summary.conducted} · <PercentBadge value={sub.summary.percentage} standing={sub.standing} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {data.months.length > 0 && (
          <Card className="gap-3 p-5">
            <h3 className="font-semibold">By month</h3>
            <ul className="divide-y text-sm">
              {data.months.map((m) => (
                <li key={m.month} className="flex items-center justify-between py-2">
                  <span>{monthLabel(m.month)}</span>
                  <span className="text-muted-foreground">
                    {m.summary.absent} absent · {m.summary.late} late · <span className="font-medium text-foreground">{m.summary.percentage === null ? "—" : `${m.summary.percentage.toFixed(1)}%`}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card className="gap-3 p-5 lg:col-span-2">
          <h3 className="font-semibold">Recent attendance</h3>
          {data.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance has been recorded yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {data.recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {formatDay(r.date)} <span className="text-muted-foreground">· {r.label}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {r.reason && <span className="text-xs text-muted-foreground">{r.reason}</span>}
                    {r.lateMinutes ? <span className="text-xs text-muted-foreground">{r.lateMinutes} min late</span> : null}
                    <AttendanceStatusBadge status={r.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
