import { z } from "zod"

import {
  AcademicRank,
  DevelopmentType,
  Gender,
  QualificationLevel,
  TeacherDocumentCategory,
  TeacherEmploymentStatus,
  TeacherEmploymentType,
  TeachingRole,
  VerificationStatus,
} from "@/lib/generated/prisma/enums"
import { addressSchema, optionalYesNo } from "@/features/students/schemas"
import {
  dateString,
  optionalDate,
  optionalEmail,
  optionalId,
  optionalInt,
  optionalPhone,
  optionalText,
  requiredId,
  requiredText,
} from "@/lib/validation"

// Shared by the teacher forms (client) and services (server re-validates).

const optionalEnum = <T extends Record<string, string>>(values: T) =>
  z
    .union([z.enum(values), z.literal("")])
    .nullish()
    .transform((value) => value || null)

export const teacherPersonalSchema = z.object({
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

export const teacherContactSchema = z.object({
  email: optionalEmail,
  phone: optionalPhone,
  alternatePhone: optionalPhone,
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalPhone,
  emergencyContactRelationship: optionalText(60),
})

// Employment details; every change also writes an employment history row.
export const employmentSchema = z
  .object({
    dateOfJoining: dateString("Enter the date of joining."),
    employmentType: z.enum(TeacherEmploymentType),
    employmentStatus: z.enum(TeacherEmploymentStatus),
    designationId: optionalId,
    academicRank: optionalEnum(AcademicRank),
    departmentId: optionalId,
    reportingToId: optionalId,
    contractStartDate: optionalDate,
    contractEndDate: optionalDate,
    onProbation: z.boolean(),
    probationEndDate: optionalDate,
    employmentNotes: optionalText(1000),
    fullTimeElsewhere: optionalYesNo,
  })
  .refine((v) => !v.contractStartDate || !v.contractEndDate || v.contractEndDate >= v.contractStartDate, {
    path: ["contractEndDate"],
    message: "The contract can't end before it starts.",
  })
  .refine((v) => v.onProbation || !v.probationEndDate, {
    path: ["probationEndDate"],
    message: "Turn on probation to set its end date.",
  })

// Employment change made from the profile: when it takes effect and why.
export const employmentChangeSchema = employmentSchema.and(
  z.object({
    effectiveDate: dateString("Enter the date this change takes effect."),
    changeNote: optionalText(300),
  })
)

export const qualificationSchema = z.object({
  level: z.enum(QualificationLevel, "Choose the level."),
  title: requiredText("Enter the qualification, e.g. M.Ed. in Mathematics.", 150),
  specialization: optionalText(120),
  institutionName: optionalText(150),
  awardingBody: optionalText(150),
  country: optionalText(60),
  completionYear: optionalInt(1950, new Date().getFullYear() + 1),
  result: optionalText(40),
})

export const certificationSchema = z
  .object({
    name: requiredText("Enter the certification or training.", 150),
    category: optionalEnum(DevelopmentType),
    issuingOrganization: optionalText(150),
    issueDate: optionalDate,
    expiryDate: optionalDate,
    reference: optionalText(80),
  })
  .refine((v) => !v.issueDate || !v.expiryDate || v.expiryDate >= v.issueDate, {
    path: ["expiryDate"],
    message: "The expiry date can't be before the issue date.",
  })

// A teaching assignment. Only the academic year is always required; the
// rest depends on how the institution is organised (validated on the server).
export const assignmentSchema = z
  .object({
    academicYearId: requiredId("Choose the academic year."),
    educationLevelId: optionalId,
    programId: optionalId,
    classId: optionalId,
    sectionId: optionalId,
    subjectId: optionalId,
    batchId: optionalId,
    role: z.enum(TeachingRole),
    startDate: dateString("Enter the start date."),
    weeklyPeriods: optionalInt(0, 60),
    notes: optionalText(300),
  })
  .refine((v) => v.educationLevelId || v.programId || v.classId || v.subjectId, {
    path: ["classId"],
    message: "Choose at least a level, program, class or subject.",
  })
  .refine((v) => !v.sectionId || v.classId, { path: ["sectionId"], message: "Choose a class for the section." })
  .refine((v) => v.role !== "CLASS_TEACHER" || v.classId, {
    path: ["classId"],
    message: "A class teacher needs a class.",
  })

// Editing an assignment never changes what is taught (that's a new assignment).
export const assignmentUpdateSchema = z.object({
  role: z.enum(TeachingRole),
  startDate: dateString("Enter the start date."),
  weeklyPeriods: optionalInt(0, 60),
  notes: optionalText(300),
})

export const endAssignmentSchema = z.object({
  endDate: dateString("Enter the end date."),
  endReason: optionalText(300),
})

export const createTeacherSchema = z.object({
  employeeId: z
    .string()
    .trim()
    .max(30, "Use at most 30 characters.")
    .regex(/^[A-Za-z0-9/_.-]*$/, "Use letters, numbers, / _ . or - only.")
    .nullish()
    .transform((value) => value || null),
  personal: teacherPersonalSchema,
  contact: teacherContactSchema,
  permanentAddress: addressSchema,
  sameAsPermanent: z.boolean(),
  temporaryAddress: addressSchema,
  employment: employmentSchema,
  qualifications: z.array(qualificationSchema).max(15),
  certifications: z.array(certificationSchema).max(20),
  assignments: z.array(assignmentSchema).max(30),
  userId: optionalId,
})

export const updateTeacherSchema = z.object({
  employeeId: createTeacherSchema.shape.employeeId,
  personal: teacherPersonalSchema,
  contact: teacherContactSchema,
  permanentAddress: addressSchema,
  sameAsPermanent: z.boolean(),
  temporaryAddress: addressSchema,
})

export const verificationSchema = z.object({
  status: z.enum(VerificationStatus),
})

export const documentMetaSchema = z.object({
  title: requiredText("Enter a title for the document.", 120),
  category: z.enum(TeacherDocumentCategory),
  requirementId: optionalId,
})

export const linkUserSchema = z.object({ userId: optionalId })

export const teacherBulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("archive"), ids: z.array(z.uuid()).min(1).max(500) }),
  z.object({ action: z.literal("restore"), ids: z.array(z.uuid()).min(1).max(500) }),
])

export type CreateTeacherInput = z.input<typeof createTeacherSchema>
export type CreateTeacherValues = z.output<typeof createTeacherSchema>
export type UpdateTeacherInput = z.input<typeof updateTeacherSchema>
export type AssignmentInput = z.input<typeof assignmentSchema>
export type EmploymentInput = z.input<typeof employmentSchema>
export type QualificationInput = z.input<typeof qualificationSchema>
export type CertificationInput = z.input<typeof certificationSchema>
