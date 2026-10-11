import { z } from "zod"

import { addressSchema } from "@/features/students/schemas"
import {
  DesignationScope,
  Gender,
  JobCategory,
  NumberingMode,
  QualificationLevel,
  StaffDocumentCategory,
  StaffEmploymentStatus,
  StaffEmploymentType,
  StaffQualificationKind,
  VerificationStatus,
} from "@/lib/generated/prisma/enums"
import {
  dateString,
  optionalDate,
  optionalEmail,
  optionalId,
  optionalInt,
  optionalPhone,
  optionalText,
  requiredText,
} from "@/lib/validation"

// Shared by the staff forms (client) and services (server re-validates).

const optionalEnum = <T extends Record<string, string>>(values: T) =>
  z
    .union([z.enum(values), z.literal("")])
    .nullish()
    .transform((value) => value || null)

export const staffPersonalSchema = z.object({
  firstName: requiredText("Enter the first name.", 60),
  middleName: optionalText(60),
  lastName: requiredText("Enter the last name.", 60),
  nameNepali: optionalText(120),
  dateOfBirth: optionalDate.refine(
    (value) => !value || value <= new Date().toISOString().slice(0, 10),
    "The date of birth can't be in the future."
  ),
  gender: optionalEnum(Gender),
  nationality: optionalText(60),
})

export const staffContactSchema = z.object({
  email: optionalEmail,
  phone: optionalPhone,
  alternatePhone: optionalPhone,
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalPhone,
  emergencyContactRelationship: optionalText(60),
})

const before = (a: string | null, b: string | null) => !a || !b || b >= a

// Current employment; every change also writes an employment history row.
export const staffEmploymentSchema = z
  .object({
    dateOfJoining: dateString("Enter the date of joining."),
    employmentType: z.enum(StaffEmploymentType),
    employmentStatus: z.enum(StaffEmploymentStatus),
    designationId: optionalId,
    departmentId: optionalId,
    reportingToId: optionalId,
    contractStartDate: optionalDate,
    contractEndDate: optionalDate,
    onProbation: z.boolean(),
    probationStartDate: optionalDate,
    probationEndDate: optionalDate,
    resignationDate: optionalDate,
    lastWorkingDate: optionalDate,
    terminationDate: optionalDate,
    leavingReason: optionalText(500),
    employmentNotes: optionalText(1000),
  })
  .refine((v) => before(v.contractStartDate, v.contractEndDate), {
    path: ["contractEndDate"],
    message: "The contract can't end before it starts.",
  })
  .refine((v) => before(v.dateOfJoining, v.contractEndDate), {
    path: ["contractEndDate"],
    message: "The contract can't end before the date of joining.",
  })
  .refine((v) => v.onProbation || (!v.probationStartDate && !v.probationEndDate), {
    path: ["probationEndDate"],
    message: "Turn on probation to set its dates.",
  })
  .refine((v) => before(v.probationStartDate, v.probationEndDate), {
    path: ["probationEndDate"],
    message: "Probation can't end before it starts.",
  })
  .refine((v) => before(v.dateOfJoining, v.lastWorkingDate), {
    path: ["lastWorkingDate"],
    message: "The last working day can't be before the date of joining.",
  })
  .refine((v) => v.employmentStatus === "TERMINATED" || !v.terminationDate, {
    path: ["terminationDate"],
    message: "A termination date only applies to terminated employment.",
  })

// An employment change made from the profile: when it takes effect and why.
export const staffEmploymentChangeSchema = staffEmploymentSchema.and(
  z.object({
    effectiveDate: dateString("Enter the date this change takes effect."),
    changeNote: optionalText(300),
  })
)

export const staffQualificationSchema = z
  .object({
    kind: z.enum(StaffQualificationKind),
    level: optionalEnum(QualificationLevel),
    title: requiredText("Enter the qualification, certification or training.", 150),
    specialization: optionalText(120),
    institutionName: optionalText(150),
    awardingBody: optionalText(150),
    country: optionalText(60),
    completionYear: optionalInt(1950, new Date().getFullYear() + 1),
    expiryDate: optionalDate,
    result: optionalText(40),
  })
  .refine((v) => v.kind !== "ACADEMIC" || v.level, { path: ["level"], message: "Choose the level." })

