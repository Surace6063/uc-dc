import { z } from "zod"

import { AssessmentCategory, ExaminationStatus, MarksSheetStatus, ResultStatus } from "@/lib/generated/prisma/enums"

// Examination lists, results and reports are driven by URL search params
// and filtered, sorted and paginated on the server; exports use the same
// parsers.

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

export function entries(source: ParamSource) {
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

// ------------------------------------------------------------ examinations

export const EXAM_SORT_FIELDS = ["startDate", "name", "status"] as const

export const examFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page,
  pageSize,
  sort: z.enum(EXAM_SORT_FIELDS).catch("startDate").default("startDate"),
  dir,
  year: uuid,
  type: uuid,
  category: z.enum(AssessmentCategory).optional().catch(undefined),
  level: uuid,
  program: uuid,
  class: uuid,
  status: z.enum(ExaminationStatus).optional().catch(undefined),
  from: day,
  to: day,
  // Archived examinations are hidden unless asked for.
  archived: z.enum(["include", "only"]).optional().catch(undefined),
})

export type ExamFilters = z.output<typeof examFiltersSchema>

export const parseExamFilters = (source: ParamSource): ExamFilters => examFiltersSchema.parse(entries(source))

export const EXAM_DEPENDENTS = { year: ["class"], level: ["program", "class"], program: ["class"] } as const

// ------------------------------------------------------------- review queue

export const sheetFiltersSchema = z.object({
  page,
  pageSize,
  exam: uuid,
  class: uuid,
  // "ACTION": waiting for a reviewer (submitted or verified).
  status: z.enum(["ACTION", ...Object.values(MarksSheetStatus)]).catch("ACTION").default("ACTION"),
})

export type SheetFilters = z.output<typeof sheetFiltersSchema>

export const parseSheetFilters = (source: ParamSource): SheetFilters => sheetFiltersSchema.parse(entries(source))

// ----------------------------------------------------------------- results

export const resultFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page,
  pageSize,
  class: uuid,
  section: uuid,
  status: z.enum(ResultStatus).optional().catch(undefined),
  // Published results (default when any exist) or a provisional preview
  // calculated from approved marks sheets.
  view: z.enum(["published", "provisional"]).optional().catch(undefined),
  sort: z.enum(["roll", "name", "percentage", "rank"]).catch("roll").default("roll"),
})

export type ResultFilters = z.output<typeof resultFiltersSchema>

export const parseResultFilters = (source: ParamSource): ResultFilters => resultFiltersSchema.parse(entries(source))

// ----------------------------------------------------------------- reports

export const reportFiltersSchema = z.object({
  year: uuid,
  exam: uuid,
  level: uuid,
  program: uuid,
  class: uuid,
  section: uuid,
  subject: uuid,
  status: z.enum(ResultStatus).optional().catch(undefined),
  // Below this aggregate percentage a student is listed as needing support.
  support: z.coerce.number().min(0).max(100).catch(40).default(40),
})

export type ReportFilters = z.output<typeof reportFiltersSchema>

export const parseReportFilters = (source: ParamSource): ReportFilters => reportFiltersSchema.parse(entries(source))

export const REPORT_DEPENDENTS = { year: ["exam", "class", "section"], exam: ["class", "section", "subject"], level: ["program", "class", "section"], program: ["class", "section"], class: ["section"] } as const
