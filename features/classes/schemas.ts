import { z } from "zod"

import { academicClassSchema, optionalEnum } from "@/features/academics/schemas"
import { ROLL_ORDERS, type RollOrder } from "@/features/classes/constants"
import { PROGRESSION_OUTCOMES } from "@/features/students/schemas"
import { InstructionMedium, SectionShift } from "@/lib/generated/prisma/enums"
import {
  dateString,
  optionalDate,
  optionalId,
  optionalInt,
  optionalText,
  requiredId,
} from "@/lib/validation"

// A class roster in one academic year: the whole class, one section, or the
// students of the class not yet placed in a section ("none").
export const rosterScopeSchema = z.object({
  academicYearId: requiredId("Choose an academic year."),
  classId: requiredId("Choose a class."),
  sectionId: z
    .union([z.uuid(), z.literal("none")])
    .nullish()
    .transform((value) => value ?? null),
})

export const renumberRollsSchema = rosterScopeSchema.extend({
  order: z.enum(Object.keys(ROLL_ORDERS) as [RollOrder, ...RollOrder[]]),
})

// Moves open enrollments between sections of the same class and year. A
// section change is a correction of the placement, not a new enrollment.
export const moveStudentsSchema = z.object({
  academicYearId: requiredId("Choose an academic year."),
  classId: requiredId("Choose a class."),
  enrollmentIds: z
    .array(z.uuid())
    .min(1, "Select at least one student.")
    .max(500),
  targetSectionId: optionalId,
})

export const classTeacherSchema = z.object({
  academicYearId: requiredId("Choose an academic year."),
  classId: requiredId("Choose a class."),
  sectionId: optionalId,
  teacherId: requiredId("Choose a teacher."),
  startDate: dateString("Enter the start date."),
})

// "A, B, C" → ["A", "B", "C"]: trimmed, de-duplicated, blanks dropped.
export function parseSectionNames(value: string) {
  return [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((n) => n.trim())
        .filter(Boolean)
    ),
  ]
}

// Adds the same sections (e.g. A, B, C) to every active class of a level or program.
export const bulkSectionsSchema = z.object({
  educationLevelId: requiredId("Choose an education level."),
  programId: optionalId,
  // Kept as text so the form's input and output types match; split with parseSectionNames.
  names: z
    .string("Enter the section names.")
    .refine(
      (value) => parseSectionNames(value).length > 0,
      "Enter at least one section name."
    )
    .refine(
      (value) => parseSectionNames(value).length <= 20,
      "Use at most 20 sections."
    )
    .refine(
      (value) => parseSectionNames(value).every((n) => n.length <= 40),
      "Use at most 40 characters per name."
    ),
  capacity: optionalInt(1, 2000),
  shift: optionalEnum(SectionShift),
  medium: optionalEnum(InstructionMedium),
})

export type RenumberRollsInput = z.input<typeof renumberRollsSchema>
export type MoveStudentsInput = z.input<typeof moveStudentsSchema>
export type ClassTeacherInput = z.input<typeof classTeacherSchema>
export type BulkSectionsInput = z.input<typeof bulkSectionsSchema>

// The class form. On create it can also add the first sections in the same
// step; editing sections happens on the class page.
export const classFormSchema = academicClassSchema.extend({
  sections: z
    .string()
    .nullish()
    .refine((value) => parseSectionNames(value ?? "").length <= 20, "Use at most 20 sections.")
    .refine(
      (value) => parseSectionNames(value ?? "").every((n) => n.length <= 40),
      "Use at most 40 characters per name."
    ),
  sectionCapacity: optionalInt(1, 2000),
})

export const idsSchema = z.array(z.uuid()).min(1, "Select at least one row.").max(200)

// Enrolls existing students (with no open placement that year) into a class.
export const ENROLLABLE_TYPES = ["NEW_ADMISSION", "READMISSION", "TRANSFER", "LATERAL_ENTRY"] as const

export const enrollStudentsSchema = z.object({
  academicYearId: requiredId("Choose an academic year."),
  classId: requiredId("Choose a class."),
  sectionId: optionalId,
  studentIds: z.array(z.uuid()).min(1, "Choose at least one student.").max(200),
  enrollmentDate: optionalDate,
  enrollmentType: z.enum(ENROLLABLE_TYPES),
})

// End-of-year progression for many students of one class at once. Each
// student's current placement is closed and (except for completion) a new,
// linked placement is opened, so history is never overwritten.
export const promotionSchema = z
  .object({
    fromYearId: requiredId("Choose the academic year."),
    classId: requiredId("Choose a class."),
    enrollmentIds: z.array(z.uuid()).min(1, "Select at least one student.").max(500),
    outcome: z.enum(PROGRESSION_OUTCOMES),
    endedOn: dateString("Enter the date the current placement ends."),
    toYearId: optionalId,
    toClassId: optionalId,
    // same: a section with the same name in the new class; pick: toSectionId.
    sectionMode: z.enum(["same", "none", "pick"]).default("same"),
    toSectionId: optionalId,
    enrollmentDate: optionalDate,
    reason: optionalText(300),
  })
  .refine((v) => v.outcome === "COMPLETED" || v.toYearId, {
    path: ["toYearId"],
    message: "Choose the academic year of the new placement.",
  })
  .refine((v) => v.outcome === "COMPLETED" || v.outcome === "DETAINED" || v.toClassId, {
    path: ["toClassId"],
    message: "Choose the class to move students into.",
  })
  .refine((v) => v.sectionMode !== "pick" || v.outcome === "COMPLETED" || v.toSectionId, {
    path: ["toSectionId"],
    message: "Choose a section.",
  })

export const subjectTeacherSchema = z.object({
  academicYearId: requiredId("Choose an academic year."),
  classId: requiredId("Choose a class."),
  sectionId: optionalId,
  teacherId: requiredId("Choose a teacher."),
  subjectId: requiredId("Choose a subject."),
  weeklyPeriods: optionalInt(0, 60),
  startDate: dateString("Enter the start date."),
})

export type ClassFormInput = z.input<typeof classFormSchema>
export type EnrollStudentsInput = z.input<typeof enrollStudentsSchema>
export type PromotionInput = z.input<typeof promotionSchema>
export type SubjectTeacherInput = z.input<typeof subjectTeacherSchema>
