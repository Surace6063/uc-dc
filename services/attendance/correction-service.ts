import "server-only"

import { ATTENDANCE_STATUS_LABELS, slotLabel, studentStatuses } from "@/features/attendance/constants"
import { correctionRequestSchema, correctionReviewSchema } from "@/features/attendance/schemas"
import { fullName } from "@/features/students/constants"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { AttendanceCorrectionStatus, AttendanceSessionStatus, Prisma } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { fromDate } from "@/lib/validation"
import { recordScopeWhere } from "@/services/attendance/access-service"
import { getPolicy, type Policy } from "@/services/attendance/policy-service"
import { isLockedFor } from "@/services/attendance/session-service"
import { audit } from "@/services/audit/audit-service"

// Changes to submitted student attendance. Every change keeps its before and
// after values in attendance_corrections, whether it was applied at once or
// reviewed first; the record itself shows who corrected it and when.
//
//   attendance.approve                 applies corrections directly and
//                                      reviews others' requests
//   attendance.update (no approve)     requests corrections; they wait for a
//                                      reviewer when the policy requires it
//
// Nobody reviews their own request. Locked registers refuse corrections until
// someone with attendance.approve reopens them.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

type Outcome = { applied: number; pending: number; skipped: { name: string; reason: string }[] }

const recordSelect = {
  id: true, status: true, lateMinutes: true, reason: true, studentId: true,
  student: { select: { firstName: true, middleName: true, lastName: true } },
  session: { select: { id: true, status: true, date: true } },
  corrections: { where: { status: "PENDING" as const }, select: { id: true } },
} satisfies Prisma.StudentAttendanceSelect

async function applyChange(
  tx: TransactionClient,
  ctx: Ctx,
  recordId: string,
  change: { toStatus: Prisma.StudentAttendanceUpdateInput["status"]; toLateMinutes: number | null; toReason: string | null }
) {
  await tx.studentAttendance.update({
    where: { id: recordId },
    data: {
      status: change.toStatus,
      lateMinutes: change.toStatus === "LATE" ? change.toLateMinutes : null,
      reason: change.toReason,
      correctedById: ctx.user.id,
      correctedAt: new Date(),
    },
  })
}

export async function requestCorrections(ctx: Ctx, raw: unknown): Promise<Outcome> {
  const input = correctionRequestSchema.parse(raw)
  const policy = await getPolicy(ctx)
  if (!studentStatuses(policy).includes(input.toStatus)) {
    throw new ValidationError({ toStatus: ["This status isn't used for students here."] })
  }
  const direct = hasPermission(ctx, "attendance.approve") || !policy.correctionsRequireApproval
  const scope = await recordScopeWhere(ctx)

  return prisma
    .$transaction(async (tx) => {
      const records = await tx.studentAttendance.findMany({
        where: { AND: [{ id: { in: input.recordIds }, organizationId: ctx.organization.id }, scope] },
        select: recordSelect,
      })
      if (records.length === 0) throw new NotFoundError("Attendance records not found.")
      const outcome: Outcome = { applied: 0, pending: 0, skipped: [] }

      for (const record of records) {
        const name = fullName(record.student)
        const reason = skipReason(ctx, record, input, policy)
        if (reason) {
          outcome.skipped.push({ name, reason })
          continue
        }
        const correction = await tx.attendanceCorrection.create({
          data: {
            organizationId: ctx.organization.id,
            studentAttendanceId: record.id,
            fromStatus: record.status,
            toStatus: input.toStatus,
            fromLateMinutes: record.lateMinutes,
            toLateMinutes: input.toStatus === "LATE" ? input.toLateMinutes : null,
            fromReason: record.reason,
            toReason: input.toReason,
            justification: input.justification,
            requestedById: ctx.user.id,
            status: direct ? "APPROVED" : "PENDING",
            ...(direct && { reviewedById: ctx.user.id, reviewedAt: new Date(), appliedAt: new Date(), reviewNote: "Applied directly" }),
          },
        })
        if (direct) {
          await applyChange(tx, ctx, record.id, input)
          outcome.applied++
        } else {
          outcome.pending++
        }
        await audit(tx, ctx, {
          action: direct ? "attendance.correct" : "attendance.correction.request",
          entityType: "student_attendance",
          entityId: record.id,
          summary: `${direct ? "Corrected" : "Requested correcting"} ${name}'s attendance on ${fromDate(record.session.date)} from ${ATTENDANCE_STATUS_LABELS[record.status]} to ${ATTENDANCE_STATUS_LABELS[input.toStatus]}`,
          metadata: { correctionId: correction.id, justification: input.justification },
        })
      }
      return outcome
    })
    .catch((error) => {
      if (isUniqueViolation(error, "attendance_corrections")) {
        throw new ValidationError({ recordIds: ["A correction for one of these records was just requested by someone else."] })
      }
      throw error
    })
}

