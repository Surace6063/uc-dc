import "server-only"

import type { ConcessionFilters, EntryFilters, TransactionFilters } from "@/features/finance/filters"
import { toDecimal, toPaisa } from "@/features/finance/money"
import { entrySchema, voidSchema } from "@/features/finance/schemas"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { FinanceEntryKind, PaymentMethod } from "@/lib/generated/prisma/enums"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"
import { requireFinance, type Ctx } from "@/services/finance/access"
import { userNames } from "@/services/finance/payment-service"

// Income and expense entries, concessions, and the combined transaction list.

// ------------------------------------------------------------ income and expenses

export async function listEntries(ctx: Ctx, kind: FinanceEntryKind, filters: EntryFilters) {
  requireFinance(ctx, "staff")
  const where: Prisma.FinanceEntryWhereInput = {
    AND: [
      { organizationId: ctx.organization.id, kind },
      filters.view === "active" ? { status: "ACTIVE" } : filters.view === "voided" ? { status: "VOIDED" } : {},
      filters.category ? { categoryId: filters.category } : {},
      filters.method ? { method: filters.method } : {},
      filters.from ? { entryDate: { gte: toDate(filters.from) } } : {},
      filters.to ? { entryDate: { lte: toDate(filters.to) } } : {},
      filters.q ? { OR: [{ description: { contains: filters.q, mode: "insensitive" } }, { party: { contains: filters.q, mode: "insensitive" } }, { reference: { contains: filters.q, mode: "insensitive" } }] } : {},
    ],
  }
  const orderBy: Prisma.FinanceEntryOrderByWithRelationInput[] = filters.sort === "amount" ? [{ amount: filters.dir }] : [{ entryDate: filters.dir }, { createdAt: filters.dir }]
  const [total, rows, sum] = await Promise.all([
    prisma.financeEntry.count({ where }),
    prisma.financeEntry.findMany({
      where, orderBy, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize,
      select: { id: true, entryDate: true, amount: true, description: true, party: true, method: true, reference: true, status: true, voidReason: true, createdById: true, categoryId: true, category: { select: { name: true } } },
    }),
    prisma.financeEntry.aggregate({ where: { AND: [where, { status: "ACTIVE" }] }, _sum: { amount: true } }),
  ])
  const users = await userNames(rows.map((r) => r.createdById))
  return { total, sum: toPaisa(sum._sum.amount), rows: rows.map((r) => ({ ...r, amount: toPaisa(r.amount), createdBy: r.createdById ? (users.get(r.createdById) ?? null) : null })) }
}

export type EntryRow = Awaited<ReturnType<typeof listEntries>>["rows"][number]

export async function saveEntry(ctx: Ctx, raw: unknown) {
  requireFinance(ctx, "finance.create")
  const input = entrySchema.parse(raw)
  const organizationId = ctx.organization.id
  const category = await prisma.financeCategory.findFirst({ where: { id: input.categoryId, organizationId, kind: input.kind }, select: { name: true } })
  if (!category) throw new ValidationError({ categoryId: ["Choose a valid category."] })
  return prisma.$transaction(async (tx) => {
    const entry = await tx.financeEntry.create({
      data: { organizationId, kind: input.kind, categoryId: input.categoryId, entryDate: toDate(input.entryDate), amount: toDecimal(input.amount), description: input.description, party: input.party, method: input.method, reference: input.reference, createdById: ctx.user.id },
      select: { id: true },
    })
    await audit(tx, ctx, { action: `finance.${input.kind.toLowerCase()}.create`, entityType: "finance", entityId: entry.id, summary: `Recorded ${input.kind.toLowerCase()} Rs. ${(input.amount / 100).toFixed(2)} (${category.name}): ${input.description}` })
    return entry
  })
}

