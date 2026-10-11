import "server-only"

import { localTime, slotLabel } from "@/features/attendance/constants"
import type { RecordFilters } from "@/features/attendance/filters"
import { fullName } from "@/features/students/constants"
import type { AuthContext } from "@/lib/authorization/context"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { fromDate, toDate } from "@/lib/validation"
import { recordScopeWhere } from "@/services/attendance/access-service"
import { getPolicy } from "@/services/attendance/policy-service"

// Server-side filtering, sorting and pagination for student attendance
// records. Every query is scoped to the organisation and to what the caller
// may see (recordScopeWhere); filter values only narrow that.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

const insensitive = (q: string) => ({ contains: q, mode: "insensitive" as const })

export async function buildRecordWhere(ctx: Ctx, filters: RecordFilters): Promise<Prisma.StudentAttendanceWhereInput> {
  const and: Prisma.StudentAttendanceWhereInput[] = [{ organizationId: ctx.organization.id }, await recordScopeWhere(ctx)]
  if (filters.year) and.push({ academicYearId: filters.year })
  if (filters.class) and.push({ classId: filters.class })
  if (filters.section) and.push({ sectionId: filters.section })
  if (filters.offering) and.push({ subjectOfferingId: filters.offering })
  if (filters.student) and.push({ studentId: filters.student })
  if (filters.type) and.push({ sessionType: filters.type })
  if (filters.status) and.push({ status: filters.status })
  if (filters.from) and.push({ date: { gte: toDate(filters.from) } })
  if (filters.to) and.push({ date: { lte: toDate(filters.to) } })
  if (filters.correction === "corrected") and.push({ correctedAt: { not: null } })
  if (filters.correction === "pending") and.push({ corrections: { some: { status: "PENDING" } } })
  if (filters.q) {
    and.push({
      student: {
        OR: [
          { firstName: insensitive(filters.q) },
          { lastName: insensitive(filters.q) },
          { admissionNumber: insensitive(filters.q) },
        ],
      },
    })
  }
  return { AND: and }
}

const ORDER: Record<RecordFilters["sort"], (dir: "asc" | "desc") => Prisma.StudentAttendanceOrderByWithRelationInput[]> = {
  date: (dir) => [{ date: dir }, { session: { slot: "asc" } }, { student: { firstName: "asc" } }],
  student: (dir) => [{ student: { firstName: dir } }, { student: { lastName: dir } }, { date: "desc" }],
  status: (dir) => [{ status: dir }, { date: "desc" }],
}

export async function listRecords(ctx: Ctx, filters: RecordFilters) {
  const [where, policy] = await Promise.all([buildRecordWhere(ctx, filters), getPolicy(ctx)])
  const [total, rows] = await Promise.all([
    prisma.studentAttendance.count({ where }),
    prisma.studentAttendance.findMany({
      where,
      orderBy: ORDER[filters.sort](filters.dir),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true, date: true, sessionType: true, status: true, checkInAt: true, lateMinutes: true, reason: true, remarks: true,
        correctedAt: true, studentId: true,
        student: { select: { firstName: true, middleName: true, lastName: true, admissionNumber: true } },
        enrollment: { select: { rollNumber: true, section: { select: { name: true } } } },
        session: {
          select: {
            id: true, status: true, slot: true, academicYearId: true, classId: true, sectionId: true, subjectOfferingId: true,
            class: { select: { name: true } },
            subjectOffering: { select: { subject: { select: { name: true, code: true } } } },
          },
        },
        markedBy: { select: { name: true, email: true } },
        corrections: { where: { status: "PENDING" }, select: { id: true } },
      },
    }),
  ])
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      date: fromDate(r.date),
      type: r.sessionType,
      slotLabel: slotLabel(r.sessionType, r.session.slot, policy.dailySlots),
      studentId: r.studentId,
      studentName: fullName(r.student),
      admissionNumber: r.student.admissionNumber,
      rollNumber: r.enrollment.rollNumber,
      className: r.session.class.name,
      sectionName: r.enrollment.section?.name ?? null,
      subjectName: r.session.subjectOffering?.subject.name ?? null,
      status: r.status,
      checkIn: r.checkInAt ? localTime(r.checkInAt) : null,
      lateMinutes: r.lateMinutes,
      reason: r.reason,
      remarks: r.remarks,
      markedBy: r.markedBy?.name || r.markedBy?.email || null,
      sessionStatus: r.session.status,
      corrected: r.correctedAt !== null,
      pendingCorrection: r.corrections.length > 0,
      register: {
        academicYearId: r.session.academicYearId,
        classId: r.session.classId,
        sectionId: r.session.sectionId,
        subjectOfferingId: r.session.subjectOfferingId,
        slot: r.session.slot,
      },
    })),
  }
}

export type RecordRow = Awaited<ReturnType<typeof listRecords>>["rows"][number]
