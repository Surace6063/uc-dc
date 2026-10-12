import { tone } from "@/components/shared/status-pill"

export { localDate } from "@/features/attendance/constants"
import type {
  AbsentTreatment,
  AssessmentCategory,
  ComponentType,
  ExaminationStatus,
  GpaMethod,
  GradingScaleStatus,
  GradingType,
  MarkStatus,
  MarksSheetStatus,
  RankBasis,
  RankScope,
  RankTieMode,
  ResultStatus,
  SubjectPassRule,
} from "@/lib/generated/prisma/enums"

// Labels and small helpers shared by examination pages, the server and CSV
// files. Nothing here encodes an institution's grading policy.

export const ASSESSMENT_CATEGORY_LABELS: Record<AssessmentCategory, string> = {
  CLASS_TEST: "Class test",
  UNIT_TEST: "Unit test",
  TERMINAL: "Terminal examination",
  MIDTERM: "Midterm",
  FINAL: "Final examination",
  PRACTICAL: "Practical examination",
  INTERNAL: "Internal assessment",
  PROJECT: "Project assessment",
  SEMESTER: "Semester examination",
  MOCK: "Mock / pre-board",
  OTHER: "Other",
}

export const EXAM_STATUS_LABELS: Record<ExaminationStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  APPROVED: "Results approved",
  PUBLISHED: "Published",
  REVISION: "Under revision",
  ARCHIVED: "Archived",
}

export const EXAM_STATUS_TONE: Record<ExaminationStatus, string> = {
  DRAFT: tone.muted,
  SCHEDULED: tone.blue,
  APPROVED: tone.primary,
  PUBLISHED: tone.green,
  REVISION: tone.amber,
  ARCHIVED: tone.muted,
}

// Where a scheduled examination is in time (shown, never stored).
export function examPhase(exam: { status: ExaminationStatus; startDate: string; endDate: string }, today: string) {
  if (exam.status !== "SCHEDULED") return null
  if (today < exam.startDate) return "Upcoming"
  if (today <= exam.endDate) return "Ongoing"
  return "Completed"
}

export const COMPONENT_TYPE_LABELS: Record<ComponentType, string> = {
  THEORY: "Theory",
  PRACTICAL: "Practical",
  INTERNAL: "Internal assessment",
  PROJECT: "Project",
  PRESENTATION: "Presentation",
  VIVA: "Viva",
  LAB: "Laboratory work",
  ASSIGNMENT: "Assignment",
  OTHER: "Other",
}

export const GRADING_TYPE_LABELS: Record<GradingType, string> = {
  LETTER: "Letter grades",
  GRADE_POINT: "Grades with grade points",
  PERCENTAGE_BAND: "Percentage bands",
}

export const SCALE_STATUS_LABELS: Record<GradingScaleStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  RETIRED: "Retired",
}

export const SCALE_STATUS_TONE: Record<GradingScaleStatus, string> = {
  DRAFT: tone.amber,
  ACTIVE: tone.green,
  RETIRED: tone.muted,
}

export const SHEET_STATUS_LABELS: Record<MarksSheetStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  VERIFIED: "Verified",
  APPROVED: "Approved",
  RETURNED: "Returned",
}

export const SHEET_STATUS_TONE: Record<MarksSheetStatus | "NOT_STARTED", string> = {
  NOT_STARTED: tone.muted,
  DRAFT: tone.muted,
  SUBMITTED: tone.blue,
  VERIFIED: tone.primary,
  APPROVED: tone.green,
  RETURNED: tone.amber,
}

export const EDITABLE_SHEET_STATUSES: readonly MarksSheetStatus[] = ["DRAFT", "RETURNED"]

export const MARK_STATUS_LABELS: Record<MarkStatus, string> = {
  SCORED: "Scored",
  ABSENT: "Absent",
  EXEMPT: "Exempt",
  INCOMPLETE: "Incomplete",
  WITHHELD: "Withheld",
}

// Short codes typed into the marks grid and CSV files instead of a number.
export const MARK_STATUS_CODES: Record<Exclude<MarkStatus, "SCORED">, string> = {
  ABSENT: "AB",
  EXEMPT: "EX",
  INCOMPLETE: "INC",
  WITHHELD: "WH",
}

