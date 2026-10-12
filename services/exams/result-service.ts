import "server-only"

import { summarize } from "@/features/attendance/calculation"
import {
  assignRanks,
  calculateStudent,
  countStatuses,
  passRate,
  toHundredths,
  toPercentUnits,
  validateConfiguration,
  type MarkInput,
  type RulesSnapshot,
  type StudentCalculation,
  type SubjectResult,
} from "@/features/exams/calculation"
import { EXAM_STATUS_LABELS, sheetLabel } from "@/features/exams/constants"
import type { ResultFilters } from "@/features/exams/filters"
import { fullName } from "@/features/students/constants"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ForbiddenError, NotFoundError } from "@/lib/authorization/errors"
import type { Prisma, ResultStatus } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { fromDate } from "@/lib/validation"
import { countStudentStatuses } from "@/services/attendance/calculation-service"
import { getPolicy } from "@/services/attendance/policy-service"
import { canReviewMarks, canSeeAllResults, mayViewClassResults, resultScopeWhere } from "@/services/exams/access-service"
import { eligibleEnrollments, rollOrder } from "@/services/exams/eligibility"
import { findExam, sheetProgress } from "@/services/exams/examination-service"
import { examRules, loadSubjects, subjectTakenBy, toSubjectConfig } from "@/services/exams/rules-service"

// Results of an examination, always produced by features/exams/calculation
// from approved marks and the examination's rules. Published results are
// read back from their immutable publication; anything else is labelled a
// provisional preview and is visible only to reviewers.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma

// A subject row as stored in a publication's breakdown: the calculation
// plus the remark shared with the student (never the internal note).
export type PublishedSubject = SubjectResult & { remark: string | null }
export type ResultBreakdown = {
  subjects: PublishedSubject[]
  notes: string[]
  graceApplied: boolean
  rules: { policy: string; scale: string; scaleVersion: number; percentageDecimals: number; gpaDecimals: number; gpaMethod: string; rankingEnabled: boolean }
}

export type CalculatedRow = {
  studentId: string
  enrollmentId: string
  name: string
  admissionNumber: string
  rollNumber: string | null
  classId: string
  className: string
  sectionId: string | null
  sectionName: string | null
  calculation: StudentCalculation
  rank: number | null
  remarks: Map<string, string>
}

