import "server-only"

import { cache } from "react"

import { localDate } from "@/features/attendance/constants"
import { toPaisa } from "@/features/finance/money"
import type { PaymentMethod } from "@/lib/generated/prisma/enums"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { toDate } from "@/lib/validation"
import { requireFinance, type Ctx } from "@/services/finance/access"
import { userNames } from "@/services/finance/payment-service"

// Finance reports and dashboard figures. Collections count completed,
// verified payments only; pending (uncleared) payments are reported apart.

const COLLECTED = { status: "COMPLETED", verificationStatus: "VERIFIED" } as const
const OPEN = ["UNPAID", "PARTIAL"] as const

const sumBy = <T,>(rows: T[], key: (r: T) => string, value: (r: T) => number) => {
  const m = new Map<string, number>()
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r))
  return [...m.entries()].map(([k, v]) => ({ key: k, amount: v })).sort((a, b) => b.amount - a.amount)
}

export const currentYear = cache(async (ctx: Ctx, year?: string) => {
  const organizationId = ctx.organization.id
  if (year === "all") return null
  return year
    ? prisma.academicYear.findFirst({ where: { id: year, organizationId }, select: { id: true, name: true } })
    : prisma.academicYear.findFirst({ where: { organizationId, isCurrent: true }, select: { id: true, name: true } })
})

const monthKey = (d: Date) => d.toISOString().slice(0, 7)
const lastMonths = (n: number) => {
  const now = new Date(`${localDate()}T00:00:00.000Z`)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1))
    return monthKey(d)
  })
}

// ------------------------------------------------------------ dashboard

