import { ATTENDANCE_TIME_ZONE } from "@/features/attendance/constants"

// Display formats for the teaching workspace. Calendar dates (lesson dates,
// exam dates) are stored at UTC midnight; instants (due times, notices) are
// shown in the institution's time zone.

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

export function formatWeekdayDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ATTENDANCE_TIME_ZONE })
}

// "in 3 days", "2 hours ago": for due dates and notices.
export function relativeTime(value: Date | string, now = new Date()) {
  const diff = new Date(value).getTime() - now.getTime()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), "minute")
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3600_000), "hour")
  return rtf.format(Math.round(diff / 86_400_000), "day")
}

export const teacherName = (t: { firstName: string; lastName: string } | null | undefined) => (t ? `${t.firstName} ${t.lastName}` : "—")
