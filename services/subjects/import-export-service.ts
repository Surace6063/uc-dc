import "server-only"

import { z } from "zod"

import { formatCredits, REQUIREMENT_LABELS } from "@/features/subjects/constants"
import type { SubjectFilters } from "@/features/subjects/filters"
import { SUBJECT_IMPORT_COLUMNS, SUBJECT_IMPORT_MAX_ROWS } from "@/features/subjects/import-template"
import { subjectSchema } from "@/features/subjects/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { AppError, ValidationError } from "@/lib/authorization/errors"
import { csvLine, normalizeHeader, parseCsv } from "@/lib/csv"
import { InstructionMedium, SubjectRequirement } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import { listSubjects } from "@/services/subjects/subject-query"
import { saveSubject } from "@/services/subjects/subject-service"

type Ctx = Pick<AuthContext, "organization" | "user">

// ------------------------------------------------------------------ export

// The subjects list as CSV with the table's filters (at most 5000 rows).
export async function exportSubjectsCsv(ctx: Ctx, filters: SubjectFilters, yearId: string | null) {
  const rows: Awaited<ReturnType<typeof listSubjects>>["rows"] = []
  for (let page = 1; rows.length < 5000; page++) {
    const result = await listSubjects(ctx, { ...filters, page, pageSize: 100 }, yearId)
    rows.push(...result.rows)
    if (rows.length >= result.total || result.rows.length === 0) break
  }
  return [
    csvLine(["Code", "Name", "Nepali name", "Category", "Requirement", "Education level", "Program", "Credits", "Theory hours", "Practical hours", "Weekly periods", "Offerings this year", "Teachers this year", "Status"]),
    ...rows.map((r) =>
      csvLine([
        r.code, r.name, r.localName, r.category?.name, REQUIREMENT_LABELS[r.requirement], r.educationLevel?.name,
        r.program?.code, formatCredits(r.creditHours), r.theoryHours, r.practicalHours, r.weeklyPeriods,
        r.offerings, r.teachers, r.archivedAt ? "Archived" : r.isActive ? "Active" : "Inactive",
      ])
    ),
  ].join("")
}

// ------------------------------------------------------------------ import

export type SubjectImportRow = {
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

const KNOWN = new Set(SUBJECT_IMPORT_COLUMNS.map((c) => c.key))

function enumValue<T extends Record<string, string>>(values: T, raw: string): T[keyof T] | null {
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, "_")
  return (Object.values(values) as string[]).includes(key) ? (key as T[keyof T]) : null
}

