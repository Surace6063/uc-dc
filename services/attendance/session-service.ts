import "server-only"

import type { RegisterTarget } from "@/features/attendance/access"
import {
  atLocalTime,
  localDate,
  localTime,
  scopeKey as buildScopeKey,
  SESSION_TYPE_LABELS,
  slotLabel,
  studentStatuses,
} from "@/features/attendance/constants"
import type { SessionFilters } from "@/features/attendance/filters"
import {
  registerScopeSchema,
  reopenSessionSchema,
  saveRegisterSchema,
  sessionIdsSchema,
  type RegisterScope,
} from "@/features/attendance/schemas"
import { fullName } from "@/features/students/constants"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { AttendanceSessionStatus, AttendanceStatus, Prisma } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { fromDate, toDate } from "@/lib/validation"
import { assertCanTake, canSeeAll, sessionScopeWhere } from "@/services/attendance/access-service"
import { getPolicy, nonWorkingDays, type Policy } from "@/services/attendance/policy-service"
import { audit } from "@/services/audit/audit-service"

// Attendance registers (sessions) and the records in them.
//
// A register's scope is checked against the organisation every time: the
// year, class, section and subject offering must all be this organisation's
// and fit together; the date must fall in the academic year, not in the
// future, and (unless the policy allows it) not on a holiday or weekly off
// day. Students are eligible when an enrollment placed them in the class (and
// section, and a section that takes the subject) on that date.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma

