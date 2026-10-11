import "server-only"

import { z } from "zod"

import { TEACHER_IMPORT_COLUMNS, TEACHER_IMPORT_MAX_ROWS } from "@/features/teachers/import-template"
import { createTeacherSchema, type CreateTeacherInput } from "@/features/teachers/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { AppError, ValidationError } from "@/lib/authorization/errors"
import { normalizeHeader, parseCsv } from "@/lib/csv"
import {
  Gender,
  QualificationLevel,
  TeacherEmploymentStatus,
  TeacherEmploymentType,
} from "@/lib/generated/prisma/enums"
import { canonicalDistrict, parseProvince } from "@/lib/nepal/locations"
import { prisma } from "@/lib/prisma"
import { createTeacher } from "@/services/teachers/teacher-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

export type TeacherImportRow = {
  line: number
  name: string
  admissionNumber: string | null
  placement: string | null
  errors: string[]
  warnings: string[]
}

const requestSchema = z.object({
  csv: z.string().max(5_000_000, "The file is too large."),
  firstLine: z.number().int().min(2).default(2),
})

const KNOWN = new Set(TEACHER_IMPORT_COLUMNS.map((c) => c.key))
const lower = (v: string) => v.trim().toLowerCase()

function enumValue<T extends Record<string, string>>(values: T, raw: string): T[keyof T] | null {
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, "_")
  return (Object.values(values) as string[]).includes(key) ? (key as T[keyof T]) : null
}

async function loadReferences(ctx: Ctx) {
  const organizationId = ctx.organization.id
  const [designations, departments] = await Promise.all([
    prisma.designation.findMany({ where: { organizationId, isActive: true, scope: { not: "NON_TEACHING" } }, select: { id: true, name: true } }),
    prisma.faculty.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true, code: true } }),
  ])
  return { designations, departments }
}

