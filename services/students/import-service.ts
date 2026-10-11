import "server-only"

import { z } from "zod"

import { IMPORT_COLUMNS, IMPORT_MAX_ROWS } from "@/features/students/import-template"
import { createStudentSchema, type CreateStudentInput } from "@/features/students/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { AppError, ValidationError } from "@/lib/authorization/errors"
import { normalizeHeader, parseCsv } from "@/lib/csv"
import {
  AdmissionType,
  Gender,
  GuardianRelationship,
} from "@/lib/generated/prisma/enums"
import { canonicalDistrict, parseProvince } from "@/lib/nepal/locations"
import { prisma } from "@/lib/prisma"
import { createStudent } from "@/services/students/student-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

export type ImportRowResult = {
  line: number
  name: string
  admissionNumber: string | null
  placement: string | null
  errors: string[]
  warnings: string[]
}

export type ImportPreview = { rows: ImportRowResult[]; valid: number; invalid: number; columns: string[] }

const importRequestSchema = z.object({
  csv: z.string().max(5_000_000, "The file is too large."),
  // Line number of the first data row in this chunk (for error reports).
  firstLine: z.number().int().min(2).default(2),
})

const KNOWN = new Set(IMPORT_COLUMNS.map((c) => c.key))
const lower = (value: string) => value.trim().toLowerCase()

// Organisation-scoped lookup tables for names/codes in the file.
async function loadStructure(ctx: Ctx) {
  const organizationId = ctx.organization.id
  const [years, levels, programs, classes, sections] = await Promise.all([
    prisma.academicYear.findMany({ where: { organizationId }, select: { id: true, name: true, status: true } }),
    prisma.educationLevel.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, code: true, usesPrograms: true },
    }),
    prisma.program.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, code: true, educationLevelId: true },
    }),
    prisma.academicClass.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, educationLevelId: true, programId: true },
    }),
    prisma.section.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, classId: true },
    }),
  ])
  return { years, levels, programs, classes, sections }
}

type Structure = Awaited<ReturnType<typeof loadStructure>>

function enumValue<T extends Record<string, string>>(values: T, raw: string): T[keyof T] | null {
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, "_")
  return (Object.values(values) as string[]).includes(key) ? (key as T[keyof T]) : null
}