// Calculates every eligible student of an examination. Only marks on
// APPROVED sheets count unless `includeUnapproved` (marks-entry previews):
// anything else shows as pending, never as zero.
export async function calculateExam(
  db: Db,
  ctx: Pick<AuthContext, "organization">,
  examinationId: string,
  options: { includeUnapproved?: boolean; rules?: RulesSnapshot; classId?: string; studentIds?: string[] } = {}
) {
  const organizationId = ctx.organization.id
  const exam = await findExam(db, ctx, examinationId)
  const subjects = await loadSubjects(db, organizationId, exam.id)
  const rules = options.rules ?? (await examRules(db, organizationId, exam)).rules
  const classIds = [...new Set(subjects.map((s) => s.classId))].filter((id) => !options.classId || id === options.classId)
  const [enrollments, marks, holds, remarks] = await Promise.all([
    eligibleEnrollments(db, organizationId, exam, { classIds, studentIds: options.studentIds }),
    db.studentMark.findMany({
      where: {
        organizationId, examinationId: exam.id,
        ...(options.includeUnapproved ? {} : { sheet: { status: "APPROVED" } }),
        ...(options.studentIds && { studentId: { in: options.studentIds } }),
      },
      select: { studentId: true, examinationSubjectId: true, componentId: true, status: true, marksObtained: true },
    }),
    db.resultHold.findMany({ where: { organizationId, examinationId: exam.id, releasedAt: null }, select: { studentId: true } }),
    db.markRemark.findMany({
      where: { organizationId, examinationSubject: { examinationId: exam.id }, remark: { not: null } },
      select: { studentId: true, examinationSubjectId: true, remark: true },
    }),
  ])
  const configs = new Map(subjects.map((s) => [s.id, toSubjectConfig(s)]))
  const marksBy = new Map<string, Map<string, Map<string, MarkInput>>>()
  for (const m of marks) {
    const student = marksBy.get(m.studentId) ?? new Map<string, Map<string, MarkInput>>()
    const subject = student.get(m.examinationSubjectId) ?? new Map<string, MarkInput>()
    subject.set(m.componentId, { status: m.status, marks: toHundredths(m.marksObtained) })
    student.set(m.examinationSubjectId, subject)
    marksBy.set(m.studentId, student)
  }
  const held = new Set(holds.map((h) => h.studentId))
  const remarkBy = new Map<string, Map<string, string>>()
  for (const r of remarks) {
    const map = remarkBy.get(r.studentId) ?? new Map<string, string>()
    map.set(r.examinationSubjectId, r.remark!)
    remarkBy.set(r.studentId, map)
  }

  const rows: CalculatedRow[] = [...enrollments.values()].map((e) => {
    const applicable = subjects.filter((s) => subjectTakenBy(s, e.classId, e.sectionId)).map((s) => configs.get(s.id)!)
    const calculation = calculateStudent(applicable, { marks: marksBy.get(e.studentId) ?? new Map(), held: held.has(e.studentId) }, rules)
    return {
      studentId: e.studentId,
      enrollmentId: e.id,
      name: fullName(e.student),
      admissionNumber: e.student.admissionNumber,
      rollNumber: e.rollNumber,
      classId: e.classId,
      className: e.class.name,
      sectionId: e.sectionId,
      sectionName: e.section?.name ?? null,
      calculation,
      rank: null,
      remarks: remarkBy.get(e.studentId) ?? new Map(),
    }
  })
  const ranks = assignRanks(rows.map((r) => ({ key: r.studentId, classId: r.classId, sectionId: r.sectionId, calculation: r.calculation })), rules.policy)
  for (const r of rows) r.rank = ranks.get(r.studentId) ?? null
  rows.sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }) || (a.sectionName ?? "").localeCompare(b.sectionName ?? "") || rollOrder(a.rollNumber, b.rollNumber) || a.name.localeCompare(b.name))
  return { exam, subjects, rules, rows }
}

export function toBreakdown(row: CalculatedRow, rules: RulesSnapshot): ResultBreakdown {
  return {
    subjects: row.calculation.subjects.map((s) => ({ ...s, remark: row.remarks.get(s.examinationSubjectId) ?? null })),
    notes: row.calculation.notes,
    graceApplied: row.calculation.graceApplied,
    rules: {
      policy: rules.policy.name,
      scale: rules.scale.name,
      scaleVersion: rules.scale.version,
      percentageDecimals: rules.policy.percentageDecimals,
      gpaDecimals: rules.policy.gpaDecimals,
      gpaMethod: rules.policy.gpaMethod,
      rankingEnabled: rules.policy.rankingEnabled,
    },
  }
}

// ------------------------------------------------------ pre-publication

export type PublicationCheck = Awaited<ReturnType<typeof publicationCheck>>