async function validate(ctx: Ctx, csv: string, firstLine: number) {
  const table = parseCsv(csv)
  if (table.length < 2) throw new ValidationError({ file: ["The file has no data rows."] })
  const headers = table[0].map(normalizeHeader)
  const missing = TEACHER_IMPORT_COLUMNS.filter((c) => c.required && !headers.includes(c.key)).map((c) => c.key)
  if (missing.length) throw new ValidationError({ file: [`Missing required columns: ${missing.join(", ")}.`] })
  if (table.length - 1 > TEACHER_IMPORT_MAX_ROWS) {
    throw new ValidationError({ file: [`Import at most ${TEACHER_IMPORT_MAX_ROWS} rows at a time.`] })
  }
  const refs = await loadReferences(ctx)

  const rows = table.slice(1).map((cells, index) => {
    const get = (key: string) => {
      const i = headers.indexOf(key)
      return i === -1 ? "" : (cells[i] ?? "").trim()
    }
    const errors: string[] = []
    const choice = <T extends Record<string, string>>(values: T, column: string, fallback: T[keyof T] | "") => {
      const raw = get(column)
      if (!raw) return fallback
      const value = enumValue(values, raw)
      if (!value) errors.push(`Invalid ${column.replace(/_/g, " ")} “${raw}”.`)
      return value ?? fallback
    }

    // Departments and designations map by name (or department code).
    const designationName = get("designation")
    const designation = refs.designations.find((d) => lower(d.name) === lower(designationName))
    if (designationName && !designation) errors.push(`Unknown designation “${designationName}”.`)
    const departmentName = get("department")
    const department = refs.departments.find((d) => lower(d.code) === lower(departmentName) || lower(d.name) === lower(departmentName))
    if (departmentName && !department) errors.push(`Unknown department “${departmentName}”.`)

    const provinceRaw = get("permanent_province")
    const province = provinceRaw ? parseProvince(provinceRaw) : null
    if (provinceRaw && !province) errors.push(`Unknown province “${provinceRaw}”.`)
    const districtRaw = get("permanent_district")
    const district = districtRaw && province ? canonicalDistrict(province, districtRaw) : null
    if (districtRaw && province && !district) errors.push(`“${districtRaw}” isn't a district of that province.`)

    const qualificationTitle = get("qualification_title")
    const qualificationLevel = choice(QualificationLevel, "qualification_level", "")
    if (qualificationTitle && !qualificationLevel) errors.push("Give a qualification level for the qualification.")

    const input: CreateTeacherInput = {
      employeeId: get("employee_id"),
      personal: {
        firstName: get("first_name"),
        middleName: get("middle_name"),
        lastName: get("last_name"),
        nameNepali: get("name_nepali"),
        dateOfBirth: get("date_of_birth"),
        gender: choice(Gender, "gender", ""),
        nationality: "",
      },
      contact: { email: get("email"), phone: get("phone") },
      permanentAddress: { province: province ?? "", district: district ?? "", municipality: get("permanent_municipality") },
      sameAsPermanent: true,
      temporaryAddress: {},
      employment: {
        dateOfJoining: get("date_of_joining"),
        employmentType: choice(TeacherEmploymentType, "employment_type", "FULL_TIME") || "FULL_TIME",
        employmentStatus: choice(TeacherEmploymentStatus, "employment_status", "ACTIVE") || "ACTIVE",
        designationId: designation?.id ?? "",
        departmentId: department?.id ?? "",
        contractEndDate: get("contract_end_date"),
        onProbation: false,
      },
      qualifications:
        qualificationTitle && qualificationLevel
          ? [{
              level: qualificationLevel,
              title: qualificationTitle,
              specialization: get("qualification_specialization"),
              institutionName: get("qualification_institution"),
              completionYear: get("qualification_year"),
            }]
          : [],
      certifications: [],
      // Imports never create assignments or link accounts.
      assignments: [],
      userId: "",
    }
    const parsed = createTeacherSchema.safeParse(input)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(issue.message.includes("Invalid option") ? `Invalid value for ${String(issue.path.at(-1))}.` : issue.message)
      }
    }
    return {
      line: firstLine + index,
      input,
      name: [get("first_name"), get("last_name")].filter(Boolean).join(" ") || "(no name)",
      employeeId: get("employee_id") || null,
      placement: [designation?.name, department?.name].filter(Boolean).join(" · ") || null,
      errors: [...new Set(errors)],
      warnings: [] as string[],
    }
  })

  // Duplicate employee IDs within the file and in the organisation.
  const seen = new Map<string, number>()
  for (const r of rows) {
    if (!r.employeeId) continue
    const key = r.employeeId.toLowerCase()
    if (seen.has(key)) r.errors.push(`Employee ID repeats line ${seen.get(key)}.`)
    else seen.set(key, r.line)
  }
  if (seen.size) {
    // Employee IDs are shared with non-teaching staff.
    const where = {
      organizationId: ctx.organization.id,
      OR: [...seen.keys()].map((id) => ({ employeeId: { equals: id, mode: "insensitive" as const } })),
    }
    const existing = await Promise.all([
      prisma.teacher.findMany({ where, select: { employeeId: true } }),
      prisma.staff.findMany({ where, select: { employeeId: true } }),
    ])
    const taken = new Set(existing.flat().map((t) => t.employeeId.toLowerCase()))
    for (const r of rows) if (r.employeeId && taken.has(r.employeeId.toLowerCase())) r.errors.push("Employee ID already exists.")
  }

  // Same email as an existing teacher: warn (likely the same person).
  const emails = rows.map((r) => r.input.contact.email).filter((e): e is string => !!e)
  if (emails.length) {
    const matches = await prisma.teacher.findMany({
      where: { organizationId: ctx.organization.id, email: { in: emails.map((e) => e.toLowerCase()) } },
      select: { email: true, employeeId: true },
    })
    for (const r of rows) {
      const m = matches.find((x) => x.email === r.input.contact.email?.toLowerCase())
      if (m) r.warnings.push(`Same email as ${m.employeeId}.`)
    }
  }

  return { rows, unknown: headers.filter((h) => h && !KNOWN.has(h)) }
}

const toResult = (r: Awaited<ReturnType<typeof validate>>["rows"][number]): TeacherImportRow => ({
  line: r.line, name: r.name, admissionNumber: r.employeeId, placement: r.placement, errors: r.errors, warnings: r.warnings,
})

export async function previewTeacherImport(ctx: Ctx, raw: unknown) {
  const { csv, firstLine } = requestSchema.parse(raw)
  const { rows, unknown } = await validate(ctx, csv, firstLine)
  return { rows: rows.map(toResult), columns: unknown }
}

// Re-validates on the server and creates each valid row in its own
// transaction, through the same service as the form.
export async function commitTeacherImport(ctx: Ctx, raw: unknown) {
  const { csv, firstLine } = requestSchema.parse(raw)
  const { rows } = await validate(ctx, csv, firstLine)
  const results: (TeacherImportRow & { created: boolean; createdAdmissionNumber?: string })[] = []
  for (const row of rows) {
    if (row.errors.length) {
      results.push({ ...toResult(row), created: false })
      continue
    }
    try {
      const created = await createTeacher(ctx, row.input)
      results.push({ ...toResult(row), created: true, createdAdmissionNumber: created.employeeId })
    } catch (error) {
      const messages =
        error instanceof ValidationError
          ? Object.values(error.fieldErrors).flat().filter((m): m is string => !!m)
          : error instanceof AppError
            ? [error.message]
            : ["Unexpected error; this row wasn't imported."]
      if (!(error instanceof AppError)) console.error(error)
      results.push({ ...toResult(row), errors: messages, created: false })
    }
  }
  return { created: results.filter((r) => r.created).length, failed: results.filter((r) => !r.created).length, rows: results }
}
