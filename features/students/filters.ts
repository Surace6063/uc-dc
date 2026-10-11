import { z } from "zod"

import {
  AdmissionType,
  EnrollmentStatus,
  EnrollmentType,
  Gender,
  StudentStatus,
} from "@/lib/generated/prisma/enums"
import { BLOOD_GROUPS } from "@/features/students/schemas"

// The students list is driven entirely by URL search params, so views are
// shareable and the server always filters, sorts and paginates. The same
// parser feeds the table page, the summary counts and the export route.

export const PAGE_SIZES = [10, 25, 50, 100] as const
export const SORT_FIELDS = ["name", "admissionNumber", "admissionDate", "createdAt", "gender"] as const

const uuid = z.uuid().optional().catch(undefined)
const text = (max: number) => z.string().trim().max(max).optional().catch(undefined)
const date = z.iso.date().optional().catch(undefined)
const presence = z.enum(["has", "missing"]).optional().catch(undefined)
const csvEnum = <T extends Record<string, string>>(values: T) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value.split(",").filter((v): v is T[keyof T] => Object.values(values).includes(v))
        : []
    )
    .catch([])

export const studentFiltersSchema = z.object({
  q: text(100),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  pageSize: z.coerce
    .number()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .catch(25)
    .default(25),
  sort: z.enum(SORT_FIELDS).catch("name").default("name"),
  dir: z.enum(["asc", "desc"]).catch("asc").default("asc"),

  // Academic context. `year` absent → the current academic year; "all" → any.
  year: z.union([z.literal("all"), z.uuid()]).optional().catch(undefined),
  level: uuid,
  program: uuid,
  faculty: uuid,
  class: uuid,
  section: uuid,
  batch: uuid,
  enrollmentStatus: csvEnum(EnrollmentStatus),
  enrollmentType: z.enum(EnrollmentType).optional().catch(undefined),

  // Student.
  view: z.enum(["current", "archived", "all"]).catch("current").default("current"),
  status: csvEnum(StudentStatus),
  gender: z.enum(Gender).optional().catch(undefined),
  admissionType: z.enum(AdmissionType).optional().catch(undefined),
  admittedFrom: date,
  admittedTo: date,
  ageMin: z.coerce.number().int().min(0).max(100).optional().catch(undefined),
  ageMax: z.coerce.number().int().min(0).max(100).optional().catch(undefined),
  nationality: text(60),
  province: z.coerce.number().int().min(1).max(7).optional().catch(undefined),
  district: text(60),
  municipality: text(100),
  // Only applied for roles with students.sensitive.view (see buildStudentWhere).
  bloodGroup: z.enum(BLOOD_GROUPS).optional().catch(undefined),

  // Data completeness.
  guardianContact: presence,
  email: presence,
  photo: presence,
  documents: z.enum(["complete", "missing"]).optional().catch(undefined),
  incomplete: z.literal("1").optional().catch(undefined),
  createdFrom: date,
  createdTo: date,
})

export type StudentFilters = z.output<typeof studentFiltersSchema>

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

export function parseStudentFilters(source: ParamSource): StudentFilters {
  const entries: Record<string, string> = {}
  if (source instanceof URLSearchParams) {
    source.forEach((value, key) => (entries[key] = value))
  } else {
    for (const [key, value] of Object.entries(source)) {
      const v = Array.isArray(value) ? value[0] : value
      if (v !== undefined && v !== "") entries[key] = v
    }
  }
  return studentFiltersSchema.parse(entries)
}

// Parent → children: changing a key clears the dependent selections that
// may no longer be compatible with it.
export const DEPENDENT_FILTERS: Record<string, readonly string[]> = {
  level: ["program", "class", "section", "batch"],
  faculty: ["program", "class", "section", "batch"],
  program: ["class", "section", "batch"],
  class: ["section"],
  province: ["district", "municipality"],
  district: ["municipality"],
}

// Filters that narrow results (used for "active filters" chips and counts).
export const FILTER_KEYS = [
  "level", "program", "faculty", "class", "section", "batch", "enrollmentStatus", "enrollmentType",
  "status", "gender", "admissionType", "admittedFrom", "admittedTo", "ageMin", "ageMax",
  "nationality", "province", "district", "municipality", "bloodGroup",
  "guardianContact", "email", "photo", "documents", "incomplete", "createdFrom", "createdTo",
] as const

export type FilterKey = (typeof FILTER_KEYS)[number]