export const financeSummary = cache(async (ctx: Ctx, yearId: string | null) => {
  requireFinance(ctx, "staff")
  const organizationId = ctx.organization.id
  const today = localDate()
  const monthStart = `${today.slice(0, 7)}-01`
  const feeWhere: Prisma.StudentFeeWhereInput = { organizationId, status: { not: "CANCELLED" }, ...(yearId && { academicYearId: yearId }) }
  const [fees, todays, month, pending, overdue] = await Promise.all([
    prisma.studentFee.aggregate({ where: feeWhere, _sum: { amount: true, discountAmount: true, paidAmount: true } }),
    prisma.payment.aggregate({ where: { organizationId, ...COLLECTED, receivedOn: toDate(today) }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.aggregate({ where: { organizationId, ...COLLECTED, receivedOn: { gte: toDate(monthStart), lte: toDate(today) } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.aggregate({ where: { organizationId, status: "COMPLETED", verificationStatus: "PENDING" }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.studentFee.aggregate({ where: { ...feeWhere, status: { in: [...OPEN] }, dueDate: { lt: toDate(today) } }, _sum: { amount: true, discountAmount: true, paidAmount: true } }),
  ])
  const assessed = toPaisa(fees._sum.amount)
  const discount = toPaisa(fees._sum.discountAmount)
  const collected = toPaisa(fees._sum.paidAmount)
  return {
    assessed, discount, collected,
    outstanding: assessed - discount - collected,
    overdue: toPaisa(overdue._sum.amount) - toPaisa(overdue._sum.discountAmount) - toPaisa(overdue._sum.paidAmount),
    today: { amount: toPaisa(todays._sum.amount), count: todays._count._all },
    month: { amount: toPaisa(month._sum.amount), count: month._count._all },
    pending: { amount: toPaisa(pending._sum.amount), count: pending._count._all },
  }
})

// Fee collections, other income and expenses for the last 12 months.
export const monthlyTrend = cache(async (ctx: Ctx) => {
  requireFinance(ctx, "staff")
  const organizationId = ctx.organization.id
  const months = lastMonths(12)
  const from = toDate(`${months[0]}-01`)
  const [payments, entries] = await Promise.all([
    prisma.payment.groupBy({ by: ["receivedOn"], where: { organizationId, ...COLLECTED, receivedOn: { gte: from } }, _sum: { amount: true } }),
    prisma.financeEntry.groupBy({ by: ["kind", "entryDate"], where: { organizationId, status: "ACTIVE", entryDate: { gte: from } }, _sum: { amount: true } }),
  ])
  return months.map((m) => {
    const fees = payments.filter((p) => monthKey(p.receivedOn) === m).reduce((n, p) => n + toPaisa(p._sum.amount), 0)
    const income = entries.filter((e) => e.kind === "INCOME" && monthKey(e.entryDate) === m).reduce((n, e) => n + toPaisa(e._sum.amount), 0)
    const expense = entries.filter((e) => e.kind === "EXPENSE" && monthKey(e.entryDate) === m).reduce((n, e) => n + toPaisa(e._sum.amount), 0)
    return { month: m, fees, income: fees + income, otherIncome: income, expense }
  })
})

export async function recentPayments(ctx: Ctx, take = 6) {
  requireFinance(ctx, "staff")
  const rows = await prisma.payment.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: [{ createdAt: "desc" }],
    take,
    select: { id: true, receiptNumber: true, receivedOn: true, amount: true, method: true, status: true, verificationStatus: true, student: { select: { firstName: true, lastName: true, admissionNumber: true } } },
  })
  return rows.map((r) => ({ ...r, amount: toPaisa(r.amount) }))
}

// Students with fees past their due date, most owed first.
export async function overdueStudents(ctx: Ctx, yearId: string | null, take = 8) {
  requireFinance(ctx, "staff")
  const fees = await prisma.studentFee.findMany({
    where: { organizationId: ctx.organization.id, status: { in: [...OPEN] }, dueDate: { lt: toDate(localDate()) }, ...(yearId && { academicYearId: yearId }) },
    select: { amount: true, discountAmount: true, paidAmount: true, dueDate: true, student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, phone: true } } },
  })
  const by = new Map<string, { student: (typeof fees)[number]["student"]; amount: number; oldest: Date; fees: number }>()
  for (const f of fees) {
    const g = by.get(f.student.id) ?? { student: f.student, amount: 0, oldest: f.dueDate!, fees: 0 }
    g.amount += toPaisa(f.amount) - toPaisa(f.discountAmount) - toPaisa(f.paidAmount)
    if (f.dueDate! < g.oldest) g.oldest = f.dueDate!
    g.fees++
    by.set(f.student.id, g)
  }
  const list = [...by.values()].filter((g) => g.amount > 0).sort((a, b) => b.amount - a.amount)
  return { total: list.length, rows: list.slice(0, take) }
}

export async function recentFinanceActivity(ctx: Ctx, take = 8) {
  requireFinance(ctx, "staff")
  const rows = await prisma.auditLog.findMany({
    where: { organizationId: ctx.organization.id, action: { startsWith: "finance." } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, summary: true, createdAt: true, actorUserId: true },
  })
  const users = await userNames(rows.map((r) => r.actorUserId))
  return rows.map((r) => ({ ...r, actor: r.actorUserId ? (users.get(r.actorUserId) ?? null) : null }))
}

// ------------------------------------------------------------ outstanding

// Open balances for a year, by class (the student's enrollment that year)
// and by fee head, plus the students who owe most.
export async function outstandingReport(ctx: Ctx, input: { yearId: string | null; classId?: string }) {
  requireFinance(ctx, "finance.reports")
  const organizationId = ctx.organization.id
  const today = localDate()
  const fees = await prisma.studentFee.findMany({
    where: {
      organizationId, status: { in: [...OPEN] }, ...(input.yearId && { academicYearId: input.yearId }),
      ...(input.classId && { student: { enrollments: { some: { classId: input.classId, ...(input.yearId && { academicYearId: input.yearId }) } } } }),
    },
    select: {
      amount: true, discountAmount: true, paidAmount: true, dueDate: true, academicYearId: true,
      category: { select: { name: true } },
      student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, phone: true, enrollments: { orderBy: { enrollmentDate: "desc" }, select: { academicYearId: true, class: { select: { name: true } }, section: { select: { name: true } } } } } },
    },
  })
  const rows = fees.map((f) => {
    const e = f.student.enrollments.find((x) => x.academicYearId === f.academicYearId) ?? f.student.enrollments[0]
    return {
      balance: toPaisa(f.amount) - toPaisa(f.discountAmount) - toPaisa(f.paidAmount),
      overdue: !!f.dueDate && f.dueDate.toISOString().slice(0, 10) < today,
      category: f.category.name,
      className: e ? e.class.name : "Not enrolled",
      student: f.student,
      studentClass: e ? [e.class.name, e.section?.name].filter(Boolean).join(" · ") : "—",
    }
  })
  const students = new Map<string, { id: string; name: string; admissionNumber: string; phone: string | null; className: string; balance: number; overdue: number }>()
  for (const r of rows) {
    const s = students.get(r.student.id) ?? { id: r.student.id, name: `${r.student.firstName} ${r.student.lastName}`, admissionNumber: r.student.admissionNumber, phone: r.student.phone, className: r.studentClass, balance: 0, overdue: 0 }
    s.balance += r.balance
    if (r.overdue) s.overdue += r.balance
    students.set(r.student.id, s)
  }
  const byClass = new Map<string, { className: string; balance: number; overdue: number; students: Set<string> }>()
  for (const r of rows) {
    const c = byClass.get(r.className) ?? { className: r.className, balance: 0, overdue: 0, students: new Set<string>() }
    c.balance += r.balance
    if (r.overdue) c.overdue += r.balance
    c.students.add(r.student.id)
    byClass.set(r.className, c)
  }
  return {
    total: rows.reduce((n, r) => n + r.balance, 0),
    overdue: rows.filter((r) => r.overdue).reduce((n, r) => n + r.balance, 0),
    students: [...students.values()].sort((a, b) => b.balance - a.balance),
    byClass: [...byClass.values()].map((c) => ({ className: c.className, balance: c.balance, overdue: c.overdue, students: c.students.size })).sort((a, b) => b.balance - a.balance),
    byCategory: sumBy(rows, (r) => r.category, (r) => r.balance),
  }
}

// ------------------------------------------------------------ collections

// Verified fee collections in a date range, by day, fee head and method.
export async function collectionReport(ctx: Ctx, input: { from: string; to: string; classId?: string; method?: PaymentMethod }) {
  requireFinance(ctx, "finance.reports")
  const organizationId = ctx.organization.id
  const paymentWhere: Prisma.PaymentWhereInput = {
    organizationId, ...COLLECTED, receivedOn: { gte: toDate(input.from), lte: toDate(input.to) },
    ...(input.method && { method: input.method }),
    ...(input.classId && { student: { enrollments: { some: { classId: input.classId } } } }),
  }
  const [allocations, payments, pending] = await Promise.all([
    prisma.paymentAllocation.findMany({ where: { organizationId, payment: paymentWhere }, select: { amount: true, studentFee: { select: { category: { select: { name: true } } } } } }),
    prisma.payment.findMany({ where: paymentWhere, select: { amount: true, method: true, receivedOn: true } }),
    prisma.payment.aggregate({ where: { ...paymentWhere, verificationStatus: "PENDING" }, _sum: { amount: true }, _count: { _all: true } }),
  ])
  return {
    total: payments.reduce((n, p) => n + toPaisa(p.amount), 0),
    receipts: payments.length,
    pending: { amount: toPaisa(pending._sum.amount), count: pending._count._all },
    byCategory: sumBy(allocations, (a) => a.studentFee.category.name, (a) => toPaisa(a.amount)),
    byMethod: sumBy(payments, (p) => p.method, (p) => toPaisa(p.amount)),
    byDay: sumBy(payments, (p) => p.receivedOn.toISOString().slice(0, 10), (p) => toPaisa(p.amount)).sort((a, b) => a.key.localeCompare(b.key)),
  }
}

// Everything received or spent on one day, with the receipts.
export async function dailyReport(ctx: Ctx, date: string) {
  requireFinance(ctx, "finance.reports")
  const organizationId = ctx.organization.id
  const [payments, entries] = await Promise.all([
    prisma.payment.findMany({
      where: { organizationId, receivedOn: toDate(date) },
      orderBy: { createdAt: "asc" },
      select: { id: true, receiptNumber: true, amount: true, method: true, reference: true, status: true, verificationStatus: true, receivedById: true, student: { select: { firstName: true, lastName: true, admissionNumber: true } } },
    }),
    prisma.financeEntry.findMany({ where: { organizationId, entryDate: toDate(date), status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true, kind: true, amount: true, description: true, method: true, category: { select: { name: true } } } }),
  ])
  const users = await userNames(payments.map((p) => p.receivedById))
  const counted = payments.filter((p) => p.status === "COMPLETED" && p.verificationStatus === "VERIFIED")
  return {
    payments: payments.map((p) => ({ ...p, amount: toPaisa(p.amount), receivedBy: p.receivedById ? (users.get(p.receivedById) ?? "—") : "—" })),
    entries: entries.map((e) => ({ ...e, amount: toPaisa(e.amount) })),
    collected: counted.reduce((n, p) => n + toPaisa(p.amount), 0),
    byMethod: sumBy(counted, (p) => p.method, (p) => toPaisa(p.amount)),
    byCollector: sumBy(counted, (p) => (p.receivedById ? (users.get(p.receivedById) ?? "—") : "—"), (p) => toPaisa(p.amount)),
    otherIncome: entries.filter((e) => e.kind === "INCOME").reduce((n, e) => n + toPaisa(e.amount), 0),
    expenses: entries.filter((e) => e.kind === "EXPENSE").reduce((n, e) => n + toPaisa(e.amount), 0),
  }
}

// One month's money in and out by category.
export async function monthlyReport(ctx: Ctx, month: string) {
  requireFinance(ctx, "finance.reports")
  const organizationId = ctx.organization.id
  const start = toDate(`${month}-01`)
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
  const [allocations, entries, pending] = await Promise.all([
    prisma.paymentAllocation.findMany({ where: { organizationId, payment: { organizationId, ...COLLECTED, receivedOn: { gte: start, lte: end } } }, select: { amount: true, studentFee: { select: { category: { select: { name: true } } } } } }),
    prisma.financeEntry.findMany({ where: { organizationId, status: "ACTIVE", entryDate: { gte: start, lte: end } }, select: { kind: true, amount: true, category: { select: { name: true } } } }),
    prisma.payment.aggregate({ where: { organizationId, status: "COMPLETED", verificationStatus: "PENDING", receivedOn: { gte: start, lte: end } }, _sum: { amount: true } }),
  ])
  const fees = sumBy(allocations, (a) => a.studentFee.category.name, (a) => toPaisa(a.amount))
  const income = sumBy(entries.filter((e) => e.kind === "INCOME"), (e) => e.category.name, (e) => toPaisa(e.amount))
  const expenses = sumBy(entries.filter((e) => e.kind === "EXPENSE"), (e) => e.category.name, (e) => toPaisa(e.amount))
  const total = (xs: { amount: number }[]) => xs.reduce((n, x) => n + x.amount, 0)
  return {
    start, end, fees, income, expenses,
    totals: { fees: total(fees), income: total(income), expenses: total(expenses), net: total(fees) + total(income) - total(expenses) },
    pending: toPaisa(pending._sum.amount),
  }
}