const CODE_WORDS: Record<string, Exclude<MarkStatus, "SCORED">> = {
  ab: "ABSENT", a: "ABSENT", absent: "ABSENT",
  ex: "EXEMPT", e: "EXEMPT", exempt: "EXEMPT",
  inc: "INCOMPLETE", i: "INCOMPLETE", incomplete: "INCOMPLETE",
  wh: "WITHHELD", w: "WITHHELD", withheld: "WITHHELD",
}

export type ParsedCell =
  | { kind: "empty" }
  | { kind: "mark"; status: MarkStatus; marks: number | null }
  | { kind: "error"; message: string }

// One grid or CSV cell: a number with at most two decimals, a status code
// (AB, EX, INC, WH) or nothing. Range checks against the component's full
// marks happen here for quick feedback and again on the server.
export function parseMarkCell(raw: string, maxHundredths?: number): ParsedCell {
  const text = raw.trim()
  if (text === "") return { kind: "empty" }
  const word = CODE_WORDS[text.toLowerCase()]
  if (word) return { kind: "mark", status: word, marks: null }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return /^-/.test(text) ? { kind: "error", message: "Marks can't be negative." } : { kind: "error", message: "Enter marks (up to 2 decimals) or AB, EX, INC, WH." }
  }
  const hundredths = Math.round(Number(text) * 100)
  if (maxHundredths !== undefined && hundredths > maxHundredths) {
    return { kind: "error", message: `Above the full marks (${maxHundredths / 100}).` }
  }
  return { kind: "mark", status: "SCORED", marks: hundredths }
}

export function markCellText(mark: { status: MarkStatus; marks: number | null } | null | undefined) {
  if (!mark) return ""
  if (mark.status === "SCORED") return mark.marks === null ? "" : String(mark.marks / 100)
  return MARK_STATUS_CODES[mark.status]
}

export const RESULT_STATUS_LABELS: Record<ResultStatus | "NOT_TAKEN", string> = {
  PASS: "Pass",
  FAIL: "Fail",
  ABSENT: "Absent",
  INCOMPLETE: "Incomplete",
  WITHHELD: "Withheld",
  EXEMPT: "Exempt",
  PENDING: "Marks pending",
  NOT_TAKEN: "Not taken",
}

export const RESULT_STATUS_TONE: Record<ResultStatus | "NOT_TAKEN", string> = {
  PASS: tone.green,
  FAIL: tone.red,
  ABSENT: tone.red,
  INCOMPLETE: tone.amber,
  WITHHELD: tone.amber,
  EXEMPT: tone.muted,
  PENDING: tone.muted,
  NOT_TAKEN: tone.muted,
}

export const PASS_RULE_LABELS: Record<SubjectPassRule, string> = {
  MARKS: "Pass marks",
  GRADE: "A non-failing grade",
  MARKS_AND_GRADE: "Pass marks and a non-failing grade",
}

export const ABSENT_TREATMENT_LABELS: Record<AbsentTreatment, string> = {
  RESULT_ABSENT: "The subject result is “absent” (not passed)",
  COUNT_AS_ZERO: "Count as zero marks",
}

export const GPA_METHOD_LABELS: Record<GpaMethod, string> = {
  NONE: "No GPA",
  CREDIT_WEIGHTED: "Credit-weighted: Σ(grade point × credit) ÷ Σ credit",
  SIMPLE_AVERAGE: "Simple average of grade points",
}

export const RANK_BASIS_LABELS: Record<RankBasis, string> = {
  TOTAL: "Total marks",
  PERCENTAGE: "Aggregate percentage",
  GPA: "GPA",
}

export const RANK_SCOPE_LABELS: Record<RankScope, string> = {
  CLASS: "Within the class",
  SECTION: "Within the section",
}

export const RANK_TIE_LABELS: Record<RankTieMode, string> = {
  SHARED: "Shared, skipping the next (1, 1, 3)",
  DENSE: "Shared, without gaps (1, 1, 2)",
}

export const formatDay = (value: string | Date | null | undefined) => {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

export const formatDateTime = (value: string | Date | null | undefined) => {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu" })
}

export const sheetLabel = (s: { subjectName: string; className: string; sectionName: string | null }) =>
  [s.className, s.sectionName ? `Section ${s.sectionName}` : null, s.subjectName].filter(Boolean).join(" · ")
