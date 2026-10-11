import { z } from "zod"

import { SubjectRequirement } from "@/lib/generated/prisma/enums"

// The subjects list is driven by URL search params and filtered, sorted and
// paginated on the server; the export route uses the same parser.

export const PAGE_SIZES = [10, 25, 50, 100] as const
export const SUBJECT_SORT_FIELDS = ["name", "code", "credits", "updatedAt"] as const

const uuid = z.uuid().optional().catch(undefined)

export const subjectFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  pageSize: z.coerce
    .number()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .catch(25)
    .default(25),
  sort: z.enum(SUBJECT_SORT_FIELDS).catch("name").default("name"),
  dir: z.enum(["asc", "desc"]).catch("asc").default("asc"),
  // Year used for "offered" counts; absent → the current academic year.
  year: uuid,
  level: uuid,
  program: uuid,
  category: uuid,
  requirement: z.enum(SubjectRequirement).optional().catch(undefined),
  // Only subjects with (or without) an active offering in the year.
  offered: z.enum(["yes", "no"]).optional().catch(undefined),
  // current = not archived.
  status: z.enum(["current", "active", "inactive", "archived", "all"]).catch("current").default("current"),
})

export type SubjectFilters = z.output<typeof subjectFiltersSchema>

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

export function parseSubjectFilters(source: ParamSource): SubjectFilters {
  const entries: Record<string, string> = {}
  if (source instanceof URLSearchParams) {
    source.forEach((value, key) => (entries[key] = value))
  } else {
    for (const [key, value] of Object.entries(source)) {
      const v = Array.isArray(value) ? value[0] : value
      if (v !== undefined && v !== "") entries[key] = v
    }
  }
  return subjectFiltersSchema.parse(entries)
}

export const DEPENDENT_FILTERS: Record<string, readonly string[]> = {
  level: ["program"],
}
