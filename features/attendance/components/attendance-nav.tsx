"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { useSession } from "@/components/shared/session-provider"
import { Pill } from "@/components/shared/status-pill"
import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_TONE,
  SESSION_STATUS_LABELS,
  SESSION_STATUS_TONE,
} from "@/features/attendance/constants"
import type { AttendanceSessionStatus, AttendanceStatus } from "@/lib/generated/prisma/enums"
import type { PermissionKey } from "@/lib/authorization/permissions"
import { cn } from "@/lib/utils"

type Item = { href: string; label: string; any: PermissionKey[]; exact?: boolean }

// Section links within Attendance. Visibility is a convenience; every page
// checks its own permission (and record scope) on the server.
const ITEMS: Item[] = [
  { href: "/dashboard/attendance", label: "Overview", any: ["attendance.view"], exact: true },
  { href: "/dashboard/attendance/take", label: "Take attendance", any: ["attendance.create", "attendance.manage"] },
  { href: "/dashboard/attendance/records", label: "Records", any: ["attendance.view_all", "attendance.create"] },
  { href: "/dashboard/attendance/sessions", label: "Registers", any: ["attendance.view_all", "attendance.create"] },
  { href: "/dashboard/attendance/corrections", label: "Corrections", any: ["attendance.update", "attendance.approve"] },
  { href: "/dashboard/attendance/staff", label: "Teachers & staff", any: ["attendance.staff.view", "attendance.staff.manage"] },
  { href: "/dashboard/attendance/reports", label: "Reports", any: ["attendance.view_all", "attendance.create", "attendance.staff.view"] },
  { href: "/dashboard/attendance/settings", label: "Settings", any: ["attendance.configure"] },
]

export function AttendanceNav() {
  const pathname = usePathname()
  const { permissions } = useSession()
  const items = ITEMS.filter((item) => item.any.some((p) => permissions.includes(p)))
  if (items.length <= 1) return null
  return (
    <nav aria-label="Attendance sections" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-px">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              active ? "border-primary font-medium text-foreground" : "border-transparent"
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  return <Pill className={ATTENDANCE_STATUS_TONE[status]}>{ATTENDANCE_STATUS_LABELS[status]}</Pill>
}

export function SessionStatusBadge({ status, locked }: { status: AttendanceSessionStatus; locked?: boolean }) {
  const shown = locked && status === "SUBMITTED" ? "LOCKED" : status
  return <Pill className={SESSION_STATUS_TONE[shown]}>{SESSION_STATUS_LABELS[shown]}</Pill>
}

export function PercentBadge({ value, standing }: { value: number | null; standing: "below" | "approaching" | "ok" | "none" }) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        standing === "below" && "text-destructive",
        standing === "approaching" && "text-amber-700 dark:text-amber-400",
        standing === "none" && "text-muted-foreground"
      )}
    >
      {value === null ? "—" : `${value.toFixed(1)}%`}
    </span>
  )
}
