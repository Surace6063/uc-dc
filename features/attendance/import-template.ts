import type { ImportColumn } from "@/components/shared/import-wizard"

// Student attendance import, e.g. from a paper register or another system.
// Students are matched only by exact admission number, and their class and
// section on that date come from their enrollment, never from names. Rows add
// marks; they never change an existing mark (that needs a correction).
export const ATTENDANCE_IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: "date", required: true, description: "Date of attendance (AD), YYYY-MM-DD.", example: "2026-05-04" },
  { key: "admission_number", required: true, description: "The student's exact admission number.", example: "ADM-00012" },
  { key: "status", required: true, description: "present, absent, late, excused or half_day (or P, A, L, E, H).", example: "present" },
  { key: "subject_code", description: "For period attendance: the subject's code. Blank = daily attendance.", example: "" },
  { key: "period", description: "Period number (with a subject), or 2 for an afternoon register. Default 1.", example: "1" },
  { key: "check_in", description: "Optional arrival time, HH:MM (24-hour).", example: "" },
  { key: "late_minutes", description: "Optional, for late arrivals.", example: "" },
  { key: "reason", description: "Optional reason shared with the family.", example: "" },
]

export const ATTENDANCE_IMPORT_MAX_ROWS = 5000
export const ATTENDANCE_IMPORT_BATCH_SIZE = 200
export const ATTENDANCE_IMPORT_TEMPLATE_URL = "/api/attendance/import-template"

const STATUS_WORDS: Record<string, string> = {
  P: "PRESENT", PRESENT: "PRESENT",
  A: "ABSENT", ABSENT: "ABSENT",
  L: "LATE", LATE: "LATE",
  E: "EXCUSED", EXCUSED: "EXCUSED",
  H: "HALF_DAY", HALF_DAY: "HALF_DAY", HALF: "HALF_DAY",
}

export function parseStatusWord(raw: string) {
  return STATUS_WORDS[raw.trim().toUpperCase().replace(/[\s-]+/g, "_")] ?? null
}
