import { z } from "zod"

import {
  AcademicRank,
  QualificationLevel,
  TeacherEmploymentStatus,
  TeacherEmploymentType,
  VerificationStatus,
} from "@/lib/generated/prisma/enums"

// The teachers list is driven by URL search params; the same parser feeds
// the page, the summary counts and the export route. Unknown or malformed
// values are dropped, never passed to the database.

export const TEACHER_SORT_FIELDS = ["name", "employeeId", "dateOfJoining", "designation", "department", "createdAt"] as const

const uuid = z.uuid().optional().catch(undefined)
const text = (max: number) => z.string().trim().max(max).optional().catch(undefined)
const date = z.iso.date().optional().catch(undefined)
const presence = z.enum(["has", "missing"]).optional().catch(undefined)
const csvEnum = <T extends Record<string, string>>(values: T) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value ? value.split(",").filter((v): v is T[keyof T] => Object.values(values).includes(v)) : []
    )
    .catch([])

export const teacherFiltersSchema = z.object({
  q: text(100),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  pageSize: z.coerce
    .number()
    .refine((n) => [10, 25, 50, 100].includes(n))
    .catch(25)
    .default(25),
  sort: z.enum(TEACHER_SORT_FIELDS).catch("name").default("name"),
  dir: z.enum(["asc", "desc"]).catch("asc").default("asc"),
  view: z.enum(["current", "archived", "all"]).catch("current").default("current"),

  // Employment.
  status: csvEnum(TeacherEmploymentStatus),
  type: csvEnum(TeacherEmploymentType),
  designation: uuid,
  // A rank, or "unrecorded" for teachers without one.
  rank: z.union([z.enum(AcademicRank), z.literal("unrecorded")]).optional().catch(undefined),
  department: uuid,
  // Recorded as holding a full-time job at another institution.
  otherJob: z.enum(["yes", "no", "unrecorded"]).optional().catch(undefined),
  joinedFrom: date,
  joinedTo: date,
  contractEndFrom: date,
  contractEndTo: date,

  // Teaching assignments (active ones in the chosen year).
  // `year` absent → the current academic year; "all" → any year.
  year: z.union([z.literal("all"), z.uuid()]).optional().catch(undefined),
  level: uuid,
  program: uuid,
  class: uuid,
  section: uuid,
  subject: uuid,
  batch: uuid,
  assigned: z.enum(["yes", "no"]).optional().catch(undefined),

  // Qualifications.
  qualLevel: z.enum(QualificationLevel).optional().catch(undefined),
  specialization: text(80),
  qualVerification: z.enum(VerificationStatus).optional().catch(undefined),
  certification: presence,

  // Profile completeness.
  phone: presence,
  email: presence,
  qualifications: presence,
  documents: z.enum(["complete", "missing"]).optional().catch(undefined),
  pendingVerification: z.literal("1").optional().catch(undefined),
  incomplete: z.literal("1").optional().catch(undefined),
})

export type TeacherFilters = z.output<typeof teacherFiltersSchema>

export function parseTeacherFilters(source: URLSearchParams | Record<string, string | string[] | undefined>) {
  const entries: Record<string, string> = {}
  if (source instanceof URLSearchParams) {
    source.forEach((value, key) => (entries[key] = value))
  } else {
    for (const [key, value] of Object.entries(source)) {
      const v = Array.isArray(value) ? value[0] : value
      if (v !== undefined && v !== "") entries[key] = v
    }
  }
  return teacherFiltersSchema.parse(entries)
}

export const TEACHER_DEPENDENT_FILTERS: Record<string, readonly string[]> = {
  year: ["class", "section"],
  level: ["program", "class", "section", "subject", "batch"],
  program: ["class", "section", "subject", "batch"],
  class: ["section"],
}

export const TEACHER_FILTER_KEYS = [
  "status", "type", "designation", "rank", "department", "otherJob", "joinedFrom", "joinedTo", "contractEndFrom", "contractEndTo",
  "level", "program", "class", "section", "subject", "batch", "assigned",
  "qualLevel", "specialization", "qualVerification", "certification",
  "phone", "email", "qualifications", "documents", "pendingVerification", "incomplete",
] as const

export type TeacherFilterKey = (typeof TEACHER_FILTER_KEYS)[number]