function skipReason(
  ctx: Ctx,
  record: { status: string; lateMinutes: number | null; reason: string | null; session: { status: AttendanceSessionStatus; date: Date }; corrections: { id: string }[] },
  input: { toStatus: string; toLateMinutes: number | null; toReason: string | null },
  policy: Policy
) {
  if (record.session.status === "DRAFT") return "The register is still a draft; edit it directly."
  if (isLockedFor(ctx, record.session, policy)) return "The register is locked."
  if (record.corrections.length > 0) return "A correction is already waiting for review."
  const toLate = input.toStatus === "LATE" ? input.toLateMinutes : null
  if (record.status === input.toStatus && record.lateMinutes === toLate && record.reason === input.toReason) return "Nothing would change."
  return null
}

// Approves or rejects pending requests. Approving applies the change unless
// the record has changed since the request (then the request is refused as
// out of date) or its register has been locked meanwhile.
export async function reviewCorrections(ctx: Ctx, raw: unknown) {
  const input = correctionReviewSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const corrections = await tx.attendanceCorrection.findMany({
      where: { id: { in: input.correctionIds }, organizationId: ctx.organization.id, status: "PENDING", studentAttendanceId: { not: null } },
      include: { studentAttendance: { select: recordSelect } },
    })
    if (corrections.length === 0) throw new NotFoundError("No pending corrections found.")
    const outcome = { approved: 0, rejected: 0, skipped: [] as { name: string; reason: string }[] }

    for (const c of corrections) {
      const record = c.studentAttendance!
      const name = fullName(record.student)
      if (c.requestedById === ctx.user.id) {
        outcome.skipped.push({ name, reason: "You can't review your own request." })
        continue
      }
      let status: AttendanceCorrectionStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED"
      let note = input.note
      if (status === "APPROVED") {
        if (record.session.status === "LOCKED") {
          outcome.skipped.push({ name, reason: "The register is locked; reopen it first." })
          continue
        }
        if (record.status !== c.fromStatus) {
          status = "REJECTED"
          note = "Out of date: the record changed after this request."
        }
      }
      // Guard against a concurrent review: only a still-pending row changes.
      const changed = await tx.attendanceCorrection.updateMany({
        where: { id: c.id, status: "PENDING" },
        data: { status, reviewedById: ctx.user.id, reviewedAt: new Date(), reviewNote: note, ...(status === "APPROVED" && { appliedAt: new Date() }) },
      })
      if (changed.count === 0) continue
      if (status === "APPROVED") {
        await applyChange(tx, ctx, record.id, { toStatus: c.toStatus, toLateMinutes: c.toLateMinutes, toReason: c.toReason })
        outcome.approved++
      } else {
        outcome.rejected++
      }
      await audit(tx, ctx, {
        action: status === "APPROVED" ? "attendance.correction.approve" : "attendance.correction.reject",
        entityType: "student_attendance",
        entityId: record.id,
        summary: `${status === "APPROVED" ? "Approved" : "Rejected"} correcting ${name}'s attendance on ${fromDate(record.session.date)} to ${ATTENDANCE_STATUS_LABELS[c.toStatus]}`,
        metadata: { correctionId: c.id, note },
      })
    }
    return outcome
  })
}