function fieldError(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

const COUNTED: AttendanceSessionStatus[] = ["SUBMITTED", "LOCKED"]
export const countedSessionWhere = { status: { in: COUNTED } } satisfies Prisma.AttendanceSessionWhereInput

// --------------------------------------------------------------- the scope

export type ResolvedTarget = Awaited<ReturnType<typeof resolveTarget>>

// Loads and checks a register's scope. `forWrite` adds the rules that only
// apply to taking attendance (no archived class, no future date, no
// non-working day); reading a past register only needs ownership.
export async function resolveTarget(db: Db, ctx: Pick<AuthContext, "organization">, scope: RegisterScope, policy: Policy, forWrite: boolean) {
  const organizationId = ctx.organization.id
  const [year, academicClass] = await Promise.all([
    db.academicYear.findFirst({
      where: { id: scope.academicYearId, organizationId },
      select: { id: true, name: true, startDate: true, endDate: true, status: true },
    }),
    db.academicClass.findFirst({
      where: { id: scope.classId, organizationId },
      select: {
        id: true, name: true, educationLevelId: true, programId: true, archivedAt: true,
        sections: { where: { archivedAt: null, isActive: true }, select: { id: true } },
      },
    }),
  ])
  if (!year) fieldError("academicYearId", "Choose a valid academic year.")
  if (!academicClass) fieldError("classId", "Choose a valid class.")

  const section = scope.sectionId
    ? await db.section.findFirst({
        where: { id: scope.sectionId, classId: academicClass.id, organizationId },
        select: { id: true, name: true, archivedAt: true },
      })
    : null
  if (scope.sectionId && !section) fieldError("sectionId", "Choose a section of this class.")

  let offering: { id: string; subjectId: string; subject: { name: string; code: string }; sectionIds: string[] } | null = null
  if (scope.sessionType === "PERIOD") {
    const row = await db.subjectOffering.findFirst({
      where: { id: scope.subjectOfferingId!, organizationId, classId: academicClass.id, academicYearId: year.id },
      select: {
        id: true, subjectId: true, status: true,
        subject: { select: { name: true, code: true } },
        sections: { select: { sectionId: true } },
      },
    })
    if (!row) fieldError("subjectOfferingId", "Choose a subject this class studies in this academic year.")
    offering = { id: row.id, subjectId: row.subjectId, subject: row.subject, sectionIds: row.sections.map((s) => s.sectionId) }
    if (section && offering.sectionIds.length > 0 && !offering.sectionIds.includes(section.id)) {
      fieldError("sectionId", `${row.subject.name} isn't taught in section ${section.name}.`)
    }
    if (forWrite && row.status !== "ACTIVE") fieldError("subjectOfferingId", "This subject has been discontinued for the class.")
  }

  const date = scope.date
  if (date < fromDate(year.startDate) || date > fromDate(year.endDate)) {
    fieldError("date", `The date must fall within ${year.name} (${fromDate(year.startDate)} to ${fromDate(year.endDate)}).`)
  }

  const warnings: string[] = []
  const closed = (
    await nonWorkingDays(ctx, { from: date, to: date }, { audience: "students", educationLevelId: academicClass.educationLevelId, policy, db })
  ).get(date)

  if (forWrite) {
    if (date > localDate()) fieldError("date", "Attendance can't be taken for a future date.")
    if (year.status === "ARCHIVED") throw new ConflictError(`${year.name} is archived; its attendance can't change.`)
    if (academicClass.archivedAt) throw new ConflictError(`${academicClass.name} is archived.`)
    if (section?.archivedAt) throw new ConflictError(`Section ${section.name} is archived.`)
    if (scope.sessionType === "DAILY" && !policy.dailyEnabled) throw new ConflictError("Daily attendance is turned off in the attendance policy.")
    if (scope.sessionType === "PERIOD" && !policy.periodEnabled) throw new ConflictError("Period attendance is turned off in the attendance policy.")
    if (scope.sessionType === "DAILY" && scope.slot > policy.dailySlots) fieldError("slot", "Choose a valid part of the day.")
    if (scope.sessionType === "PERIOD" && scope.slot > policy.maxPeriodsPerDay) fieldError("slot", `Choose a period from 1 to ${policy.maxPeriodsPerDay}.`)
    if (closed && !policy.allowOnNonWorkingDays) throw new ConflictError(`${date} is a non-working day (${closed}).`)
  }
  if (closed) warnings.push(`${date} is a non-working day (${closed}).`)
  if (!scope.sectionId && academicClass.sections.length > 0) {
    warnings.push("This register covers the whole class. Students already marked in a section register for the same day are left out.")
  }

  const key = buildScopeKey(scope.sessionType, scope.slot, offering?.id ?? null)
  const target: RegisterTarget = {
    academicYearId: year.id,
    classId: academicClass.id,
    sectionId: section?.id ?? null,
    sessionType: scope.sessionType,
    subjectId: offering?.subjectId ?? null,
  }
  return { scope, year, academicClass, section, offering, scopeKey: key, target, nonWorkingDay: closed ?? null, warnings }
}

async function findSession(db: Db, organizationId: string, t: ResolvedTarget) {
  return db.attendanceSession.findFirst({
    where: {
      organizationId,
      classId: t.academicClass.id,
      sectionId: t.section?.id ?? null,
      date: toDate(t.scope.date),
      scopeKey: t.scopeKey,
    },
  })
}

// Enrollments that place students in the register's class (and section, and
// sections taking the subject) on its date. Closed placements count for
// dates before they ended, so past registers keep their students.
async function eligibleEnrollments(db: Db, organizationId: string, t: ResolvedTarget) {
  const date = toDate(t.scope.date)
  const sectionWhere: Prisma.EnrollmentWhereInput = t.section
    ? { sectionId: t.section.id }
    : t.offering && t.offering.sectionIds.length > 0
      ? { sectionId: { in: t.offering.sectionIds } }
      : {}
  const rows = await db.enrollment.findMany({
    where: {
      organizationId,
      academicYearId: t.year.id,
      classId: t.academicClass.id,
      ...sectionWhere,
      enrollmentDate: { lte: date },
      OR: [{ status: "ACTIVE" }, { status: { notIn: ["ACTIVE", "ON_HOLD", "CANCELLED"] }, endedOn: { gte: date } }],
      student: { archivedAt: null },
    },
    orderBy: [{ status: "asc" }, { enrollmentDate: "desc" }],
    select: {
      id: true, studentId: true, sectionId: true, rollNumber: true, status: true,
      section: { select: { name: true } },
      student: {
        select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, profileImagePath: true, gender: true },
      },
    },
  })
  // One placement per student (an open one first).
  const byStudent = new Map<string, (typeof rows)[number]>()
  for (const row of rows) if (!byStudent.has(row.studentId)) byStudent.set(row.studentId, row)
  return byStudent
}

const rollOrder = (a: string | null, b: string | null) => {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  const na = Number(a)
  const nb = Number(b)
  return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b)
}