// Turns one CSV row into the same input the admission form submits, so
// imports go through exactly the same validation and business rules.
function toInput(get: (key: string) => string, structure: Structure, errors: string[]) {
  // Enum columns: an unrecognised value is reported, not silently dropped.
  const choice = <T extends Record<string, string>>(values: T, column: string, fallback: T[keyof T] | "") => {
    const raw = get(column)
    if (!raw) return fallback
    const value = enumValue(values, raw)
    if (!value) errors.push(`Invalid ${column.replace(/_/g, " ")} “${raw}”.`)
    return value ?? fallback
  }

  const provinceRaw = get("permanent_province")
  const province = provinceRaw ? parseProvince(provinceRaw) : null
  if (provinceRaw && !province) errors.push(`Unknown province “${provinceRaw}”.`)
  const districtRaw = get("permanent_district")
  const district = districtRaw && province ? canonicalDistrict(province, districtRaw) : null
  if (districtRaw && province && !district) errors.push(`“${districtRaw}” isn't a district of that province.`)

  const permanentAddress = {
    province: province ?? "",
    district: district ?? "",
    municipality: get("permanent_municipality"),
    wardNumber: get("permanent_ward"),
    tole: get("permanent_tole"),
  }

  // Placement: every name must resolve inside this organisation.
  let enrollment: CreateStudentInput["enrollment"] = null
  let placement: string | null = null
  const yearName = get("academic_year")
  const levelName = get("education_level")
  const className = get("class")
  if (yearName || levelName || className) {
    const year = structure.years.find((y) => lower(y.name) === lower(yearName))
    const level = structure.levels.find((l) => lower(l.code) === lower(levelName) || lower(l.name) === lower(levelName))
    const programName = get("program")
    const program = level
      ? structure.programs.find(
          (p) => p.educationLevelId === level.id && (lower(p.code) === lower(programName) || lower(p.name) === lower(programName))
        )
      : undefined
    if (!year) errors.push(yearName ? `Unknown academic year “${yearName}”.` : "Academic year is required to enroll.")
    else if (year.status === "ARCHIVED") errors.push(`Academic year “${year.name}” is archived.`)
    if (!level) errors.push(levelName ? `Unknown education level “${levelName}”.` : "Education level is required to enroll.")
    if (level?.usesPrograms && !program) {
      errors.push(programName ? `Unknown program “${programName}” for ${level.name}.` : `${level.name} requires a program.`)
    }
    if (level && !level.usesPrograms && programName) errors.push(`${level.name} doesn't use programs.`)
    const academicClass = level
      ? structure.classes.find(
          (c) =>
            c.educationLevelId === level.id &&
            (c.programId ?? null) === (program?.id ?? null) &&
            lower(c.name) === lower(className)
        )
      : undefined
    if (level && !academicClass) errors.push(className ? `Unknown class “${className}”.` : "Class is required to enroll.")
    const sectionName = get("section")
    const section = academicClass
      ? structure.sections.find((s) => s.classId === academicClass.id && lower(s.name) === lower(sectionName))
      : undefined
    if (sectionName && academicClass && !section) errors.push(`Unknown section “${sectionName}” in ${academicClass.name}.`)

    if (year && level && academicClass) {
      enrollment = {
        academicYearId: year.id,
        educationLevelId: level.id,
        programId: program?.id ?? "",
        classId: academicClass.id,
        sectionId: section?.id ?? "",
        batchId: "",
        rollNumber: get("roll_number"),
        enrollmentDate: "",
        enrollmentType: "NEW_ADMISSION",
      }
      placement = [academicClass.name, section?.name, program?.code, year.name].filter(Boolean).join(" · ")
    }
  }

  const guardianName = get("guardian_name")
  const input: CreateStudentInput = {
    personal: {
      firstName: get("first_name"),
      middleName: get("middle_name"),
      lastName: get("last_name"),
      dateOfBirth: get("date_of_birth"),
      gender: choice(Gender, "gender", ""),
      nationality: get("nationality"),
      email: get("email"),
      phone: get("phone"),
      alternatePhone: "",
      bloodGroup: "",
      motherTongue: "",
      medicalNotes: "",
    },
    admission: {
      admissionNumber: get("admission_number"),
      admissionDate: get("admission_date"),
      admissionType: choice(AdmissionType, "admission_type", "NEW") || "NEW",
      previousSchool: "",
    },
    permanentAddress,
    sameAsPermanent: true,
    temporaryAddress: {},
    guardians: guardianName
      ? [
          {
            guardianId: "",
            fullName: guardianName,
            phone: get("guardian_phone"),
            email: get("guardian_email"),
            relationship: choice(GuardianRelationship, "guardian_relationship", "OTHER") || "OTHER",
            isPrimary: true,
            isEmergencyContact: true,
            receivesAcademicNotifications: true,
            receivesBillingNotifications: true,
          },
        ]
      : [],
    enroll: enrollment !== null,
    enrollment,
  }
  return { input, placement }
}

function readRows(csv: string) {
  const table = parseCsv(csv)
  if (table.length < 2) throw new ValidationError({ file: ["The file has no data rows."] })
  const headers = table[0].map(normalizeHeader)
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !headers.includes(c.key)).map((c) => c.key)
  if (missing.length) throw new ValidationError({ file: [`Missing required columns: ${missing.join(", ")}.`] })
  if (table.length - 1 > IMPORT_MAX_ROWS) {
    throw new ValidationError({ file: [`Import at most ${IMPORT_MAX_ROWS} rows at a time.`] })
  }
  return { headers, rows: table.slice(1) }
}

