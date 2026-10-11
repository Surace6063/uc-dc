import { z } from "zod"

import {
  AcademicYearStatus,
  DocumentAudience,
  GroupingKind,
  NumberingMode,
} from "@/lib/generated/prisma/enums"
import {
  dateString,
  optionalId,
  optionalInt,
  optionalText,
  requiredId,
  requiredText,
} from "@/lib/validation"

const code = z
  .string("Enter a short code.")
  .trim()
  .min(1, "Enter a short code.")
  .max(20, "Use at most 20 characters.")
  .regex(/^[A-Za-z0-9_.+-]+$/, "Use letters, numbers, - _ . or + only.")
  .transform((value) => value.toUpperCase())

const sortOrder = optionalInt(0, 9999).transform((value) => value ?? 0)

export const educationLevelSchema = z.object({
  name: requiredText("Enter a name."),
  code,
  description: optionalText(300),
  groupingKind: z.enum(GroupingKind),
  usesPrograms: z.boolean(),
  isActive: z.boolean(),
  sortOrder,
})

export const applyPresetSchema = z.object({
  presetKey: z.string().min(1),
  createClasses: z.boolean(),
  createPrograms: z.boolean(),
})

export const programSchema = z.object({
  educationLevelId: requiredId("Choose an education level."),
  facultyId: optionalId,
  name: requiredText("Enter the program name."),
  code,
  description: optionalText(300),
  duration: optionalInt(1, 20),
  isActive: z.boolean(),
  sortOrder,
})

// Creates "Semester 1..N" (etc.) for a program or level in one step.
export const generateClassesSchema = z.object({
  educationLevelId: requiredId("Choose an education level."),
  programId: optionalId,
  kind: z.enum(GroupingKind),
  count: optionalInt(1, 20).refine((value) => value !== null, "Enter how many to create."),
  startAt: optionalInt(1, 20).transform((value) => value ?? 1),
})

export const academicClassSchema = z.object({
  educationLevelId: requiredId("Choose an education level."),
  programId: optionalId,
  name: requiredText("Enter the class name.", 60),
  kind: z.enum(GroupingKind),
  sequence: optionalInt(0, 999).transform((value) => value ?? 1),
  isActive: z.boolean(),
})

export const sectionSchema = z.object({
  classId: requiredId("Choose a class."),
  name: requiredText("Enter the section name.", 40),
  capacity: optionalInt(1, 2000),
  isActive: z.boolean(),
  sortOrder,
})

export const academicYearSchema = z
  .object({
    name: requiredText("Enter a name, e.g. 2082/83.", 40),
    startDate: dateString("Enter the start date."),
    endDate: dateString("Enter the end date."),
    status: z.enum(AcademicYearStatus),
    isCurrent: z.boolean(),
  })
  .refine((v) => v.endDate > v.startDate, {
    path: ["endDate"],
    message: "The end date must be after the start date.",
  })
  .refine((v) => !v.isCurrent || v.status === "ACTIVE" || v.status === "PLANNED", {
    path: ["isCurrent"],
    message: "A completed or archived year can't be the current year.",
  })

export const facultySchema = z.object({
  name: requiredText("Enter a name."),
  code,
  description: optionalText(300),
  isActive: z.boolean(),
  sortOrder,
})

export const batchSchema = z.object({
  name: requiredText("Enter a name, e.g. Batch 2026.", 60),
  programId: optionalId,
  startYear: optionalInt(1950, 2200),
  isActive: z.boolean(),
})

export const documentRequirementSchema = z
  .object({
    audience: z.enum(DocumentAudience).default("STUDENT"),
    name: requiredText("Enter the document name."),
    description: optionalText(300),
    educationLevelId: optionalId,
    isRequired: z.boolean(),
    isActive: z.boolean(),
    sortOrder,
  })
  // Levels only apply to students.
  .transform((v) => (v.audience === "TEACHER" ? { ...v, educationLevelId: null } : v))

export const subjectSchema = z.object({
  name: requiredText("Enter the subject name."),
  code,
  educationLevelId: optionalId,
  programId: optionalId,
  creditHours: optionalInt(0, 50),
  isActive: z.boolean(),
  sortOrder,
})

export const designationSchema = z.object({
  name: requiredText("Enter the designation.", 80),
  isActive: z.boolean(),
  sortOrder,
})

export const staffSettingsSchema = z.object({
  employeeIdMode: z.enum(NumberingMode),
  employeeIdPrefix: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9/_-]*$/, "Use letters, numbers, / _ or - only."),
  employeeIdPadding: optionalInt(1, 10).transform((value) => value ?? 4),
  nextEmployeeSequence: optionalInt(1, 99_999_999).transform((value) => value ?? 1),
})

export const studentSettingsSchema = z.object({
  admissionNumberMode: z.enum(NumberingMode),
  admissionNumberPrefix: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9/_-]*$/, "Use letters, numbers, / _ or - only."),
  admissionNumberPadding: optionalInt(1, 10).transform((value) => value ?? 5),
  nextAdmissionSequence: optionalInt(1, 99_999_999).transform((value) => value ?? 1),
  rollNumberMode: z.enum(NumberingMode),
})

export type EducationLevelInput = z.input<typeof educationLevelSchema>
export type ProgramInput = z.input<typeof programSchema>
export type AcademicClassInput = z.input<typeof academicClassSchema>
export type SectionInput = z.input<typeof sectionSchema>
export type AcademicYearInput = z.input<typeof academicYearSchema>
export type FacultyInput = z.input<typeof facultySchema>
export type BatchInput = z.input<typeof batchSchema>
export type DocumentRequirementInput = z.input<typeof documentRequirementSchema>
export type StudentSettingsInput = z.input<typeof studentSettingsSchema>
export type SubjectInput = z.input<typeof subjectSchema>
export type DesignationInput = z.input<typeof designationSchema>
export type StaffSettingsInput = z.input<typeof staffSettingsSchema>
export type GenerateClassesInput = z.input<typeof generateClassesSchema>
