import { z } from "zod"

import {
  AbsentTreatment,
  AssessmentCategory,
  ComponentType,
  GpaMethod,
  GradingType,
  MarkStatus,
  RankBasis,
  RankScope,
  RankTieMode,
  SubjectPassRule,
} from "@/lib/generated/prisma/enums"
import { dateString, optionalDate, optionalId, optionalText, requiredId, requiredText } from "@/lib/validation"

// Shared by forms (React Hook Form + zodResolver) and the server, which
// always re-parses input with these schemas.

const bool = z.union([z.boolean(), z.literal("true"), z.literal("false")]).transform((v) => v === true || v === "true")

// A decimal with at most `places` decimals between min and max.
function decimal(min: number, max: number, places: number, message: string) {
  return z.union([z.number(), z.string()]).transform((value, ctx) => {
    const n = typeof value === "number" ? value : value.trim() === "" ? NaN : Number(value)
    const scaled = n * 10 ** places
    if (!Number.isFinite(n) || n < min || n > max || Math.abs(scaled - Math.round(scaled)) > 1e-6) {
      ctx.addIssue({ code: "custom", message })
      return z.NEVER
    }
    return n
  })
}

function optionalDecimal(min: number, max: number, places: number, message: string) {
  return z
    .union([z.number(), z.string()])
    .nullish()
    .transform((value, ctx) => {
      if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null
      const result = decimal(min, max, places, message).safeParse(value)
      if (!result.success) {
        ctx.addIssue({ code: "custom", message })
        return z.NEVER
      }
      return result.data
    })
}

const marksValue = (label = "Marks") => decimal(0.01, 99999.99, 2, `${label}: enter a number above 0 with at most 2 decimals.`)
const optionalMarks = (label = "Pass marks") => optionalDecimal(0, 99999.99, 2, `${label}: enter a number with at most 2 decimals.`)
const time = z
  .string()
  .trim()
  .regex(/^$|^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Use HH:MM (24-hour).")
  .nullish()
  .transform((v) => v || null)

// ---------------------------------------------------------------- settings

export const assessmentTypeSchema = z.object({
  name: requiredText("Enter a name.", 80),
  code: optionalText(20),
  category: z.enum(AssessmentCategory, "Choose a category."),
  description: optionalText(300),
  isActive: bool.default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).catch(0).default(0),
})

export const gradeRuleSchema = z.object({
  grade: requiredText("Enter a grade.", 12),
  minimumPercentage: decimal(0, 100, 2, "Enter 0–100 with at most 2 decimals."),
  maximumPercentage: decimal(0, 100, 2, "Enter 0–100 with at most 2 decimals."),
  gradePoint: optionalDecimal(0, 99.99, 2, "Enter a grade point with at most 2 decimals."),
  description: optionalText(80),
  isFailing: bool.default(false),
})

export const gradingScaleSchema = z
  .object({
    name: requiredText("Enter a name.", 80),
    code: optionalText(20),
    description: optionalText(500),
    gradingType: z.enum(GradingType, "Choose a grading type."),
    effectiveFrom: optionalDate,
    effectiveTo: optionalDate,
    rules: z.array(gradeRuleSchema).min(1, "Add at least one grade band.").max(30, "Use at most 30 bands."),
  })
  .refine((v) => !v.effectiveFrom || !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, {
    path: ["effectiveTo"],
    message: "Must be on or after the start date.",
  })

export type GradingScaleInput = z.input<typeof gradingScaleSchema>

export const resultPolicySchema = z.object({
  name: requiredText("Enter a name.", 80),
  description: optionalText(500),
  educationLevelId: optionalId,
  gradingScaleId: optionalId,
  isActive: bool.default(true),
  subjectPassRule: z.enum(SubjectPassRule),
  componentPassRequired: bool.default(false),
  absentTreatment: z.enum(AbsentTreatment),
  optionalInAggregate: bool.default(false),
  gpaMethod: z.enum(GpaMethod),
  percentageDecimals: z.coerce.number().int("Use 0 to 4.").min(0, "Use 0 to 4.").max(4, "Use 0 to 4."),
  gpaDecimals: z.coerce.number().int("Use 0 to 4.").min(0, "Use 0 to 4.").max(4, "Use 0 to 4."),
  graceMarksPerSubject: optionalDecimal(0, 100, 2, "Enter 0–100 with at most 2 decimals."),
  graceMaxSubjects: z.coerce.number().int("Use 0 to 20.").min(0, "Use 0 to 20.").max(20, "Use 0 to 20."),
  rankingEnabled: bool.default(false),
  rankBasis: z.enum(RankBasis),
  rankScope: z.enum(RankScope),
  rankTieMode: z.enum(RankTieMode),
  requireVerification: bool.default(true),
  separateReviewer: bool.default(true),
})

