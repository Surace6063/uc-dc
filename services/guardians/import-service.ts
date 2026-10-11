import "server-only"

import { z } from "zod"

import { GUARDIAN_IMPORT_COLUMNS, GUARDIAN_IMPORT_MAX_ROWS } from "@/features/guardians/import-template"
import { guardianProfileSchema, type GuardianProfileInput, type StudentLinkInput } from "@/features/guardians/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { AppError, ValidationError } from "@/lib/authorization/errors"
import { normalizeHeader, parseCsv } from "@/lib/csv"
import { ContactMethod, Gender, GuardianRelationship } from "@/lib/generated/prisma/enums"
import { canonicalDistrict, parseProvince } from "@/lib/nepal/locations"
import { prisma } from "@/lib/prisma"
import { createGuardian, linkStudents } from "@/services/guardians/guardian-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

// Shape expected by the shared import wizard: the reference column holds the
// student's admission number, the placement column what will happen.
export type GuardianImportRow = {
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

const KNOWN = new Set(GUARDIAN_IMPORT_COLUMNS.map((c) => c.key))

function enumValue<T extends Record<string, string>>(values: T, raw: string): T[keyof T] | null {
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, "_")
  return (Object.values(values) as string[]).includes(key) ? (key as T[keyof T]) : null
}

function yesNo(raw: string, fallback: boolean): boolean | null {
  const v = raw.trim().toLowerCase()
  if (!v) return fallback
  if (["yes", "y", "true", "1"].includes(v)) return true
  if (["no", "n", "false", "0"].includes(v)) return false
  return null
}

type Target = { kind: "existing"; id: string; label: string } | { kind: "new" }

type ParsedRow = {
  line: number
  name: string
  admissionNumber: string | null
  profile: GuardianProfileInput
  link: StudentLinkInput | null
  target: Target
  sameAsLine: number | null
  errors: string[]
  warnings: string[]
}

const key = (name: string, phone: string) => `${name.trim().toLowerCase()}|${phone.trim()}`