// Entries are voided (kept on record), never edited or deleted.
export async function voidEntry(ctx: Ctx, id: string, raw: unknown) {
  requireFinance(ctx, "finance.reverse")
  const { reason } = voidSchema.parse(raw)
  await prisma.$transaction(async (tx) => {
    const e = await tx.financeEntry.findFirst({ where: { id, organizationId: ctx.organization.id }, select: { id: true, kind: true, status: true, description: true } })
    if (!e) throw new NotFoundError("Entry not found.")
    if (e.status === "VOIDED") throw new ConflictError("This entry is already voided.")
    await tx.financeEntry.update({ where: { id }, data: { status: "VOIDED", voidedAt: new Date(), voidedById: ctx.user.id, voidReason: reason } })
    await audit(tx, ctx, { action: `finance.${e.kind.toLowerCase()}.void`, entityType: "finance", entityId: id, summary: `Voided ${e.kind.toLowerCase()} “${e.description}”: ${reason}` })
  })
}

// ------------------------------------------------------------ concessions

export async function listConcessions(ctx: Ctx, filters: ConcessionFilters) {
  requireFinance(ctx, "staff")
  const organizationId = ctx.organization.id
  const yearId =
    filters.year === "all" ? null
    : filters.year ? (await prisma.academicYear.findFirst({ where: { id: filters.year, organizationId }, select: { id: true } }))?.id ?? null
    : (await prisma.academicYear.findFirst({ where: { organizationId, isCurrent: true }, select: { id: true } }))?.id ?? null
  const where: Prisma.FeeConcessionWhereInput = {
    AND: [
      { organizationId },
      yearId ? { studentFee: { academicYearId: yearId } } : {},
      filters.kind ? { kind: filters.kind } : {},
      filters.view === "active" ? { revokedAt: null } : filters.view === "revoked" ? { revokedAt: { not: null } } : {},
      filters.q ? { OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { student: { OR: [{ firstName: { contains: filters.q, mode: "insensitive" } }, { lastName: { contains: filters.q, mode: "insensitive" } }, { admissionNumber: { contains: filters.q, mode: "insensitive" } }] } }] } : {},
    ],
  }
  const [total, rows, sums] = await Promise.all([
    prisma.feeConcession.count({ where }),
    prisma.feeConcession.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize,
      select: {
        id: true, kind: true, scholarshipCategory: true, title: true, amount: true, reason: true, createdAt: true, revokedAt: true, revokeReason: true, approvedById: true,
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
        studentFee: { select: { title: true, amount: true } },
      },
    }),
    prisma.feeConcession.groupBy({ by: ["kind"], where: { AND: [where, { revokedAt: null }] }, _sum: { amount: true }, _count: { _all: true } }),
  ])
  const users = await userNames(rows.map((r) => r.approvedById))
  return {
    total, yearId,
    byKind: sums.map((s) => ({ kind: s.kind, amount: toPaisa(s._sum.amount), count: s._count._all })),
    rows: rows.map((r) => ({ ...r, amount: toPaisa(r.amount), feeAmount: toPaisa(r.studentFee.amount), approvedBy: r.approvedById ? (users.get(r.approvedById) ?? null) : null })),
  }
}

export type ConcessionRow = Awaited<ReturnType<typeof listConcessions>>["rows"][number]

// ------------------------------------------------------------ all transactions

export type TransactionRow = {
  id: string
  type: "fee" | "income" | "expense"
  date: Date
  reference: string
  description: string
  method: PaymentMethod
  // Positive money in, negative money out.
  amount: number
  state: "completed" | "pending" | "reversed" | "voided"
  href: string | null
}