export type ResultPolicyInput = z.input<typeof resultPolicySchema>

// ------------------------------------------------------------ examinations

export const examinationSchema = z
  .object({
    academicYearId: requiredId("Choose an academic year."),
    assessmentTypeId: requiredId("Choose an assessment type."),
    name: requiredText("Enter a name.", 120),
    code: optionalText(30),
    description: optionalText(1000),
    educationLevelId: optionalId,
    programId: optionalId,
    term: optionalText(60),
    startDate: dateString("Enter the start date."),
    endDate: dateString("Enter the end date."),
    resultPublicationDate: optionalDate,
    gradingScaleId: requiredId("Choose a grading scale."),
    resultPolicyId: requiredId("Choose a result policy."),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "Must be on or after the start date." })
  .refine((v) => !v.resultPublicationDate || v.resultPublicationDate >= v.startDate, {
    path: ["resultPublicationDate"],
    message: "Can't be before the examination starts.",
  })

export type ExaminationInput = z.input<typeof examinationSchema>

export const componentSchema = z.object({
  name: requiredText("Enter a name.", 60),
  componentType: z.enum(ComponentType),
  maximumMarks: marksValue("Full marks"),
  passMarks: optionalMarks(),
  weightage: optionalDecimal(0.01, 100, 2, "Weightage: enter a percentage above 0, at most 100."),
})

export const addSubjectsSchema = z.object({
  examinationId: requiredId("Choose an examination."),
  offeringIds: z.array(z.uuid()).min(1, "Choose at least one subject.").max(300),
  // Template applied to every subject added; each can be edited afterwards.
  components: z.array(componentSchema).min(1, "Add at least one component.").max(10),
  passMarks: optionalMarks(),
})

export const examinationSubjectSchema = z
  .object({
    maximumMarks: marksValue("Full marks"),
    passMarks: optionalMarks(),
    creditHours: optionalDecimal(0.01, 99.99, 2, "Enter credit hours above 0 with at most 2 decimals."),
    isCompulsory: bool.default(true),
    examDate: optionalDate,
    startTime: time,
    endTime: time,
    venue: optionalText(80),
    sequence: z.coerce.number().int().min(0).max(999).catch(0).default(0),
    components: z.array(componentSchema).min(1, "Add at least one component.").max(10, "Use at most 10 components."),
  })
  .refine((v) => v.passMarks === null || v.passMarks <= v.maximumMarks, { path: ["passMarks"], message: "Can't exceed full marks." })
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, { path: ["endTime"], message: "Must be after the start time." })

export type ExaminationSubjectInput = z.input<typeof examinationSubjectSchema>

export const transitionSchema = z.object({
  examinationId: requiredId("Choose an examination."),
  reason: optionalText(1000),
})

export const publishSchema = z.object({
  examinationId: requiredId("Choose an examination."),
  reason: optionalText(1000),
  notifyGuardians: bool.default(true),
})

export const revisionSchema = z.object({
  examinationId: requiredId("Choose an examination."),
  reason: requiredText("Explain why the published results need correcting.", 1000),
  sheetIds: z.array(z.uuid()).max(500).default([]),
})

export const holdSchema = z.object({
  examinationId: requiredId("Choose an examination."),
  studentId: requiredId("Choose a student."),
  reason: requiredText("Give a reason.", 500),
})

// ------------------------------------------------------------------- marks

export const sheetScopeSchema = z.object({
  examinationSubjectId: requiredId("Choose a subject."),
  sectionId: optionalId,
})

const markEntry = z.object({
  componentId: z.uuid(),
  // null clears the mark (back to "not entered"); drafts only.
  status: z.enum(MarkStatus).nullable(),
  marks: z.number().min(0, "Marks can't be negative.").max(99999.99).nullable(),
})

export const saveMarksSchema = z.object({
  scope: sheetScopeSchema,
  sheetId: optionalId,
  // The sheet's updatedAt when the grid loaded; a newer one means someone else saved.
  expectedUpdatedAt: z.string().nullish().transform((v) => v || null),
  // Required when changing marks that were already submitted once.
  reason: optionalText(500),
  submit: bool.default(false),
  entries: z
    .array(
      z.object({
        studentId: z.uuid(),
        marks: z.array(markEntry).max(10),
        remark: optionalText(300),
        internalNote: optionalText(500),
      })
    )
    .max(1000, "At most 1000 students per sheet."),
})

export type SaveMarksInput = z.input<typeof saveMarksSchema>

export const sheetIdsSchema = z.object({
  sheetIds: z.array(z.uuid()).min(1, "Choose at least one marks sheet.").max(500),
  note: optionalText(1000),
})

export const returnSheetsSchema = z.object({
  sheetIds: z.array(z.uuid()).min(1, "Choose at least one marks sheet.").max(500),
  note: requiredText("Tell the teacher what needs correcting.", 1000),
})
