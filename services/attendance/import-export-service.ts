import "server-only"

import { z } from "zod"

import {
  ATTENDANCE_STATUS_LABELS,
  atLocalTime,
  localDate,
  scopeKey,
  SESSION_TYPE_LABELS,
  studentStatuses,
} from "@/features/attendance/constants"
import type { EmployeeFilters, RecordFilters } from "@/features/attendance/filters"
import { ATTENDANCE_IMPORT_COLUMNS, ATTENDANCE_IMPORT_MAX_ROWS, parseStatusWord } from "@/features/attendance/import-template"
import { fullName } from "@/features/students/constants"
import type { AuthContext } from "@/lib/authorization/context"
import { AppError, ValidationError } from "@/lib/authorization/errors"
import { csvLine, normalizeHeader, parseCsv } from "@/lib/csv"
import type { AttendanceStatus } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { toDate } from "@/lib/validation"
import { listEmployeeRecords } from "@/services/attendance/employee-service"
import { getPolicy, nonWorkingDays, type Policy } from "@/services/attendance/policy-service"
import { listRecords } from "@/services/attendance/record-query"
import { resolveTarget } from "@/services/attendance/session-service"
import { audit } from "@/services/audit/audit-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

const MAX_EXPORT = 20_000

// ------------------------------------------------------------------ export

// Student records with the table's filters (and the caller's scope). Internal
// remarks and who marked each record stay out of exports.
export async function exportRecordsCsv(ctx: Ctx, filters: RecordFilters) {
  const lines = [
    csvLine(["Date", "Register", "Slot / period", "Class", "Section", "Subject", "Admission number", "Roll number", "Student", "Status", "Check-in", "Late minutes", "Reason", "Corrected", "Register status"]),
  ]
  let count = 0
  for (let page = 1; count < MAX_EXPORT; page++) {
    const { rows, total } = await listRecords(ctx, { ...filters, page, pageSize: 100 })
    for (const r of rows) {
      lines.push(
        csvLine([
          r.date, SESSION_TYPE_LABELS[r.type], r.slotLabel, r.className, r.sectionName, r.subjectName, r.admissionNumber,
          r.rollNumber, r.studentName, ATTENDANCE_STATUS_LABELS[r.status], r.checkIn, r.lateMinutes, r.reason,
          r.corrected ? "Yes" : "No", r.sessionStatus,
        ])
      )
    }
    count += rows.length
    if (count >= total || rows.length === 0) break
  }
  return { csv: lines.join(""), count }
}

export async function exportEmployeeCsv(ctx: Ctx, filters: EmployeeFilters) {
  const lines = [csvLine(["Date", "Type", "Employee ID", "Name", "Status", "Check-in", "Check-out", "Late minutes", "Reason", "Source", "Corrected"])]
  let count = 0
  for (let page = 1; count < MAX_EXPORT; page++) {
    const { rows, total } = await listEmployeeRecords(ctx, { ...filters, page, pageSize: 100 })
    for (const r of rows) {
      lines.push(
        csvLine([
          r.date, r.type === "TEACHER" ? "Teacher" : "Staff", r.employeeId, r.name, ATTENDANCE_STATUS_LABELS[r.status],
          r.checkIn, r.checkOut, r.lateMinutes, r.reason, r.source.toLowerCase(), r.corrected ? "Yes" : "No",
        ])
      )
    }
    count += rows.length
    if (count >= total || rows.length === 0) break
  }
  return { csv: lines.join(""), count }
}

// ------------------------------------------------------------------ import