export const staffAssignmentSchema = z.object({
  title: requiredText("Enter the responsibility, e.g. Library management.", 120),
  departmentId: optionalId,
  startDate: dateString("Enter the start date."),
  notes: optionalText(300),
})

export const endStaffAssignmentSchema = z.object({
  endDate: dateString("Enter the end date."),
  endReason: optionalText(300),
})

const employeeIdField = z
  .string()
  .trim()
  .max(30, "Use at most 30 characters.")
  .regex(/^[A-Za-z0-9/_.-]*$/, "Use letters, numbers, / _ . or - only.")
  .nullish()
  .transform((value) => value || null)

export const createStaffSchema = z.object({
  employeeId: employeeIdField,
  personal: staffPersonalSchema,
  contact: staffContactSchema,
  permanentAddress: addressSchema,
  sameAsPermanent: z.boolean(),
  temporaryAddress: addressSchema,
  employment: staffEmploymentSchema,
  qualifications: z.array(staffQualificationSchema).max(30),
  assignments: z.array(staffAssignmentSchema).max(20),
  userId: optionalId,
})

export const updateStaffSchema = z.object({
  employeeId: employeeIdField,
  personal: staffPersonalSchema,
  contact: staffContactSchema,
  permanentAddress: addressSchema,
  sameAsPermanent: z.boolean(),
  temporaryAddress: addressSchema,
})

export const staffVerificationSchema = z.object({ status: z.enum(VerificationStatus) })

export const staffDocumentMetaSchema = z.object({
  title: requiredText("Enter a title for the document.", 120),
  category: z.enum(StaffDocumentCategory),
  requirementId: optionalId,
})

export const staffLinkUserSchema = z.object({ userId: optionalId })

export const staffBulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("archive"), ids: z.array(z.uuid()).min(1).max(500) }),
  z.object({ action: z.literal("restore"), ids: z.array(z.uuid()).min(1).max(500) }),
])

// ------------------------------------------------------------ configuration

const code = z
  .string("Enter a short code.")
  .trim()
  .min(1, "Enter a short code.")
  .max(20, "Use at most 20 characters.")
  .regex(/^[A-Za-z0-9_.+-]+$/, "Use letters, numbers, - _ . or + only.")
  .transform((value) => value.toUpperCase())

const sortOrder = optionalInt(0, 9999).transform((value) => value ?? 0)

export const departmentSchema = z.object({
  name: requiredText("Enter the department name.", 80),
  code,
  description: optionalText(300),
  isActive: z.boolean(),
  sortOrder,
})

export const staffDesignationSchema = z.object({
  name: requiredText("Enter the designation.", 80),
  scope: z.enum(DesignationScope),
  category: optionalEnum(JobCategory),
  departmentId: optionalId,
  isActive: z.boolean(),
  sortOrder,
})

export const staffDocumentTypeSchema = z.object({
  name: requiredText("Enter the document name."),
  description: optionalText(300),
  isRequired: z.boolean(),
  isActive: z.boolean(),
  sortOrder,
})

export const reorderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(500) })

export const employeeIdSettingsSchema = z.object({
  employeeIdMode: z.enum(NumberingMode),
  employeeIdPrefix: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9/_-]*$/, "Use letters, numbers, / _ or - only."),
  employeeIdPadding: optionalInt(1, 10).transform((value) => value ?? 4),
  nextEmployeeSequence: optionalInt(1, 99_999_999).transform((value) => value ?? 1),
})

export type CreateStaffInput = z.input<typeof createStaffSchema>
export type CreateStaffValues = z.output<typeof createStaffSchema>
export type UpdateStaffInput = z.input<typeof updateStaffSchema>
export type StaffQualificationInput = z.input<typeof staffQualificationSchema>
export type StaffAssignmentInput = z.input<typeof staffAssignmentSchema>
