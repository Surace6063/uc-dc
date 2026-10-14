import { z } from "zod"

import { entries } from "@/features/exams/filters"
import { ClassAssignmentStatus, LessonPlanStatus, MaterialKind, NoticeAudience } from "@/lib/generated/prisma/enums"

// Teaching lists are driven by URL search params and filtered, sorted and
// paginated on the server. Unknown values are dropped, never queried.

export const TEACHING_PAGE_SIZES = [10, 25, 50, 100] as const

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

const uuid = z.uuid().optional().catch(undefined)
const day = z.iso.date().optional().catch(undefined)
const q = z.string().trim().max(100).optional().catch(undefined)
const page = z.coerce.number().int().min(1).max(10_000).catch(1).default(1)
const pageSize = z.coerce
  .number()
  .refine((n) => (TEACHING_PAGE_SIZES as readonly number[]).includes(n))
  .catch(25)
  .default(25)
const dir = z.enum(["asc", "desc"]).catch("desc").default("desc")

// `year` absent → the current academic year; "all" → any year.
const year = z.union([z.literal("all"), z.uuid()]).optional().catch(undefined)

const placeFilters = { year, class: uuid, section: uuid, subject: uuid }

export const TEACHING_DEPENDENTS = { year: ["class", "section"], class: ["section"] } as const

// ------------------------------------------------------------ lesson plans

export const LESSON_PLAN_SORTS = ["plannedDate", "title", "status"] as const

const lessonPlanFiltersSchema = z.object({
  q, page, pageSize, dir,
  sort: z.enum(LESSON_PLAN_SORTS).catch("plannedDate").default("plannedDate"),
  ...placeFilters,
  status: z.enum(LessonPlanStatus).optional().catch(undefined),
  from: day,
  to: day,
})
export type LessonPlanFilters = z.output<typeof lessonPlanFiltersSchema>
export const parseLessonPlanFilters = (source: ParamSource): LessonPlanFilters => lessonPlanFiltersSchema.parse(entries(source))

// ------------------------------------------------------------ materials

export const MATERIAL_SORTS = ["createdAt", "title"] as const

const materialFiltersSchema = z.object({
  q, page, pageSize, dir,
  sort: z.enum(MATERIAL_SORTS).catch("createdAt").default("createdAt"),
  ...placeFilters,
  kind: z.enum(MaterialKind).optional().catch(undefined),
})
export type MaterialFilters = z.output<typeof materialFiltersSchema>
export const parseMaterialFilters = (source: ParamSource): MaterialFilters => materialFiltersSchema.parse(entries(source))

// ------------------------------------------------------------ class assignments

export const ASSIGNMENT_SORTS = ["dueAt", "title", "status", "createdAt"] as const

const classAssignmentFiltersSchema = z.object({
  q, page, pageSize, dir,
  sort: z.enum(ASSIGNMENT_SORTS).catch("dueAt").default("dueAt"),
  ...placeFilters,
  status: z.enum(ClassAssignmentStatus).optional().catch(undefined),
  // Only assignments with submissions awaiting review.
  review: z.literal("pending").optional().catch(undefined),
  from: day,
  to: day,
})
export type ClassAssignmentFilters = z.output<typeof classAssignmentFiltersSchema>
export const parseClassAssignmentFilters = (source: ParamSource): ClassAssignmentFilters => classAssignmentFiltersSchema.parse(entries(source))

// ------------------------------------------------------------ notices

const noticeFiltersSchema = z.object({
  q, page,
  pageSize: z.coerce.number().refine((n) => [10, 20, 50].includes(n)).catch(20).default(20),
  audience: z.enum(NoticeAudience).optional().catch(undefined),
  class: uuid,
  // "mine": notices I posted.
  view: z.enum(["all", "mine"]).catch("all").default("all"),
  // Expired notices are hidden unless asked for.
  expired: z.literal("show").optional().catch(undefined),
})
export type NoticeFilters = z.output<typeof noticeFiltersSchema>
export const parseNoticeFilters = (source: ParamSource): NoticeFilters => noticeFiltersSchema.parse(entries(source))