export type AttendanceImportRow = {
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

const KNOWN = new Set(ATTENDANCE_IMPORT_COLUMNS.map((c) => c.key))

type Planned = {
  studentId: string
  enrollmentId: string
  enrollmentSectionId: string | null
  scope: {
    academicYearId: string
    date: string
    classId: string
    sectionId: string | null
    sessionType: "DAILY" | "PERIOD"
    subjectOfferingId: string | null
    slot: number
  }
  status: AttendanceStatus
  checkInTime: string | null
  lateMinutes: number | null
  reason: string | null
}

async function validate(ctx: Ctx, csv: string, firstLine: number, policy: Policy) {
  const organizationId = ctx.organization.id
  const table = parseCsv(csv)
  if (table.length < 2) throw new ValidationError({ file: ["The file has no data rows."] })
  const headers = table[0].map(normalizeHeader)
  const missing = ATTENDANCE_IMPORT_COLUMNS.filter((c) => c.required && !headers.includes(c.key)).map((c) => c.key)
  if (missing.length) throw new ValidationError({ file: [`Missing required columns: ${missing.join(", ")}.`] })
  if (table.length - 1 > ATTENDANCE_IMPORT_MAX_ROWS) throw new ValidationError({ file: [`Import at most ${ATTENDANCE_IMPORT_MAX_ROWS} rows at a time.`] })

  const cell = (cells: string[], key: string) => {
    const index = headers.indexOf(key)
    return index === -1 ? "" : (cells[index] ?? "").trim()
  }
  const admissionNumbers = [...new Set(table.slice(1).map((c) => cell(c, "admission_number")).filter(Boolean))]
  const subjectCodes = [...new Set(table.slice(1).map((c) => cell(c, "subject_code").toUpperCase()).filter(Boolean))]
  const [students, subjects] = await Promise.all([
    prisma.student.findMany({
      where: { organizationId, admissionNumber: { in: admissionNumbers } },
      select: {
        id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, archivedAt: true,
        enrollments: {
          where: { status: { notIn: ["CANCELLED", "ON_HOLD"] } },
          select: {
            id: true, academicYearId: true, classId: true, sectionId: true, status: true, enrollmentDate: true, endedOn: true,
            class: { select: { name: true, educationLevelId: true } },
            section: { select: { name: true } },
          },
        },
      },
    }),
    prisma.subject.findMany({ where: { organizationId, code: { in: subjectCodes } }, select: { id: true, code: true, name: true } }),
  ])
  const studentBy = new Map(students.map((s) => [s.admissionNumber.toLowerCase(), s]))
  const subjectBy = new Map(subjects.map((s) => [s.code, s]))
  const allowed = new Set(studentStatuses(policy))
  const today = localDate()
  const seen = new Map<string, number>()
  const closedCache = new Map<string, string | undefined>()

  const rows: (AttendanceImportRow & { plan: Planned | null })[] = []
  for (const [i, cells] of table.slice(1).entries()) {
    const line = firstLine + i
    const errors: string[] = []
    const warnings: string[] = []
    const date = cell(cells, "date")
    const admission = cell(cells, "admission_number")
    const student = studentBy.get(admission.toLowerCase())
    let plan: Planned | null = null
    let placement: string | null = null

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) errors.push("Date must be YYYY-MM-DD.")
    else if (date > today) errors.push("The date is in the future.")
    if (!student) errors.push(`No student with admission number "${admission}".`)
    else if (student.archivedAt) errors.push("The student is archived.")
    const status = parseStatusWord(cell(cells, "status")) as AttendanceStatus | null
    if (!status) errors.push(`Unknown status "${cell(cells, "status")}".`)
    else if (!allowed.has(status)) errors.push(`${ATTENDANCE_STATUS_LABELS[status]} isn't used for students here.`)
    const code = cell(cells, "subject_code").toUpperCase()
    const subject = code ? subjectBy.get(code) : null
    if (code && !subject) errors.push(`No subject with code "${code}".`)
    const slotRaw = cell(cells, "period")
    const slot = slotRaw ? Number(slotRaw) : 1
    if (!Number.isInteger(slot) || slot < 1 || slot > 20) errors.push("Period must be a whole number from 1 to 20.")
    const checkIn = cell(cells, "check_in")
    if (checkIn && !/^([01]\d|2[0-3]):[0-5]\d$/.test(checkIn)) errors.push("Check-in must be HH:MM.")
    const lateRaw = cell(cells, "late_minutes")
    const late = lateRaw ? Number(lateRaw) : null
    if (lateRaw && (!Number.isInteger(late) || late! < 0 || late! > 1440)) errors.push("Late minutes must be a whole number.")
    const reason = cell(cells, "reason").slice(0, 200) || null

    if (student && errors.length === 0) {
      const day = toDate(date)
      const enrollment = student.enrollments
        .filter((e) => e.enrollmentDate <= day && (e.status === "ACTIVE" || (e.endedOn && e.endedOn >= day)))
        .sort((a, b) => b.enrollmentDate.getTime() - a.enrollmentDate.getTime())[0]
      if (!enrollment) errors.push(`The student wasn't placed in any class on ${date}.`)
      else {
        placement = [enrollment.class.name, enrollment.section?.name].filter(Boolean).join(" ")
        let offeringId: string | null = null
        if (subject) {
          const offering = await prisma.subjectOffering.findFirst({
            where: { organizationId, academicYearId: enrollment.academicYearId, classId: enrollment.classId, subjectId: subject.id },
            select: { id: true, sections: { select: { sectionId: true } } },
          })
          if (!offering) errors.push(`${placement} doesn't study ${subject.name} that year.`)
          else if (offering.sections.length && !offering.sections.some((s) => s.sectionId === enrollment.sectionId)) {
            errors.push(`${subject.name} isn't taught in the student's section.`)
          } else offeringId = offering.id
          if (!policy.periodEnabled) errors.push("Period attendance is turned off in the attendance policy.")
        } else {
          if (!policy.dailyEnabled) errors.push("Daily attendance is turned off in the attendance policy.")
          if (slot > policy.dailySlots) errors.push("This organisation keeps one daily register; leave the period blank.")
        }
        const cacheKey = `${date}:${enrollment.class.educationLevelId}`
        if (!closedCache.has(cacheKey)) {
          closedCache.set(
            cacheKey,
            (await nonWorkingDays(ctx, { from: date, to: date }, { audience: "students", educationLevelId: enrollment.class.educationLevelId, policy })).get(date)
          )
        }
        const closed = closedCache.get(cacheKey)
        if (closed && !policy.allowOnNonWorkingDays) errors.push(`${date} is a non-working day (${closed}).`)

        if (errors.length === 0) {
          const key = scopeKey(subject ? "PERIOD" : "DAILY", slot, offeringId)
          const dup = `${student.id}:${date}:${key}`
          if (seen.has(dup)) errors.push(`Same student, date and register as line ${seen.get(dup)}.`)
          else seen.set(dup, line)
          const existing = await prisma.studentAttendance.findFirst({
            where: { organizationId, studentId: student.id, date: day, scopeKey: key },
            select: { status: true },
          })
          if (existing) errors.push(`Already recorded as ${ATTENDANCE_STATUS_LABELS[existing.status].toLowerCase()}; use a correction to change it.`)
          plan = {
            studentId: student.id,
            enrollmentId: enrollment.id,
            enrollmentSectionId: enrollment.sectionId,
            scope: {
              academicYearId: enrollment.academicYearId,
              date,
              classId: enrollment.classId,
              sectionId: enrollment.sectionId,
              sessionType: subject ? "PERIOD" : "DAILY",
              subjectOfferingId: offeringId,
              slot,
            },
            status: status!,
            checkInTime: checkIn || null,
            lateMinutes: status === "LATE" ? late : null,
            reason,
          }
        }
      }
    }
    rows.push({
      line,
      name: student ? fullName(student) : admission || "(no admission number)",
      admissionNumber: admission || null,
      placement: [date, placement, subject?.name].filter(Boolean).join(" · ") || null,
      errors,
      warnings,
      plan: errors.length ? null : plan,
    })
  }
  return { rows, unknown: headers.filter((h) => h && !KNOWN.has(h)) }
}

