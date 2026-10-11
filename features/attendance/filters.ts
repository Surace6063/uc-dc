import { z } from "zod"

import {
  AttendanceSessionStatus,
  AttendanceSessionType,
  AttendanceStatus,
  EmployeeType,
} from "@/lib/generated/prisma/enums"

// Attendance lists and reports are driven by URL search params and filtered,
// sorted and paginated on the server; export routes use the same parsers.

export const PAGE_SIZES = [10, 25, 50, 100] as const

const uuid = z.uuid().optional().catch(undefined)
const day = z.iso.date().optional().catch(undefined)
const page = z.coerce.number().int().min(1).max(10_000).catch(1).default(1)
const pageSize = z.coerce
  .number()
  .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
  .catch(25)
  .default(25)
const dir = z.enum(["asc", "desc"]).catch("desc").default("desc")

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

function entries(source: ParamSource) {
  const out: Record<string, string> = {}
  if (source instanceof URLSearchParams) {
    source.forEach((value, key) => (out[key] = value))
  } else {
    for (const [key, value] of Object.entries(source)) {
      const v = Array.isArray(value) ? value[0] : value
      if (v !== undefined && v !== "") out[key] = v
    }
  }
  return out
}

// ----------------------------------------------------------- student records

export const RECORD_SORT_FIELDS = ["date", "student", "status"] as const

export const recordFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page,
  pageSize,
  sort: z.enum(RECORD_SORT_FIELDS).catch("date").default("date"),
  dir,
  from: day,
  to: day,
  year: uuid,
  class: uuid,
  section: uuid,
  offering: uuid,
  student: uuid,
  type: z.enum(AttendanceSessionType).optional().catch(undefined),
  status: z.enum(AttendanceStatus).optional().catch(undefined),
  // Records changed after submission, or with a correction awaiting review.
  correction: z.enum(["corrected", "pending"]).optional().catch(undefined),
})

export type RecordFilters = z.output<typeof recordFiltersSchema>

export const parseRecordFilters = (source: ParamSource): RecordFilters => recordFiltersSchema.parse(entries(source))

// ------------------------------------------------------------------ sessions

export const sessionFiltersSchema = z.object({
  page,
  pageSize,
  from: day,
  to: day,
  year: uuid,
  class: uuid,
  section: uuid,
  type: z.enum(AttendanceSessionType).optional().catch(undefined),
  status: z.enum(AttendanceSessionStatus).optional().catch(undefined),
})

export type SessionFilters = z.output<typeof sessionFiltersSchema>

export const parseSessionFilters = (source: ParamSource): SessionFilters => sessionFiltersSchema.parse(entries(source))

// ------------------------------------------------------------ employees

export const EMPLOYEE_SORT_FIELDS = ["date", "name", "status"] as const

export const employeeFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page,
  pageSize,
  sort: z.enum(EMPLOYEE_SORT_FIELDS).catch("date").default("date"),
  dir,
  from: day,
  to: day,
  type: z.enum(EmployeeType).optional().catch(undefined),
  status: z.enum(AttendanceStatus).optional().catch(undefined),
})

export type EmployeeFilters = z.output<typeof employeeFiltersSchema>

export const parseEmployeeFilters = (source: ParamSource): EmployeeFilters => employeeFiltersSchema.parse(entries(source))

// ------------------------------------------------------------------ reports

export const REPORT_KINDS = {
  students: "Student summary",
  classes: "Class & section summary",
  subjects: "Subject-wise",
  monthly: "Monthly",
  shortage: "Attendance shortage",
  employees: "Teachers & staff",
} as const

export type ReportKind = keyof typeof REPORT_KINDS

export const reportParamsSchema = z.object({
  kind: z.enum(Object.keys(REPORT_KINDS) as [ReportKind, ...ReportKind[]]).catch("students").default("students"),
  year: uuid,
  from: day,
  to: day,
  level: uuid,
  program: uuid,
  class: uuid,
  section: uuid,
  offering: uuid,
  type: z.enum(AttendanceSessionType).optional().catch(undefined),
  employeeType: z.enum(EmployeeType).optional().catch(undefined),
})

export type ReportParams = z.output<typeof reportParamsSchema>

export const parseReportParams = (source: ParamSource): ReportParams => reportParamsSchema.parse(entries(source))

// ---------------------------------------------------------------- register

// The take-attendance page's selection, from the URL. Checked again on the
// server against the organisation when the register is loaded or saved.
export const registerParamsSchema = z.object({
  year: uuid,
  date: day,
  level: uuid,
  program: uuid,
  class: uuid,
  section: z.union([z.uuid(), z.literal("all")]).optional().catch(undefined),
  type: z.enum(AttendanceSessionType).optional().catch(undefined),
  offering: uuid,
  slot: z.coerce.number().int().min(1).max(20).optional().catch(undefined),
})

export type RegisterParams = z.output<typeof registerParamsSchema>

export const parseRegisterParams = (source: ParamSource): RegisterParams => registerParamsSchema.parse(entries(source))

export const REGISTER_DEPENDENTS: Record<string, readonly string[]> = {
  year: ["offering"],
  level: ["program", "class", "section", "offering"],
  program: ["class", "section", "offering"],
  class: ["section", "offering"],
  type: ["offering", "slot"],
}

export const RECORD_DEPENDENTS: Record<string, readonly string[]> = {
  year: ["class", "section", "offering"],
  class: ["section", "offering"],
}

export const REPORT_DEPENDENTS: Record<string, readonly string[]> = {
  year: ["class", "section", "offering"],
  level: ["program", "class", "section", "offering"],
  program: ["class", "section", "offering"],
  class: ["section", "offering"],
}
