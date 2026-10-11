import "server-only"

import type { AttendanceSummary, Standing } from "@/features/attendance/calculation"
import { REPORT_KINDS, type ReportKind, type ReportParams } from "@/features/attendance/filters"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ForbiddenError } from "@/lib/authorization/errors"
import { csvLine } from "@/lib/csv"
import { canSeeAll } from "@/services/attendance/access-service"
import { getPolicy } from "@/services/attendance/policy-service"
import {
  classReport,
  employeeReport,
  monthlyReport,
  resolvePeriod,
  shortageReport,
  studentReport,
  subjectReport,
  type ReportPeriod,
} from "@/services/attendance/report-service"

// Reports as one tabular shape, so the page and the CSV export show exactly
// the same rows, totals and reporting period.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

export type Cell = string | number | null
export type ReportRow = { key: string; cells: Cell[]; standing?: Standing; emphasis?: boolean }
export type ReportTable = {
  kind: ReportKind
  title: string
  period: ReportPeriod
  columns: { label: string; numeric?: boolean }[]
  rows: ReportRow[]
  notes: string[]
}

const SUMMARY_COLUMNS = [
  { label: "Present", numeric: true },
  { label: "Late", numeric: true },
  { label: "Half day", numeric: true },
  { label: "Absent", numeric: true },
  { label: "Excused / leave", numeric: true },
  { label: "Attended", numeric: true },
  { label: "Counted", numeric: true },
  { label: "Attendance %", numeric: true },
]

const summaryCells = (s: AttendanceSummary): Cell[] => [
  s.present, s.late, s.halfDay, s.absent, s.excused + s.onLeave,
  Math.round(s.attended * 10) / 10, s.conducted, s.percentage,
]

export function reportKindsFor(ctx: Pick<AuthContext, "permissions">): ReportKind[] {
  const student = canSeeAll(ctx) || hasPermission(ctx, "attendance.create")
  const staff = hasPermission(ctx, "attendance.staff.view") || hasPermission(ctx, "attendance.staff.manage")
  return (Object.keys(REPORT_KINDS) as ReportKind[]).filter((k) => (k === "employees" ? staff : student))
}

export async function buildReport(ctx: Ctx, params: ReportParams): Promise<ReportTable> {
  if (!reportKindsFor(ctx).includes(params.kind)) throw new ForbiddenError("You can't view this report.")
  const [policy, period] = await Promise.all([getPolicy(ctx), resolvePeriod(ctx, params)])
  const notes = [
    `Counts only submitted registers between ${period.from} and ${period.to}. Unmarked students are not counted as absent.`,
    `Late ${policy.lateCountsAsPresent ? "counts" : "does not count"} as attended; half day counts as half; excused absences and leave are ${
      policy.excusedTreatment === "EXCLUDE" ? "left out" : policy.excusedTreatment === "COUNT_AS_ABSENT" ? "counted as absent" : "counted as attended"
    }. Minimum: ${policy.minimumPercentage}%.`,
  ]
  const base = { kind: params.kind, title: REPORT_KINDS[params.kind], period, notes }
  const studentColumns = [{ label: "Student" }, { label: "Admission no." }, { label: "Class" }, { label: "Section" }, { label: "Roll" }]

  switch (params.kind) {
    case "students": {
      const rows = await studentReport(ctx, params, period, policy)
      return {
        ...base,
        columns: [...studentColumns, ...SUMMARY_COLUMNS],
        rows: rows.map((r) => ({ key: r.studentId, standing: r.standing, cells: [r.name, r.admissionNumber, r.className, r.sectionName, r.rollNumber, ...summaryCells(r.summary)] })),
      }
    }
    case "classes": {
      const rows = await classReport(ctx, params, period, policy)
      return {
        ...base,
        columns: [{ label: "Class" }, { label: "Section" }, ...SUMMARY_COLUMNS],
        rows: rows.map((r) => ({ key: r.key, standing: r.standing, emphasis: r.isTotal, cells: [r.className, r.sectionName, ...summaryCells(r.summary)] })),
      }
    }
    case "subjects": {
      const result = await subjectReport(ctx, params, period, policy)
      if (result.perStudent) {
        return {
          ...base,
          notes: [...notes, "Per student and subject (course-wise) for the chosen class."],
          columns: [...studentColumns, { label: "Subject" }, ...SUMMARY_COLUMNS],
          rows: result.rows.map((r) => ({
            key: `${r.studentId}:${r.subjectName}`,
            standing: r.standing,
            cells: [r.name, r.admissionNumber, r.className, r.sectionName, r.rollNumber, r.subjectName, ...summaryCells(r.summary)],
          })),
        }
      }
      return {
        ...base,
        notes: [...notes, "Choose a class to see each student's attendance per subject."],
        columns: [{ label: "Class" }, { label: "Subject" }, ...SUMMARY_COLUMNS],
        rows: result.rows.map((r) => ({ key: r.key, standing: r.standing, cells: [r.className, r.subjectName, ...summaryCells(r.summary)] })),
      }
    }
    case "monthly": {
      const rows = await monthlyReport(ctx, params, period, policy)
      return {
        ...base,
        columns: [{ label: "Month" }, { label: "Days with attendance", numeric: true }, ...SUMMARY_COLUMNS],
        rows: rows.map((r) => ({ key: r.month, standing: r.standing, cells: [r.month, r.daysWithAttendance, ...summaryCells(r.summary)] })),
      }
    }
    case "shortage": {
      const result = await shortageReport(ctx, params, period, policy)
      return {
        ...base,
        notes: [...notes, `“Approaching” means below ${policy.minimumPercentage + policy.warningMarginPercentage}%.`],
        columns: [...studentColumns, { label: "Scope" }, ...SUMMARY_COLUMNS],
        rows: [
          ...result.students.map((r) => ({ key: r.studentId, standing: r.standing, cells: [r.name, r.admissionNumber, r.className, r.sectionName, r.rollNumber, "Overall", ...summaryCells(r.summary)] as Cell[] })),
          ...result.subjects.map((r) => ({ key: `${r.studentId}:${r.subjectName}`, standing: r.standing, cells: [r.name, r.admissionNumber, r.className, r.sectionName, r.rollNumber, r.subjectName, ...summaryCells(r.summary)] as Cell[] })),
        ],
      }
    }
    case "employees": {
      const result = await employeeReport(ctx, params, period, policy)
      return {
        ...base,
        notes: [
          `${result.workingDays} working days between ${period.from} and ${period.to} (weekly holidays and holidays excluded). Days without a record are shown as “Not recorded”, never as absent.`,
          notes[1],
        ],
        columns: [{ label: "Name" }, { label: "Employee ID" }, { label: "Type" }, ...SUMMARY_COLUMNS, { label: "Late minutes", numeric: true }, { label: "Not recorded", numeric: true }],
        rows: result.rows.map((r) => ({
          key: r.id,
          cells: [r.name, r.employeeId, r.type === "TEACHER" ? "Teacher" : "Staff", ...summaryCells(r.summary), r.totalLateMinutes, r.unrecorded],
        })),
      }
    }
  }
}

export function reportCsv(table: ReportTable) {
  return [
    csvLine([table.title]),
    csvLine(["Reporting period", `${table.period.from} to ${table.period.to}`, table.period.yearName ?? ""]),
    ...table.notes.map((n) => csvLine([n])),
    "\r\n",
    csvLine(table.columns.map((c) => c.label)),
    ...table.rows.map((r) => csvLine(r.cells)),
  ].join("")
}