const strip = (row: AttendanceImportRow & { plan: Planned | null }): AttendanceImportRow => ({
  line: row.line, name: row.name, admissionNumber: row.admissionNumber, placement: row.placement, errors: row.errors, warnings: row.warnings,
})

export async function previewAttendanceImport(ctx: Ctx, raw: unknown) {
  const { csv, firstLine } = requestSchema.parse(raw)
  const { rows, unknown } = await validate(ctx, csv, firstLine, await getPolicy(ctx))
  return { rows: rows.map(strip), columns: unknown }
}

// Each row is its own transaction. Marks go into the student's section
// register for that date (created as submitted, "imported"), never into a
// draft someone is taking or a locked register, and never over an existing
// mark.
export async function commitAttendanceImport(ctx: Ctx, raw: unknown) {
  const { csv, firstLine } = requestSchema.parse(raw)
  const policy = await getPolicy(ctx)
  const { rows } = await validate(ctx, csv, firstLine, policy)
  const results: (AttendanceImportRow & { created: boolean })[] = []
  let created = 0
  for (const row of rows) {
    if (!row.plan) {
      results.push({ ...strip(row), created: false })
      continue
    }
    const plan = row.plan
    try {
      await prisma.$transaction(async (tx) => {
        const t = await resolveTarget(tx, ctx, plan.scope, policy, true)
        let session = await tx.attendanceSession.findFirst({
          where: { organizationId: ctx.organization.id, classId: plan.scope.classId, sectionId: plan.scope.sectionId, date: toDate(plan.scope.date), scopeKey: t.scopeKey },
        })
        if (session?.status === "DRAFT") throw new AppError("CONFLICT", "This register is being taken in the app (draft); finish it there.", 409)
        if (session?.status === "LOCKED") throw new AppError("CONFLICT", "This register is locked.", 409)
        if (!session) {
          session = await tx.attendanceSession.create({
            data: {
              organizationId: ctx.organization.id,
              academicYearId: plan.scope.academicYearId,
              sessionType: plan.scope.sessionType,
              date: toDate(plan.scope.date),
              slot: plan.scope.slot,
              scopeKey: t.scopeKey,
              classId: plan.scope.classId,
              sectionId: plan.scope.sectionId,
              subjectOfferingId: plan.scope.subjectOfferingId,
              status: "SUBMITTED",
              takenById: ctx.user.id,
              submittedById: ctx.user.id,
              submittedAt: new Date(),
              notifiedAt: new Date(),
              notes: "Imported from a CSV file",
            },
          })
        }
        await tx.studentAttendance.create({
          data: {
            organizationId: ctx.organization.id,
            sessionId: session.id,
            studentId: plan.studentId,
            enrollmentId: plan.enrollmentId,
            academicYearId: plan.scope.academicYearId,
            classId: plan.scope.classId,
            sectionId: plan.enrollmentSectionId,
            subjectOfferingId: plan.scope.subjectOfferingId,
            sessionType: plan.scope.sessionType,
            date: toDate(plan.scope.date),
            scopeKey: t.scopeKey,
            status: plan.status,
            checkInAt: plan.checkInTime && plan.status !== "ABSENT" ? atLocalTime(plan.scope.date, plan.checkInTime) : null,
            lateMinutes: plan.lateMinutes,
            reason: plan.reason,
            markedById: ctx.user.id,
          },
        })
      })
      created++
      results.push({ ...strip(row), created: true })
    } catch (error) {
      const messages = isUniqueViolation(error)
        ? ["Already recorded (possibly by someone else just now)."]
        : error instanceof ValidationError
          ? Object.values(error.fieldErrors).flat().filter((m): m is string => !!m)
          : error instanceof AppError
            ? [error.message]
            : ["Unexpected error; this row wasn't imported."]
      if (!(error instanceof AppError) && !isUniqueViolation(error)) console.error(error)
      results.push({ ...strip(row), errors: messages, created: false })
    }
  }
  if (created > 0) {
    await audit(prisma, ctx, {
      action: "attendance.import",
      entityType: "student_attendance",
      summary: `Imported ${created} attendance mark${created === 1 ? "" : "s"} from a CSV file`,
      metadata: { created, failed: results.length - created },
    })
  }
  return { created, failed: results.length - created, rows: results }
}
