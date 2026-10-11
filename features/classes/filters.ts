import { z } from "zod"

// The classes and sections lists are driven by URL search params (shareable,
// filtered, sorted and paginated on the server). The same parser feeds the
// page, the summary counts and the export route.

export const PAGE_SIZES = [10, 25, 50, 100] as const
export const CLASS_SORT_FIELDS = ["order", "name", "code", "createdAt"] as const
export const SECTION_SORT_FIELDS = ["class", "name", "capacity"] as const

const uuid = z.uuid().optional().catch(undefined)

export const classFiltersSchema = z.object({
  view: z.enum(["classes", "sections"]).catch("classes").default("classes"),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  pageSize: z.coerce
    .number()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .catch(25)
    .default(25),
  sort: z.string().optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).catch("asc").default("asc"),
  // Absent → the current academic year (counts and class teachers).
  year: uuid,
  level: uuid,
  program: uuid,
  class: uuid,
  // current = everything not archived.
  status: z.enum(["current", "active", "inactive", "archived", "all"]).catch("current").default("current"),
  // Only classes with students enrolled in the selected year.
  running: z.literal("1").optional().catch(undefined),
  // Only classes/sections the signed-in teacher teaches in the selected year.
  mine: z.literal("1").optional().catch(undefined),
})

export type ClassFilters = z.output<typeof classFiltersSchema> & {
  classSort: (typeof CLASS_SORT_FIELDS)[number]
  sectionSort: (typeof SECTION_SORT_FIELDS)[number]
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

export function parseClassFilters(source: ParamSource): ClassFilters {
  const entries: Record<string, string> = {}
  if (source instanceof URLSearchParams) {
    source.forEach((value, key) => (entries[key] = value))
  } else {
    for (const [key, value] of Object.entries(source)) {
      const v = Array.isArray(value) ? value[0] : value
      if (v !== undefined && v !== "") entries[key] = v
    }
  }
  const parsed = classFiltersSchema.parse(entries)
  const sort = parsed.sort ?? ""
  return {
    ...parsed,
    classSort: (CLASS_SORT_FIELDS as readonly string[]).includes(sort)
      ? (sort as ClassFilters["classSort"])
      : "order",
    sectionSort: (SECTION_SORT_FIELDS as readonly string[]).includes(sort)
      ? (sort as ClassFilters["sectionSort"])
      : "class",
  }
}

// Changing a parent filter clears children that may no longer apply.
export const DEPENDENT_FILTERS: Record<string, readonly string[]> = {
  level: ["program", "class"],
  program: ["class"],
  view: ["sort", "dir", "page", "class"],
}
