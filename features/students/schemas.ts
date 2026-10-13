import { z } from "zod"

import {
  AdmissionType,
  CasteEthnicity,
  DisabilityType,
  EnrollmentStatus,
  EnrollmentType,
  Gender,
  GuardianRelationship,
  QualificationLevel,
  ScholarshipCategory,
  StudentStatus,
} from "@/lib/generated/prisma/enums"
import { isDistrictInProvince } from "@/lib/nepal/locations"
import {
  dateString,
  optionalDate,
  optionalDecimal,
  optionalEmail,
  optionalId,
  optionalInt,
  optionalPhone,
  optionalText,
  requiredId,
  requiredText,
} from "@/lib/validation"

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const

const optionalEnum = <T extends Record<string, string>>(values: T) =>
  z
    .union([z.enum(values), z.literal("")])
    .nullish()
    .transform((value) => value || null)

// "yes" / "no" / "" (not recorded); stored as true / false / null (see
// yesNoToBoolean). Kept as strings here so form input and output types match.
export const optionalYesNo = z
  .union([z.literal("yes"), z.literal("no"), z.literal("")])
  .nullish()
  .transform((value) => value || null)

export const yesNoToBoolean = (value: "yes" | "no" | null) => (value === null ? null : value === "yes")
export const booleanToYesNo = (value: boolean | null | undefined): "yes" | "no" | "" => (value === true ? "yes" : value === false ? "no" : "")

// ------------------------------------------------------------------ sections

export const personalSchema = z.object({
  firstName: requiredText("Enter the first name.", 60),
  middleName: optionalText(60),
  lastName: requiredText("Enter the last name.", 60),
  dateOfBirth: optionalDate.refine(
    (value) => !value || value <= new Date().toISOString().slice(0, 10),
    "The date of birth can't be in the future."
  ),
  gender: optionalEnum(Gender),
  nationality: optionalText(60),
  email: optionalEmail,
  phone: optionalPhone,
  alternatePhone: optionalPhone,
  bloodGroup: z
    .union([z.enum(BLOOD_GROUPS), z.literal("")])
    .nullish()
    .transform((value) => value || null),
  motherTongue: optionalText(60),
  medicalNotes: optionalText(2000),
  // UGC/EMIS background; blank = not recorded. Disability is restricted
  // like medical notes (written only with students.sensitive.view).
  casteEthnicity: optionalEnum(CasteEthnicity),
  disabilityType: optionalEnum(DisabilityType),
  economicallyDisadvantaged: optionalYesNo,
  firstGenerationLearner: optionalYesNo,
  remoteArea: optionalYesNo,
})

export const addressSchema = z
  .object({
    province: optionalInt(1, 7),
    district: optionalText(60),
    municipality: optionalText(100),
    wardNumber: optionalInt(1, 40),
    tole: optionalText(100),
    street: optionalText(150),
    postalCode: optionalText(10),
  })
  .refine((a) => !a.district || (a.province !== null && isDistrictInProvince(a.province, a.district)), {
    path: ["district"],
    message: "Choose a district in the selected province.",
  })

export const admissionSchema = z.object({
  // Blank: generated automatically when the organisation uses automatic numbering.
  admissionNumber: z
    .string()
    .trim()
    .max(30, "Use at most 30 characters.")
    .regex(/^[A-Za-z0-9/_.-]*$/, "Use letters, numbers, / _ . or - only.")
    .nullish()
    .transform((value) => value || null),
  admissionDate: dateString("Enter the admission date."),
  admissionType: z.enum(AdmissionType),
  previousSchool: optionalText(150),
  previousQualification: optionalEnum(QualificationLevel),
  // GPA, percentage or division, as written on the certificate.
  previousResult: optionalText(40),
  entranceScore: optionalDecimal(0, 1000, 2),
  scholarshipCategory: optionalEnum(ScholarshipCategory),
})

export const guardianDetailsSchema = z.object({
  fullName: requiredText("Enter the guardian's name.", 120),
  phone: optionalPhone,
  alternatePhone: optionalPhone,
  email: optionalEmail,
  occupation: optionalText(80),
  address: optionalText(200),
})

export const guardianLinkSchema = z.object({
  relationship: z.enum(GuardianRelationship, "Choose the relationship."),
  isPrimary: z.boolean(),
  isEmergencyContact: z.boolean(),
  receivesAcademicNotifications: z.boolean(),
  receivesBillingNotifications: z.boolean(),
})

