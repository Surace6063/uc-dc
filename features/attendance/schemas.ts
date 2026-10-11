import { z } from "zod"

import { optionalEnum } from "@/features/academics/schemas"
import {
  AttendanceSessionType,
  AttendanceStatus,
  EmployeeType,
  ExcusedTreatment,
  HolidayAudience,
} from "@/lib/generated/prisma/enums"
import { dateString, optionalId, optionalInt, optionalText, requiredId, requiredText } from "@/lib/validation"

// Shared by the attendance forms (React Hook Form) and the server, which
// re-parses every input with the same schemas.

export const timeOfDay = z
  .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)."), z.literal("")])
  .nullish()
  .transform((value) => value || null)

// --------------------------------------------------------------- registers

// What one register covers. The server resolves and checks every ID against
// the caller's organisation; nothing here is trusted on its own.
export const registerScopeSchema = z
  .object({
    academicYearId: requiredId("Choose an academic year."),
    date: dateString("Choose the date."),
    classId: requiredId("Choose a class."),
    sectionId: optionalId,
    sessionType: z.enum(AttendanceSessionType),
    subjectOfferingId: optionalId,
    slot: z.coerce.number().int().min(1).max(20).catch(1).default(1),
  })
  .superRefine((value, ctx) => {
    if (value.sessionType === "PERIOD" && !value.subjectOfferingId) {
      ctx.addIssue({ code: "custom", path: ["subjectOfferingId"], message: "Choose the subject." })
    }
    if (value.sessionType === "DAILY" && value.subjectOfferingId) {
      ctx.addIssue({ code: "custom", path: ["subjectOfferingId"], message: "Daily attendance isn't taken per subject." })
    }
  })

export type RegisterScope = z.output<typeof registerScopeSchema>

export const registerEntrySchema = z.object({
  studentId: z.uuid(),
  // null: leave (or make) the student unmarked. Only drafts can unmark.
  status: z.enum(AttendanceStatus).nullable(),
  checkInTime: timeOfDay,
  lateMinutes: optionalInt(0, 1440),
  reason: optionalText(200),
  remarks: optionalText(500),
})

export type RegisterEntry = z.output<typeof registerEntrySchema>

export const saveRegisterSchema = z.object({
  scope: registerScopeSchema,
  // The register the form was loaded from (null for a new one) and the
  // version it saw, so two people saving the same register can't silently
  // overwrite each other.
  sessionId: z.uuid().nullable(),
  expectedUpdatedAt: z.iso.datetime().nullable(),
  entries: z.array(registerEntrySchema).max(1000, "A register can hold at most 1000 students."),
  submit: z.boolean(),
  notes: optionalText(500),
})

export const reopenSessionSchema = z.object({
  sessionId: z.uuid(),
  reason: requiredText("Say why the register is being reopened.", 500),
})

export const sessionIdsSchema = z.array(z.uuid()).min(1, "Select at least one register.").max(200)

// -------------------------------------------------------------- corrections

export const correctionRequestSchema = z.object({
  recordIds: z.array(z.uuid()).min(1, "Select at least one record.").max(200),
  toStatus: z.enum(AttendanceStatus),
  toLateMinutes: optionalInt(0, 1440),
  toReason: optionalText(200),
  justification: requiredText("Explain why the attendance needs correcting.", 500),
})

export const correctionReviewSchema = z.object({
  correctionIds: z.array(z.uuid()).min(1).max(200),
  decision: z.enum(["APPROVE", "REJECT"]),
  note: optionalText(500),
})

// ------------------------------------------------------- teachers and staff

export const employeeEntrySchema = z.object({
  employeeType: z.enum(EmployeeType),
  employeeId: z.uuid(),
  status: z.enum(AttendanceStatus).nullable(),
  checkInTime: timeOfDay,
  checkOutTime: timeOfDay,
  lateMinutes: optionalInt(0, 1440),
  reason: optionalText(200),
  remarks: optionalText(500),
})

export type EmployeeEntry = z.output<typeof employeeEntrySchema>

export const employeeRegisterSchema = z.object({
  date: dateString("Choose the date."),
  entries: z.array(employeeEntrySchema).min(1, "Nothing to save.").max(1000),
  // Required when changing records of an earlier day (kept as corrections).
  justification: optionalText(500),
})

// ------------------------------------------------------------------ policy

export const policySchema = z
  .object({
    dailyEnabled: z.boolean(),
    periodEnabled: z.boolean(),
    dailySlots: z.coerce.number().int().min(1).max(2),
    maxPeriodsPerDay: z.coerce.number().int().min(1, "At least 1.").max(20, "At most 20."),
    defaultStatus: optionalEnum({ PRESENT: "PRESENT", ABSENT: "ABSENT" } as const),
    halfDayEnabled: z.boolean(),
    lateCountsAsPresent: z.boolean(),
    excusedTreatment: z.enum(ExcusedTreatment),
    minimumPercentage: z.coerce.number().int().min(0, "From 0 to 100.").max(100, "From 0 to 100."),
    warningMarginPercentage: z.coerce.number().int().min(0, "From 0 to 50.").max(50, "From 0 to 50."),
    correctionsRequireApproval: z.boolean(),
    lockAfterDays: optionalInt(0, 3650),
    weeklyOffDays: z.array(z.number().int().min(0).max(6)).max(6, "Leave at least one working day."),
    allowOnNonWorkingDays: z.boolean(),
    notifyGuardiansOnAbsence: z.boolean(),
    notifyGuardiansOnLate: z.boolean(),
    employeeAttendanceEnabled: z.boolean(),
    employeeSelfCheckIn: z.boolean(),
    workdayStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)."),
    lateGraceMinutes: z.coerce.number().int().min(0).max(600),
  })
  .refine((v) => v.dailyEnabled || v.periodEnabled, {
    path: ["dailyEnabled"],
    message: "Keep at least one kind of student attendance.",
  })
  .transform((v) => ({ ...v, weeklyOffDays: [...new Set(v.weeklyOffDays)].sort() }))

export type PolicyValues = z.input<typeof policySchema>

export const holidaySchema = z
  .object({
    name: requiredText("Enter the holiday's name.", 120),
    startDate: dateString("Enter the first day."),
    endDate: dateString("Enter the last day."),
    appliesTo: z.enum(HolidayAudience),
    educationLevelId: optionalId,
    description: optionalText(300),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "The last day can't be before the first." })

export type HolidayValues = z.input<typeof holidaySchema>