// Everything that must hold before results are approved or published, with
// a summary of what would be released.
export async function publicationCheck(ctx: Pick<AuthContext, "organization">, examinationId: string, db: Db = prisma) {
  const organizationId = ctx.organization.id
  const { exam, subjects, rules, rows } = await calculateExam(db, ctx, examinationId)
  const errors: string[] = []
  const warnings: string[] = []
  const issues = validateConfiguration(subjects.map(toSubjectConfig), rules)
  errors.push(...issues.errors)
  warnings.push(...issues.warnings)

  const progress = await sheetProgress(db, organizationId, exam, subjects)
  const notApproved = progress.filter((p) => p.required && p.status !== "APPROVED")
  if (notApproved.length) {
    errors.push(
      `${notApproved.length} marks sheet${notApproved.length === 1 ? " isn't" : "s aren't"} approved yet: ${notApproved
        .slice(0, 6)
        .map((p) => `${sheetLabel(p)} (${p.status === "NOT_STARTED" ? "not started" : p.status.toLowerCase()})`)
        .join("; ")}${notApproved.length > 6 ? "…" : ""}.`
    )
  }
  const counts = countStatuses(rows.map((r) => r.calculation))
  const pending = rows.filter((r) => r.calculation.status === "PENDING")
  if (pending.length) {
    errors.push(
      `${pending.length} student${pending.length === 1 ? " has" : "s have"} marks missing (${pending.slice(0, 5).map((r) => r.name).join(", ")}${pending.length > 5 ? "…" : ""}). Enter their marks, or place a result hold.`
    )
  }
  if (counts.WITHHELD) warnings.push(`${counts.WITHHELD} result${counts.WITHHELD === 1 ? " is" : "s are"} withheld and will be published as withheld, without marks.`)
  if (counts.INCOMPLETE) warnings.push(`${counts.INCOMPLETE} result${counts.INCOMPLETE === 1 ? " is" : "s are"} incomplete.`)
  if (rows.length === 0) errors.push("No students are placed in this examination's classes.")
  const gpaGaps = rules.policy.gpaMethod !== "NONE" ? rows.filter((r) => (r.calculation.status === "PASS" || r.calculation.status === "FAIL") && r.calculation.gpa === null).length : 0
  if (gpaGaps) warnings.push(`GPA couldn't be calculated for ${gpaGaps} student${gpaGaps === 1 ? "" : "s"} (see their result notes).`)

  const previous = await db.resultPublication.findFirst({ where: { organizationId, examinationId, status: "ACTIVE" }, select: { id: true, version: true } })
  let changed: number | null = null
  if (previous) {
    const old = await db.studentResult.findMany({ where: { publicationId: previous.id }, select: { studentId: true, status: true, percentage: true, grade: true, gpa: true } })
    const oldBy = new Map(old.map((o) => [o.studentId, o]))
    changed = rows.filter((r) => {
      const o = oldBy.get(r.studentId)
      return !o || o.status !== r.calculation.status || o.grade !== r.calculation.grade || (o.percentage === null ? null : toPercentUnits(o.percentage)) !== r.calculation.percentage
    }).length + old.filter((o) => !rows.some((r) => r.studentId === o.studentId)).length
  }
  return {
    exam: { id: exam.id, name: exam.name, status: exam.status, statusLabel: EXAM_STATUS_LABELS[exam.status] },
    errors,
    warnings,
    summary: { students: rows.length, counts, passRate: passRate(counts), sheets: progress.filter((p) => p.required).length, approvedSheets: progress.filter((p) => p.required).length - notApproved.length },
    nextVersion: (previous?.version ?? 0) + 1,
    changedFromPrevious: changed,
  }
}

// ------------------------------------------------------------ listing

export type ResultRow = {
  id: string
  studentId: string
  name: string
  admissionNumber: string
  rollNumber: string | null
  className: string
  sectionName: string | null
  status: ResultStatus
  totalObtained: number | null
  totalMaximum: number | null
  percentage: number | null
  grade: string | null
  gpa: number | null
  rank: number | null
  subjects: { id: string; status: string; obtained: number | null; maximum: number | null; grade: string | null }[]
}

const canPreview = (ctx: Ctx) => canSeeAllResults(ctx) && (canReviewMarks(ctx) || hasPermission(ctx, "exams.publish"))

