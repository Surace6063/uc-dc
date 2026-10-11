import type { AttendanceStatus, ExcusedTreatment } from "@/lib/generated/prisma/enums"

// The one attendance calculation. Dashboards, reports, profiles, portals and
// shortage alerts all count records by status in the database and pass the
// counts here, so every screen applies the same rules:
//
//   percentage = attended / conducted × 100
//
// Only marked records of submitted (or locked) registers are counted. A
// student with no record for a register was not marked: they add nothing to
// either side, and are reported separately as "unmarked" where it matters.
// Registers can't be created for future dates, so future sessions are never
// counted; non-working days have no registers unless the policy allows them.

export type StatusCounts = Partial<Record<AttendanceStatus, number>>

export type CalculationPolicy = {
  lateCountsAsPresent: boolean
  excusedTreatment: ExcusedTreatment
  minimumPercentage: number
  warningMarginPercentage: number
}

export type AttendanceSummary = {
  present: number
  late: number
  halfDay: number
  absent: number
  excused: number
  onLeave: number
  // Records counted (every marked record, whatever its status).
  marked: number
  // Denominator and numerator after the policy's rules.
  conducted: number
  attended: number
  percentage: number | null
}

// How much one record of each status adds to attended and conducted.
export function statusWeight(status: AttendanceStatus, policy: Pick<CalculationPolicy, "lateCountsAsPresent" | "excusedTreatment">) {
  switch (status) {
    case "PRESENT":
      return { attended: 1, conducted: 1 }
    case "LATE":
      return { attended: policy.lateCountsAsPresent ? 1 : 0, conducted: 1 }
    case "HALF_DAY":
      return { attended: 0.5, conducted: 1 }
    case "ABSENT":
      return { attended: 0, conducted: 1 }
    case "EXCUSED":
    case "ON_LEAVE":
      if (policy.excusedTreatment === "EXCLUDE") return { attended: 0, conducted: 0 }
      return { attended: policy.excusedTreatment === "COUNT_AS_PRESENT" ? 1 : 0, conducted: 1 }
  }
}

export function summarize(
  counts: StatusCounts,
  policy: Pick<CalculationPolicy, "lateCountsAsPresent" | "excusedTreatment">
): AttendanceSummary {
  let attended = 0
  let conducted = 0
  let marked = 0
  for (const [status, count] of Object.entries(counts) as [AttendanceStatus, number | undefined][]) {
    if (!count) continue
    const weight = statusWeight(status, policy)
    attended += weight.attended * count
    conducted += weight.conducted * count
    marked += count
  }
  return {
    present: counts.PRESENT ?? 0,
    late: counts.LATE ?? 0,
    halfDay: counts.HALF_DAY ?? 0,
    absent: counts.ABSENT ?? 0,
    excused: counts.EXCUSED ?? 0,
    onLeave: counts.ON_LEAVE ?? 0,
    marked,
    conducted,
    attended,
    percentage: conducted > 0 ? Math.round((attended / conducted) * 1000) / 10 : null,
  }
}

export type Standing = "below" | "approaching" | "ok" | "none"

// Where a percentage stands against the policy's minimum. "none" when nothing
// has been conducted yet: no data is not a shortage.
export function standing(percentage: number | null, policy: Pick<CalculationPolicy, "minimumPercentage" | "warningMarginPercentage">): Standing {
  if (percentage === null) return "none"
  if (percentage < policy.minimumPercentage) return "below"
  if (percentage < policy.minimumPercentage + policy.warningMarginPercentage) return "approaching"
  return "ok"
}

// Adds up per-status counts, e.g. from a groupBy over several keys.
export function addCounts(target: StatusCounts, status: AttendanceStatus, count: number) {
  target[status] = (target[status] ?? 0) + count
  return target
}
