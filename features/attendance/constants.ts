import { tone } from "@/components/shared/status-pill"
import type {
  AttendanceCorrectionStatus,
  AttendanceSessionStatus,
  AttendanceSessionType,
  AttendanceStatus,
  ExcusedTreatment,
  HolidayAudience,
} from "@/lib/generated/prisma/enums"

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  LATE: "Late",
  HALF_DAY: "Half day",
  ABSENT: "Absent",
  EXCUSED: "Excused",
  ON_LEAVE: "On leave",
}

// One-letter codes for compact registers and keyboard marking.
export const ATTENDANCE_STATUS_SHORT: Record<AttendanceStatus, string> = {
  PRESENT: "P",
  LATE: "L",
  HALF_DAY: "H",
  ABSENT: "A",
  EXCUSED: "E",
  ON_LEAVE: "V",
}

export const ATTENDANCE_STATUS_TONE: Record<AttendanceStatus, string> = {
  PRESENT: tone.green,
  LATE: tone.amber,
  HALF_DAY: tone.blue,
  ABSENT: tone.red,
  EXCUSED: tone.primary,
  ON_LEAVE: tone.muted,
}

export const SESSION_TYPE_LABELS: Record<AttendanceSessionType, string> = {
  DAILY: "Daily",
  PERIOD: "Period / subject",
}

export const SESSION_STATUS_LABELS: Record<AttendanceSessionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  LOCKED: "Locked",
}

export const SESSION_STATUS_TONE: Record<AttendanceSessionStatus, string> = {
  DRAFT: tone.amber,
  SUBMITTED: tone.green,
  LOCKED: tone.muted,
}

export const CORRECTION_STATUS_LABELS: Record<AttendanceCorrectionStatus, string> = {
  PENDING: "Pending review",
  APPROVED: "Applied",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
}

export const CORRECTION_STATUS_TONE: Record<AttendanceCorrectionStatus, string> = {
  PENDING: tone.amber,
  APPROVED: tone.green,
  REJECTED: tone.red,
  CANCELLED: tone.muted,
}

export const EXCUSED_TREATMENT_LABELS: Record<ExcusedTreatment, string> = {
  EXCLUDE: "Leave out of the calculation",
  COUNT_AS_ABSENT: "Count as absent",
  COUNT_AS_PRESENT: "Count as attended",
}

export const HOLIDAY_AUDIENCE_LABELS: Record<HolidayAudience, string> = {
  ALL: "Everyone",
  STUDENTS: "Students only",
  EMPLOYEES: "Teachers and staff only",
}

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

// Statuses a student register offers. Leave is for employees; a student's
// approved absence is "Excused".
export function studentStatuses(policy: { halfDayEnabled: boolean }): AttendanceStatus[] {
  return ["PRESENT", "LATE", ...(policy.halfDayEnabled ? (["HALF_DAY"] as const) : []), "ABSENT", "EXCUSED"]
}

export function employeeStatuses(policy: { halfDayEnabled: boolean }): AttendanceStatus[] {
  return ["PRESENT", "LATE", ...(policy.halfDayEnabled ? (["HALF_DAY"] as const) : []), "ABSENT", "ON_LEAVE"]
}

export function slotLabel(type: AttendanceSessionType, slot: number, dailySlots = 1) {
  if (type === "PERIOD") return `Period ${slot}`
  if (dailySlots < 2) return "Full day"
  return slot === 1 ? "Morning" : "Afternoon"
}

// Identifies what a register covers within a day. Copied onto every record so
// the database refuses a second mark for the same student, day and scope.
export function scopeKey(type: AttendanceSessionType, slot: number, subjectOfferingId: string | null) {
  return type === "DAILY" ? `DAILY:${slot}` : `PERIOD:${subjectOfferingId}:${slot}`
}

// ------------------------------------------------------------------ time

// Registers are kept in the institution's local time. Nepal has one time
// zone without daylight saving; an organisation-level setting can replace
// this constant if institutions elsewhere use the system.
export const ATTENDANCE_TIME_ZONE = "Asia/Kathmandu"

// "YYYY-MM-DD" of an instant in the local time zone.
export function localDate(at: Date = new Date(), timeZone = ATTENDANCE_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
}

// "HH:MM" (24 h) of an instant in the local time zone.
export function localTime(at: Date, timeZone = ATTENDANCE_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at)
}

function offsetMinutes(at: Date, timeZone: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value
  const match = name?.match(/GMT([+-])(\d{2}):?(\d{2})?/)
  if (!match) return 0
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0))
}

// The instant of a local wall-clock time on a calendar date.
export function atLocalTime(date: string, time: string, timeZone = ATTENDANCE_TIME_ZONE) {
  const naive = new Date(`${date}T${time}:00.000Z`)
  return new Date(naive.getTime() - offsetMinutes(naive, timeZone) * 60_000)
}

export function minutesOf(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

// 0 = Sunday … 6 = Saturday, for a "YYYY-MM-DD" calendar date.
export function weekday(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay()
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Every calendar date from `from` to `to`, inclusive (capped at a year).
export function datesBetween(from: string, to: string) {
  const out: string[] = []
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

export const formatDay = (date: Date | string) =>
  new Date(typeof date === "string" ? `${date}T00:00:00.000Z` : date).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })

export const formatPercent = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)}%`)
