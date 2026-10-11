import "server-only"

import {
  ATTENDANCE_STATUS_LABELS,
  atLocalTime,
  employeeStatuses,
  localDate,
  localTime,
} from "@/features/attendance/constants"
import { employedOn, statusForCheckIn } from "@/features/attendance/employees"
import type { EmployeeFilters } from "@/features/attendance/filters"
import { employeeRegisterSchema } from "@/features/attendance/schemas"
import { fullName } from "@/features/students/constants"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { EmployeeType, Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { fromDate, toDate } from "@/lib/validation"
import { getPolicy, nonWorkingDays, type Policy } from "@/services/attendance/policy-service"
import { audit } from "@/services/audit/audit-service"

// Teacher and staff attendance: one record per person per working day,
// separate from student registers. Recorded by HR / attendance staff
// (attendance.staff.manage), or by employees themselves when the policy
// allows self check-in. Employment dates are respected, leave is a status
// ("On leave") rather than presence, and payroll only ever reads this data.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

function fieldError(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

const personSelect = {
  id: true, employeeId: true, firstName: true, middleName: true, lastName: true, userId: true, profileImagePath: true,
  dateOfJoining: true, employmentStatus: true, contractEndDate: true, archivedAt: true,
  designation: { select: { name: true } },
} as const

function period(p: { dateOfJoining: Date; employmentStatus: string; contractEndDate: Date | null; lastWorkingDate?: Date | null; terminationDate?: Date | null }) {
  return {
    dateOfJoining: fromDate(p.dateOfJoining),
    employmentStatus: p.employmentStatus,
    contractEndDate: p.contractEndDate ? fromDate(p.contractEndDate) : null,
    lastWorkingDate: p.lastWorkingDate ? fromDate(p.lastWorkingDate) : null,
    terminationDate: p.terminationDate ? fromDate(p.terminationDate) : null,
  }
}

// Everyone employed on a date (teachers and staff), with their record for
// that day if any. People who have left keep showing for days they worked.
export async function getEmployeeRegister(ctx: Ctx, date: string, type?: EmployeeType) {
  const organizationId = ctx.organization.id
  const policy = await getPolicy(ctx)
  const day = toDate(date)
  const [teachers, staff, records, closed] = await Promise.all([
    type === "STAFF"
      ? []
      : prisma.teacher.findMany({
          where: { organizationId, dateOfJoining: { lte: day }, OR: [{ archivedAt: null }, { attendance: { some: { date: day } } }] },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
          select: personSelect,
        }),
    type === "TEACHER"
      ? []
      : prisma.staff.findMany({
          where: { organizationId, dateOfJoining: { lte: day }, OR: [{ archivedAt: null }, { attendance: { some: { date: day } } }] },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
          select: { ...personSelect, lastWorkingDate: true, terminationDate: true, department: { select: { name: true } } },
        }),
    prisma.employeeAttendance.findMany({
      where: { organizationId, date: day, ...(type && { employeeType: type }) },
      select: {
        id: true, teacherId: true, staffId: true, status: true, checkInAt: true, checkOutAt: true, lateMinutes: true,
        reason: true, remarks: true, source: true, correctedAt: true,
      },
    }),
    nonWorkingDays(ctx, { from: date, to: date }, { audience: "employees", policy }),
  ])
  const byTeacher = new Map(records.filter((r) => r.teacherId).map((r) => [r.teacherId!, r]))
  const byStaff = new Map(records.filter((r) => r.staffId).map((r) => [r.staffId!, r]))
  const toRecord = (r: (typeof records)[number] | undefined) =>
    r
      ? {
          id: r.id,
          status: r.status,
          checkInTime: r.checkInAt ? localTime(r.checkInAt) : null,
          checkOutTime: r.checkOutAt ? localTime(r.checkOutAt) : null,
          lateMinutes: r.lateMinutes,
          reason: r.reason,
          remarks: r.remarks,
          source: r.source,
          corrected: r.correctedAt !== null,
        }
      : null

  const people = [
    ...teachers
      .filter((t) => byTeacher.has(t.id) || (!t.archivedAt && employedOn(period(t), date)))
      .map((t) => ({ type: "TEACHER" as const, id: t.id, employeeId: t.employeeId, name: fullName(t), role: t.designation?.name ?? "Teacher", profileImagePath: t.profileImagePath, record: toRecord(byTeacher.get(t.id)) })),
    ...staff
      .filter((s) => byStaff.has(s.id) || (!s.archivedAt && employedOn(period(s), date)))
      .map((s) => ({ type: "STAFF" as const, id: s.id, employeeId: s.employeeId, name: fullName(s), role: [s.designation?.name, s.department?.name].filter(Boolean).join(" · ") || "Staff", profileImagePath: s.profileImagePath, record: toRecord(byStaff.get(s.id)) })),
  ]
  return {
    date,
    people,
    statuses: employeeStatuses(policy),
    nonWorkingDay: closed.get(date) ?? null,
    isFuture: date > localDate(),
    isPast: date < localDate(),
    enabled: policy.employeeAttendanceEnabled,
    policy: { workdayStartTime: policy.workdayStartTime, lateGraceMinutes: policy.lateGraceMinutes, allowOnNonWorkingDays: policy.allowOnNonWorkingDays },
  }
}

export type EmployeeRegister = Awaited<ReturnType<typeof getEmployeeRegister>>
export type EmployeeRegisterRow = EmployeeRegister["people"][number]

async function loadPeople(ctx: Ctx, ids: { teacherIds: string[]; staffIds: string[] }) {
  const organizationId = ctx.organization.id
  const [teachers, staff] = await Promise.all([
    prisma.teacher.findMany({ where: { organizationId, id: { in: ids.teacherIds } }, select: personSelect }),
    prisma.staff.findMany({ where: { organizationId, id: { in: ids.staffIds } }, select: { ...personSelect, lastWorkingDate: true, terminationDate: true } }),
  ])
  return { teachers: new Map(teachers.map((t) => [t.id, t])), staff: new Map(staff.map((s) => [s.id, s])) }
}

function assertWorkingDay(policy: Policy, date: string, closed: string | undefined) {
  if (!policy.employeeAttendanceEnabled) throw new ConflictError("Teacher and staff attendance is turned off in the attendance policy.")
  if (date > localDate()) fieldError("date", "Attendance can't be recorded for a future date.")
  if (closed && !policy.allowOnNonWorkingDays) throw new ConflictError(`${date} is a non-working day (${closed}).`)
}

// Saves the day's register. Changing an earlier day's existing records needs
// a justification and is kept as a correction (before and after values).
export async function saveEmployeeRegister(ctx: Ctx, raw: unknown) {
  const input = employeeRegisterSchema.parse(raw)
  const organizationId = ctx.organization.id
  const policy = await getPolicy(ctx)
  const closed = (await nonWorkingDays(ctx, { from: input.date, to: input.date }, { audience: "employees", policy })).get(input.date)
  assertWorkingDay(policy, input.date, closed)
  const allowed = new Set(employeeStatuses(policy))
  const keys = input.entries.map((e) => `${e.employeeType}:${e.employeeId}`)
  if (new Set(keys).size !== keys.length) fieldError("entries", "A person appears twice.")

  const people = await loadPeople(ctx, {
    teacherIds: input.entries.filter((e) => e.employeeType === "TEACHER").map((e) => e.employeeId),
    staffIds: input.entries.filter((e) => e.employeeType === "STAFF").map((e) => e.employeeId),
  })
  const day = toDate(input.date)
  const isPastDay = input.date < localDate()

  return prisma
    .$transaction(async (tx) => {
      const existing = await tx.employeeAttendance.findMany({ where: { organizationId, date: day } })
      const existingFor = (type: EmployeeType, id: string) => existing.find((r) => (type === "TEACHER" ? r.teacherId : r.staffId) === id)
      const outcome = { created: 0, updated: 0, cleared: 0, corrected: 0 }

      for (const [i, entry] of input.entries.entries()) {
        const person = entry.employeeType === "TEACHER" ? people.teachers.get(entry.employeeId) : people.staff.get(entry.employeeId)
        if (!person) throw new ValidationError({ [`entries.${i}`]: ["Not one of this organisation's teachers or staff."] })
        const name = fullName(person)
        const current = existingFor(entry.employeeType, entry.employeeId)
        if (!current && !employedOn(period(person), input.date)) {
          throw new ValidationError({ [`entries.${i}`]: [`${name} wasn't employed on ${input.date}.`] })
        }
        if (entry.status && !allowed.has(entry.status)) throw new ValidationError({ [`entries.${i}.status`]: ["This status isn't used here."] })

        if (entry.status === null) {
          if (current) {
            if (isPastDay) throw new ValidationError({ [`entries.${i}`]: [`${name}'s record for an earlier day can be corrected, not removed.`] })
            await tx.employeeAttendance.delete({ where: { id: current.id } })
            outcome.cleared++
          }
          continue
        }
        const implied = statusForCheckIn(entry.status, entry.checkInTime, policy)
        const values = {
          status: implied.status,
          checkInAt: entry.checkInTime && implied.status !== "ABSENT" && implied.status !== "ON_LEAVE" ? atLocalTime(input.date, entry.checkInTime) : null,
          checkOutAt: entry.checkOutTime && implied.status !== "ABSENT" && implied.status !== "ON_LEAVE" ? atLocalTime(input.date, entry.checkOutTime) : null,
          lateMinutes: implied.status === "LATE" ? (entry.lateMinutes ?? implied.lateMinutes) : null,
          reason: entry.reason,
          remarks: entry.remarks,
        }
        if (values.checkInAt && values.checkOutAt && values.checkOutAt < values.checkInAt) {
          throw new ValidationError({ [`entries.${i}.checkOutTime`]: [`${name}: check-out can't be before check-in.`] })
        }
        if (!current) {
          await tx.employeeAttendance.create({
            data: {
              ...values,
              organizationId,
              employeeType: entry.employeeType,
              teacherId: entry.employeeType === "TEACHER" ? entry.employeeId : null,
              staffId: entry.employeeType === "STAFF" ? entry.employeeId : null,
              date: day,
              markedById: ctx.user.id,
            },
          })
          outcome.created++
          continue
        }
        const statusChanged = current.status !== values.status || current.lateMinutes !== values.lateMinutes
        const otherChanged =
          current.checkInAt?.getTime() !== values.checkInAt?.getTime() ||
          current.checkOutAt?.getTime() !== values.checkOutAt?.getTime() ||
          current.reason !== values.reason ||
          current.remarks !== values.remarks
        if (!statusChanged && !otherChanged) continue
        if (isPastDay && statusChanged) {
          if (!input.justification) fieldError("justification", "Explain why an earlier day's attendance is being changed.")
          await tx.attendanceCorrection.create({
            data: {
              organizationId,
              employeeAttendanceId: current.id,
              fromStatus: current.status,
              toStatus: values.status,
              fromLateMinutes: current.lateMinutes,
              toLateMinutes: values.lateMinutes,
              fromReason: current.reason,
              toReason: values.reason,
              justification: input.justification,
              status: "APPROVED",
              requestedById: ctx.user.id,
              reviewedById: ctx.user.id,
              reviewedAt: new Date(),
              appliedAt: new Date(),
              reviewNote: "Applied directly",
            },
          })
          outcome.corrected++
          await audit(tx, ctx, {
            action: "attendance.employee.correct",
            entityType: entry.employeeType === "TEACHER" ? "teacher" : "staff",
            entityId: entry.employeeId,
            summary: `Corrected ${name}'s attendance on ${input.date} from ${ATTENDANCE_STATUS_LABELS[current.status]} to ${ATTENDANCE_STATUS_LABELS[values.status]}`,
            metadata: { justification: input.justification },
          })
        }
        await tx.employeeAttendance.update({
          where: { id: current.id },
          data: { ...values, ...(isPastDay && statusChanged ? { correctedById: ctx.user.id, correctedAt: new Date() } : { markedById: ctx.user.id }) },
        })
        outcome.updated++
      }
      await audit(tx, ctx, {
        action: "attendance.employee.save",
        entityType: "employee_attendance",
        summary: `Recorded teacher and staff attendance for ${input.date} (${outcome.created} new, ${outcome.updated} changed${outcome.cleared ? `, ${outcome.cleared} cleared` : ""})`,
        metadata: outcome,
      })
      return outcome
    })
    .catch((error) => {
      if (isUniqueViolation(error, "employee_attendance")) throw new ConflictError("Someone else just recorded attendance for the same person. Reload and try again.")
      throw error
    })
}

// ---------------------------------------------------------- self-service

// The signed-in user's teacher or staff profile here, if any.
export async function myEmployeeProfile(ctx: Pick<AuthContext, "organization" | "user">) {
  const where = { organizationId: ctx.organization.id, userId: ctx.user.id, archivedAt: null }
  const teacher = await prisma.teacher.findFirst({ where, select: personSelect })
  if (teacher) return { type: "TEACHER" as const, person: teacher, period: period(teacher) }
  const staff = await prisma.staff.findFirst({ where, select: { ...personSelect, lastWorkingDate: true, terminationDate: true } })
  if (staff) return { type: "STAFF" as const, person: staff, period: period(staff) }
  return null
}

// Check-in and check-out from the employee's own account. Times come from the
// server clock, never from the browser.
export async function selfCheck(ctx: Ctx, direction: "in" | "out") {
  const policy = await getPolicy(ctx)
  if (!policy.employeeSelfCheckIn) throw new ConflictError("Self check-in is turned off. Ask the office to record your attendance.")
  const profile = await myEmployeeProfile(ctx)
  if (!profile) throw new NotFoundError("Your account isn't linked to a teacher or staff profile.")
  const now = new Date()
  const date = localDate(now)
  const closed = (await nonWorkingDays(ctx, { from: date, to: date }, { audience: "employees", policy })).get(date)
  assertWorkingDay(policy, date, closed)
  if (!employedOn(profile.period, date)) throw new ConflictError("You aren't employed on today's date in our records.")
  const key = profile.type === "TEACHER" ? { teacherId: profile.person.id } : { staffId: profile.person.id }

  return prisma
    .$transaction(async (tx) => {
      const existing = await tx.employeeAttendance.findFirst({ where: { organizationId: ctx.organization.id, date: toDate(date), ...key } })
      if (direction === "in") {
        if (existing) throw new ConflictError(existing.checkInAt ? "You have already checked in today." : "Today's attendance has already been recorded for you.")
        const implied = statusForCheckIn("PRESENT", localTime(now), policy)
        await tx.employeeAttendance.create({
          data: {
            organizationId: ctx.organization.id,
            employeeType: profile.type,
            ...key,
            date: toDate(date),
            status: implied.status,
            lateMinutes: implied.lateMinutes,
            checkInAt: now,
            source: "SELF_SERVICE",
            markedById: ctx.user.id,
          },
        })
      } else {
        if (!existing?.checkInAt) throw new ConflictError("Check in first.")
        if (existing.checkOutAt) throw new ConflictError("You have already checked out today.")
        await tx.employeeAttendance.update({ where: { id: existing.id }, data: { checkOutAt: now } })
      }
      await audit(tx, ctx, {
        action: direction === "in" ? "attendance.employee.check_in" : "attendance.employee.check_out",
        entityType: profile.type === "TEACHER" ? "teacher" : "staff",
        entityId: profile.person.id,
        summary: `Checked ${direction} at ${localTime(now)}`,
      })
      return { time: localTime(now) }
    })
    .catch((error) => {
      if (isUniqueViolation(error, "employee_attendance")) throw new ConflictError("You have already checked in today.")
      throw error
    })
}

// ---------------------------------------------------------------- records

export function employeeRecordWhere(ctx: Pick<AuthContext, "organization">, filters: EmployeeFilters): Prisma.EmployeeAttendanceWhereInput {
  const q = filters.q
  const nameMatch = q
    ? {
        OR: [
          { firstName: { contains: q, mode: "insensitive" as const } },
          { lastName: { contains: q, mode: "insensitive" as const } },
          { employeeId: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : null
  return {
    AND: [
      { organizationId: ctx.organization.id },
      filters.type ? { employeeType: filters.type } : {},
      filters.status ? { status: filters.status } : {},
      filters.from ? { date: { gte: toDate(filters.from) } } : {},
      filters.to ? { date: { lte: toDate(filters.to) } } : {},
      nameMatch ? { OR: [{ teacher: nameMatch }, { staff: nameMatch }] } : {},
    ],
  }
}

export async function listEmployeeRecords(ctx: Pick<AuthContext, "organization">, filters: EmployeeFilters) {
  const where = employeeRecordWhere(ctx, filters)
  const orderBy: Prisma.EmployeeAttendanceOrderByWithRelationInput[] =
    filters.sort === "status"
      ? [{ status: filters.dir }, { date: "desc" }]
      : filters.sort === "name"
        ? [{ teacher: { firstName: filters.dir } }, { staff: { firstName: filters.dir } }, { date: "desc" }]
        : [{ date: filters.dir }]
  const [total, rows] = await Promise.all([
    prisma.employeeAttendance.count({ where }),
    prisma.employeeAttendance.findMany({
      where,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true, employeeType: true, date: true, status: true, checkInAt: true, checkOutAt: true, lateMinutes: true,
        reason: true, remarks: true, source: true, correctedAt: true,
        teacher: { select: { id: true, employeeId: true, firstName: true, middleName: true, lastName: true } },
        staff: { select: { id: true, employeeId: true, firstName: true, middleName: true, lastName: true } },
        markedBy: { select: { name: true, email: true } },
      },
    }),
  ])
  return {
    total,
    rows: rows.map((r) => {
      const person = r.teacher ?? r.staff!
      return {
        id: r.id,
        type: r.employeeType,
        personId: person.id,
        employeeId: person.employeeId,
        name: fullName(person),
        date: fromDate(r.date),
        status: r.status,
        checkIn: r.checkInAt ? localTime(r.checkInAt) : null,
        checkOut: r.checkOutAt ? localTime(r.checkOutAt) : null,
        lateMinutes: r.lateMinutes,
        reason: r.reason,
        remarks: r.remarks,
        source: r.source,
        corrected: r.correctedAt !== null,
        markedBy: r.markedBy?.name || r.markedBy?.email || null,
      }
    }),
  }
}

export type EmployeeRecordRow = Awaited<ReturnType<typeof listEmployeeRecords>>["rows"][number]
