import { z } from "zod"

import { ONLINE_METHODS, PENDABLE_METHODS, REFERENCE_METHODS } from "@/features/finance/constants"
import { ConcessionKind, FinanceCategoryKind, FinanceEntryKind, PaymentMethod, ScholarshipCategory } from "@/lib/generated/prisma/enums"
import { dateString, optionalDate, optionalId, optionalText, requiredId, requiredText } from "@/lib/validation"

// Shared by finance forms (client) and services (server re-validates).
// Amounts are typed in rupees and become whole paisa here.

const MAX_PAISA = 100_000_000_00 // Rs. 10 crore per line

export const rupees = (label = "Enter an amount.") =>
  z
    .union([z.number(), z.string()])
    .transform((value, ctx) => {
      const text = String(value).trim().replace(/,/g, "")
      if (!/^\d+(\.\d{1,2})?$/.test(text)) {
        ctx.addIssue({ code: "custom", message: label })
        return z.NEVER
      }
      const paisa = Math.round(Number(text) * 100)
      if (paisa <= 0 || paisa > MAX_PAISA) {
        ctx.addIssue({ code: "custom", message: "Enter an amount above zero, up to Rs. 10 crore." })
        return z.NEVER
      }
      return paisa
    })

const flag = z.union([z.boolean(), z.enum(["true", "false", "on", ""])]).transform((v) => v === true || v === "true" || v === "on")
const reason = (message: string) => requiredText(message, 300)

export const categorySchema = z.object({
  kind: z.enum(FinanceCategoryKind),
  name: requiredText("Enter a name.", 80),
  code: optionalText(20),
  description: optionalText(300),
  isActive: flag,
})

export const feeStructureSchema = z
  .object({
    academicYearId: requiredId("Choose the academic year."),
    categoryId: requiredId("Choose the fee head."),
    name: requiredText("Enter a name.", 120),
    description: optionalText(500),
    educationLevelId: optionalId,
    programId: optionalId,
    classId: optionalId,
    amount: rupees(),
    isActive: flag,
    installments: z
      .array(z.object({ label: requiredText("Name the installment.", 60), dueDate: dateString("Enter the due date."), amount: rupees() }))
      .max(12, "At most 12 installments."),
  })
  .refine((v) => v.installments.length === 0 || v.installments.reduce((n, i) => n + i.amount, 0) === v.amount, {
    path: ["installments"],
    message: "Installment amounts must add up to the total.",
  })

export const assignStructureSchema = z.object({
  feeStructureId: requiredId("Choose the fee structure."),
  // Only these students; empty → every enrolled student it applies to.
  studentIds: z.array(z.uuid()).max(2000).default([]),
})

export const studentFeeSchema = z.object({
  studentId: requiredId("Choose the student."),
  academicYearId: requiredId("Choose the academic year."),
  categoryId: requiredId("Choose the fee head."),
  title: requiredText("Describe the charge.", 120),
  amount: rupees(),
  dueDate: optionalDate,
  note: optionalText(300),
})

export const cancelFeeSchema = z.object({ reason: reason("Give a reason for cancelling.") })

export const concessionSchema = z
  .object({
    studentFeeId: requiredId("Choose the fee."),
    kind: z.enum(ConcessionKind),
    scholarshipCategory: z.union([z.enum(ScholarshipCategory), z.literal("")]).nullish().transform((v) => v || null),
    title: requiredText("Name the discount or scholarship.", 120),
    // One of: a fixed amount, or a percentage of the fee.
    amount: z.union([rupees(), z.literal("")]).nullish().transform((v) => (v === "" || v === undefined ? null : v)),
    percent: z
      .union([z.coerce.number().min(0.01, "Use 0.01–100 %.").max(100, "Use 0.01–100 %."), z.literal("")])
      .nullish()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    reason: optionalText(300),
  })
  .refine((v) => (v.amount === null) !== (v.percent === null), { path: ["amount"], message: "Enter either an amount or a percentage." })

export const revokeSchema = z.object({ reason: reason("Give a reason.") })

export const paymentSchema = z
  .object({
    studentId: requiredId("Choose the student."),
    amount: rupees(),
    receivedOn: dateString("Enter the payment date."),
    method: z.enum(PaymentMethod),
    reference: optionalText(80),
    payerName: optionalText(120),
    note: optionalText(300),
    // The fees to pay, oldest due first; empty → all of the student's open fees.
    studentFeeIds: z.array(z.uuid()).max(200).default([]),
    // Cheques and transfers awaiting clearance.
    pending: flag.default(false),
    // Staff confirm they found the transaction in the provider's dashboard.
    confirmedOnline: flag.default(false),
    // Idempotency key from the form: a repeated submission returns the
    // first receipt.
    requestId: optionalId,
  })
  .refine((v) => !REFERENCE_METHODS.includes(v.method) || v.reference, { path: ["reference"], message: "Enter the transaction ID or reference." })
  .refine((v) => !ONLINE_METHODS.includes(v.method) || v.confirmedOnline, {
    path: ["confirmedOnline"],
    message: "Confirm you've found this transaction in the merchant dashboard.",
  })
  .refine((v) => !v.pending || PENDABLE_METHODS.includes(v.method), { path: ["pending"], message: "Only cheques and bank transfers can await clearance." })

export const reverseSchema = z.object({ reason: reason("Give a reason for the reversal.") })

export const entrySchema = z.object({
  kind: z.enum(FinanceEntryKind),
  categoryId: requiredId("Choose the category."),
  entryDate: dateString("Enter the date."),
  amount: rupees(),
  description: requiredText("Describe the entry.", 200),
  party: optionalText(120),
  method: z.enum(PaymentMethod),
  reference: optionalText(80),
})

export const voidSchema = z.object({ reason: reason("Give a reason for voiding.") })

export type FeeStructureInput = z.input<typeof feeStructureSchema>
export type PaymentInput = z.input<typeof paymentSchema>