async function validate(ctx: Ctx, csv: string, firstLine: number): Promise<{ rows: ParsedRow[]; unknown: string[] }> {
  const organizationId = ctx.organization.id
  const table = parseCsv(csv)
  if (table.length < 2) throw new ValidationError({ file: ["The file has no data rows."] })
  const headers = table[0].map(normalizeHeader)
  const missing = GUARDIAN_IMPORT_COLUMNS.filter((c) => c.required && !headers.includes(c.key)).map((c) => c.key)
  if (missing.length) throw new ValidationError({ file: [`Missing required columns: ${missing.join(", ")}.`] })
  if (table.length - 1 > GUARDIAN_IMPORT_MAX_ROWS) {
    throw new ValidationError({ file: [`Import at most ${GUARDIAN_IMPORT_MAX_ROWS} rows at a time.`] })
  }

  const cells = table.slice(1).map((row) => (column: string) => {
    const i = headers.indexOf(column)
    return i === -1 ? "" : (row[i] ?? "").trim()
  })

  // Look up students, guardian IDs and name+phone matches in three queries.
  const admissionNumbers = [...new Set(cells.map((get) => get("student_admission_number")).filter(Boolean))]
  const codes = [...new Set(cells.map((get) => get("guardian_code")).filter(Boolean))]
  const phones = [...new Set(cells.map((get) => get("phone")).filter(Boolean))]
  const [students, byCode, byPhone] = await Promise.all([
    admissionNumbers.length
      ? prisma.student.findMany({
          where: { organizationId, OR: admissionNumbers.map((n) => ({ admissionNumber: { equals: n, mode: "insensitive" as const } })) },
          select: { id: true, admissionNumber: true, firstName: true, lastName: true, archivedAt: true },
        })
      : [],
    codes.length
      ? prisma.guardian.findMany({
          where: { organizationId, OR: codes.map((c) => ({ guardianCode: { equals: c, mode: "insensitive" as const } })) },
          select: { id: true, guardianCode: true, fullName: true, archivedAt: true },
        })
      : [],
    phones.length
      ? prisma.guardian.findMany({
          where: { organizationId, phone: { in: phones } },
          select: { id: true, guardianCode: true, fullName: true, phone: true, archivedAt: true },
        })
      : [],
  ])
  const targetIds = [...byCode.map((g) => g.id), ...byPhone.map((g) => g.id)]
  const existingLinks = targetIds.length && students.length
    ? await prisma.studentGuardian.findMany({
        where: { organizationId, guardianId: { in: targetIds }, studentId: { in: students.map((s) => s.id) } },
        select: { guardianId: true, studentId: true },
      })
    : []
  const primaryTaken = students.length
    ? new Set((await prisma.studentGuardian.findMany({
        where: { organizationId, studentId: { in: students.map((s) => s.id) }, isPrimary: true },
        select: { studentId: true },
      })).map((l) => l.studentId))
    : new Set<string>()

  const firstLineFor = new Map<string, number>()
  const pairs = new Map<string, number>()
  const primaryInFile = new Map<string, number>()

  const rows = cells.map((get, index): ParsedRow => {
    const line = firstLine + index
    const errors: string[] = []
    const warnings: string[] = []
    const choice = <T extends Record<string, string>>(values: T, column: string) => {
      const raw = get(column)
      if (!raw) return ""
      const value = enumValue(values, raw)
      if (!value) errors.push(`Invalid ${column.replace(/_/g, " ")} “${raw}”.`)
      return value ?? ""
    }
    const flag = (column: string, fallback: boolean) => {
      const value = yesNo(get(column), fallback)
      if (value === null) errors.push(`Use yes or no for ${column.replace(/_/g, " ")}.`)
      return value ?? fallback
    }

    const name = get("full_name")
    const phone = get("phone")
    const provinceRaw = get("permanent_province")
    const province = provinceRaw ? parseProvince(provinceRaw) : null
    if (provinceRaw && !province) errors.push(`Unknown province “${provinceRaw}”.`)
    const districtRaw = get("permanent_district")
    const district = districtRaw && province ? canonicalDistrict(province, districtRaw) : null
    if (districtRaw && province && !district) errors.push(`“${districtRaw}” isn't a district of that province.`)

    const profile: GuardianProfileInput = {
      guardianCode: get("guardian_code"),
      fullName: name,
      gender: choice(Gender, "gender"),
      phone,
      alternatePhone: get("alternate_phone"),
      email: get("email"),
      occupation: get("occupation"),
      workplace: get("workplace"),
      preferredContactMethod: choice(ContactMethod, "preferred_contact_method"),
      preferredLanguage: get("preferred_language"),
      permanentAddress: {
        province: province ?? "", district: district ?? "", municipality: get("permanent_municipality"),
        wardNumber: get("permanent_ward"), tole: get("permanent_tole"),
      },
      sameAsPermanent: true,
      temporaryAddress: {},
    }

    // Which guardian: an explicit guardian ID, else exact name + phone.
    let target: Target = { kind: "new" }
    let sameAsLine: number | null = null
    const code = get("guardian_code")
    const codeMatch = code ? byCode.find((g) => g.guardianCode?.toLowerCase() === code.toLowerCase()) : undefined
    if (codeMatch) {
      if (codeMatch.archivedAt) errors.push(`Guardian ${codeMatch.guardianCode} is archived; restore them first.`)
      target = { kind: "existing", id: codeMatch.id, label: `${codeMatch.fullName} (${codeMatch.guardianCode})` }
      if (name && name.toLowerCase() !== codeMatch.fullName.toLowerCase()) {
        warnings.push(`Guardian ID ${codeMatch.guardianCode} belongs to ${codeMatch.fullName}; their saved details are kept.`)
      }
    } else {
      const nameMatch = byPhone.find((g) => g.phone === phone && g.fullName.toLowerCase() === name.toLowerCase())
      if (nameMatch) {
        if (nameMatch.archivedAt) errors.push(`Matches archived guardian ${nameMatch.guardianCode}; restore them first.`)
        target = { kind: "existing", id: nameMatch.id, label: `${nameMatch.fullName} (${nameMatch.guardianCode})` }
      } else {
        const parsed = guardianProfileSchema.safeParse(profile)
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            errors.push(issue.message.includes("Invalid option") ? `Invalid value for ${String(issue.path.at(-1))}.` : issue.message)
          }
        }
        const samePhone = byPhone.find((g) => g.phone === phone)
        if (samePhone) warnings.push(`Phone also used by ${samePhone.fullName} (${samePhone.guardianCode}); a separate guardian will be created.`)
        const k = key(name, phone)
        if (name && phone) {
          if (firstLineFor.has(k)) sameAsLine = firstLineFor.get(k)!
          else firstLineFor.set(k, line)
        }
      }
    }

    // The student link, if any.
    const admissionNumber = get("student_admission_number") || null
    let link: StudentLinkInput | null = null
    if (admissionNumber) {
      const student = students.find((s) => s.admissionNumber.toLowerCase() === admissionNumber.toLowerCase())
      const relationship = choice(GuardianRelationship, "relationship")
      if (!student) errors.push(`No student with admission number “${admissionNumber}”.`)
      else if (student.archivedAt) errors.push(`Student ${student.admissionNumber} is archived.`)
      if (!get("relationship")) errors.push("Give the relationship to the student.")
      const isPrimary = flag("is_primary", false)
      link = {
        studentId: student?.id ?? "",
        relationship: relationship || "OTHER",
        isPrimary,
        isEmergencyContact: flag("is_emergency_contact", true),
        canPickupStudent: flag("can_pickup", false),
        canAccessStudentPortalData: flag("portal_access", false),
        receivesBillingNotifications: flag("fee_notices", false),
        receivesAcademicNotifications: true,
        receivesAttendanceNotifications: true,
        receivesGeneralAnnouncements: true,
        notes: "",
      }
      if (student) {
        const guardianKey = target.kind === "existing" ? target.id : `line:${sameAsLine ?? line}`
        const pair = `${guardianKey}|${student.id}`
        if (target.kind === "existing" && existingLinks.some((l) => l.guardianId === target.id && l.studentId === student.id)) {
          errors.push("This guardian is already linked to that student.")
        } else if (pairs.has(pair)) {
          errors.push(`Same guardian and student as line ${pairs.get(pair)}.`)
        } else pairs.set(pair, line)
        if (isPrimary) {
          if (primaryInFile.has(student.id)) errors.push(`Line ${primaryInFile.get(student.id)} already makes someone primary for this student.`)
          else {
            primaryInFile.set(student.id, line)
            if (primaryTaken.has(student.id)) warnings.push("Replaces the student's current primary contact.")
          }
        }
      }
    } else if (target.kind === "existing") {
      errors.push("This guardian already exists; give a student admission number to link, or remove the row.")
    }

    return { line, name: name || "(no name)", admissionNumber, profile, link, target, sameAsLine, errors: [...new Set(errors)], warnings }
  })

  return { rows, unknown: headers.filter((h) => h && !KNOWN.has(h)) }
}

