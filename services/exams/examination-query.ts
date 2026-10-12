import "server-only"

import { examPhase, localDate } from "@/features/exams/constants"
import type { ExamFilters } from "@/features/exams/filters"
import type { AuthContext } from "@/lib/authorization/context"
import type { MarksSheetStatus, Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { fromDate, toDate } from "@/lib/validation"
import { eligibleEnrollmentWhere } from "@/services/exams/eligibility"

// The examinations list and dashboard figures, filtered, sorted and
// paginated in the database. Only one page of examinations is summarised
// at a time.
type Ctx = Pick<AuthContext, "organization">

export type SheetSummary = { expected: number } & Record<MarksSheetStatus | "NOT_STARTED", number>

// Students and marks-sheet progress for a set of examinations. "Expected"
// sheets are compulsory subjects × sections that have eligible students,
// plus any optional-subject sheet that has been started.
async function summarize(organizationId: string, exams: { id: string; academicYearId: string; startDate: Date; endDate: Date }[]) {
  if (exams.length === 0) return new Map<string, { students: number; sheets: SheetSummary }>()
  const ids = exams.map((e) => e.id)
  const [subjects, sheets] = await Promise.all([
    prisma.examinationSubject.findMany({
      where: { examinationId: { in: ids } },
      select: { id: true, examinationId: true, classId: true, isCompulsory: true, subjectOffering: { select: { sections: { select: { sectionId: true } } } } },
    }),
    prisma.marksSheet.findMany({ where: { examinationId: { in: ids } }, select: { examinationId: true, examinationSubjectId: true, sectionId: true, status: true } }),
  ])
  const out = new Map<string, { students: number; sheets: SheetSummary }>()
  await Promise.all(
    exams.map(async (exam) => {
      const mine = subjects.filter((s) => s.examinationId === exam.id)
      const classIds = [...new Set(mine.map((s) => s.classId))]
      const groups = classIds.length
        ? await prisma.enrollment.groupBy({
            by: ["classId", "sectionId"],
            where: { AND: [eligibleEnrollmentWhere(organizationId, exam), { classId: { in: classIds } }] },
            _count: { _all: true },
          })
        : []
      const examSheets = sheets.filter((s) => s.examinationId === exam.id)
      const summary: SheetSummary = { expected: 0, NOT_STARTED: 0, DRAFT: 0, SUBMITTED: 0, VERIFIED: 0, APPROVED: 0, RETURNED: 0 }
      for (const s of mine) {
        const limited = s.subjectOffering.sections.map((x) => x.sectionId)
        const keys = new Set<string>()
        for (const g of groups) {
          if (g.classId !== s.classId) continue
          if (limited.length && (g.sectionId === null || !limited.includes(g.sectionId))) continue
          if (s.isCompulsory) keys.add(g.sectionId ?? "")
        }
        for (const sheet of examSheets.filter((x) => x.examinationSubjectId === s.id)) keys.add(sheet.sectionId ?? "")
        for (const key of keys) {
          summary.expected++
          const sheet = examSheets.find((x) => x.examinationSubjectId === s.id && (x.sectionId ?? "") === key)
          summary[sheet?.status ?? "NOT_STARTED"]++
        }
      }
      out.set(exam.id, { students: groups.reduce((sum, g) => sum + g._count._all, 0), sheets: summary })
    })
  )
  return out
}

function listWhere(ctx: Ctx, f: ExamFilters): Prisma.ExaminationWhereInput {
  return {
    AND: [
      { organizationId: ctx.organization.id },
      f.archived === "only" ? { status: "ARCHIVED" } : f.archived === "include" ? {} : { status: { not: "ARCHIVED" } },
      f.year ? { academicYearId: f.year } : {},
      f.type ? { assessmentTypeId: f.type } : {},
      f.category ? { assessmentType: { category: f.category } } : {},
      f.level ? { OR: [{ educationLevelId: f.level }, { subjects: { some: { class: { educationLevelId: f.level } } } }] } : {},
      f.program ? { OR: [{ programId: f.program }, { subjects: { some: { class: { programId: f.program } } } }] } : {},
      f.class ? { subjects: { some: { classId: f.class } } } : {},
      f.status ? { status: f.status } : {},
      f.from ? { endDate: { gte: toDate(f.from) } } : {},
      f.to ? { startDate: { lte: toDate(f.to) } } : {},
      f.q
        ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }, { term: { contains: f.q, mode: "insensitive" } }] }
        : {},
    ],
  }
}