// Submitted registers older than the policy's lock period are closed for
// everyone except those who approve corrections; LOCKED ones for everyone.
export function isLockedFor(ctx: Pick<AuthContext, "permissions">, session: { status: AttendanceSessionStatus; date: Date }, policy: Policy) {
  if (session.status === "LOCKED") return true
  if (session.status !== "SUBMITTED" || policy.lockAfterDays === null) return false
  if (hasPermission(ctx, "attendance.approve")) return false
  const ageDays = (toDate(localDate()).getTime() - session.date.getTime()) / 86_400_000
  return ageDays > policy.lockAfterDays
}

// ------------------------------------------------------------- the register

// Everything the take-attendance page needs for one scope: the register (if
// one exists), its records, the eligible students and what the caller may
// do. Reading needs the same rights as taking, or attendance.view_all.
export async function getRegister(ctx: Ctx, rawScope: unknown) {
  const scope = registerScopeSchema.parse(rawScope)
  const organizationId = ctx.organization.id
  const policy = await getPolicy(ctx)
  const t = await resolveTarget(prisma, ctx, scope, policy, false)

  let canTake = true
  try {
    await assertCanTake(ctx, t.target)
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error
    canTake = false
  }
  if (!canTake && !canSeeAll(ctx)) throw new ForbiddenError("You can only open registers for classes and subjects you teach.")

  const [session, enrollments] = await Promise.all([findSession(prisma, organizationId, t), eligibleEnrollments(prisma, organizationId, t)])
  const records = session
    ? await prisma.studentAttendance.findMany({
        where: { sessionId: session.id, organizationId },
        select: {
          id: true, studentId: true, status: true, checkInAt: true, lateMinutes: true, reason: true, remarks: true,
          correctedAt: true, updatedAt: true,
          corrections: { where: { status: "PENDING" }, select: { id: true } },
          student: { select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, profileImagePath: true, gender: true } },
          enrollment: { select: { rollNumber: true, section: { select: { name: true } } } },
        },
      })
    : []
  // Students marked for the same day and scope in another register (e.g. a
  // section register when this one is for the whole class).
  const elsewhere = await prisma.studentAttendance.findMany({
    where: {
      organizationId,
      studentId: { in: [...enrollments.keys()] },
      date: toDate(scope.date),
      scopeKey: t.scopeKey,
      ...(session && { sessionId: { not: session.id } }),
    },
    select: { studentId: true, session: { select: { section: { select: { name: true } } } } },
  })
  const elsewhereBy = new Map(elsewhere.map((r) => [r.studentId, r.session.section?.name ?? "whole class"]))

  const recordBy = new Map(records.map((r) => [r.studentId, r]))
  const students = [
    ...[...enrollments.values()].map((e) => ({ student: e.student, rollNumber: e.rollNumber, sectionName: e.section?.name ?? null, eligible: true })),
    // Marked earlier but no longer placed here (e.g. a placement corrected later).
    ...records
      .filter((r) => !enrollments.has(r.studentId))
      .map((r) => ({ student: r.student, rollNumber: r.enrollment.rollNumber, sectionName: r.enrollment.section?.name ?? null, eligible: false })),
  ]
    .map(({ student, rollNumber, sectionName, eligible }) => {
      const record = recordBy.get(student.id)
      return {
        studentId: student.id,
        name: fullName(student),
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNumber: student.admissionNumber,
        profileImagePath: student.profileImagePath,
        rollNumber,
        sectionName,
        eligible,
        markedElsewhere: elsewhereBy.get(student.id) ?? null,
        record: record
          ? {
              id: record.id,
              status: record.status,
              checkInTime: record.checkInAt ? localTime(record.checkInAt) : null,
              lateMinutes: record.lateMinutes,
              reason: record.reason,
              remarks: record.remarks,
              corrected: record.correctedAt !== null,
              pendingCorrection: record.corrections.length > 0,
            }
          : null,
      }
    })
    .sort((a, b) => rollOrder(a.rollNumber, b.rollNumber) || a.name.localeCompare(b.name))

  const locked = session ? isLockedFor(ctx, session, policy) : false
  return {
    scope,
    title: registerTitle(t, policy),
    yearName: t.year.name,
    warnings: t.warnings,
    nonWorkingDay: t.nonWorkingDay,
    blockedByCalendar: t.nonWorkingDay !== null && !policy.allowOnNonWorkingDays && !session,
    isFuture: scope.date > localDate(),
    session: session
      ? {
          id: session.id,
          status: session.status,
          updatedAt: session.updatedAt.toISOString(),
          submittedAt: session.submittedAt,
          notes: session.notes,
          locked,
        }
      : null,
    students,
    statuses: studentStatuses(policy),
    defaultStatus: policy.defaultStatus,
    canTake: canTake && (!session || session.status === "DRAFT"),
    canCorrect:
      !!session && session.status !== "DRAFT" && !locked &&
      (hasPermission(ctx, "attendance.update") || hasPermission(ctx, "attendance.approve")),
    canApprove: hasPermission(ctx, "attendance.approve"),
    // Whether a correction from this user applies at once or waits for review.
    correctionsDirect: hasPermission(ctx, "attendance.approve") || !policy.correctionsRequireApproval,
  }
}

