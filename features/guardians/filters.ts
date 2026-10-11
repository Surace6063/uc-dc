import { z } from "zod"

import { INVITATION_STATES } from "@/features/guardians/constants"
import { GuardianPortalStatus, GuardianRelationship } from "@/lib/generated/prisma/enums"

// The guardian list is driven by URL search params; the same parser feeds the
// page, the summary counts and the export route. Unknown or malformed values
// are dropped, never passed to the database.

export const GUARDIAN_SORT_FIELDS = ["name", "guardianCode", "children", "createdAt"] as const

const text = (max: number) => z.string().trim().max(max).optional().catch(undefined)
const presence = z.enum(["has", "missing"]).optional().catch(undefined)
const csvEnum = <T extends Record<string, string>>(values: T) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value ? value.split(",").filter((v): v is T[keyof T] => Object.values(values).includes(v)) : []
    )
    .catch([])

export const guardianFiltersSchema = z.object({
  q: text(100),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  pageSize: z.coerce
    .number()
    .refine((n) => [10, 25, 50, 100].includes(n))
    .catch(25)
    .default(25),
  sort: z.enum(GUARDIAN_SORT_FIELDS).catch("name").default("name"),
  dir: z.enum(["asc", "desc"]).catch("asc").default("asc"),
  view: z.enum(["current", "archived", "all"]).catch("current").default("current"),

  relationship: z.enum(GuardianRelationship).optional().catch(undefined),
  portal: csvEnum(GuardianPortalStatus),
  invitation: z.enum(INVITATION_STATES).optional().catch(undefined),
  // Number of linked students.
  children: z.enum(["0", "1", "2+"]).optional().catch(undefined),
  primary: z.enum(["yes", "no"]).optional().catch(undefined),
  email: presence,
  // Guardians of one student (from the student profile).
  student: z.uuid().optional().catch(undefined),
})

export type GuardianFilters = z.output<typeof guardianFiltersSchema>

export function parseGuardianFilters(source: URLSearchParams | Record<string, string | string[] | undefined>) {
  const entries: Record<string, string> = {}
  if (source instanceof URLSearchParams) {
    source.forEach((value, key) => (entries[key] = value))
  } else {
    for (const [key, value] of Object.entries(source)) {
      const v = Array.isArray(value) ? value[0] : value
      if (v !== undefined && v !== "") entries[key] = v
    }
  }
  return guardianFiltersSchema.parse(entries)
}

export const GUARDIAN_FILTER_KEYS = ["relationship", "portal", "invitation", "children", "primary", "email", "student"] as const