function describe(row: ParsedRow) {
  const action =
    row.target.kind === "existing" ? `Link to ${row.target.label}` : row.sameAsLine ? `Same new guardian as line ${row.sameAsLine}` : "New guardian"
  return row.link ? action : `${action} (no student)`
}

const toResult = (r: ParsedRow): GuardianImportRow => ({
  line: r.line, name: r.name, admissionNumber: r.admissionNumber, placement: describe(r), errors: r.errors, warnings: r.warnings,
})

export async function previewGuardianImport(ctx: Ctx, raw: unknown) {
  const { csv, firstLine } = requestSchema.parse(raw)
  const { rows, unknown } = await validate(ctx, csv, firstLine)
  return { rows: rows.map(toResult), columns: unknown }
}

// Re-validates on the server and applies each valid row in its own
// transaction through the same services as the forms. A guardian created by
// an earlier row is found again by name + phone, so a guardian with several
// children is created once. A failed row never blocks the others.
export async function commitGuardianImport(ctx: Ctx, raw: unknown) {
  const { csv, firstLine } = requestSchema.parse(raw)
  const { rows } = await validate(ctx, csv, firstLine)
  const results: (GuardianImportRow & { created: boolean })[] = []
  for (const row of rows) {
    if (row.errors.length) {
      results.push({ ...toResult(row), created: false })
      continue
    }
    try {
      let guardianId = row.target.kind === "existing" ? row.target.id : null
      if (!guardianId && row.sameAsLine) {
        const earlier = await prisma.guardian.findFirst({
          where: {
            organizationId: ctx.organization.id,
            phone: row.profile.phone,
            fullName: { equals: row.profile.fullName, mode: "insensitive" },
          },
          select: { id: true },
        })
        guardianId = earlier?.id ?? null
      }
      let placement = describe(row)
      if (guardianId) {
        await linkStudents(ctx, guardianId, { links: [row.link] })
      } else {
        const created = await createGuardian(ctx, { profile: row.profile, links: row.link ? [row.link] : [] })
        placement = `Created ${created.guardianCode}`
      }
      // The reference column keeps the student's admission number.
      results.push({ ...toResult(row), placement, created: true })
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
