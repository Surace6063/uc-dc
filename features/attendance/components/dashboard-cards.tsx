"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { BellRingIcon, ClipboardCheckIcon, ClockIcon, FilePenLineIcon, TriangleAlertIcon, UserCheckIcon, UserXIcon } from "lucide-react"

import { useCan } from "@/components/shared/session-provider"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { raiseShortageAlertsAction } from "@/features/attendance/actions"
import type { DashboardStats } from "@/services/attendance/report-service"

// Summary cards; each opens the records behind it.
export function DashboardCards({ stats }: { stats: DashboardStats }) {
  const router = useRouter()
  const today = stats.today
  const t = stats.todaySummary
  const records = (q: Record<string, string>) => router.push(`/dashboard/attendance/records?${new URLSearchParams({ from: today, to: today, ...q })}`)
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="Marked today"
        value={t.marked}
        hint={stats.completion === null ? "No students enrolled" : `${stats.completion}% of ${stats.enrolled.toLocaleString()} enrolled`}
        icon={ClipboardCheckIcon}
        onClick={() => router.push(`/dashboard/attendance/sessions?from=${today}&to=${today}`)}
      />
      <StatCard label="Present" value={t.present} hint={t.percentage === null ? "Of students marked" : `${t.percentage}% attendance today`} icon={UserCheckIcon} onClick={() => records({ status: "PRESENT" })} />
      <StatCard label="Absent" value={t.absent} hint={`${stats.unmarked.toLocaleString()} not marked yet (not absent)`} icon={UserXIcon} onClick={() => records({ status: "ABSENT" })} />
      <StatCard label="Late" value={t.late} hint="Arrived late today" icon={ClockIcon} onClick={() => records({ status: "LATE" })} />
      <StatCard label="Drafts to submit" value={stats.drafts} hint={stats.pendingCorrections ? `${stats.pendingCorrections} correction(s) to review` : "Registers not yet submitted"} icon={FilePenLineIcon} onClick={() => router.push("/dashboard/attendance/sessions?status=DRAFT")} />
      <StatCard
        label={`Below ${stats.minimumPercentage}%`}
        value={stats.below}
        hint={`${stats.approaching} approaching · ${stats.yearName ?? "this year"}`}
        icon={TriangleAlertIcon}
        onClick={() => router.push("/dashboard/attendance/reports?kind=shortage")}
      />
    </div>
  )
}

export function RaiseAlertsButton() {
  const canApprove = useCan("attendance.approve")
  const [pending, setPending] = React.useState(false)
  if (!canApprove) return null
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        const result = await raiseShortageAlertsAction()
        setPending(false)
        if (!result.ok) {
          toast.add({ title: "Couldn't raise alerts", description: result.error, type: "error" })
          return
        }
        const r = result.data
        toast.add({
          title: r.year ? `${r.raised} new shortage alert${r.raised === 1 ? "" : "s"}` : "No current academic year",
          description: r.year
            ? `${r.alreadyRaised} already raised this month. ${r.recipients} guardian${r.recipients === 1 ? "" : "s"} to inform: ${r.sent} sent${r.unreached ? `, ${r.unreached} not reached (no delivery channel is set up)` : ""}.`
            : undefined,
          type: "success",
        })
      }}
    >
      {pending ? <Spinner /> : <BellRingIcon data-icon="inline-start" />}
      Raise shortage alerts
    </Button>
  )
}
