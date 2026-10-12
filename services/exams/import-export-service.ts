import "server-only"

import { z } from "zod"

import { formatGpa, formatMarks, formatPercent, toHundredths } from "@/features/exams/calculation"
import { EDITABLE_SHEET_STATUSES, EXAM_STATUS_LABELS, markCellText, parseMarkCell, RESULT_STATUS_LABELS } from "@/features/exams/constants"
import type { ExamFilters, ResultFilters } from "@/features/exams/filters"
import { fullName } from "@/features/students/constants"
import { MARKS_IMPORT_COLUMNS, MARKS_IMPORT_MAX_ROWS } from "@/features/exams/import-template"
import type { AuthContext } from "@/lib/authorization/context"
import { AppError, ConflictError, ValidationError } from "@/lib/authorization/errors"
import { csvLine, normalizeHeader, parseCsv } from "@/lib/csv"
import type { MarkStatus } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"
import { mayEnterMarks } from "@/services/exams/access-service"
import { eligibleEnrollments, rollOrder } from "@/services/exams/eligibility"
import { findExam } from "@/services/exams/examination-service"
import { listExaminations } from "@/services/exams/examination-query"
import { listExamResults } from "@/services/exams/result-service"
import { loadSubjects, subjectTakenBy } from "@/services/exams/rules-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

const MAX_EXPORT = 20_000

// ------------------------------------------------------------------ export

export async function exportExaminationsCsv(ctx: Ctx, filters: ExamFilters) {
  const lines = [csvLine(["Examination", "Code", "Type", "Academic year", "Term", "Classes", "Start", "End", "Status", "Students", "Marks sheets", "Approved sheets", "Published version"])]
  let count = 0
  for (let page = 1; count < MAX_EXPORT; page++) {
    const { rows, total } = await listExaminations(ctx, { ...filters, page, pageSize: 100 })
    for (const r of rows) {
      lines.push(
        csvLine([r.name, r.code, r.typeName, r.yearName, r.term, r.classes.join("; "), r.startDate, r.endDate, EXAM_STATUS_LABELS[r.status], r.students, r.sheets.expected, r.sheets.APPROVED, r.publishedVersion])
      )
    }
    count += rows.length
    if (count >= total || rows.length === 0) break
  }
  return { csv: lines.join(""), count }
}

// Results with the table's filters and the caller's scope: published
// results, or (reviewers only) the provisional calculation, labelled as such.
// Internal notes never appear; withheld results carry no marks.
export async function exportResultsCsv(ctx: Ctx, examinationId: string, filters: ResultFilters) {
  const first = await listExamResults(ctx, examinationId, { ...filters, page: 1, pageSize: 100 })
  const decimals = first.rules?.policy.percentageDecimals ?? 2
  const gpaDecimals = first.rules?.policy.gpaDecimals ?? 2
  const subjects = first.subjects
  const lines = [
    csvLine([
      "Admission number", "Student", "Class", "Section", "Roll number",
      ...subjects.flatMap((s) => [`${s.name} (${s.code}) marks`, `${s.name} grade`]),
      "Total", "Full marks", "Percentage", "Grade", "GPA", "Rank", "Result",
    ]),
  ]
  let count = 0
  let page = first
  for (let p = 1; count < MAX_EXPORT; p++) {
    if (p > 1) page = await listExamResults(ctx, examinationId, { ...filters, page: p, pageSize: 100 })
    for (const r of page.rows) {
      const withheld = r.status === "WITHHELD"
      lines.push(
        csvLine([
          r.admissionNumber, r.name, r.className, r.sectionName, r.rollNumber,
          ...subjects.flatMap((s) => {
            const x = r.subjects.find((y) => y.id === s.id)
            if (!x || withheld) return ["", ""]
            return [x.obtained === null ? RESULT_STATUS_LABELS[x.status as keyof typeof RESULT_STATUS_LABELS] : formatMarks(x.obtained), x.grade]
          }),
          withheld ? "" : formatMarks(r.totalObtained), withheld ? "" : formatMarks(r.totalMaximum),
          withheld || r.percentage === null ? "" : formatPercent(r.percentage, decimals),
          withheld ? "" : r.grade, withheld || r.gpa === null ? "" : formatGpa(r.gpa, gpaDecimals), r.rank, RESULT_STATUS_LABELS[r.status],
        ])
      )
    }
    count += page.rows.length
    if (count >= page.total || page.rows.length === 0) break
  }
  return { csv: lines.join(""), count, view: first.view, version: first.publication?.version ?? null, examName: first.exam.name }
}