// Fee payments and income/expense entries in one list, newest first. A
// read-only view over the payments and entries tables (no separate ledger).
export async function listTransactions(ctx: Ctx, filters: TransactionFilters) {
  requireFinance(ctx, "staff")
  const organizationId = ctx.organization.id
  const dates = { ...(filters.from && { gte: toDate(filters.from) }), ...(filters.to && { lte: toDate(filters.to) }) }
  const cancelled = filters.include === "cancelled"
  // Enough of each side to fill the requested page after merging.
  const take = filters.page * filters.pageSize
  const wantFees = !filters.type || filters.type === "fee"
  const wantEntries = !filters.type || filters.type !== "fee"
  const paymentWhere: Prisma.PaymentWhereInput = {
    organizationId, receivedOn: dates, ...(filters.method && { method: filters.method }), ...(!cancelled && { status: "COMPLETED" }),
    ...(filters.q && { OR: [{ receiptNumber: { contains: filters.q, mode: "insensitive" } }, { reference: { contains: filters.q, mode: "insensitive" } }, { student: { OR: [{ firstName: { contains: filters.q, mode: "insensitive" } }, { lastName: { contains: filters.q, mode: "insensitive" } }, { admissionNumber: { contains: filters.q, mode: "insensitive" } }] } }] }),
  }
  const entryWhere: Prisma.FinanceEntryWhereInput = {
    organizationId, entryDate: dates, ...(filters.type && filters.type !== "fee" && { kind: filters.type === "income" ? "INCOME" : "EXPENSE" }),
    ...(filters.method && { method: filters.method }), ...(!cancelled && { status: "ACTIVE" }),
    ...(filters.q && { OR: [{ description: { contains: filters.q, mode: "insensitive" } }, { party: { contains: filters.q, mode: "insensitive" } }, { reference: { contains: filters.q, mode: "insensitive" } }] }),
  }
  const [payments, entries, paymentCount, entryCount, inSum, outSum, entryInSum] = await Promise.all([
    wantFees ? prisma.payment.findMany({ where: paymentWhere, orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }], take, select: { id: true, receiptNumber: true, receivedOn: true, amount: true, method: true, status: true, verificationStatus: true, createdAt: true, student: { select: { firstName: true, lastName: true, admissionNumber: true } } } }) : [],
    wantEntries ? prisma.financeEntry.findMany({ where: entryWhere, orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }], take, select: { id: true, kind: true, entryDate: true, amount: true, description: true, party: true, method: true, reference: true, status: true, createdAt: true, category: { select: { name: true } } } }) : [],
    wantFees ? prisma.payment.count({ where: paymentWhere }) : 0,
    wantEntries ? prisma.financeEntry.count({ where: entryWhere }) : 0,
    wantFees ? prisma.payment.aggregate({ where: { ...paymentWhere, status: "COMPLETED", verificationStatus: "VERIFIED" }, _sum: { amount: true } }) : null,
    wantEntries ? prisma.financeEntry.aggregate({ where: { ...entryWhere, kind: "EXPENSE", status: "ACTIVE" }, _sum: { amount: true } }) : null,
    wantEntries ? prisma.financeEntry.aggregate({ where: { ...entryWhere, kind: "INCOME", status: "ACTIVE" }, _sum: { amount: true } }) : null,
  ])
  const rows: (TransactionRow & { sortKey: number })[] = [
    ...payments.map((p) => ({
      id: p.id, type: "fee" as const, date: p.receivedOn, reference: p.receiptNumber,
      description: `Fee payment · ${p.student.firstName} ${p.student.lastName} (${p.student.admissionNumber})`,
      method: p.method, amount: toPaisa(p.amount),
      state: (p.status === "REVERSED" ? "reversed" : p.verificationStatus === "PENDING" ? "pending" : "completed") as TransactionRow["state"],
      href: `/dashboard/finance/payments/${p.id}`,
      sortKey: p.receivedOn.getTime() * 1000 + (p.createdAt.getTime() % 1000),
    })),
    ...entries.map((e) => ({
      id: e.id, type: e.kind === "INCOME" ? ("income" as const) : ("expense" as const), date: e.entryDate, reference: e.reference ?? "—",
      description: `${e.category.name} · ${e.description}${e.party ? ` (${e.party})` : ""}`,
      method: e.method, amount: e.kind === "INCOME" ? toPaisa(e.amount) : -toPaisa(e.amount),
      state: (e.status === "VOIDED" ? "voided" : "completed") as TransactionRow["state"],
      href: e.kind === "INCOME" ? "/dashboard/finance/income" : "/dashboard/finance/expenses",
      sortKey: e.entryDate.getTime() * 1000 + (e.createdAt.getTime() % 1000),
    })),
  ].sort((a, b) => b.sortKey - a.sortKey)
  const start = (filters.page - 1) * filters.pageSize
  return {
    total: paymentCount + entryCount,
    moneyIn: toPaisa(inSum?._sum.amount) + toPaisa(entryInSum?._sum.amount),
    moneyOut: toPaisa(outSum?._sum.amount),
    rows: rows.slice(start, start + filters.pageSize).map((r): TransactionRow => ({ id: r.id, type: r.type, date: r.date, reference: r.reference, description: r.description, method: r.method, amount: r.amount, state: r.state, href: r.href })),
  }
}