// Either links an existing guardian (siblings) or creates a new one.
export const guardianEntrySchema = z
  .object({
    guardianId: optionalId,
    fullName: optionalText(120),
    phone: optionalPhone,
    alternatePhone: optionalPhone,
    email: optionalEmail,
    occupation: optionalText(80),
    address: optionalText(200),
  })
  .extend(guardianLinkSchema.shape)
  .refine((g) => g.guardianId || g.fullName, {
    path: ["fullName"],
    message: "Enter the guardian's name.",
  })

export const placementSchema = z.object({
  academicYearId: requiredId("Choose the academic year."),
  educationLevelId: requiredId("Choose the education level."),
  programId: optionalId,
  classId: requiredId("Choose the class."),
  sectionId: optionalId,
  batchId: optionalId,
  rollNumber: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9-]*$/, "Use letters, numbers or - only.")
    .nullish()
    .transform((value) => value || null),
})

export const enrollmentSchema = placementSchema.extend({
  enrollmentDate: optionalDate,
  enrollmentType: z.enum(EnrollmentType),
})

// ------------------------------------------------------------------ forms

export const createStudentSchema = z
  .object({
    personal: personalSchema,
    admission: admissionSchema,
    permanentAddress: addressSchema,
    sameAsPermanent: z.boolean(),
    temporaryAddress: addressSchema,
    guardians: z.array(guardianEntrySchema).max(6, "Add at most 6 guardians."),
    enroll: z.boolean(),
    enrollment: enrollmentSchema.nullish(),
  })
  .refine((v) => !v.enroll || v.enrollment, {
    path: ["enrollment", "classId"],
    message: "Choose the class to enroll the student in.",
  })
  .refine((v) => v.guardians.filter((g) => g.isPrimary).length <= 1, {
    path: ["guardians"],
    message: "Only one guardian can be the primary contact.",
  })

export const updateStudentSchema = z.object({
  personal: personalSchema,
  admission: admissionSchema,
  permanentAddress: addressSchema,
  sameAsPermanent: z.boolean(),
  temporaryAddress: addressSchema,
})

export const updateGuardianSchema = guardianDetailsSchema.extend(guardianLinkSchema.shape)

export const correctEnrollmentSchema = z.object({
  sectionId: optionalId,
  batchId: optionalId,
  rollNumber: placementSchema.shape.rollNumber,
  enrollmentDate: dateString("Enter the enrollment date."),
})

// Closes the current placement and (usually) opens the next one.
export const PROGRESSION_OUTCOMES = ["PROMOTED", "DETAINED", "COMPLETED", "TRANSFERRED"] as const

export const progressEnrollmentSchema = z
  .object({
    outcome: z.enum(PROGRESSION_OUTCOMES),
    endedOn: dateString("Enter the date the placement ended."),
    reason: optionalText(300),
    createNext: z.boolean(),
    next: enrollmentSchema.nullish(),
  })
  .refine((v) => !v.createNext || v.next, {
    path: ["next", "classId"],
    message: "Choose the new class.",
  })

export const enrollmentStatusSchema = z.object({
  status: z.enum(EnrollmentStatus),
  reason: optionalText(300),
})

export const studentStatusSchema = z.object({
  status: z.enum(StudentStatus),
  reason: optionalText(300),
})

export const bulkActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("archive"), ids: z.array(z.uuid()).min(1).max(500) }),
  z.object({ action: z.literal("restore"), ids: z.array(z.uuid()).min(1).max(500) }),
  z.object({
    action: z.literal("status"),
    ids: z.array(z.uuid()).min(1).max(500),
    status: z.enum(StudentStatus),
    reason: optionalText(300),
  }),
])

export const duplicateCheckSchema = z.object({
  firstName: z.string().trim().max(60),
  lastName: z.string().trim().max(60),
  dateOfBirth: optionalDate,
  phone: optionalPhone,
  admissionNumber: z.string().trim().max(30).nullish(),
  excludeId: optionalId,
})

export type CreateStudentInput = z.input<typeof createStudentSchema>
export type CreateStudentValues = z.output<typeof createStudentSchema>
export type UpdateStudentInput = z.input<typeof updateStudentSchema>
export type GuardianEntryInput = z.input<typeof guardianEntrySchema>
export type EnrollmentInput = z.input<typeof enrollmentSchema>
export type PlacementValues = z.output<typeof placementSchema>
export type BulkActionInput = z.input<typeof bulkActionSchema>