export type RegisterData = Awaited<ReturnType<typeof getRegister>>
export type RegisterStudent = RegisterData["students"][number]

function registerTitle(t: ResolvedTarget, policy: Policy) {
  return [
    t.academicClass.name,
    t.section ? `Section ${t.section.name}` : null,
    t.offering ? t.offering.subject.name : null,
    slotLabel(t.scope.sessionType, t.scope.slot, policy.dailySlots),
  ]
    .filter(Boolean)
    .join(" · ")
}

// Saves a register as a draft or submits it, in one transaction: either every
// mark is written or none is. Submitted registers can't be changed here
// (corrections only), and a register changed by someone else since the form
// loaded is refused rather than overwritten. Re-sending the same request is
// harmless: marks are keyed by (register, student), and a second "submit"
// finds the register already submitted.
export async function saveRegister(ctx: Ctx, raw: unknown) {
  const input = saveRegisterSchema.parse(raw)
  const organizationId = ctx.organization.id
  const policy = await getPolicy(ctx)
  const allowed = new Set(studentStatuses(policy))

  const ids = input.entries.map((e) => e.studentId)
  if (new Set(ids).size !== ids.length) fieldError("entries", "A student appears twice in the register.")
  input.entries.forEach((entry, i) => {
    if (entry.status && !allowed.has(entry.status)) {
      throw new ValidationError({ [`entries.${i}.status`]: ["This status isn't used for students here."] })
    }
  })

  const result = await prisma
    .$transaction(async (tx) => {
      const t = await resolveTarget(tx, ctx, input.scope, policy, true)
      await assertCanTake(ctx, t.target, tx)

      let session = await findSession(tx, organizationId, t)
      if (session && session.id !== input.sessionId) {
        throw new ConflictError("Someone else has started this register. Reload to see their marks.")
      }
      if (!session && input.sessionId) throw new ConflictError("This register no longer exists. Reload the page.")
      if (session && input.expectedUpdatedAt && session.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new ConflictError("This register was changed by someone else after you opened it. Reload to see the latest marks.")
      }
      if (session && session.status !== "DRAFT") {
        throw new ConflictError("This register has already been submitted. Changes now go through a correction.")
      }
      if (!session) {
        session = await tx.attendanceSession.create({
          data: {
            organizationId,
            academicYearId: t.year.id,
            sessionType: input.scope.sessionType,
            date: toDate(input.scope.date),
            slot: input.scope.slot,
            scopeKey: t.scopeKey,
            classId: t.academicClass.id,
            sectionId: t.section?.id ?? null,
            subjectOfferingId: t.offering?.id ?? null,
            takenById: ctx.user.id,
            notes: input.notes,
          },
        })
      }

      const enrollments = await eligibleEnrollments(tx, organizationId, t)
      const existing = new Map(
        (await tx.studentAttendance.findMany({ where: { sessionId: session.id, organizationId } })).map((r) => [r.studentId, r])
      )
      const unknown = input.entries.filter((e) => !enrollments.has(e.studentId) && !(existing.has(e.studentId) && e.status === null))
      if (unknown.length) {
        fieldError("entries", `${unknown.length} student${unknown.length === 1 ? " isn't" : "s aren't"} placed in this class on this date.`)
      }

      const marking = input.entries.filter((e) => e.status !== null).map((e) => e.studentId)
      const clashes = await tx.studentAttendance.findMany({
        where: { organizationId, studentId: { in: marking }, date: toDate(input.scope.date), scopeKey: t.scopeKey, sessionId: { not: session.id } },
        select: { student: { select: { firstName: true, middleName: true, lastName: true } } },
      })
      if (clashes.length) {
        fieldError(
          "entries",
          `Already marked in another register for this day: ${clashes.slice(0, 5).map((c) => fullName(c.student)).join(", ")}${clashes.length > 5 ? "…" : ""}.`
        )
      }

      let created = 0
      let updated = 0
      let cleared = 0
      const toCreate: Prisma.StudentAttendanceCreateManyInput[] = []
      for (const entry of input.entries) {
        const current = existing.get(entry.studentId)
        if (entry.status === null) {
          if (current) {
            await tx.studentAttendance.delete({ where: { id: current.id } })
            cleared++
          }
          continue
        }
        const values = {
          status: entry.status,
          checkInAt: entry.checkInTime && entry.status !== "ABSENT" ? atLocalTime(input.scope.date, entry.checkInTime) : null,
          lateMinutes: entry.status === "LATE" ? entry.lateMinutes : null,
          reason: entry.reason,
          remarks: entry.remarks,
        }
        if (!current) {
          const enrollment = enrollments.get(entry.studentId)!
          toCreate.push({
            ...values,
            organizationId,
            sessionId: session.id,
            studentId: entry.studentId,
            enrollmentId: enrollment.id,
            academicYearId: t.year.id,
            classId: t.academicClass.id,
            sectionId: enrollment.sectionId,
            subjectOfferingId: t.offering?.id ?? null,
            sessionType: input.scope.sessionType,
            date: toDate(input.scope.date),
            scopeKey: t.scopeKey,
            markedById: ctx.user.id,
          })
        } else if (
          current.status !== values.status ||
          current.checkInAt?.getTime() !== values.checkInAt?.getTime() ||
          current.lateMinutes !== values.lateMinutes ||
          current.reason !== values.reason ||
          current.remarks !== values.remarks
        ) {
          await tx.studentAttendance.update({ where: { id: current.id }, data: { ...values, markedById: ctx.user.id } })
          updated++
        }
      }
      if (toCreate.length) created = (await tx.studentAttendance.createMany({ data: toCreate })).count

      const counts = await tx.studentAttendance.groupBy({
        by: ["status"],
        where: { sessionId: session.id, organizationId },
        _count: { _all: true },
      })
      const marked = counts.reduce((sum, c) => sum + c._count._all, 0)
      const markedIds = new Set(
        (await tx.studentAttendance.findMany({ where: { sessionId: session.id, organizationId }, select: { studentId: true } })).map((r) => r.studentId)
      )
      // Eligible students without a mark here. They are not counted as absent.
      const unmarked = [...enrollments.keys()].filter((id) => !markedIds.has(id)).length

      if (input.submit && marked === 0) fieldError("entries", "Mark at least one student before submitting.")
      const firstSubmission = input.submit && session.submittedAt === null
      session = await tx.attendanceSession.update({
        where: { id: session.id },
        data: {
          notes: input.notes,
          ...(input.submit && { status: "SUBMITTED", submittedAt: new Date(), submittedById: ctx.user.id }),
        },
      })

      const title = registerTitle(t, policy)
      await audit(tx, ctx, {
        action: input.submit ? "attendance.session.submit" : "attendance.session.save",
        entityType: "attendance_session",
        entityId: session.id,
        summary: `${input.submit ? "Submitted" : "Saved draft of"} attendance for ${title} on ${input.scope.date} (${marked} marked${unmarked ? `, ${unmarked} unmarked` : ""})`,
        metadata: { created, updated, cleared, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) },
      })

      return {
        sessionId: session.id,
        status: session.status,
        updatedAt: session.updatedAt.toISOString(),
        marked,
        unmarked,
        counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<AttendanceStatus, number>>,
        firstSubmission,
        title,
      }
    })
    .catch((error) => {
      if (isUniqueViolation(error, "attendance_sessions")) {
        throw new ConflictError("Someone else has just started this register. Reload to see their marks.")
      }
      if (isUniqueViolation(error, "student_id", "scope_key")) {
        throw new ConflictError("Some students were just marked in another register for this day. Reload and try again.")
      }
      throw error
    })

  return result
}

