import { z } from "zod"

import { optionalEnum } from "@/features/academics/schemas"
import {
  CurriculumComponent,
  InstructionMedium,
  OfferingStatus,
  PrerequisiteKind,
  SubjectRequirement,
  TeachingRole,
} from "@/lib/generated/prisma/enums"
import {
  dateString,
  optionalDate,
  optionalDecimal,
  optionalId,
  optionalInt,
  optionalText,
  requiredId,
  requiredText,
} from "@/lib/validation"

// Shared by client forms and the server, which always re-parses input.

const code = z
  .string("Enter a code.")
  .trim()
  .min(1, "Enter a code.")
  .max(20, "Use at most 20 characters.")
  .regex(/^[A-Za-z0-9_.+-]+$/, "Use letters, numbers, - _ . or + only.")
  .transform((value) => value.toUpperCase())

const optionalCode = z
  .string()
  .trim()
  .max(20, "Use at most 20 characters.")
  .regex(/^[A-Za-z0-9_.+-]*$/, "Use letters, numbers, - _ . or + only.")
  .nullish()
  .transform((value) => (value ? value.toUpperCase() : null))

const sortOrder = optionalInt(0, 9999).transform((value) => value ?? 0)

export const subjectSchema = z.object({
  name: requiredText("Enter the subject name.", 120),
  localName: optionalText(120),
  code,
  description: optionalText(1000),
  categoryId: optionalId,
  requirement: z.enum(SubjectRequirement).default("COMPULSORY"),
  educationLevelId: optionalId,
  programId: optionalId,
  creditHours: optionalDecimal(0, 50),
  theoryHours: optionalInt(0, 2000),
  practicalHours: optionalInt(0, 2000),
  weeklyPeriods: optionalInt(0, 60),
  medium: optionalEnum(InstructionMedium),
  isActive: z.boolean().default(true),
  sortOrder,
})

export const categorySchema = z.object({
  name: requiredText("Enter a name.", 60),
  description: optionalText(300),
  isActive: z.boolean().default(true),
  sortOrder,
})

export const prerequisiteSchema = z.object({
  prerequisiteId: requiredId("Choose a subject."),
  kind: z.enum(PrerequisiteKind).default("REQUIRED"),
  minimumGrade: optionalText(20),
  note: optionalText(300),
})

// ------------------------------------------------------------ curricula

export const curriculumSchema = z
  .object({
    name: requiredText("Enter a name, e.g. CDC Mathematics Grade 8.", 120),
    code: optionalCode,
    version: requiredText("Enter a version, e.g. 2078.", 40),
    description: optionalText(2000),
    educationLevelId: optionalId,
    programId: optionalId,
    effectiveFrom: optionalDate,
    effectiveTo: optionalDate,
  })
  .refine((v) => !v.effectiveFrom || !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, {
    path: ["effectiveTo"],
    message: "The end date can't be before the start date.",
  })

export const newVersionSchema = z.object({
  version: requiredText("Enter the new version.", 40),
  copyContent: z.boolean().default(true),
})

export const unitSchema = z.object({
  title: requiredText("Enter a title.", 200),
  description: optionalText(2000),
  sequence: optionalInt(0, 999),
  component: z.enum(CurriculumComponent).default("THEORY"),
  estimatedHours: optionalInt(0, 1000),
  learningObjectives: optionalText(4000),
})

export const topicSchema = z.object({
  title: requiredText("Enter a title.", 200),
  description: optionalText(2000),
  sequence: optionalInt(0, 999),
  estimatedHours: optionalInt(0, 1000),
  learningObjectives: optionalText(4000),
})

export const reorderSchema = z.array(z.uuid()).min(1).max(500)

// ------------------------------------------------------------- offerings

export const addOfferingsSchema = z.object({
  academicYearId: requiredId("Choose an academic year."),
  classId: requiredId("Choose a class."),
  subjectIds: z.array(z.uuid()).min(1, "Choose at least one subject.").max(60),
})

export const offeringSchema = z
  .object({
    requirement: z.enum(SubjectRequirement),
    creditHours: optionalDecimal(0, 50),
    weeklyPeriods: optionalInt(0, 60),
    curriculumId: optionalId,
    electiveGroupId: optionalId,
    code: optionalCode,
    notes: optionalText(500),
    status: z.enum(OfferingStatus).default("ACTIVE"),
    // Empty: taught in every section of the class.
    sectionIds: z.array(z.uuid()).max(50).default([]),
  })
  .refine((v) => v.requirement !== "COMPULSORY" || !v.electiveGroupId, {
    path: ["electiveGroupId"],
    message: "Compulsory subjects aren't part of an elective group.",
  })

export const copyOfferingsSchema = z.object({
  fromYearId: requiredId("Choose the year to copy from."),
  toYearId: requiredId("Choose the year to copy to."),
  classId: requiredId("Choose a class."),
})

export const electiveGroupSchema = z
  .object({
    academicYearId: requiredId("Choose an academic year."),
    classId: requiredId("Choose a class."),
    name: requiredText("Enter a name, e.g. Optional I.", 60),
    description: optionalText(300),
    minChoices: optionalInt(0, 20).transform((v) => v ?? 1),
    maxChoices: optionalInt(1, 20).transform((v) => v ?? 1),
  })
  .refine((v) => v.maxChoices >= v.minChoices, {
    path: ["maxChoices"],
    message: "The maximum can't be below the minimum.",
  })

export const offeringTeacherSchema = z.object({
  offeringId: requiredId("Choose a subject."),
  sectionId: optionalId,
  teacherId: requiredId("Choose a teacher."),
  role: z.enum([TeachingRole.SUBJECT_TEACHER, TeachingRole.CO_TEACHER]).default("SUBJECT_TEACHER"),
  weeklyPeriods: optionalInt(0, 60),
  startDate: dateString("Enter the start date."),
})

export const idsSchema = z.array(z.uuid()).min(1, "Select at least one row.").max(200)

export type SubjectInput = z.input<typeof subjectSchema>
export type CategoryInput = z.input<typeof categorySchema>
export type CurriculumInput = z.input<typeof curriculumSchema>
export type UnitInput = z.input<typeof unitSchema>
export type TopicInput = z.input<typeof topicSchema>
export type OfferingInput = z.input<typeof offeringSchema>
export type ElectiveGroupInput = z.input<typeof electiveGroupSchema>
export type OfferingTeacherInput = z.input<typeof offeringTeacherSchema>