// The results table of one examination: the active publication, or (for
// reviewers) a provisional calculation from approved marks.
export async function listExamResults(ctx: Ctx, examinationId: string, filters: ResultFilters) {
  const organizationId = ctx.organization.id
  const exam = await findExam(prisma, ctx, examinationId)
  const publication = await prisma.resultPublication.findFirst({
    where: { organizationId, examinationId, status: "ACTIVE" },
    select: { id: true, version: true, publishedAt: true, rulesSnapshot: true },
  })
  const subjects = await loadSubjects(prisma, organizationId, examinationId)
  const subjectColumns = subjects
    .filter((s) => !filters.class || s.classId === filters.class)
    .map((s) => ({ id: s.id, name: s.subjectOffering.subject.name, code: s.subjectOffering.code ?? s.subjectOffering.subject.code, classId: s.classId }))
  const mayPreview = canPreview(ctx)
  const view: "published" | "provisional" = filters.view === "provisional" && mayPreview ? "provisional" : publication ? "published" : mayPreview ? "provisional" : "published"

  if (view === "published") {
    if (!publication) return { view, publication: null, rows: [], total: 0, subjects: subjectColumns, rules: null, canPreview: mayPreview, exam }
    const scope = await resultScopeWhere(ctx, exam.academicYearId)
    const where: Prisma.StudentResultWhereInput = {
      AND: [
        { organizationId, publicationId: publication.id },
        scope,
        filters.class ? { classId: filters.class } : {},
        filters.section ? { sectionId: filters.section } : {},
        filters.status ? { status: filters.status } : {},
        filters.q
          ? {
              student: {
                OR: [
                  { firstName: { contains: filters.q, mode: "insensitive" } },
                  { lastName: { contains: filters.q, mode: "insensitive" } },
                  { admissionNumber: { contains: filters.q, mode: "insensitive" } },
                ],
              },
            }
          : {},
      ],
    }
    const orderBy: Prisma.StudentResultOrderByWithRelationInput[] =
      filters.sort === "percentage"
        ? [{ percentage: { sort: "desc", nulls: "last" } }]
        : filters.sort === "rank"
          ? [{ rank: { sort: "asc", nulls: "last" } }]
          : filters.sort === "name"
            ? [{ student: { firstName: "asc" } }, { student: { lastName: "asc" } }]
            : [{ classId: "asc" }, { sectionId: "asc" }, { enrollment: { rollNumber: "asc" } }]
    const [total, rows] = await Promise.all([
      prisma.studentResult.count({ where }),
      prisma.studentResult.findMany({
        where,
        orderBy,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        select: {
          id: true, studentId: true, classId: true, sectionId: true, status: true, totalObtained: true, totalMaximum: true, percentage: true,
          grade: true, gpa: true, rank: true, breakdown: true,
          student: { select: { firstName: true, middleName: true, lastName: true, admissionNumber: true } },
          enrollment: { select: { rollNumber: true, class: { select: { name: true } }, section: { select: { name: true } } } },
        },
      }),
    ])
    return {
      view,
      publication: { id: publication.id, version: publication.version, publishedAt: publication.publishedAt },
      total,
      subjects: subjectColumns,
      rules: publication.rulesSnapshot as unknown as RulesSnapshot,
      canPreview: mayPreview,
      exam,
      rows: rows.map(
        (r): ResultRow => ({
          id: r.id,
          studentId: r.studentId,
          name: fullName(r.student),
          admissionNumber: r.student.admissionNumber,
          rollNumber: r.enrollment.rollNumber,
          className: r.enrollment.class.name,
          sectionName: r.enrollment.section?.name ?? null,
          status: r.status,
          totalObtained: toHundredths(r.totalObtained),
          totalMaximum: toHundredths(r.totalMaximum),
          percentage: r.percentage === null ? null : toPercentUnits(r.percentage),
          grade: r.grade,
          gpa: r.gpa === null ? null : toPercentUnits(r.gpa),
          rank: r.rank,
          subjects: (r.breakdown as unknown as ResultBreakdown).subjects.map((s) => ({ id: s.examinationSubjectId, status: s.status, obtained: s.obtained, maximum: s.maximum, grade: s.grade })),
        })
      ),
    }
  }

  if (!mayPreview) throw new ForbiddenError("Results haven't been published yet.")
  const { rows: all, rules } = await calculateExam(prisma, ctx, examinationId, { classId: filters.class })
  const q = filters.q?.toLowerCase()
  const filtered = all.filter(
    (r) =>
      (!filters.section || r.sectionId === filters.section) &&
      (!filters.status || r.calculation.status === filters.status) &&
      (!q || r.name.toLowerCase().includes(q) || r.admissionNumber.toLowerCase().includes(q))
  )
  if (filters.sort === "percentage") filtered.sort((a, b) => (b.calculation.percentage ?? -1) - (a.calculation.percentage ?? -1))
  if (filters.sort === "rank") filtered.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
  if (filters.sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name))
  const page = filtered.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize)
  return {
    view,
    publication: publication ? { id: publication.id, version: publication.version, publishedAt: publication.publishedAt } : null,
    total: filtered.length,
    subjects: subjectColumns,
    rules,
    canPreview: mayPreview,
    exam,
    rows: page.map(
      (r): ResultRow => ({
        id: r.studentId,
        studentId: r.studentId,
        name: r.name,
        admissionNumber: r.admissionNumber,
        rollNumber: r.rollNumber,
        className: r.className,
        sectionName: r.sectionName,
        status: r.calculation.status,
        totalObtained: r.calculation.totalObtained,
        totalMaximum: r.calculation.totalMaximum,
        percentage: r.calculation.percentage,
        grade: r.calculation.grade,
        gpa: r.calculation.gpa,
        // Ranks are never shown before results are final.
        rank: null,
        subjects: r.calculation.subjects.map((s) => ({ id: s.examinationSubjectId, status: s.status, obtained: s.obtained, maximum: s.maximum, grade: s.grade })),
      })
    ),
  }
}