export async function cancelCorrection(ctx: Ctx, correctionId: string) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.attendanceCorrection.findFirst({
      where: { id: correctionId, organizationId: ctx.organization.id, status: "PENDING", requestedById: ctx.user.id },
    })
    if (!c) throw new NotFoundError("Pending request not found.")
    await tx.attendanceCorrection.update({ where: { id: c.id }, data: { status: "CANCELLED", reviewedAt: new Date() } })
    await audit(tx, ctx, {
      action: "attendance.correction.cancel", entityType: "student_attendance", entityId: c.studentAttendanceId,
      summary: "Cancelled an attendance correction request",
    })
  })
}

// ---------------------------------------------------------------- reading

export async function listCorrections(ctx: Ctx, options: { status?: AttendanceCorrectionStatus | "ALL"; take?: number } = {}) {
  const policy = await getPolicy(ctx)
  const scope = await recordScopeWhere(ctx)
  const rows = await prisma.attendanceCorrection.findMany({
    where: {
      organizationId: ctx.organization.id,
      ...(options.status && options.status !== "ALL" && { status: options.status }),
      OR: [
        { studentAttendance: scope },
        { requestedById: ctx.user.id, studentAttendanceId: { not: null } },
      ],
      studentAttendanceId: { not: null },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: options.take ?? 200,
    select: {
      id: true, status: true, fromStatus: true, toStatus: true, fromLateMinutes: true, toLateMinutes: true, toReason: true,
      justification: true, reviewNote: true, createdAt: true, reviewedAt: true, requestedById: true,
      requestedBy: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true, email: true } },
      studentAttendance: {
        select: {
          id: true, date: true, sessionType: true,
          student: { select: { firstName: true, middleName: true, lastName: true, admissionNumber: true } },
          session: {
            select: {
              slot: true, sessionType: true,
              class: { select: { name: true } },
              section: { select: { name: true } },
              subjectOffering: { select: { subject: { select: { name: true } } } },
            },
          },
        },
      },
    },
  })
  return rows.map((r) => {
    const rec = r.studentAttendance!
    return {
      id: r.id,
      status: r.status,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      fromLateMinutes: r.fromLateMinutes,
      toLateMinutes: r.toLateMinutes,
      toReason: r.toReason,
      justification: r.justification,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      mine: r.requestedById === ctx.user.id,
      requestedBy: r.requestedBy?.name || r.requestedBy?.email || "—",
      reviewedBy: r.reviewedBy?.name || r.reviewedBy?.email || null,
      recordId: rec.id,
      date: fromDate(rec.date),
      studentName: fullName(rec.student),
      admissionNumber: rec.student.admissionNumber,
      register: [
        rec.session.class.name,
        rec.session.section?.name,
        rec.session.subjectOffering?.subject.name,
        slotLabel(rec.session.sessionType, rec.session.slot, policy.dailySlots),
      ]
        .filter(Boolean)
        .join(" · "),
    }
  })
}

export type CorrectionRow = Awaited<ReturnType<typeof listCorrections>>[number]

// A record's full history: every correction, newest first.
export async function recordHistory(ctx: Ctx, recordId: string) {
  const scope = await recordScopeWhere(ctx)
  const record = await prisma.studentAttendance.findFirst({
    where: { AND: [{ id: recordId, organizationId: ctx.organization.id }, scope] },
    select: {
      id: true, status: true, createdAt: true,
      markedBy: { select: { name: true, email: true } },
      corrections: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, status: true, fromStatus: true, toStatus: true, justification: true, reviewNote: true, createdAt: true, reviewedAt: true,
          requestedBy: { select: { name: true, email: true } },
          reviewedBy: { select: { name: true, email: true } },
        },
      },
    },
  })
  if (!record) throw new NotFoundError("Attendance record not found.")
  return record
}