// ------------------------------------------------------- locking & reopening

export async function lockSessions(ctx: Ctx, rawIds: unknown) {
  const ids = sessionIdsSchema.parse(rawIds)
  return prisma.$transaction(async (tx) => {
    const sessions = await tx.attendanceSession.findMany({
      where: { id: { in: ids }, organizationId: ctx.organization.id },
      select: { id: true, status: true },
    })
    const lockable = sessions.filter((s) => s.status === "SUBMITTED").map((s) => s.id)
    if (lockable.length) {
      await tx.attendanceSession.updateMany({
        where: { id: { in: lockable }, organizationId: ctx.organization.id, status: "SUBMITTED" },
        data: { status: "LOCKED", lockedAt: new Date(), lockedById: ctx.user.id },
      })
      await audit(
        tx,
        ctx,
        lockable.map((id) => ({ action: "attendance.session.lock", entityType: "attendance_session", entityId: id, summary: "Locked an attendance register" }))
      )
    }
    return { locked: lockable.length, skipped: ids.length - lockable.length }
  })
}

// Reopens a locked register for corrections (it becomes "submitted" again).
// Drafts are never reopened: they were never closed.
export async function reopenSession(ctx: Ctx, raw: unknown) {
  const input = reopenSessionSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.findFirst({ where: { id: input.sessionId, organizationId: ctx.organization.id } })
    if (!session) throw new NotFoundError("Register not found.")
    if (session.status !== "LOCKED") throw new ConflictError("Only locked registers can be reopened.")
    await tx.attendanceSession.update({
      where: { id: session.id },
      data: { status: "SUBMITTED", lockedAt: null, lockedById: null },
    })
    await audit(tx, ctx, {
      action: "attendance.session.reopen", entityType: "attendance_session", entityId: session.id,
      summary: `Reopened a locked attendance register (${fromDate(session.date)})`, metadata: { reason: input.reason },
    })
  })
}

