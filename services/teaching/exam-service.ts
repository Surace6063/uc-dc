import "server-only"

import { localDate } from "@/features/attendance/constants"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { resultScopeWhere } from "@/services/exams/access-service"
import { marksPicker } from "@/services/exams/marks-service"
import { teachingAssignments, type Ctx } from "@/services/teaching/scope-service"

// Examinations from a teacher's point of view: the papers of subjects they
// teach (class teachers: every paper of their class), their marks sheets,
// and published results of their classes. Drafts are never shown.

const VISIBLE = ["SCHEDULED", "APPROVED", "PUBLISHED", "REVISION"] as const

async function paperScope(ctx: Ctx, academicYearId: string): Promise<Prisma.ExaminationSubjectWhereInput | null> {
  const assignments = await teachingAssignments(ctx, academicYearId)
  if (assignments.length === 0) return null
  return {
    OR: assignments.map((a) => ({
      classId: a.classId!,
      ...(a.subjectId && a.role !== "CLASS_TEACHER" ? { subjectOffering: { subjectId: a.subjectId } } : {}),
    })),
  }
}

// Each paper (examination subject) with its date, for a year.
export async function myExamSchedule(ctx: Ctx, academicYearId: string | null, when: "upcoming" | "all" = "upcoming") {
  if (!academicYearId) return []
  const scope = await paperScope(ctx, academicYearId)
  if (!scope) return []
  const today = new Date(`${localDate()}T00:00:00.000Z`)
  return prisma.examinationSubject.findMany({
    where: {
      AND: [
        { organizationId: ctx.organization.id, examination: { academicYearId, status: { in: [...VISIBLE] } } },
        scope,
        when === "upcoming" ? { OR: [{ examDate: { gte: today } }, { examDate: null, examination: { endDate: { gte: today } } }] } : {},
      ],
    },
    orderBy: [{ examDate: { sort: "asc", nulls: "last" } }, { startTime: "asc" }, { sequence: "asc" }],
    take: 200,
    select: {
      id: true, examDate: true, startTime: true, endTime: true, venue: true, maximumMarks: true, passMarks: true,
      class: { select: { id: true, name: true } },
      subjectOffering: { select: { code: true, subject: { select: { name: true, code: true } } } },
      examination: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
    },
  })
}

export type MyExamPaper = Awaited<ReturnType<typeof myExamSchedule>>[number]

// Marks sheets the teacher still has to enter or correct, across every
// examination open for marks.
export async function myPendingSheets(ctx: Ctx) {
  const { exams } = await marksPicker(ctx)
  const open = exams.filter((e) => e.status === "SCHEDULED" || e.status === "REVISION")
  const lists = await Promise.all(
    open.map(async (e) => {
      const { sheets } = await marksPicker(ctx, e.id)
      return sheets
        .filter((s) => s.status === "NOT_STARTED" || s.status === "DRAFT" || s.status === "RETURNED")
        .map((s) => ({ ...s, examinationId: e.id, examinationName: e.name }))
    })
  )
  return lists.flat()
}

export type PendingSheet = Awaited<ReturnType<typeof myPendingSheets>>[number]

// Examinations with published results that include the teacher's classes,
// with pass/fail counts for those classes only.
export async function myPublishedResults(ctx: Ctx, academicYearId: string | null) {
  if (!academicYearId) return []
  const scope = await resultScopeWhere(ctx, academicYearId)
  const where: Prisma.StudentResultWhereInput = { AND: [{ organizationId: ctx.organization.id, academicYearId, publication: { status: "ACTIVE" } }, scope] }
  const grouped = await prisma.studentResult.groupBy({ by: ["examinationId", "status"], where, _count: { _all: true } })
  const examIds = [...new Set(grouped.map((g) => g.examinationId))]
  if (examIds.length === 0) return []
  const [exams, publications, averages] = await Promise.all([
    prisma.examination.findMany({ where: { id: { in: examIds }, organizationId: ctx.organization.id }, select: { id: true, name: true, startDate: true, endDate: true } }),
    prisma.resultPublication.findMany({ where: { organizationId: ctx.organization.id, examinationId: { in: examIds }, status: "ACTIVE" }, select: { examinationId: true, version: true, publishedAt: true } }),
    prisma.studentResult.groupBy({ by: ["examinationId"], where, _avg: { percentage: true } }),
  ])
  return exams
    .map((e) => {
      const rows = grouped.filter((g) => g.examinationId === e.id)
      const n = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0
      const pass = n("PASS")
      const fail = n("FAIL")
      const publication = publications.find((p) => p.examinationId === e.id)
      const avg = averages.find((a) => a.examinationId === e.id)?._avg.percentage
      return {
        ...e,
        students: rows.reduce((t, r) => t + r._count._all, 0),
        pass,
        fail,
        other: rows.reduce((t, r) => t + r._count._all, 0) - pass - fail,
        // Share of decided results (pass or fail) that passed.
        passRate: pass + fail ? Math.round((pass / (pass + fail)) * 1000) / 10 : null,
        averagePercentage: avg === null || avg === undefined ? null : Math.round(Number(avg) * 10) / 10,
        publishedAt: publication?.publishedAt ?? null,
        version: publication?.version ?? null,
      }
    })
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
}

export type MyPublishedResult = Awaited<ReturnType<typeof myPublishedResults>>[number]
