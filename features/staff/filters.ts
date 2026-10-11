import { z } from "zod"

import {
  JobCategory,
  QualificationLevel,
  StaffEmploymentStatus,
  StaffEmploymentType,
  VerificationStatus,
} from "@/lib/generated/prisma/enums"

// The staff list is driven by URL search params; the same parser feeds the
// page, the summary counts and the export route. Unknown or malformed values
// are dropped, never passed to the database.

export const STAFF_SORT_FIELDS = ["name", "employeeId", "dateOfJoining", "contractEndDate", "designation", "department", "createdAt"] as const

const uuid = z.uuid().optional().catch(undefined)
const text = (max: number) => z.string().trim().max(max).optional().catch(undefined)
const date = z.iso.date().optional().catch(undefined)
const presence = z.enum(["has", "missing"]).optional().catch(undefined)
const yesNo = z.enum(["yes", "no"]).optional().catch(undefined)
const csvEnum = <T extends Record<string, string>>(values: T) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value ? value.split(",").filter((v): v is T[keyof T] => Object.values(values).includes(v)) : []
    )
    .catch([])

export const staffFiltersSchema = z.object({
  q: text(100),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  pageSize: z.coerce
    .number()
    .refine((n) => [10, 25, 50, 100].includes(n))
    .catch(25)
    .default(25),
  sort: z.enum(STAFF_SORT_FIELDS).catch("name").default("name"),
  dir: z.enum(["asc", "desc"]).catch("asc").default("asc"),
  view: z.enum(["current", "archived", "all"]).catch("current").default("current"),

  // Employment.
  status: csvEnum(StaffEmploymentStatus),
  type: csvEnum(StaffEmploymentType),
  department: uuid,
  designation: uuid,
  category: z.enum(JobCategory).optional().catch(undefined),
  joinedFrom: date,
  joinedTo: date,
  // Contract and probation details need staff.employment.view (checked on the server).
  contractEndFrom: date,
  contractEndTo: date,
  contractExpiring: z.literal("1").optional().catch(undefined),
  probation: yesNo,
  manager: uuid,

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

  // Other. Address filters need staff.sensitive.view (checked on the server).
  province: z.coerce.number().int().min(1).max(7).optional().catch(undefined),
  district: text(60),
  municipality: text(100),
  account: yesNo,
  responsibilities: yesNo,
})

export type StaffFilters = z.output<typeof staffFiltersSchema>

export function parseStaffFilters(source: URLSearchParams | Record<string, string | string[] | undefined>) {
  const entries: Record<string, string> = {}
  if (source instanceof URLSearchParams) {
    source.forEach((value, key) => (entries[key] = value))
  } else {
    for (const [key, value] of Object.entries(source)) {
      const v = Array.isArray(value) ? value[0] : value
      if (v !== undefined && v !== "") entries[key] = v
    }
  }
  return staffFiltersSchema.parse(entries)
}

export const STAFF_DEPENDENT_FILTERS: Record<string, readonly string[]> = {
  department: ["designation"],
  category: ["designation"],
  province: ["district", "municipality"],
  district: ["municipality"],
}

export const STAFF_FILTER_KEYS = [
  "status", "type", "department", "designation", "category", "joinedFrom", "joinedTo",
  "contractEndFrom", "contractEndTo", "contractExpiring", "probation", "manager",
  "qualLevel", "specialization", "qualVerification", "certification",
  "phone", "email", "qualifications", "documents", "pendingVerification", "incomplete",
  "province", "district", "municipality", "account", "responsibilities",
] as const

export type StaffFilterKey = (typeof STAFF_FILTER_KEYS)[number]
