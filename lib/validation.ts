import { z } from "zod"

// Field helpers shared by client forms (React Hook Form + zodResolver) and
// the server, which always re-parses input with the same schemas.

// Optional free text: "" and whitespace become null.
export const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .nullish()
    .transform((value) => value || null)

export const requiredText = (message: string, max = 120) =>
  z.string(message).trim().min(1, message).max(max, `Use at most ${max} characters.`)

// Optional reference to another record: "" means none.
export const optionalId = z
  .union([z.uuid("Invalid selection."), z.literal("")])
  .nullish()
  .transform((value) => value || null)

export const requiredId = (message: string) => z.uuid(message)

// Calendar date as entered in a date input (AD, YYYY-MM-DD).
export const dateString = (message = "Enter a valid date.") => z.iso.date(message)

export const optionalDate = z
  .union([z.iso.date("Enter a valid date."), z.literal("")])
  .nullish()
  .transform((value) => value || null)

// Optional whole number from a text/number input.
export const optionalInt = (min: number, max: number) =>
  z
    .union([z.number(), z.string()])
    .nullish()
    .transform((value, ctx) => {
      if (value === null || value === undefined || value === "") return null
      const n = typeof value === "number" ? value : Number(value)
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `Enter a whole number from ${min} to ${max}.` })
        return z.NEVER
      }
      return n
    })

export const optionalEmail = z
  .union([z.email("Enter a valid email address."), z.literal("")])
  .nullish()
  .transform((value) => (value ? value.toLowerCase() : null))

// Nepali mobile/landline numbers, loosely: digits with optional +, spaces, dashes.
export const optionalPhone = z
  .string()
  .trim()
  .max(20)
  .regex(/^$|^\+?[0-9][0-9\s-]{5,18}$/, "Enter a valid phone number.")
  .nullish()
  .transform((value) => value || null)

// Stored dates are calendar dates (@db.Date): use UTC midnight.
export function toDate(value: string): Date
export function toDate(value: string | null): Date | null
export function toDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

export function fromDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : ""
}
