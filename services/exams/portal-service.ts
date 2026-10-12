import "server-only"

import { toHundredths, toPercentUnits } from "@/features/exams/calculation"
import type { AuthContext } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { prisma } from "@/lib/prisma"
import { myStudentProfile } from "@/services/attendance/portal-service"
import { loadPublishedResult, publishedCard, type ResultBreakdown } from "@/services/exams/result-service"
import { requireGuardianStudentAccess } from "@/services/guardians/portal-service"

// Results as students and guardians see them: only the active published
// version of each examination, never drafts, provisional calculations,
// superseded versions or internal examiner notes. The student is never taken
// from the client: a student sees the profile linked to their account; a
// guardian sees a child only through a link that allows portal access,
// re-checked on every call.
type Ctx = Pick<AuthContext, "organization" | "user">

async function publishedResults(ctx: Ctx, studentId: string) {
  const rows = await prisma.studentResult.findMany({
    where: { organizationId: ctx.organization.id, studentId, publication: { status: "ACTIVE" } },
    orderBy: [{ publication: { publishedAt: "desc" } }],
    select: {
      id: true, status: true, totalObtained: true, totalMaximum: true, percentage: true, grade: true, gpa: true, rank: true, breakdown: true,
      publication: { select: { version: true, publishedAt: true } },
      enrollment: { select: { class: { select: { name: true } }, section: { select: { name: true } } } },
      examinationId: true,
    },
  })
  const exams = new Map(
    (
      await prisma.examination.findMany({
        where: { id: { in: rows.map((r) => r.examinationId) }, organizationId: ctx.organization.id },
        select: { id: true, name: true, startDate: true, assessmentType: { select: { name: true } }, academicYear: { select: { id: true, name: true, startDate: true } } },
      })
    ).map((e) => [e.id, e])
  )
  const items = rows.map((r) => {
    const exam = exams.get(r.examinationId)!
    const withheld = r.status === "WITHHELD"
    const breakdown = r.breakdown as unknown as ResultBreakdown
    return {
      resultId: r.id,
      examName: exam.name,
      typeName: exam.assessmentType.name,
      yearId: exam.academicYear.id,
      yearName: exam.academicYear.name,
      yearStart: exam.academicYear.startDate,
      examStart: exam.startDate,
      className: [r.enrollment.class.name, r.enrollment.section ? `Section ${r.enrollment.section.name}` : null].filter(Boolean).join(" · "),
      publishedAt: r.publication.publishedAt,
      version: r.publication.version,
      status: r.status,
      totalObtained: withheld ? null : toHundredths(r.totalObtained),
      totalMaximum: withheld ? null : toHundredths(r.totalMaximum),
      percentage: withheld || r.percentage === null ? null : toPercentUnits(r.percentage),
      grade: withheld ? null : r.grade,
      gpa: withheld || r.gpa === null ? null : toPercentUnits(r.gpa),
      rank: withheld ? null : r.rank,
      percentageDecimals: breakdown.rules.percentageDecimals,
      gpaDecimals: breakdown.rules.gpaDecimals,
    }
  })
  // Grouped by academic year, newest first: the student's history.
  const years = new Map<string, { id: string; name: string; start: Date; items: typeof items }>()
  for (const item of items) {
    const y = years.get(item.yearId) ?? { id: item.yearId, name: item.yearName, start: item.yearStart, items: [] }
    y.items.push(item)
    years.set(item.yearId, y)
  }
  return [...years.values()]
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .map((y) => ({ ...y, items: y.items.sort((a, b) => b.examStart.getTime() - a.examStart.getTime()) }))
}

export type PortalResultYears = Awaited<ReturnType<typeof publishedResults>>

export async function myResults(ctx: Ctx) {
  const student = await myStudentProfile(ctx)
  if (!student) return null
  return { student, years: await publishedResults(ctx, student.id) }
}

export async function childResults(ctx: Ctx, studentId: string) {
  await requireGuardianStudentAccess(ctx, studentId)
  return publishedResults(ctx, studentId)
}

// One published result for its own student or a linked guardian. Anything
// else (another student, a superseded version, another organisation) is
// "not found", so IDs can't be probed.
export async function portalResultCard(ctx: Ctx, resultId: string) {
  const result = await loadPublishedResult(ctx, { id: resultId, publication: { status: "ACTIVE" } })
  if (!result) throw new NotFoundError("Result not found.")
  const own = await myStudentProfile(ctx)
  if (own?.id !== result.studentId) await requireGuardianStudentAccess(ctx, result.studentId)
  return publishedCard(ctx, result)
}
