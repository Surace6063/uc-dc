import "server-only"

import { localDate } from "@/features/attendance/constants"
import { toHundredths, toPercentUnits } from "@/features/exams/calculation"
import { prisma } from "@/lib/prisma"
import { myEnrollment, myStudent, type Ctx } from "@/services/student-portal/me-service"

// Examinations from the student's side: the papers their section sits, and
// marks from published results only (never drafts or provisional figures).

const VISIBLE = ["SCHEDULED", "APPROVED", "PUBLISHED", "REVISION"] as const

// Papers of the student's class that their section takes (an offering may be
// limited to some sections). Electives aren't recorded per student, so every
// elective paper of the section is listed.
export async function myExamPapers(ctx: Ctx, when: "upcoming" | "all" = "upcoming") {
  const e = await myEnrollment(ctx)
  if (!e) return []
  const today = new Date(`${localDate()}T00:00:00.000Z`)
  return prisma.examinationSubject.findMany({
    where: {
      AND: [
        { organizationId: ctx.organization.id, classId: e.classId, examination: { academicYearId: e.academicYearId, status: { in: [...VISIBLE] } } },
        { OR: [{ subjectOffering: { sections: { none: {} } } }, ...(e.sectionId ? [{ subjectOffering: { sections: { some: { sectionId: e.sectionId } } } }] : [])] },
        when === "upcoming" ? { OR: [{ examDate: { gte: today } }, { examDate: null, examination: { endDate: { gte: today } } }] } : {},
      ],
    },
    orderBy: [{ examDate: { sort: "asc", nulls: "last" } }, { startTime: "asc" }, { sequence: "asc" }],
    take: 200,
    select: {
      id: true, examDate: true, startTime: true, endTime: true, venue: true, maximumMarks: true, passMarks: true, isCompulsory: true,
      subjectOffering: { select: { code: true, subject: { select: { name: true, code: true } } } },
      examination: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
    },
  })
}

export type StudentPaper = Awaited<ReturnType<typeof myExamPapers>>[number]

// Subject marks from the student's published results, newest examination
// first. Withheld results show no marks.
export async function myMarks(ctx: Ctx) {
  const student = await myStudent(ctx)
  if (!student) return []
  const results = await prisma.studentResult.findMany({
    where: { organizationId: ctx.organization.id, studentId: student.id, publication: { status: "ACTIVE" } },
    orderBy: [{ publication: { publishedAt: "desc" } }],
    select: { id: true, status: true, examinationId: true, publication: { select: { publishedAt: true } } },
  })
  if (results.length === 0) return []
  const [exams, subjects] = await Promise.all([
    prisma.examination.findMany({ where: { id: { in: results.map((r) => r.examinationId) }, organizationId: ctx.organization.id }, select: { id: true, name: true, academicYear: { select: { name: true } } } }),
    prisma.studentSubjectResult.findMany({
      where: { organizationId: ctx.organization.id, resultId: { in: results.map((r) => r.id) } },
      orderBy: [{ isCompulsory: "desc" }],
      select: { id: true, resultId: true, subjectId: true, status: true, obtained: true, maximum: true, percentage: true, grade: true, gradePoint: true, isCompulsory: true },
    }),
  ])
  const subjectNames = new Map(
    (await prisma.subject.findMany({ where: { id: { in: [...new Set(subjects.map((s) => s.subjectId))] }, organizationId: ctx.organization.id }, select: { id: true, name: true, code: true } })).map((s) => [s.id, s])
  )
  const examOf = new Map(exams.map((e) => [e.id, e]))
  return results.map((r) => {
    const withheld = r.status === "WITHHELD"
    return {
      resultId: r.id,
      examName: examOf.get(r.examinationId)?.name ?? "Examination",
      yearName: examOf.get(r.examinationId)?.academicYear.name ?? "",
      publishedAt: r.publication.publishedAt,
      withheld,
      subjects: withheld
        ? []
        : subjects
            .filter((s) => s.resultId === r.id)
            .map((s) => ({
              id: s.id,
              name: subjectNames.get(s.subjectId)?.name ?? "Subject",
              code: subjectNames.get(s.subjectId)?.code ?? "",
              status: s.status,
              obtained: s.obtained === null ? null : toHundredths(s.obtained),
              maximum: s.maximum === null ? null : toHundredths(s.maximum),
              percentage: s.percentage === null ? null : toPercentUnits(s.percentage),
              grade: s.grade,
              gradePoint: s.gradePoint === null ? null : toPercentUnits(s.gradePoint),
              isCompulsory: s.isCompulsory,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
    }
  })
}

export type StudentMarks = Awaited<ReturnType<typeof myMarks>>[number]
