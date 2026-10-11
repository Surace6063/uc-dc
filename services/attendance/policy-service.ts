import "server-only"

import { datesBetween, weekday } from "@/features/attendance/constants"
import { holidaySchema, policySchema } from "@/features/attendance/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { AttendancePolicy, HolidayAudience } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { fromDate, toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"

// The organisation's attendance rules, holidays and operating calendar.
// Nothing about methods, thresholds, weekends or holidays is hardcoded: an
// organisation without a policy row gets the defaults below.
type Ctx = Pick<AuthContext, "organization" | "user">
type Db = TransactionClient | typeof prisma

export type Policy = Omit<AttendancePolicy, "organizationId" | "updatedAt">

export const DEFAULT_POLICY: Policy = {
  dailyEnabled: true,
  periodEnabled: false,
  dailySlots: 1,
  maxPeriodsPerDay: 8,
  defaultStatus: "PRESENT",
  halfDayEnabled: false,
  lateCountsAsPresent: true,
  excusedTreatment: "EXCLUDE",
  minimumPercentage: 75,
  warningMarginPercentage: 5,
  correctionsRequireApproval: true,
  lockAfterDays: null,
  weeklyOffDays: [6],
  allowOnNonWorkingDays: false,
  notifyGuardiansOnAbsence: false,
  notifyGuardiansOnLate: false,
  employeeAttendanceEnabled: true,
  employeeSelfCheckIn: false,
  workdayStartTime: "10:00",
  lateGraceMinutes: 10,
}

export async function getPolicy(ctx: Pick<AuthContext, "organization">, db: Db = prisma): Promise<Policy> {
  const row = await db.attendancePolicy.findUnique({ where: { organizationId: ctx.organization.id } })
  if (!row) return DEFAULT_POLICY
  return Object.fromEntries(Object.keys(DEFAULT_POLICY).map((key) => [key, row[key as keyof Policy]])) as Policy
}

export async function savePolicy(ctx: Ctx, raw: unknown) {
  const input = policySchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const before = await getPolicy(ctx, tx)
    await tx.attendancePolicy.upsert({
      where: { organizationId: ctx.organization.id },
      create: { organizationId: ctx.organization.id, ...input },
      update: input,
    })
    const changed = (Object.keys(input) as (keyof typeof input)[]).filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(input[key])
    )
    if (changed.length) {
      await audit(tx, ctx, {
        action: "attendance.policy.update",
        entityType: "attendance_policy",
        summary: `Changed the attendance policy (${changed.join(", ")})`,
        metadata: { before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, input[k]])) },
      })
    }
  })
}

// ---------------------------------------------------------------- holidays

export async function listHolidays(ctx: Pick<AuthContext, "organization">, range?: { from: string; to: string }) {
  const rows = await prisma.holiday.findMany({
    where: {
      organizationId: ctx.organization.id,
      ...(range && { startDate: { lte: toDate(range.to) }, endDate: { gte: toDate(range.from) } }),
    },
    orderBy: { startDate: "asc" },
    take: 500,
    select: {
      id: true, name: true, startDate: true, endDate: true, appliesTo: true, educationLevelId: true, description: true,
      educationLevel: { select: { name: true } },
    },
  })
  return rows.map((h) => ({ ...h, startDate: fromDate(h.startDate), endDate: fromDate(h.endDate) }))
}

export type HolidayRow = Awaited<ReturnType<typeof listHolidays>>[number]

export async function saveHoliday(ctx: Ctx, id: string | null, raw: unknown) {
  const input = holidaySchema.parse(raw)
  const organizationId = ctx.organization.id
  if (input.educationLevelId) {
    const level = await prisma.educationLevel.findFirst({ where: { id: input.educationLevelId, organizationId }, select: { id: true } })
    if (!level) throw new ValidationError({ educationLevelId: ["Choose a valid education level."] })
  }
  const data = {
    name: input.name,
    startDate: toDate(input.startDate),
    endDate: toDate(input.endDate),
    appliesTo: input.appliesTo,
    educationLevelId: input.educationLevelId,
    description: input.description,
  }
  return prisma.$transaction(async (tx) => {
    let holiday
    if (id) {
      const existing = await tx.holiday.findFirst({ where: { id, organizationId }, select: { id: true } })
      if (!existing) throw new NotFoundError("Holiday not found.")
      holiday = await tx.holiday.update({ where: { id }, data })
    } else {
      holiday = await tx.holiday.create({ data: { ...data, organizationId, createdById: ctx.user.id } })
    }
    await audit(tx, ctx, {
      action: id ? "holiday.update" : "holiday.create",
      entityType: "holiday",
      entityId: holiday.id,
      summary: `${id ? "Updated" : "Added"} holiday ${input.name} (${input.startDate}${input.endDate !== input.startDate ? ` to ${input.endDate}` : ""})`,
    })
    return holiday
  })
}

export async function deleteHoliday(ctx: Ctx, id: string) {
  return prisma.$transaction(async (tx) => {
    const holiday = await tx.holiday.findFirst({ where: { id, organizationId: ctx.organization.id } })
    if (!holiday) throw new NotFoundError("Holiday not found.")
    await tx.holiday.delete({ where: { id } })
    await audit(tx, ctx, {
      action: "holiday.delete", entityType: "holiday", entityId: id,
      summary: `Removed holiday ${holiday.name} (${fromDate(holiday.startDate)})`,
    })
  })
}

// ---------------------------------------------------------------- calendar

export type NonWorkingDay = { date: string; reason: string }

// Non-working days between two dates (inclusive) for students or employees:
// the policy's weekly off days and holidays that apply to them (and, for a
// student register, to the class's education level).
export async function nonWorkingDays(
  ctx: Pick<AuthContext, "organization">,
  range: { from: string; to: string },
  options: { audience: "students" | "employees"; educationLevelId?: string | null; policy?: Policy; db?: Db }
): Promise<Map<string, string>> {
  const db = options.db ?? prisma
  const policy = options.policy ?? (await getPolicy(ctx, db))
  const audiences: HolidayAudience[] = ["ALL", options.audience === "students" ? "STUDENTS" : "EMPLOYEES"]
  const holidays = await db.holiday.findMany({
    where: {
      organizationId: ctx.organization.id,
      appliesTo: { in: audiences },
      startDate: { lte: toDate(range.to) },
      endDate: { gte: toDate(range.from) },
      // Level-specific holidays count only for that level's registers; for
      // organisation-wide figures only holidays for everyone are used.
      OR: [{ educationLevelId: null }, ...(options.educationLevelId ? [{ educationLevelId: options.educationLevelId }] : [])],
    },
    select: { name: true, startDate: true, endDate: true },
  })
  const days = new Map<string, string>()
  for (const date of datesBetween(range.from, range.to)) {
    if (policy.weeklyOffDays.includes(weekday(date))) days.set(date, "Weekly holiday")
  }
  for (const h of holidays) {
    const from = fromDate(h.startDate) < range.from ? range.from : fromDate(h.startDate)
    const to = fromDate(h.endDate) > range.to ? range.to : fromDate(h.endDate)
    for (const date of datesBetween(from, to)) days.set(date, h.name)
  }
  return days
}

// Working days in a range: the denominator for "expected" registers.
export async function workingDays(
  ctx: Pick<AuthContext, "organization">,
  range: { from: string; to: string },
  options: { audience: "students" | "employees"; policy?: Policy; db?: Db }
) {
  const closed = await nonWorkingDays(ctx, range, options)
  return datesBetween(range.from, range.to).filter((d) => !closed.has(d))
}