export async function listExaminations(ctx: Ctx, filters: ExamFilters) {
  const where = listWhere(ctx, filters)
  const orderBy: Prisma.ExaminationOrderByWithRelationInput[] =
    filters.sort === "name" ? [{ name: filters.dir }] : filters.sort === "status" ? [{ status: filters.dir }, { startDate: "desc" }] : [{ startDate: filters.dir }, { name: "asc" }]
  const [total, rows] = await Promise.all([
    prisma.examination.count({ where }),
    prisma.examination.findMany({
      where,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true, name: true, code: true, term: true, status: true, startDate: true, endDate: true, academicYearId: true, publishedAt: true,
        assessmentType: { select: { name: true, category: true } },
        academicYear: { select: { name: true } },
        educationLevel: { select: { name: true } },
        program: { select: { name: true } },
        subjects: { distinct: ["classId"], select: { class: { select: { name: true, sequence: true } } } },
        publications: { where: { status: "ACTIVE" }, select: { version: true } },
      },
    }),
  ])
  const summaries = await summarize(ctx.organization.id, rows)
  const today = localDate()
  return {
    total,
    rows: rows.map((r) => {
      const s = summaries.get(r.id)!
      const startDate = fromDate(r.startDate)
      const endDate = fromDate(r.endDate)
      const classes = r.subjects.map((x) => x.class).sort((a, b) => a.sequence - b.sequence).map((c) => c.name)
      return {
        id: r.id,
        name: r.name,
        code: r.code,
        term: r.term,
        typeName: r.assessmentType.name,
        category: r.assessmentType.category,
        yearName: r.academicYear.name,
        scope: [r.educationLevel?.name, r.program?.name].filter(Boolean).join(" · ") || null,
        classes,
        startDate,
        endDate,
        status: r.status,
        phase: examPhase({ status: r.status, startDate, endDate }, today),
        students: s.students,
        sheets: s.sheets,
        publishedVersion: r.publications[0]?.version ?? null,
        publishedAt: r.publishedAt,
      }
    }),
  }
}

export type ExamRow = Awaited<ReturnType<typeof listExaminations>>["rows"][number]

export async function examDashboard(ctx: Ctx, yearId: string | null) {
  const organizationId = ctx.organization.id
  if (!yearId) return null
  const exams = await prisma.examination.findMany({
    where: { organizationId, academicYearId: yearId, status: { not: "ARCHIVED" } },
    select: { id: true, status: true, academicYearId: true, startDate: true, endDate: true },
  })
  const open = exams.filter((e) => e.status === "SCHEDULED" || e.status === "REVISION")
  const summaries = await summarize(organizationId, open)
  const awaitingMarks = open.filter((e) => {
    const s = summaries.get(e.id)!.sheets
    return s.NOT_STARTED + s.DRAFT + s.RETURNED > 0
  }).length
  const awaitingApproval = open.filter((e) => {
    const s = summaries.get(e.id)!.sheets
    return s.expected > 0 && s.SUBMITTED + s.VERIFIED > 0 && s.NOT_STARTED + s.DRAFT + s.RETURNED === 0
  }).length + exams.filter((e) => e.status === "APPROVED").length
  const [reviewQueue, incomplete] = await Promise.all([
    prisma.marksSheet.count({ where: { organizationId, status: { in: ["SUBMITTED", "VERIFIED"] }, examination: { academicYearId: yearId } } }),
    prisma.studentResult.count({ where: { organizationId, academicYearId: yearId, status: { in: ["INCOMPLETE", "WITHHELD"] }, publication: { status: "ACTIVE" } } }),
  ])
  return {
    total: exams.length,
    awaitingMarks,
    awaitingApproval,
    reviewQueue,
    published: exams.filter((e) => e.status === "PUBLISHED" || e.status === "REVISION").length,
    incomplete,
  }
}

export async function examFilterOptions(ctx: Ctx) {
  const organizationId = ctx.organization.id
  const [years, types, levels, programs, classes] = await Promise.all([
    prisma.academicYear.findMany({ where: { organizationId }, orderBy: { startDate: "desc" }, select: { id: true, name: true, isCurrent: true } }),
    prisma.assessmentType.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, isActive: true, category: true } }),
    prisma.educationLevel.findMany({ where: { organizationId, isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.program.findMany({ where: { organizationId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, educationLevelId: true } }),
    prisma.academicClass.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ educationLevel: { sortOrder: "asc" } }, { sequence: "asc" }],
      select: { id: true, name: true, educationLevelId: true, programId: true },
    }),
  ])
  return { years, types, levels, programs, classes }
}

// Choices for the examination form: active types, scales that aren't
// retired and active result policies.
export async function examFormOptions(ctx: Ctx) {
  const organizationId = ctx.organization.id
  const [years, types, levels, programs, scales, policies] = await Promise.all([
    prisma.academicYear.findMany({ where: { organizationId, status: { not: "ARCHIVED" } }, orderBy: { startDate: "desc" }, select: { id: true, name: true, isCurrent: true } }),
    prisma.assessmentType.findMany({ where: { organizationId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.educationLevel.findMany({ where: { organizationId, isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.program.findMany({ where: { organizationId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, educationLevelId: true } }),
    prisma.gradingScale.findMany({ where: { organizationId, status: { not: "RETIRED" } }, orderBy: [{ name: "asc" }, { version: "desc" }], select: { id: true, name: true, version: true, status: true, isDefault: true } }),
    prisma.resultPolicy.findMany({ where: { organizationId, isActive: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }], select: { id: true, name: true, isDefault: true, gradingScaleId: true, educationLevelId: true } }),
  ])
  return { years, types, levels, programs, scales, policies }
}