// A marks template for the sheets the caller may fill: one row per student
// per component, current marks included.
export async function marksTemplateCsv(ctx: Ctx, examinationId: string, examinationSubjectId?: string) {
  const organizationId = ctx.organization.id
  const exam = await findExam(prisma, ctx, examinationId)
  const subjects = (await loadSubjects(prisma, organizationId, examinationId)).filter((s) => !examinationSubjectId || s.id === examinationSubjectId)
  const enrollments = await eligibleEnrollments(prisma, organizationId, exam, { classIds: [...new Set(subjects.map((s) => s.classId))] })
  const marks = await prisma.studentMark.findMany({ where: { organizationId, examinationId }, select: { studentId: true, componentId: true, status: true, marksObtained: true } })
  const markBy = new Map(marks.map((m) => [`${m.studentId}:${m.componentId}`, { status: m.status, marks: toHundredths(m.marksObtained) }]))
  const lines = [csvLine([...MARKS_IMPORT_COLUMNS.map((c) => c.key), "class", "section", "full_marks"])]
  const access = new Map<string, boolean>()
  const students = [...enrollments.values()].sort((a, b) => a.class.name.localeCompare(b.class.name) || (a.section?.name ?? "").localeCompare(b.section?.name ?? "") || rollOrder(a.rollNumber, b.rollNumber))
  for (const s of subjects) {
    for (const e of students) {
      if (!subjectTakenBy(s, e.classId, e.sectionId)) continue
      const key = `${s.id}:${e.sectionId ?? ""}`
      if (!access.has(key)) {
        access.set(key, await mayEnterMarks(ctx, { academicYearId: exam.academicYearId, classId: s.classId, sectionId: e.sectionId, subjectId: s.subjectOffering.subjectId }))
      }
      if (!access.get(key)) continue
      for (const c of s.components) {
        lines.push(
          csvLine([
            e.student.admissionNumber, s.subjectOffering.code ?? s.subjectOffering.subject.code, c.name, markCellText(markBy.get(`${e.studentId}:${c.id}`)),
            fullName(e.student), e.class.name, e.section?.name ?? "", c.maximumMarks.toString(),
          ])
        )
      }
      if (lines.length > 50_000) break
    }
  }
  return { csv: lines.join(""), exam }
}

// ------------------------------------------------------------------ import

export type MarksImportRow = {
  line: number
  name: string
  admissionNumber: string | null
  placement: string | null
  errors: string[]
  warnings: string[]
}

const requestSchema = z.object({
  examinationId: z.uuid(),
  csv: z.string().max(5_000_000, "The file is too large."),
  firstLine: z.number().int().min(2).default(2),
})

type Plan = { sheetKey: string; examinationSubjectId: string; sectionId: string | null; classId: string; studentId: string; enrollmentId: string; componentId: string; status: MarkStatus; marks: number | null }

