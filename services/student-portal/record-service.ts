import "server-only"

import { localDate } from "@/features/attendance/constants"
import { NotFoundError } from "@/lib/authorization/errors"
import type { AttendanceStatus } from "@/lib/generated/prisma/enums"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { signedUrl } from "@/lib/supabase/storage"
import { toDate } from "@/lib/validation"
import { countedSessionWhere } from "@/services/attendance/session-service"
import { myEnrollment, myStudent, requireStudent, type Ctx } from "@/services/student-portal/me-service"

// The student's own records: profile, documents and attendance history.
// Staff-only details (medical notes, internal notes, status history,
// disability, entrance score) are never included.

export async function myProfile(ctx: Ctx) {
  const student = await myStudent(ctx)
  if (!student) return null
  const [profile, enrollments] = await Promise.all([
    prisma.student.findUniqueOrThrow({
      where: { id: student.id },
      select: {
        id: true, admissionNumber: true, admissionDate: true, firstName: true, middleName: true, lastName: true,
        dateOfBirth: true, gender: true, nationality: true, bloodGroup: true, email: true, phone: true, alternatePhone: true, profileImagePath: true, status: true,
        addresses: { select: { type: true, province: true, district: true, municipality: true, wardNumber: true, tole: true } },
        guardians: {
          where: { canAccessStudentPortalData: true },
          orderBy: [{ isPrimary: "desc" }],
          select: { relationship: true, isPrimary: true, guardian: { select: { fullName: true, phone: true, email: true } } },
        },
      },
    }),
    prisma.enrollment.findMany({
      where: { organizationId: ctx.organization.id, studentId: student.id },
      orderBy: { enrollmentDate: "desc" },
      select: { id: true, status: true, rollNumber: true, enrollmentDate: true, academicYear: { select: { name: true } }, class: { select: { name: true } }, section: { select: { name: true } }, program: { select: { name: true } } },
    }),
  ])
  return { profile, enrollments }
}

export type MyProfile = NonNullable<Awaited<ReturnType<typeof myProfile>>>

// Documents the student has on file, and the institution's required
// documents (for their level) that are still missing. Nothing is "missing"
// unless the institution has set up document requirements.
export async function myDocuments(ctx: Ctx) {
  const student = await myStudent(ctx)
  if (!student) return null
  const e = await myEnrollment(ctx)
  const [documents, requirements] = await Promise.all([
    prisma.studentDocument.findMany({
      where: { organizationId: ctx.organization.id, studentId: student.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, requirementId: true, requirement: { select: { name: true } } },
    }),
    prisma.documentRequirement.findMany({
      where: {
        organizationId: ctx.organization.id, audience: "STUDENT", isActive: true,
        OR: [{ educationLevelId: null }, ...(e ? [{ educationLevelId: e.educationLevelId }] : [])],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, isRequired: true },
    }),
  ])
  const submitted = new Set(documents.map((d) => d.requirementId).filter(Boolean))
  return {
    documents,
    requirements: requirements.map((r) => ({ ...r, submitted: submitted.has(r.id) })),
    missing: requirements.filter((r) => r.isRequired && !submitted.has(r.id)).length,
  }
}

export async function myDocumentUrl(ctx: Ctx, documentId: string) {
  const student = await requireStudent(ctx)
  const document = await prisma.studentDocument.findFirst({
    where: { id: documentId, studentId: student.id, organizationId: ctx.organization.id },
    select: { storagePath: true, fileName: true },
  })
  if (!document) throw new NotFoundError("Document not found.")
  return signedUrl(document.storagePath, 60, document.fileName)
}

// Attendance records in a date range (counted registers only), newest first.
export async function myAttendanceHistory(ctx: Ctx, input: { from?: string; to?: string; status?: AttendanceStatus; page: number; pageSize: number }) {
  const student = await myStudent(ctx)
  if (!student) return null
  const where: Prisma.StudentAttendanceWhereInput = {
    organizationId: ctx.organization.id,
    studentId: student.id,
    session: countedSessionWhere,
    date: { ...(input.from && { gte: toDate(input.from) }), lte: toDate(input.to && input.to < localDate() ? input.to : localDate()) },
    ...(input.status && { status: input.status }),
  }
  const [total, rows, byStatus] = await Promise.all([
    prisma.studentAttendance.count({ where }),
    prisma.studentAttendance.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true, date: true, status: true, lateMinutes: true, reason: true, sessionType: true,
        session: { select: { slot: true, subjectOffering: { select: { subject: { select: { name: true } } } } } },
      },
    }),
    prisma.studentAttendance.groupBy({ by: ["status"], where: { ...where, status: undefined }, _count: { _all: true } }),
  ])
  return { total, rows, counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Partial<Record<AttendanceStatus, number>> }
}