async function validate(ctx: Ctx, csv: string, firstLine: number) {
  const organizationId = ctx.organization.id
  const table = parseCsv(csv)
  if (table.length < 2) throw new ValidationError({ file: ["The file has no data rows."] })
  const headers = table[0].map(normalizeHeader)
  const missing = SUBJECT_IMPORT_COLUMNS.filter((c) => c.required && !headers.includes(c.key)).map((c) => c.key)
  if (missing.length) throw new ValidationError({ file: [`Missing required columns: ${missing.join(", ")}.`] })
  if (table.length - 1 > SUBJECT_IMPORT_MAX_ROWS) {
    throw new ValidationError({ file: [`Import at most ${SUBJECT_IMPORT_MAX_ROWS} rows at a time.`] })
  }

  const [levels, programs, categories, subjects] = await Promise.all([
    prisma.educationLevel.findMany({ where: { organizationId }, select: { id: true, code: true, name: true } }),
    prisma.program.findMany({ where: { organizationId }, select: { id: true, code: true, educationLevelId: true } }),
    prisma.subjectCategory.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.subject.findMany({
      where: { organizationId },
      select: {
        id: true, code: true, archivedAt: true, isActive: true, sortOrder: true,
      },
    }),
  ])
  const seen = new Map<string, number>()

  const rows = table.slice(1).map((cells, i) => {
    const line = firstLine + i
    const get = (key: string) => {
      const index = headers.indexOf(key)
      return index === -1 ? "" : (cells[index] ?? "").trim()
    }
    const errors: string[] = []
    const warnings: string[] = []

    const levelCode = get("education_level").toUpperCase()
    const programCode = get("program").toUpperCase()
    const level = levelCode ? levels.find((l) => l.code === levelCode) : null
    if (levelCode && !level) errors.push(`No education level with code "${get("education_level")}".`)
    const program = programCode ? programs.find((p) => p.code === programCode) : null
    if (programCode && !program) errors.push(`No program with code "${get("program")}".`)
    if (program && level && program.educationLevelId !== level.id) errors.push("The program belongs to a different education level.")
    const category = get("category") ? categories.find((c) => c.name.toLowerCase() === get("category").toLowerCase()) : null
    if (get("category") && !category) errors.push(`No subject category named "${get("category")}".`)
    const requirement = get("requirement") ? enumValue(SubjectRequirement, get("requirement")) : "COMPULSORY"
    if (!requirement) errors.push(`Unknown requirement "${get("requirement")}".`)
    const medium = get("medium") ? enumValue(InstructionMedium, get("medium")) : null
    if (get("medium") && !medium) errors.push(`Unknown medium "${get("medium")}".`)

    const code = get("code").toUpperCase()
    const existing = subjects.find((s) => s.code === code)
    if (existing?.archivedAt) errors.push(`Subject ${code} is archived; restore it first.`)
    else if (existing) warnings.push(`Updates the existing subject ${code}.`)
    if (code && seen.has(code)) errors.push(`Same code as line ${seen.get(code)}.`)
    else if (code) seen.set(code, line)

    const parsed = subjectSchema.safeParse({
      code: get("code"),
      name: get("name"),
      localName: get("local_name"),
      description: get("description"),
      categoryId: category?.id ?? "",
      requirement: requirement ?? "COMPULSORY",
      educationLevelId: level?.id ?? program?.educationLevelId ?? "",
      programId: program?.id ?? "",
      creditHours: get("credit_hours"),
      theoryHours: get("theory_hours"),
      practicalHours: get("practical_hours"),
      weeklyPeriods: get("weekly_periods"),
      medium: medium ?? "",
      isActive: existing ? existing.isActive : true,
      sortOrder: existing?.sortOrder ?? 0,
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`${String(issue.path[0] ?? "row")}: ${issue.message}`)
    }

    return {
      line,
      name: get("name") || "(no name)",
      reference: code || null,
      placement: [level?.name, program ? programCode : null, category?.name].filter(Boolean).join(" · ") || null,
      errors,
      warnings,
      input: parsed.success ? parsed.data : null,
      existingId: existing && !existing.archivedAt ? existing.id : null,
    }
  })
  return { rows, unknown: headers.filter((h) => h && !KNOWN.has(h)) }
}

type Validated = Awaited<ReturnType<typeof validate>>["rows"][number]

const toResult = (r: Validated): SubjectImportRow => ({
  line: r.line, name: r.name, admissionNumber: r.reference, placement: r.placement, errors: r.errors, warnings: r.warnings,
})

export async function previewSubjectImport(ctx: Ctx, raw: unknown) {
  const { csv, firstLine } = requestSchema.parse(raw)
  const { rows, unknown } = await validate(ctx, csv, firstLine)
  return { rows: rows.map(toResult), columns: unknown }
}

// Each valid row is saved through the same service as the form.
export async function commitSubjectImport(ctx: Ctx, raw: unknown) {
  const { csv, firstLine } = requestSchema.parse(raw)
  const { rows } = await validate(ctx, csv, firstLine)
  const results: (SubjectImportRow & { created: boolean })[] = []
  for (const row of rows) {
    if (row.errors.length || !row.input) {
      results.push({ ...toResult(row), created: false })
      continue
    }
    try {
      await saveSubject(ctx, row.existingId, row.input)
      results.push({ ...toResult(row), created: true })
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