async function validate(ctx: Ctx, raw: unknown) {
  const { examinationId, csv, firstLine } = requestSchema.parse(raw)
  const organizationId = ctx.organization.id
  const exam = await findExam(prisma, ctx, examinationId)
  if (exam.status !== "SCHEDULED" && exam.status !== "REVISION") throw new ConflictError(`${exam.name} isn't open for marks entry.`)
  const table = parseCsv(csv)
  if (table.length < 2) throw new ValidationError({ file: ["The file has no data rows."] })
  if (table.length - 1 > MARKS_IMPORT_MAX_ROWS) throw new ValidationError({ file: [`Import at most ${MARKS_IMPORT_MAX_ROWS} rows at a time.`] })
  const headers = table[0].map(normalizeHeader)
  const missing = MARKS_IMPORT_COLUMNS.filter((c) => c.required && !headers.includes(c.key)).map((c) => c.key)
  if (missing.length) throw new ValidationError({ file: [`Missing columns: ${missing.join(", ")}.`] })
  const col = (row: string[], key: string) => (row[headers.indexOf(key)] ?? "").trim()

  const subjects = await loadSubjects(prisma, organizationId, examinationId)
  const admissionNumbers = [...new Set(table.slice(1).map((r) => col(r, "admission_number")).filter(Boolean))]
  const students = await prisma.student.findMany({ where: { organizationId, admissionNumber: { in: admissionNumbers } }, select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true } })
  const studentBy = new Map(students.map((s) => [s.admissionNumber, s]))
  const enrollments = await eligibleEnrollments(prisma, organizationId, exam, { classIds: [...new Set(subjects.map((s) => s.classId))], studentIds: students.map((s) => s.id) })
  const sheets = await prisma.marksSheet.findMany({ where: { organizationId, examinationId } })
  const existing = await prisma.studentMark.findMany({ where: { organizationId, examinationId, studentId: { in: students.map((s) => s.id) } }, select: { studentId: true, componentId: true, status: true, marksObtained: true } })
  const existingBy = new Map(existing.map((m) => [`${m.studentId}:${m.componentId}`, m]))
  const access = new Map<string, boolean>()
  const seen = new Set<string>()

  const rows: (MarksImportRow & { plan: Plan | null })[] = []
  for (let i = 1; i < table.length; i++) {
    const r = table[i]
    const row: MarksImportRow & { plan: Plan | null } = { line: firstLine + i - 1, name: col(r, "student_name") || "—", admissionNumber: col(r, "admission_number") || null, placement: null, errors: [], warnings: [], plan: null }
    rows.push(row)
    const student = row.admissionNumber ? studentBy.get(row.admissionNumber) : undefined
    if (!student) {
      row.errors.push(row.admissionNumber ? "No student has this admission number." : "Admission number is required.")
      continue
    }
    row.name = fullName(student)
    const enrollment = enrollments.get(student.id)
    if (!enrollment) {
      row.errors.push("This student isn't placed in any class of this examination.")
      continue
    }
    const code = col(r, "subject_code").toLowerCase()
    const subject = subjects.find((s) => s.classId === enrollment.classId && (s.subjectOffering.code ?? s.subjectOffering.subject.code).toLowerCase() === code)
    if (!subject) {
      row.errors.push(`${enrollment.class.name} has no subject “${col(r, "subject_code")}” in this examination.`)
      continue
    }
    if (!subjectTakenBy(subject, enrollment.classId, enrollment.sectionId)) {
      row.errors.push(`${subject.subjectOffering.subject.name} isn't taught in this student's section.`)
      continue
    }
    const component = subject.components.find((c) => c.name.toLowerCase() === col(r, "component").toLowerCase())
    row.placement = [enrollment.class.name, enrollment.section?.name, subject.subjectOffering.subject.name, component?.name ?? col(r, "component")].filter(Boolean).join(" · ")
    if (!component) {
      row.errors.push(`Unknown component; use one of: ${subject.components.map((c) => c.name).join(", ")}.`)
      continue
    }
    const cell = parseMarkCell(col(r, "marks"), toHundredths(component.maximumMarks))
    if (cell.kind === "empty") {
      row.errors.push("Enter marks or a status code (AB, EX, INC, WH).")
      continue
    }
    if (cell.kind === "error") {
      row.errors.push(cell.message)
      continue
    }
    const dup = `${student.id}:${component.id}`
    if (seen.has(dup)) {
      row.errors.push("This student and component appear more than once in the file.")
      continue
    }
    seen.add(dup)
    const sheetKey = `${subject.id}:${enrollment.sectionId ?? ""}`
    if (!access.has(sheetKey)) {
      access.set(sheetKey, await mayEnterMarks(ctx, { academicYearId: exam.academicYearId, classId: subject.classId, sectionId: enrollment.sectionId, subjectId: subject.subjectOffering.subjectId }))
    }
    if (!access.get(sheetKey)) {
      row.errors.push("You can't enter marks for this subject and section.")
      continue
    }
    const sheet = sheets.find((s) => s.examinationSubjectId === subject.id && s.sectionId === enrollment.sectionId)
    if (sheet && !EDITABLE_SHEET_STATUSES.includes(sheet.status)) {
      row.errors.push("These marks are already submitted; a reviewer must return them first.")
      continue
    }
    const current = existingBy.get(dup)
    if (current) {
      if (current.status === cell.status && toHundredths(current.marksObtained) === cell.marks) row.warnings.push("Already entered with the same value; skipped.")
      else row.errors.push(`Already has ${markCellText({ status: current.status, marks: toHundredths(current.marksObtained) })}; change it in the marks grid instead.`)
      continue
    }
    row.plan = { sheetKey, examinationSubjectId: subject.id, sectionId: enrollment.sectionId, classId: subject.classId, studentId: student.id, enrollmentId: enrollment.id, componentId: component.id, status: cell.status, marks: cell.marks }
  }
  return { exam, rows }
}