// --------------------------------------------------------- report cards

export type ResultCard = {
  official: boolean
  publication: { version: number; publishedAt: Date; superseded: boolean } | null
  organization: { name: string; logoUrl: string | null }
  exam: { id: string; name: string; typeName: string; yearName: string; term: string | null; startDate: string; endDate: string }
  student: { id: string; name: string; admissionNumber: string; profileImagePath: string | null; rollNumber: string | null; className: string; sectionName: string | null; programName: string | null }
  status: ResultStatus
  totalObtained: number | null
  totalMaximum: number | null
  percentage: number | null
  grade: string | null
  gpa: number | null
  rank: number | null
  breakdown: ResultBreakdown
  attendance: { attended: number; conducted: number; percentage: number | null } | null
}

async function attendanceFor(ctx: Pick<AuthContext, "organization">, studentId: string, academicYearId: string, until: Date) {
  const policy = await getPolicy(ctx)
  const counts = await countStudentStatuses(ctx, { studentId, academicYearId, date: { lte: until }, ...(policy.dailyEnabled && { sessionType: "DAILY" }) }, [])
  const s = summarize(counts.get("")?.counts ?? {}, policy)
  return s.conducted > 0 ? { attended: s.attended, conducted: s.conducted, percentage: s.percentage } : null
}

const cardInclude = {
  publication: { select: { version: true, publishedAt: true, status: true } },
  student: { select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, profileImagePath: true } },
  enrollment: { select: { rollNumber: true, class: { select: { name: true } }, section: { select: { name: true } }, program: { select: { name: true } } } },
} satisfies Prisma.StudentResultInclude

async function examHeader(organizationId: string, examinationId: string) {
  const exam = await prisma.examination.findFirstOrThrow({
    where: { id: examinationId, organizationId },
    select: {
      id: true, name: true, term: true, startDate: true, endDate: true, academicYearId: true,
      assessmentType: { select: { name: true } }, academicYear: { select: { name: true } }, organization: { select: { name: true, logoUrl: true } },
    },
  })
  return exam
}

// A published result as a report card. Access is checked by the caller
// (staff scope here; portal-service for students and guardians).
export async function publishedCard(ctx: Pick<AuthContext, "organization">, result: Prisma.StudentResultGetPayload<{ include: typeof cardInclude }>): Promise<ResultCard> {
  const exam = await examHeader(ctx.organization.id, result.examinationId)
  const withheld = result.status === "WITHHELD"
  const breakdown = result.breakdown as unknown as ResultBreakdown
  return {
    official: result.publication.status === "ACTIVE",
    publication: { version: result.publication.version, publishedAt: result.publication.publishedAt, superseded: result.publication.status !== "ACTIVE" },
    organization: exam.organization,
    exam: { id: exam.id, name: exam.name, typeName: exam.assessmentType.name, yearName: exam.academicYear.name, term: exam.term, startDate: fromDate(exam.startDate), endDate: fromDate(exam.endDate) },
    student: {
      id: result.student.id, name: fullName(result.student), admissionNumber: result.student.admissionNumber, profileImagePath: result.student.profileImagePath,
      rollNumber: result.enrollment.rollNumber, className: result.enrollment.class.name, sectionName: result.enrollment.section?.name ?? null, programName: result.enrollment.program?.name ?? null,
    },
    status: result.status,
    // A withheld result shows no marks at all.
    totalObtained: withheld ? null : toHundredths(result.totalObtained),
    totalMaximum: withheld ? null : toHundredths(result.totalMaximum),
    percentage: withheld || result.percentage === null ? null : toPercentUnits(result.percentage),
    grade: withheld ? null : result.grade,
    gpa: withheld || result.gpa === null ? null : toPercentUnits(result.gpa),
    rank: withheld ? null : result.rank,
    breakdown: withheld ? { ...breakdown, subjects: [], notes: ["This result has been withheld by the institution."] } : breakdown,
    attendance: withheld ? null : await attendanceFor(ctx, result.studentId, result.academicYearId, exam.endDate),
  }
}

