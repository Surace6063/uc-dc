import "server-only"

import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { toDate } from "@/lib/validation"

// Which students sit an examination: those placed in its classes during the
// examination. An open placement (active or on hold) that began by the last
// day counts; a closed one counts if it was still running on the first day
// (a student who withdrew mid-examination keeps their marks). Cancelled
// placements never count. One placement per student, an open one first.
type Db = TransactionClient | typeof prisma

export type ExamWindow = { academicYearId: string; startDate: Date | string; endDate: Date | string }

const asDate = (d: Date | string) => (typeof d === "string" ? toDate(d) : d)

export function eligibleEnrollmentWhere(organizationId: string, exam: ExamWindow): Prisma.EnrollmentWhereInput {
  return {
    organizationId,
    academicYearId: exam.academicYearId,
    enrollmentDate: { lte: asDate(exam.endDate) },
    OR: [{ status: { in: ["ACTIVE", "ON_HOLD"] } }, { status: { notIn: ["ACTIVE", "ON_HOLD", "CANCELLED"] }, endedOn: { gte: asDate(exam.startDate) } }],
    student: { archivedAt: null },
  }
}

export const enrollmentSelect = {
  id: true, studentId: true, classId: true, sectionId: true, rollNumber: true, status: true, academicYearId: true,
  section: { select: { name: true } },
  class: { select: { name: true } },
  student: { select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, profileImagePath: true } },
} satisfies Prisma.EnrollmentSelect

export type EligibleEnrollment = Prisma.EnrollmentGetPayload<{ select: typeof enrollmentSelect }>

export async function eligibleEnrollments(
  db: Db,
  organizationId: string,
  exam: ExamWindow,
  scope: { classIds: string[]; sectionIds?: (string | null)[]; studentIds?: string[] }
) {
  const sectionFilter: Prisma.EnrollmentWhereInput =
    scope.sectionIds === undefined
      ? {}
      : {
          OR: [
            ...(scope.sectionIds.some((s) => s !== null) ? [{ sectionId: { in: scope.sectionIds.filter((s): s is string => s !== null) } }] : []),
            ...(scope.sectionIds.includes(null) ? [{ sectionId: null }] : []),
          ],
        }
  const rows = await db.enrollment.findMany({
    where: {
      AND: [
        eligibleEnrollmentWhere(organizationId, exam),
        { classId: { in: scope.classIds } },
        sectionFilter,
        scope.studentIds ? { studentId: { in: scope.studentIds } } : {},
      ],
    },
    orderBy: [{ status: "asc" }, { enrollmentDate: "desc" }],
    select: enrollmentSelect,
  })
  const byStudent = new Map<string, EligibleEnrollment>()
  for (const row of rows) if (!byStudent.has(row.studentId)) byStudent.set(row.studentId, row)
  return byStudent
}

// Roll numbers sort numerically when they are numbers ("2" before "10").
export function rollOrder(a: string | null, b: string | null) {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  const na = Number(a)
  const nb = Number(b)
  return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b)
}