// Validates every row without writing anything.
async function validateRows(ctx: Ctx, csv: string, firstLine: number) {
  const { headers, rows } = readRows(csv)
  const structure = await loadStructure(ctx)

  const prepared = rows.map((cells, index) => {
    const get = (key: string) => {
      const i = headers.indexOf(key)
      return i === -1 ? "" : (cells[i] ?? "").trim()
    }
    const errors: string[] = []
    const { input, placement } = toInput(get, structure, errors)
    const parsed = createStudentSchema.safeParse(input)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.at(-1)
        errors.push(issue.message.includes("Invalid option") ? `Invalid value for ${String(field)}.` : issue.message)
      }
    }
    return {
      line: firstLine + index,
      input,
      parsed: parsed.success ? parsed.data : null,
      name: [get("first_name"), get("last_name")].filter(Boolean).join(" ") || "(no name)",
      admissionNumber: get("admission_number") || null,
      placement,
      errors,
      warnings: [] as string[],
    }
  })

  // Duplicate admission numbers within the file and against the database.
  const seen = new Map<string, number>()
  for (const row of prepared) {
    if (!row.admissionNumber) continue
    const key = row.admissionNumber.toLowerCase()
    if (seen.has(key)) row.errors.push(`Admission number repeats line ${seen.get(key)}.`)
    else seen.set(key, row.line)
  }
  const numbers = [...seen.keys()]
  if (numbers.length) {
    const existing = await prisma.student.findMany({
      where: {
        organizationId: ctx.organization.id,
        OR: numbers.map((n) => ({ admissionNumber: { equals: n, mode: "insensitive" as const } })),
      },
      select: { admissionNumber: true },
    })
    const taken = new Set(existing.map((s) => s.admissionNumber.toLowerCase()))
    for (const row of prepared) {
      if (row.admissionNumber && taken.has(row.admissionNumber.toLowerCase())) {
        row.errors.push("Admission number already exists.")
      }
    }
  }

  // Possible duplicate people (same name and date of birth): a warning only.
  const withDob = prepared.filter((r) => r.parsed?.personal.dateOfBirth)
  if (withDob.length) {
    const matches = await prisma.student.findMany({
      where: {
        organizationId: ctx.organization.id,
        OR: withDob.map((r) => ({
          firstName: { equals: r.parsed!.personal.firstName, mode: "insensitive" as const },
          lastName: { equals: r.parsed!.personal.lastName, mode: "insensitive" as const },
          dateOfBirth: new Date(`${r.parsed!.personal.dateOfBirth}T00:00:00.000Z`),
        })),
      },
      select: { firstName: true, lastName: true, dateOfBirth: true, admissionNumber: true },
    })
    for (const row of withDob) {
      const p = row.parsed!.personal
      const match = matches.find(
        (m) =>
          lower(m.firstName) === lower(p.firstName) &&
          lower(m.lastName) === lower(p.lastName) &&
          m.dateOfBirth?.toISOString().slice(0, 10) === p.dateOfBirth
      )
      if (match) row.warnings.push(`Possible duplicate of ${match.admissionNumber}.`)
    }
  }

  const unknown = headers.filter((h) => h && !KNOWN.has(h))
  return { prepared, unknown }
}

function summarise(rows: ImportRowResult[], columns: string[]): ImportPreview {
  const invalid = rows.filter((r) => r.errors.length > 0).length
  return { rows, valid: rows.length - invalid, invalid, columns }
}

export async function previewImport(ctx: Ctx, raw: unknown): Promise<ImportPreview> {
  const { csv, firstLine } = importRequestSchema.parse(raw)
  const { prepared, unknown } = await validateRows(ctx, csv, firstLine)
  return summarise(
    prepared.map(({ line, name, admissionNumber, placement, errors, warnings }) => ({
      line, name, admissionNumber, placement, errors, warnings,
    })),
    unknown
  )
}

// Re-validates the chunk on the server (the preview is never trusted) and
// creates each valid row in its own transaction, so one bad row can't undo
// the others. Returns per-row outcomes for the error report.
export async function commitImport(ctx: Ctx, raw: unknown) {
  const { csv, firstLine } = importRequestSchema.parse(raw)
  const { prepared } = await validateRows(ctx, csv, firstLine)
  const results: (ImportRowResult & { created: boolean; createdAdmissionNumber?: string })[] = []

  for (const row of prepared) {
    const base = {
      line: row.line, name: row.name, admissionNumber: row.admissionNumber,
      placement: row.placement, warnings: row.warnings,
    }
    if (row.errors.length > 0) {
      results.push({ ...base, errors: row.errors, created: false })
      continue
    }
    try {
      const created = await createStudent(ctx, row.input)
      results.push({ ...base, errors: [], created: true, createdAdmissionNumber: created.admissionNumber })
    } catch (error) {
      const messages =
        error instanceof ValidationError
          ? Object.values(error.fieldErrors).flat().filter((m): m is string => !!m)
          : error instanceof AppError
            ? [error.message]
            : ["Unexpected error; this row wasn't imported."]
      if (!(error instanceof AppError)) console.error(error)
      results.push({ ...base, errors: messages, created: false })
    }
  }
  return {
    created: results.filter((r) => r.created).length,
    failed: results.filter((r) => !r.created).length,
    rows: results,
  }
}