const strip = (row: MarksImportRow & { plan: Plan | null }): MarksImportRow => ({
  line: row.line, name: row.name, admissionNumber: row.admissionNumber, placement: row.placement, errors: row.errors, warnings: row.warnings,
})

export async function previewMarksImport(ctx: Ctx, raw: unknown) {
  const { rows } = await validate(ctx, raw)
  return { rows: rows.map(strip), columns: MARKS_IMPORT_COLUMNS.map((c) => c.key) }
}

// Writes valid rows into draft (or returned) sheets, one transaction per
// sheet: a sheet's rows are all written or none are.
export async function commitMarksImport(ctx: Ctx, raw: unknown) {
  const { exam, rows } = await validate(ctx, raw)
  const organizationId = ctx.organization.id
  const bySheet = new Map<string, Plan[]>()
  for (const row of rows) if (row.plan) bySheet.set(row.plan.sheetKey, [...(bySheet.get(row.plan.sheetKey) ?? []), row.plan])
  const failed = new Map<string, string>()
  for (const [key, plans] of bySheet) {
    const first = plans[0]
    try {
      await prisma.$transaction(async (tx) => {
        let sheet = await tx.marksSheet.findFirst({ where: { organizationId, examinationSubjectId: first.examinationSubjectId, sectionId: first.sectionId } })
        if (sheet && !EDITABLE_SHEET_STATUSES.includes(sheet.status)) throw new ConflictError("These marks were submitted in the meantime.")
        if (!sheet) {
          sheet = await tx.marksSheet.create({
            data: { organizationId, examinationId: exam.id, examinationSubjectId: first.examinationSubjectId, classId: first.classId, sectionId: first.sectionId, createdById: ctx.user.id },
          })
        }
        await tx.studentMark.createMany({
          data: plans.map((p) => ({
            organizationId, examinationId: exam.id, examinationSubjectId: p.examinationSubjectId, componentId: p.componentId, marksSheetId: sheet.id,
            studentId: p.studentId, enrollmentId: p.enrollmentId, status: p.status, marksObtained: p.marks === null ? null : p.marks / 100, enteredById: ctx.user.id,
          })),
        })
        if (sheet.firstSubmittedAt) {
          await tx.studentMarkHistory.createMany({
            data: plans.map((p) => ({
              organizationId, examinationId: exam.id, componentId: p.componentId, studentId: p.studentId,
              toStatus: p.status, toMarks: p.marks === null ? null : p.marks / 100, reason: "Imported from a CSV file", changedById: ctx.user.id,
            })),
          })
        }
        await tx.marksSheet.update({ where: { id: sheet.id }, data: { updatedAt: new Date() } })
      })
    } catch (error) {
      failed.set(key, error instanceof AppError ? error.message : "Someone else changed these marks at the same time. Try again.")
      if (!(error instanceof AppError)) console.error(error)
    }
  }
  const results = rows.map((row) => {
    const problem = row.plan ? failed.get(row.plan.sheetKey) : undefined
    return { ...strip(row), errors: problem ? [...row.errors, problem] : row.errors, created: !!row.plan && !problem }
  })
  const created = results.filter((r) => r.created).length
  if (created) {
    await audit(prisma, ctx, {
      action: "exam.marks.import", entityType: "examination", entityId: exam.id,
      summary: `Imported ${created} mark${created === 1 ? "" : "s"} into ${exam.name} (as drafts)`,
      metadata: { sheets: bySheet.size - failed.size, refused: results.length - created },
    })
  }
  return { rows: results }
}
