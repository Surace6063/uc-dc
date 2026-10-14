import { z } from "zod"

import { entries } from "@/features/exams/filters"
import { ConcessionKind, FinanceEntryKind, PaymentMethod, StudentFeeStatus } from "@/lib/generated/prisma/enums"

// Finance lists and reports are driven by URL search params, applied on
// the server; CSV exports use the same parsers. Bad values are dropped.

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

const uuid = z.uuid().optional().catch(undefined)
const day = z.iso.date().optional().catch(undefined)
const q = z.string().trim().max(100).optional().catch(undefined)
const page = z.coerce.number().int().min(1).max(10_000).catch(1).default(1)
const pageSize = z.coerce.number().refine((n) => [10, 25, 50, 100].includes(n)).catch(25).default(25)
const dir = z.enum(["asc", "desc"]).catch("desc").default("desc")
const year = z.union([z.literal("all"), z.uuid()]).optional().catch(undefined)
// Rupee bounds typed by the user, as paisa.
const amount = z
  .string()
  .optional()
  .transform((v) => (v && /^\d+(\.\d{1,2})?$/.test(v) ? Math.round(Number(v) * 100) : undefined))
  .catch(undefined)

export const FINANCE_DEPENDENTS = { year: ["class"], level: ["class"] } as const

const feeFiltersSchema = z.object({
  q, page, pageSize, dir, year,
  sort: z.enum(["dueDate", "student", "amount", "balance", "createdAt"]).catch("dueDate").default("dueDate"),
  class: uuid,
  category: uuid,
  status: z.enum(StudentFeeStatus).optional().catch(undefined),
  // "overdue": balance left after the due date.
  due: z.enum(["overdue", "upcoming"]).optional().catch(undefined),
  min: amount,
  max: amount,
})
export type FeeFilters = z.output<typeof feeFiltersSchema>
export const parseFeeFilters = (source: ParamSource): FeeFilters => feeFiltersSchema.parse(entries(source))

// A range typed backwards (From after To) means the same period, not an
// empty one.
export function orderedRange<T extends { from?: string; to?: string }>(f: T): T {
  return f.from && f.to && f.from > f.to ? { ...f, from: f.to, to: f.from } : f
}

const paymentFiltersSchema = z.object({
  q, page, pageSize, dir, year,
  sort: z.enum(["receivedOn", "amount", "receipt"]).catch("receivedOn").default("receivedOn"),
  class: uuid,
  method: z.enum(PaymentMethod).optional().catch(undefined),
  status: z.enum(["completed", "pending", "reversed"]).optional().catch(undefined),
  from: day,
  to: day,
  min: amount,
  max: amount,
})
export type PaymentFilters = z.output<typeof paymentFiltersSchema>
export const parsePaymentFilters = (source: ParamSource): PaymentFilters => orderedRange(paymentFiltersSchema.parse(entries(source)))

const concessionFiltersSchema = z.object({
  q, page, pageSize, year,
  kind: z.enum(ConcessionKind).optional().catch(undefined),
  view: z.enum(["active", "revoked", "all"]).catch("active").default("active"),
})
export type ConcessionFilters = z.output<typeof concessionFiltersSchema>
export const parseConcessionFilters = (source: ParamSource): ConcessionFilters => concessionFiltersSchema.parse(entries(source))

const entryFiltersSchema = z.object({
  q, page, pageSize, dir,
  sort: z.enum(["entryDate", "amount"]).catch("entryDate").default("entryDate"),
  category: uuid,
  method: z.enum(PaymentMethod).optional().catch(undefined),
  from: day,
  to: day,
  view: z.enum(["active", "voided", "all"]).catch("active").default("active"),
})
export type EntryFilters = z.output<typeof entryFiltersSchema>
export const parseEntryFilters = (source: ParamSource): EntryFilters => orderedRange(entryFiltersSchema.parse(entries(source)))

const transactionFiltersSchema = z.object({
  q, page, pageSize,
  type: z.enum(["fee", "income", "expense"]).optional().catch(undefined),
  method: z.enum(PaymentMethod).optional().catch(undefined),
  from: day,
  to: day,
  // Reversed payments and voided entries are hidden unless asked for.
  include: z.literal("cancelled").optional().catch(undefined),
})
export type TransactionFilters = z.output<typeof transactionFiltersSchema>
export const parseTransactionFilters = (source: ParamSource): TransactionFilters => orderedRange(transactionFiltersSchema.parse(entries(source)))

const reportFiltersSchema = z.object({
  year,
  class: uuid,
  method: z.enum(PaymentMethod).optional().catch(undefined),
  from: day,
  to: day,
  date: day,
  // "YYYY-MM"
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().catch(undefined),
})
export type ReportFilters = z.output<typeof reportFiltersSchema>
export const parseReportFilters = (source: ParamSource): ReportFilters => orderedRange(reportFiltersSchema.parse(entries(source)))

export const ENTRY_KINDS = FinanceEntryKind
