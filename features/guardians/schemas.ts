import { z } from "zod"

import { addressSchema } from "@/features/students/schemas"
import { ContactMethod, Gender, GuardianRelationship } from "@/lib/generated/prisma/enums"
import {
  optionalDate,
  optionalEmail,
  optionalPhone,
  optionalText,
  requiredText,
} from "@/lib/validation"

// Shared by the guardian forms (client) and services (server re-validates).
// No citizenship, national ID or other identity numbers are collected.

const optionalEnum = <T extends Record<string, string>>(values: T) =>
  z
    .union([z.enum(values), z.literal("")])
    .nullish()
    .transform((value) => value || null)

// Nepali mobiles (98XXXXXXXX), landlines (01-4XXXXXX) and international
// numbers (+977 ..., +91 ...): digits with optional +, spaces and dashes.
export const requiredPhone = z
  .string("Enter the phone number.")
  .trim()
  .min(1, "Enter the phone number.")
  .max(20, "Use at most 20 characters.")
  .regex(/^\+?[0-9][0-9\s-]{5,18}$/, "Enter a valid phone number.")

const guardianCodeField = z
  .string()
  .trim()
  .max(30, "Use at most 30 characters.")
  .regex(/^[A-Za-z0-9/_.-]*$/, "Use letters, numbers, / _ . or - only.")
  .nullish()
  .transform((value) => value || null)

export const guardianProfileSchema = z
  .object({
    // Blank: generated automatically.
    guardianCode: guardianCodeField,
    fullName: requiredText("Enter the guardian's full name.", 120),
    gender: optionalEnum(Gender),
    dateOfBirth: optionalDate.refine(
      (value) => !value || value <= new Date().toISOString().slice(0, 10),
      "The date of birth can't be in the future."
    ),
    nationality: optionalText(60),
    phone: requiredPhone,
    alternatePhone: optionalPhone,
    email: optionalEmail,
    preferredContactMethod: optionalEnum(ContactMethod),
    preferredLanguage: optionalText(40),
    occupation: optionalText(80),
    workplace: optionalText(120),
    address: optionalText(200),
    permanentAddress: addressSchema,
    sameAsPermanent: z.boolean(),
    temporaryAddress: addressSchema,
  })
  .refine((v) => v.preferredContactMethod !== "EMAIL" || v.email, {
    path: ["email"],
    message: "Add an email address, or choose another contact method.",
  })

// Settings of one guardian ↔ student link.
export const linkSettingsSchema = z.object({
  relationship: z.enum(GuardianRelationship, "Choose the relationship."),
  isPrimary: z.boolean(),
  isEmergencyContact: z.boolean(),
  canPickupStudent: z.boolean(),
  receivesAcademicNotifications: z.boolean(),
  receivesAttendanceNotifications: z.boolean(),
  receivesBillingNotifications: z.boolean(),
  receivesGeneralAnnouncements: z.boolean(),
  canAccessStudentPortalData: z.boolean(),
  notes: optionalText(300),
})

export const studentLinkSchema = linkSettingsSchema.extend({
  studentId: z.uuid("Choose a student."),
})

const uniqueStudents = (links: { studentId: string }[]) => new Set(links.map((l) => l.studentId)).size === links.length

const linksField = z
  .array(studentLinkSchema)
  .max(20, "Link at most 20 students at a time.")
  .refine(uniqueStudents, "Each student can be linked only once.")

export const createGuardianSchema = z.object({
  profile: guardianProfileSchema,
  links: linksField,
})

export const updateGuardianSchema = z.object({ profile: guardianProfileSchema })

export const linkStudentsSchema = z.object({
  links: linksField.min(1, "Choose at least one student."),
})

export const inviteGuardianSchema = z.object({
  email: z.email("Enter the email address the guardian will sign in with.").transform((v) => v.toLowerCase()),
})

export const portalAccessSchema = z.object({ enabled: z.boolean() })

export const guardianBulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("archive"), ids: z.array(z.uuid()).min(1).max(500) }),
  z.object({ action: z.literal("restore"), ids: z.array(z.uuid()).min(1).max(500) }),
])

export const guardianDuplicateCheckSchema = z.object({
  fullName: z.string().trim().max(120),
  phone: z.string().trim().max(20).nullish(),
  email: z.string().trim().max(200).nullish(),
  excludeId: z.uuid().nullish(),
})

// What a guardian may change about themselves in the portal. Fee notices and
// portal access are deliberately missing: those are the school's decision.
export const portalPreferencesSchema = z.object({
  preferredContactMethod: optionalEnum(ContactMethod),
  preferredLanguage: optionalText(40),
  alternatePhone: optionalPhone,
  children: z
    .array(
      z.object({
        studentId: z.uuid(),
        receivesAcademicNotifications: z.boolean(),
        receivesAttendanceNotifications: z.boolean(),
        receivesGeneralAnnouncements: z.boolean(),
      })
    )
    .max(20),
})

export type GuardianProfileInput = z.input<typeof guardianProfileSchema>
export type CreateGuardianInput = z.input<typeof createGuardianSchema>
export type CreateGuardianValues = z.output<typeof createGuardianSchema>
export type UpdateGuardianInput = z.input<typeof updateGuardianSchema>
export type UpdateGuardianValues = z.output<typeof updateGuardianSchema>
export type StudentLinkInput = z.input<typeof studentLinkSchema>
export type LinkSettingsInput = z.input<typeof linkSettingsSchema>
export type PortalPreferencesInput = z.input<typeof portalPreferencesSchema>
