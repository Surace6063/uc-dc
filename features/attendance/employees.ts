import { minutesOf } from "@/features/attendance/constants"
import type { AttendanceStatus } from "@/lib/generated/prisma/enums"

// Pure rules for teacher and staff attendance (unit-tested).

export type EmploymentPeriod = {
  dateOfJoining: string
  employmentStatus: string
  // Staff record when they left; teachers only have a contract end date.
  lastWorkingDate?: string | null
  terminationDate?: string | null
  contractEndDate?: string | null
}

const CURRENT = new Set(["ACTIVE", "ON_LEAVE", "SUSPENDED"])

// Was the person employed on this date? Attendance before joining or after
// leaving is refused. Someone who has left without a recorded last day is
// treated as no longer employed.
export function employedOn(person: EmploymentPeriod, date: string) {
  if (date < person.dateOfJoining) return false
  const leftOn = person.lastWorkingDate ?? person.terminationDate ?? (person.employmentStatus === "CONTRACT_EXPIRED" ? person.contractEndDate : null)
  if (leftOn && date > leftOn) return false
  return CURRENT.has(person.employmentStatus) || Boolean(leftOn)
}

// Minutes after the start of the working day (0 when on time).
export function lateMinutesFor(checkInTime: string, workdayStartTime: string) {
  return Math.max(0, minutesOf(checkInTime) - minutesOf(workdayStartTime))
}

// The status a check-in implies under the policy: late only beyond the grace
// period. Statuses other than present/late are left alone.
export function statusForCheckIn(
  status: AttendanceStatus,
  checkInTime: string | null,
  policy: { workdayStartTime: string; lateGraceMinutes: number }
): { status: AttendanceStatus; lateMinutes: number | null } {
  if (!checkInTime || (status !== "PRESENT" && status !== "LATE")) {
    return { status, lateMinutes: null }
  }
  const late = lateMinutesFor(checkInTime, policy.workdayStartTime)
  return late > policy.lateGraceMinutes ? { status: "LATE", lateMinutes: late } : { status: "PRESENT", lateMinutes: null }
}