// --------------------------------------------------------------- the list

export async function listSessions(ctx: Ctx, filters: SessionFilters) {
  const organizationId = ctx.organization.id
  const policy = await getPolicy(ctx)
  const where: Prisma.AttendanceSessionWhereInput = {
    AND: [
      { organizationId },
      await sessionScopeWhere(ctx),
      filters.year ? { academicYearId: filters.year } : {},
      filters.class ? { classId: filters.class } : {},
      filters.section ? { sectionId: filters.section } : {},
      filters.type ? { sessionType: filters.type } : {},
      filters.status ? { status: filters.status } : {},
      filters.from ? { date: { gte: toDate(filters.from) } } : {},
      filters.to ? { date: { lte: toDate(filters.to) } } : {},
    ],
  }
  const [total, rows] = await Promise.all([
    prisma.attendanceSession.count({ where }),
    prisma.attendanceSession.findMany({
      where,
      orderBy: [{ date: "desc" }, { class: { sequence: "asc" } }, { slot: "asc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true, date: true, sessionType: true, slot: true, status: true, submittedAt: true, academicYearId: true,
        classId: true, sectionId: true, subjectOfferingId: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
        subjectOffering: { select: { subject: { select: { name: true, code: true } } } },
        takenBy: { select: { name: true, email: true } },
      },
    }),
  ])
  const counts = await prisma.studentAttendance.groupBy({
    by: ["sessionId", "status"],
    where: { organizationId, sessionId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  })
  return {
    total,
    rows: rows.map((r) => {
      const mine = counts.filter((c) => c.sessionId === r.id)
      const count = (s: AttendanceStatus) => mine.find((c) => c.status === s)?._count._all ?? 0
      return {
        id: r.id,
        date: fromDate(r.date),
        type: r.sessionType,
        typeLabel: SESSION_TYPE_LABELS[r.sessionType],
        slotLabel: slotLabel(r.sessionType, r.slot, policy.dailySlots),
        slot: r.slot,
        status: r.status,
        locked: isLockedFor(ctx, r, policy),
        academicYearId: r.academicYearId,
        classId: r.classId,
        sectionId: r.sectionId,
        subjectOfferingId: r.subjectOfferingId,
        className: r.class.name,
        sectionName: r.section?.name ?? null,
        subjectName: r.subjectOffering?.subject.name ?? null,
        takenBy: r.takenBy?.name || r.takenBy?.email || null,
        submittedAt: r.submittedAt,
        marked: mine.reduce((sum, c) => sum + c._count._all, 0),
        present: count("PRESENT") + count("LATE"),
        absent: count("ABSENT"),
      }
    }),
  }
}

export type SessionRow = Awaited<ReturnType<typeof listSessions>>["rows"][number]
