import "server-only"

import { z } from "zod"

import { academicClassSchema } from "@/features/academics/schemas"
import { CLASS_IMPORT_COLUMNS, CLASS_IMPORT_MAX_ROWS } from "@/features/classes/import-template"
import type { AuthContext } from "@/lib/authorization/context"
import { ValidationError } from "@/lib/authorization/errors"
import { normalizeHeader, parseCsv } from "@/lib/csv"
import { suggestLocalClassName } from "@/lib/education/presets"
import { InstructionMedium, SectionShift } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import {
  CLASS_WRITE_ERRORS,
  guardWrite,
  saveAcademicClassInTx,
} from "@/services/academics/structure-service"
import { audit } from "@/services/audit/audit-service"
import { failureReason } from "@/services/classes/placement-service"

// CSV import of classes and their sections. References are matched by exact
// codes; anything ambiguous is reported, never guessed. Each row is written in
// its own transaction through the same rules as the class form.
type Ctx = Pick<AuthContext, "organization" | "user">

export type ClassImportRow = {
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

const KNOWN = new Set(CLASS_IMPORT_COLUMNS.map((c) => c.key))

function enumValue<T extends Record<string, string>>(values: T, raw: string): T[keyof T] | null {
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, "_")
  return (Object.values(values) as string[]).includes(key) ? (key as T[keyof T]) : null
}

function positiveInt(raw: string, max: number) {
  if (!raw.trim()) return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= max ? n : undefined
}