export async function loadPublishedResult(ctx: Pick<AuthContext, "organization">, where: Prisma.StudentResultWhereInput) {
  return prisma.studentResult.findFirst({ where: { AND: [{ organizationId: ctx.organization.id }, where] }, include: cardInclude })
}

// Staff view of one student's result: a published version (the active one
// by default) or, for reviewers, a provisional preview.
export async function staffResultCard(ctx: Ctx, examinationId: string, studentId: string, options: { version?: number; provisional?: boolean }) {
  const organizationId = ctx.organization.id
  const exam = await findExam(prisma, ctx, examinationId)
  if (!options.provisional) {
    const result = await loadPublishedResult(ctx, {
      examinationId, studentId,
      publication: options.version ? { version: options.version } : { status: "ACTIVE" },
    })
    if (result) {
      if (!(await mayViewClassResults(ctx, { academicYearId: result.academicYearId, classId: result.classId, sectionId: result.sectionId }))) {
        throw new NotFoundError("Result not found.")
      }
      return publishedCard(ctx, result)
    }
    if (!canPreview(ctx)) throw new NotFoundError("Result not found.")
  }
  if (!canPreview(ctx)) throw new ForbiddenError("Only reviewers can see provisional results.")
  const { rows, rules } = await calculateExam(prisma, ctx, examinationId, { studentIds: [studentId] })
  const row = rows[0]
  if (!row) throw new NotFoundError("This student doesn't sit this examination.")
  const header = await examHeader(organizationId, examinationId)
  const student = await prisma.student.findFirstOrThrow({ where: { id: studentId, organizationId }, select: { profileImagePath: true } })
  const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { id: row.enrollmentId }, select: { program: { select: { name: true } } } })
  return {
    official: false,
    publication: null,
    organization: header.organization,
    exam: { id: exam.id, name: exam.name, typeName: header.assessmentType.name, yearName: header.academicYear.name, term: exam.term, startDate: fromDate(exam.startDate), endDate: fromDate(exam.endDate) },
    student: {
      id: studentId, name: row.name, admissionNumber: row.admissionNumber, profileImagePath: student.profileImagePath, rollNumber: row.rollNumber,
      className: row.className, sectionName: row.sectionName, programName: enrollment.program?.name ?? null,
    },
    status: row.calculation.status,
    totalObtained: row.calculation.totalObtained,
    totalMaximum: row.calculation.totalMaximum,
    percentage: row.calculation.percentage,
    grade: row.calculation.grade,
    gpa: row.calculation.gpa,
    rank: null,
    breakdown: toBreakdown(row, rules),
    attendance: await attendanceFor(ctx, studentId, exam.academicYearId, exam.endDate),
  } satisfies ResultCard
}

// Published versions of one student's result (for the version switcher).
export async function resultVersions(ctx: Pick<AuthContext, "organization">, examinationId: string, studentId: string) {
  const rows = await prisma.studentResult.findMany({
    where: { organizationId: ctx.organization.id, examinationId, studentId },
    orderBy: { publication: { version: "desc" } },
    select: { publication: { select: { version: true, status: true, publishedAt: true, reason: true } } },
  })
  return rows.map((r) => r.publication)
}