async function validate(ctx: Ctx, csv: string, firstLine: number) {
  const organizationId = ctx.organization.id
  const table = parseCsv(csv)
  if (table.length < 2) throw new ValidationError({ file: ["The file has no data rows."] })
  const headers = table[0].map(normalizeHeader)
  const missing = CLASS_IMPORT_COLUMNS.filter((c) => c.required && !headers.includes(c.key)).map((c) => c.key)
  if (missing.length) throw new ValidationError({ file: [`Missing required columns: ${missing.join(", ")}.`] })
  if (table.length - 1 > CLASS_IMPORT_MAX_ROWS) {
    throw new ValidationError({ file: [`Import at most ${CLASS_IMPORT_MAX_ROWS} rows at a time.`] })
  }

  const [levels, programs, classes] = await Promise.all([
    prisma.educationLevel.findMany({ where: { organizationId }, select: { id: true, code: true, name: true, usesPrograms: true, groupingKind: true } }),
    prisma.program.findMany({ where: { organizationId }, select: { id: true, code: true, educationLevelId: true } }),
    prisma.academicClass.findMany({
      where: { organizationId },
      select: {
        id: true, name: true, code: true, educationLevelId: true, programId: true, archivedAt: true,
        sections: { select: { name: true } },
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
    const className = get("class_name")
    const levelCode = get("education_level").toUpperCase()
    const programCode = get("program").toUpperCase()

    const level = levels.find((l) => l.code === levelCode)
    if (!level) errors.push(`No education level with code "${get("education_level")}".`)
    let programId: string | null = null
    if (level?.usesPrograms) {
      const program = programs.find((p) => p.code === programCode && p.educationLevelId === level.id)
      if (!programCode) errors.push(`${level.name} uses programs; enter a program code.`)
      else if (!program) errors.push(`No program "${get("program")}" in ${level.name}.`)
      programId = program?.id ?? null
    } else if (level && programCode) {
      errors.push(`${level.name} doesn't use programs; leave program empty.`)
    }

    const sequence = positiveInt(get("sequence"), 999)
    const capacity = positiveInt(get("class_capacity"), 5000)
    const sectionCapacity = positiveInt(get("section_capacity"), 2000)
    if (sequence === undefined) errors.push("sequence must be a whole number from 1 to 999.")
    if (capacity === undefined) errors.push("class_capacity must be a whole number.")
    if (sectionCapacity === undefined) errors.push("section_capacity must be a whole number.")
    const shift = get("shift") ? enumValue(SectionShift, get("shift")) : null
    const medium = get("medium") ? enumValue(InstructionMedium, get("medium")) : null
    if (get("shift") && !shift) errors.push(`Unknown shift "${get("shift")}".`)
    if (get("medium") && !medium) errors.push(`Unknown medium "${get("medium")}".`)
    const sectionNames = [...new Set(get("sections").split(/[|;]/).map((s) => s.trim()).filter(Boolean))]
    if (sectionNames.some((s) => s.length > 40)) errors.push("Section names can be at most 40 characters.")

    const parsed = academicClassSchema.safeParse({
      educationLevelId: level?.id ?? "",
      programId,
      name: className,
      localName: get("local_name") || (className ? suggestLocalClassName(className) : null),
      code: get("class_code"),
      description: get("description"),
      kind: level?.groupingKind ?? "GRADE",
      sequence: sequence ?? 1,
      capacity: capacity ?? null,
      isActive: true,
    })
    if (!parsed.success && level) {
      for (const issue of parsed.error.issues) errors.push(`${String(issue.path[0] ?? "row")}: ${issue.message}`)
    }

    // The same class twice in one file would race; report the later row.
    const key = `${level?.id}:${programId ?? ""}:${className.toLowerCase()}`
    if (className && seen.has(key)) errors.push(`Same class as line ${seen.get(key)}.`)
    else seen.set(key, line)

    const code = parsed.success ? parsed.data.code : null
    const existing =
      classes.find((c) => c.educationLevelId === level?.id && c.programId === programId && c.name.toLowerCase() === className.toLowerCase()) ??
      null
    const codeOwner = code ? classes.find((c) => c.code === code) : null
    if (codeOwner && codeOwner.id !== existing?.id) errors.push(`Class code ${code} is already used by ${codeOwner.name}.`)

    let newSections = sectionNames
    if (existing) {
      if (existing.archivedAt) errors.push(`${existing.name} is archived; restore it first.`)
      const taken = new Set(existing.sections.map((s) => s.name.toLowerCase()))
      newSections = sectionNames.filter((s) => !taken.has(s.toLowerCase()))
      if (newSections.length === 0 && errors.length === 0) errors.push("This class and its sections already exist.")
      else if (newSections.length) warnings.push(`Class exists; adds section${newSections.length === 1 ? "" : "s"} ${newSections.join(", ")}.`)
    }

    return {
      line,
      name: className || "(no name)",
      reference: code,
      placement: [level?.name, programCode || null, sectionNames.length ? `Sections ${sectionNames.join(", ")}` : null]
        .filter(Boolean)
        .join(" · "),
      errors,
      warnings,
      input: parsed.success ? parsed.data : null,
      existingId: existing?.id ?? null,
      newSections,
      section: { capacity: sectionCapacity ?? null, shift, medium },
    }
  })

  return { rows, unknown: headers.filter((h) => h && !KNOWN.has(h)) }
}

type Validated = Awaited<ReturnType<typeof validate>>["rows"][number]

const toResult = (r: Validated): ClassImportRow => ({
  line: r.line, name: r.name, admissionNumber: r.reference, placement: r.placement, errors: r.errors, warnings: r.warnings,
})

export async function previewClassImport(ctx: Ctx, raw: unknown) {
  const { csv, firstLine } = requestSchema.parse(raw)
  const { rows, unknown } = await validate(ctx, csv, firstLine)
  return { rows: rows.map(toResult), columns: unknown }
}

export async function commitClassImport(ctx: Ctx, raw: unknown) {
  const { csv, firstLine } = requestSchema.parse(raw)
  const { rows } = await validate(ctx, csv, firstLine)
  const organizationId = ctx.organization.id
  const results: (ClassImportRow & { created: boolean })[] = []

  for (const row of rows) {
    if (row.errors.length || !row.input) {
      results.push({ ...toResult(row), created: false })
      continue
    }
    try {
      await guardWrite(
        () =>
          prisma.$transaction(async (tx) => {
            const classId = row.existingId ?? (await saveAcademicClassInTx(tx, ctx, null, row.input!)).id
            if (row.newSections.length) {
              const max = await tx.section.aggregate({ where: { classId, organizationId }, _max: { sortOrder: true } })
              const start = (max._max.sortOrder ?? -10) + 10
              await tx.section.createMany({
                data: row.newSections.map((name, i) => ({
                  organizationId, classId, name, sortOrder: start + i * 10, ...row.section,
                })),
              })
            }
            await audit(tx, ctx, {
              action: "class.import", entityType: "class", entityId: classId,
              summary: `${row.existingId ? "Added sections to" : "Imported"} class ${row.input!.name}${row.newSections.length ? ` (sections ${row.newSections.join(", ")})` : ""}`,
            })
          }),
        CLASS_WRITE_ERRORS
      )
      results.push({ ...toResult(row), created: true })
    } catch (error) {
      results.push({ ...toResult(row), errors: [failureReason(error)], created: false })
    }
  }
  return { created: results.filter((r) => r.created).length, failed: results.filter((r) => !r.created).length, rows: results }
}
