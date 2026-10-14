import "server-only"

import { localDate } from "@/features/attendance/constants"
import type { FeeFilters, PaymentFilters } from "@/features/finance/filters"
import { allocate, toDecimal, toPaisa } from "@/features/finance/money"
import { paymentSchema, reverseSchema } from "@/features/finance/schemas"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"
import { requireFinance, type Ctx } from "@/services/finance/access"
import { lockFees, recomputeFees } from "@/services/finance/fee-service"

// Fees owed, payments received, receipts and reversals.

const fullName = (s: { firstName: string; middleName?: string | null; lastName: string }) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")

async function yearScope(ctx: Ctx, year: string | undefined) {
  if (year === "all") return null
  const organizationId = ctx.organization.id
  const found = year
    ? await prisma.academicYear.findFirst({ where: { id: year, organizationId }, select: { id: true } })
    : await prisma.academicYear.findFirst({ where: { organizationId, isCurrent: true }, select: { id: true } })
  return found?.id ?? null
}

const studentSearch = (q: string): Prisma.StudentWhereInput => ({
  OR: q
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((term) => ({
      OR: [
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { admissionNumber: { contains: term, mode: "insensitive" } },
        { phone: { contains: term } },
      ],
    })),
})

// ------------------------------------------------------------ student search

// Students by name, admission number or phone, optionally in a class, with
// their outstanding balance.
export async function searchStudents(ctx: Ctx, input: { q?: string; classId?: string }) {
  requireFinance(ctx, "staff")
  const organizationId = ctx.organization.id
  if (!input.q && !input.classId) return []
  const students = await prisma.student.findMany({
    where: {
      organizationId, archivedAt: null,
      ...(input.q && studentSearch(input.q)),
      ...(input.classId && { enrollments: { some: { classId: input.classId, status: { in: ["ACTIVE", "ON_HOLD"] } } } }),
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 25,
    select: {
      id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, phone: true,
      enrollments: { where: { status: { in: ["ACTIVE", "ON_HOLD"] } }, orderBy: { enrollmentDate: "desc" }, take: 1, select: { rollNumber: true, class: { select: { name: true } }, section: { select: { name: true } } } },
      fees: { where: { status: { in: ["UNPAID", "PARTIAL"] } }, select: { amount: true, discountAmount: true, paidAmount: true } },
    },
  })
  return students.map((s) => ({
    id: s.id, name: fullName(s), admissionNumber: s.admissionNumber, phone: s.phone,
    className: s.enrollments[0] ? [s.enrollments[0].class.name, s.enrollments[0].section?.name].filter(Boolean).join(" · ") : null,
    balance: s.fees.reduce((n, f) => n + toPaisa(f.amount) - toPaisa(f.discountAmount) - toPaisa(f.paidAmount), 0),
  }))
}

export type StudentHit = Awaited<ReturnType<typeof searchStudents>>[number]

// ------------------------------------------------------------ one student's account

export async function studentAccount(ctx: Ctx, studentId: string) {
  requireFinance(ctx, "staff")
  const organizationId = ctx.organization.id
  const student = await prisma.student.findFirst({
    where: { id: studentId, organizationId },
    select: {
      id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, phone: true,
      enrollments: { where: { status: { in: ["ACTIVE", "ON_HOLD"] } }, orderBy: { enrollmentDate: "desc" }, take: 1, select: { rollNumber: true, academicYear: { select: { id: true, name: true } }, class: { select: { name: true } }, section: { select: { name: true } } } },
    },
  })
  if (!student) throw new NotFoundError("Student not found.")
  const [fees, payments] = await Promise.all([
    prisma.studentFee.findMany({
      where: { organizationId, studentId },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: {
        id: true, title: true, amount: true, discountAmount: true, paidAmount: true, dueDate: true, status: true, cancelReason: true,
        academicYear: { select: { name: true } }, category: { select: { name: true } },
        concessions: { orderBy: { createdAt: "desc" }, select: { id: true, kind: true, title: true, amount: true, reason: true, createdAt: true, revokedAt: true, revokeReason: true } },
      },
    }),
    prisma.payment.findMany({
      where: { organizationId, studentId },
      orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
      select: { id: true, receiptNumber: true, receivedOn: true, amount: true, method: true, reference: true, status: true, verificationStatus: true, reversalReason: true },
    }),
  ])
  const today = localDate()
  const rows = fees.map((f) => {
    const amount = toPaisa(f.amount)
    const discount = toPaisa(f.discountAmount)
    const paid = toPaisa(f.paidAmount)
    const balance = f.status === "CANCELLED" ? 0 : amount - discount - paid
    return {
      ...f,
      amount, discount, paid, balance,
      overdue: balance > 0 && !!f.dueDate && f.dueDate.toISOString().slice(0, 10) < today,
      concessions: f.concessions.map((c) => ({ ...c, amount: toPaisa(c.amount) })),
    }
  })
  const open = rows.filter((f) => f.status !== "CANCELLED")
  return {
    student: { ...student, name: fullName(student), enrollment: student.enrollments[0] ?? null },
    fees: rows,
    payments: payments.map((p) => ({ ...p, amount: toPaisa(p.amount) })),
    totals: {
      assessed: open.reduce((n, f) => n + f.amount, 0),
      discount: open.reduce((n, f) => n + f.discount, 0),
      paid: open.reduce((n, f) => n + f.paid, 0),
      balance: open.reduce((n, f) => n + f.balance, 0),
      overdue: open.filter((f) => f.overdue).reduce((n, f) => n + f.balance, 0),
      pending: payments.filter((p) => p.status === "COMPLETED" && p.verificationStatus === "PENDING").reduce((n, p) => n + toPaisa(p.amount), 0),
    },
  }
}

export type StudentAccount = Awaited<ReturnType<typeof studentAccount>>

// ------------------------------------------------------------ fee lists (assignments, outstanding)

export async function listStudentFees(ctx: Ctx, filters: FeeFilters, options: { openOnly?: boolean } = {}) {
  requireFinance(ctx, "staff")
  const organizationId = ctx.organization.id
  const yearId = await yearScope(ctx, filters.year)
  const today = new Date(`${localDate()}T00:00:00.000Z`)
  const where: Prisma.StudentFeeWhereInput = {
    AND: [
      { organizationId },
      yearId ? { academicYearId: yearId } : {},
      filters.category ? { categoryId: filters.category } : {},
      filters.status ? { status: filters.status } : {},
      options.openOnly ? { status: { in: ["UNPAID", "PARTIAL"] } } : {},
      filters.class ? { student: { enrollments: { some: { classId: filters.class, ...(yearId && { academicYearId: yearId }), status: { in: ["ACTIVE", "ON_HOLD"] } } } } } : {},
      filters.due === "overdue" ? { status: { in: ["UNPAID", "PARTIAL"] }, dueDate: { lt: today } } : {},
      filters.due === "upcoming" ? { status: { in: ["UNPAID", "PARTIAL"] }, dueDate: { gte: today } } : {},
      filters.min !== undefined ? { amount: { gte: toDecimal(filters.min) } } : {},
      filters.max !== undefined ? { amount: { lte: toDecimal(filters.max) } } : {},
      filters.q ? { OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { student: studentSearch(filters.q) }] } : {},
    ],
  }
  const orderBy: Prisma.StudentFeeOrderByWithRelationInput[] =
    filters.sort === "student" ? [{ student: { firstName: filters.dir } }, { student: { lastName: filters.dir } }]
    : filters.sort === "amount" ? [{ amount: filters.dir }]
    : filters.sort === "createdAt" ? [{ createdAt: filters.dir }]
    : [{ dueDate: { sort: filters.dir, nulls: "last" } }, { createdAt: "asc" }]
  const [total, rows, sums] = await Promise.all([
    prisma.studentFee.count({ where }),
    prisma.studentFee.findMany({
      where, orderBy, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize,
      select: {
        id: true, title: true, amount: true, discountAmount: true, paidAmount: true, dueDate: true, status: true, createdAt: true,
        category: { select: { name: true } }, academicYear: { select: { name: true } },
        student: { select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, enrollments: { where: { status: { in: ["ACTIVE", "ON_HOLD"] } }, orderBy: { enrollmentDate: "desc" }, take: 1, select: { class: { select: { name: true } }, section: { select: { name: true } } } } } },
      },
    }),
    prisma.studentFee.aggregate({ where: { AND: [where, { status: { not: "CANCELLED" } }] }, _sum: { amount: true, discountAmount: true, paidAmount: true } }),
  ])
  const todayText = localDate()
  return {
    total, yearId,
    totals: {
      assessed: toPaisa(sums._sum.amount),
      discount: toPaisa(sums._sum.discountAmount),
      paid: toPaisa(sums._sum.paidAmount),
      balance: toPaisa(sums._sum.amount) - toPaisa(sums._sum.discountAmount) - toPaisa(sums._sum.paidAmount),
    },
    rows: rows.map((f) => {
      const amount = toPaisa(f.amount)
      const balance = f.status === "CANCELLED" ? 0 : amount - toPaisa(f.discountAmount) - toPaisa(f.paidAmount)
      const e = f.student.enrollments[0]
      return {
        id: f.id, title: f.title, status: f.status, dueDate: f.dueDate, createdAt: f.createdAt, category: f.category.name, year: f.academicYear.name,
        amount, discount: toPaisa(f.discountAmount), paid: toPaisa(f.paidAmount), balance,
        overdue: balance > 0 && !!f.dueDate && f.dueDate.toISOString().slice(0, 10) < todayText,
        student: { id: f.student.id, name: fullName(f.student), admissionNumber: f.student.admissionNumber, className: e ? [e.class.name, e.section?.name].filter(Boolean).join(" · ") : null },
      }
    }),
  }
}

export type FeeRow = Awaited<ReturnType<typeof listStudentFees>>["rows"][number]

// ------------------------------------------------------------ recording payments

// Next receipt number, taken inside the payment's transaction after all
// checks: the counter row stays locked until commit, so numbers are
// gapless (a refused payment uses none) and never handed out twice.
async function nextReceiptNumber(tx: TransactionClient, organizationId: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const s = await tx.financeSettings.update({ where: { organizationId }, data: { nextReceiptSequence: { increment: 1 } } })
    const candidate = `${s.receiptPrefix}${String(s.nextReceiptSequence - 1).padStart(s.receiptPadding, "0")}`
    if (!(await tx.payment.findFirst({ where: { organizationId, receiptNumber: candidate }, select: { id: true } }))) return candidate
  }
  throw new ConflictError("Couldn't generate a free receipt number.")
}

export async function recordPayment(ctx: Ctx, raw: unknown) {
  requireFinance(ctx, "finance.create")
  const input = paymentSchema.parse(raw)
  const organizationId = ctx.organization.id
  if (input.receivedOn > localDate()) throw new ValidationError({ receivedOn: ["The payment date can't be in the future."] })
  const student = await prisma.student.findFirst({ where: { id: input.studentId, organizationId }, select: { id: true, firstName: true, lastName: true } })
  if (!student) throw new ValidationError({ studentId: ["Choose a valid student."] })
  if (input.reference && input.method !== "CASH") {
    const dup = await prisma.payment.findFirst({ where: { organizationId, method: input.method, reference: input.reference, status: "COMPLETED" }, select: { receiptNumber: true } })
    if (dup) throw new ValidationError({ reference: [`This reference is already recorded on receipt ${dup.receiptNumber}.`] })
  }
  // A repeated submission (double-click, retry) returns the first receipt.
  const replay = async () =>
    input.requestId ? prisma.payment.findFirst({ where: { organizationId, requestId: input.requestId, studentId: input.studentId }, select: { id: true, receiptNumber: true } }) : null
  const existing = await replay()
  if (existing) return existing
  await prisma.financeSettings.createMany({ data: [{ organizationId }], skipDuplicates: true })
  try {
  return await prisma.$transaction(async (tx) => {
    await lockFees(tx, organizationId, { studentId: input.studentId })
    const fees = await tx.studentFee.findMany({
      where: { organizationId, studentId: input.studentId, status: { in: ["UNPAID", "PARTIAL"] }, ...(input.studentFeeIds.length && { id: { in: input.studentFeeIds } }) },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: { id: true, amount: true, discountAmount: true, paidAmount: true },
    })
    if (input.studentFeeIds.length && fees.length !== new Set(input.studentFeeIds).size) throw new ValidationError({ studentFeeIds: ["Some chosen fees aren't open for this student."] })
    // Pending payments already count against the balance, so nothing is
    // collected twice while a cheque clears.
    const pending = await tx.paymentAllocation.groupBy({
      by: ["studentFeeId"],
      where: { organizationId, studentFeeId: { in: fees.map((f) => f.id) }, payment: { status: "COMPLETED", verificationStatus: "PENDING" } },
      _sum: { amount: true },
    })
    const open = fees.map((f) => ({
      id: f.id,
      balance: toPaisa(f.amount) - toPaisa(f.discountAmount) - toPaisa(f.paidAmount) - toPaisa(pending.find((p) => p.studentFeeId === f.id)?._sum.amount),
    }))
    const available = open.reduce((n, f) => n + Math.max(0, f.balance), 0)
    if (available === 0) throw new ConflictError("This student has nothing left to pay for the chosen fees.")
    const parts = allocate(input.amount, open)
    if (!parts) throw new ValidationError({ amount: [`The amount is more than the balance due (Rs. ${(available / 100).toFixed(2)}).`] })

    const verified = !input.pending
    const receiptNumber = await nextReceiptNumber(tx, organizationId)
    const payment = await tx.payment.create({
      data: {
        organizationId, studentId: input.studentId, receiptNumber, receivedOn: toDate(input.receivedOn), amount: toDecimal(input.amount),
        method: input.method, reference: input.reference, payerName: input.payerName, note: input.note,
        verificationStatus: verified ? "VERIFIED" : "PENDING", verifiedAt: verified ? new Date() : null, verifiedById: verified ? ctx.user.id : null,
        receivedById: ctx.user.id, requestId: input.requestId,
        // organizationId comes from the payment (composite key).
        allocations: { create: parts.map((p) => ({ studentFeeId: p.studentFeeId, amount: toDecimal(p.amount) })) },
      },
      select: { id: true, receiptNumber: true },
    })
    await recomputeFees(tx, organizationId, parts.map((p) => p.studentFeeId))
    await audit(tx, ctx, {
      action: "finance.payment.create", entityType: "student", entityId: student.id,
      summary: `Receipt ${receiptNumber}: Rs. ${(input.amount / 100).toFixed(2)} from ${student.firstName} ${student.lastName} by ${input.method}${verified ? "" : " (awaiting clearance)"}`,
      metadata: { paymentId: payment.id },
    })
    return payment
  })
  } catch (error) {
    // The same request arrived twice at once: the first one won.
    const first = (error as { code?: string }).code === "P2002" ? await replay() : null
    if (first) return first
    throw error
  }
}

// A pending cheque or transfer has cleared.
export async function confirmPayment(ctx: Ctx, paymentId: string) {
  requireFinance(ctx, "finance.update")
  await prisma.$transaction(async (tx) => {
    const p = await tx.payment.findFirst({ where: { id: paymentId, organizationId: ctx.organization.id }, select: { id: true, receiptNumber: true, studentId: true, status: true, verificationStatus: true, allocations: { select: { studentFeeId: true } } } })
    if (!p) throw new NotFoundError("Payment not found.")
    if (p.status !== "COMPLETED" || p.verificationStatus !== "PENDING") throw new ConflictError("Only pending payments can be confirmed.")
    await lockFees(tx, ctx.organization.id, { ids: p.allocations.map((a) => a.studentFeeId) })
    await tx.payment.update({ where: { id: paymentId }, data: { verificationStatus: "VERIFIED", verifiedAt: new Date(), verifiedById: ctx.user.id } })
    await recomputeFees(tx, ctx.organization.id, p.allocations.map((a) => a.studentFeeId))
    await audit(tx, ctx, { action: "finance.payment.confirm", entityType: "student", entityId: p.studentId, summary: `Confirmed payment ${p.receiptNumber}`, metadata: { paymentId } })
  })
}

// Reversal (bounced cheque, wrong entry, refund): the receipt stays on
// record as reversed and the fees are reopened.
export async function reversePayment(ctx: Ctx, paymentId: string, raw: unknown) {
  requireFinance(ctx, "finance.reverse")
  const { reason } = reverseSchema.parse(raw)
  await prisma.$transaction(async (tx) => {
    const p = await tx.payment.findFirst({ where: { id: paymentId, organizationId: ctx.organization.id }, select: { id: true, receiptNumber: true, studentId: true, status: true, amount: true, allocations: { select: { studentFeeId: true } } } })
    if (!p) throw new NotFoundError("Payment not found.")
    if (p.status === "REVERSED") throw new ConflictError("This payment is already reversed.")
    await lockFees(tx, ctx.organization.id, { ids: p.allocations.map((a) => a.studentFeeId) })
    await tx.payment.update({ where: { id: paymentId }, data: { status: "REVERSED", reversedAt: new Date(), reversedById: ctx.user.id, reversalReason: reason } })
    await recomputeFees(tx, ctx.organization.id, p.allocations.map((a) => a.studentFeeId))
    await audit(tx, ctx, { action: "finance.payment.reverse", entityType: "student", entityId: p.studentId, summary: `Reversed payment ${p.receiptNumber} (Rs. ${(toPaisa(p.amount) / 100).toFixed(2)}): ${reason}`, metadata: { paymentId } })
  })
}

// ------------------------------------------------------------ payment history

export async function listPayments(ctx: Ctx, filters: PaymentFilters) {
  requireFinance(ctx, "staff")
  const organizationId = ctx.organization.id
  const yearId = filters.year ? await yearScope(ctx, filters.year) : null
  const where: Prisma.PaymentWhereInput = {
    AND: [
      { organizationId },
      yearId ? { allocations: { some: { studentFee: { academicYearId: yearId } } } } : {},
      filters.method ? { method: filters.method } : {},
      filters.status === "completed" ? { status: "COMPLETED", verificationStatus: "VERIFIED" } : {},
      filters.status === "pending" ? { status: "COMPLETED", verificationStatus: "PENDING" } : {},
      filters.status === "reversed" ? { status: "REVERSED" } : {},
      filters.from ? { receivedOn: { gte: toDate(filters.from) } } : {},
      filters.to ? { receivedOn: { lte: toDate(filters.to) } } : {},
      filters.min !== undefined ? { amount: { gte: toDecimal(filters.min) } } : {},
      filters.max !== undefined ? { amount: { lte: toDecimal(filters.max) } } : {},
      filters.class ? { student: { enrollments: { some: { classId: filters.class, status: { in: ["ACTIVE", "ON_HOLD"] } } } } } : {},
      filters.q ? { OR: [{ receiptNumber: { contains: filters.q, mode: "insensitive" } }, { reference: { contains: filters.q, mode: "insensitive" } }, { student: studentSearch(filters.q) }] } : {},
    ],
  }
  const orderBy: Prisma.PaymentOrderByWithRelationInput[] =
    filters.sort === "amount" ? [{ amount: filters.dir }] : filters.sort === "receipt" ? [{ receiptNumber: filters.dir }] : [{ receivedOn: filters.dir }, { createdAt: filters.dir }]
  const [total, rows, sum] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where, orderBy, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize,
      select: {
        id: true, receiptNumber: true, receivedOn: true, amount: true, method: true, reference: true, status: true, verificationStatus: true, reversalReason: true, receivedById: true, createdAt: true,
        student: { select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true } },
      },
    }),
    prisma.payment.aggregate({ where: { AND: [where, { status: "COMPLETED", verificationStatus: "VERIFIED" }] }, _sum: { amount: true } }),
  ])
  const users = await userNames(rows.map((r) => r.receivedById))
  return {
    total,
    collected: toPaisa(sum._sum.amount),
    rows: rows.map((r) => ({ ...r, amount: toPaisa(r.amount), studentName: fullName(r.student), receivedBy: r.receivedById ? (users.get(r.receivedById) ?? null) : null })),
  }
}

export type PaymentRow = Awaited<ReturnType<typeof listPayments>>["rows"][number]

export async function userNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  if (!unique.length) return new Map<string, string>()
  return new Map((await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
}

// ------------------------------------------------------------ receipts

export async function getReceipt(ctx: Ctx, paymentId: string) {
  requireFinance(ctx, "staff")
  return loadReceipt(ctx, { id: paymentId, organizationId: ctx.organization.id })
}

// A student's own receipt (the student portal). Another student's payment,
// or another organisation's, is "not found".
export async function getMyReceipt(ctx: Ctx, paymentId: string) {
  return loadReceipt(ctx, { id: paymentId, organizationId: ctx.organization.id, student: { userId: ctx.user.id, archivedAt: null } })
}

async function loadReceipt(ctx: Ctx, where: Prisma.PaymentWhereInput) {
  const organizationId = ctx.organization.id
  const p = await prisma.payment.findFirst({
    where,
    select: {
      id: true, receiptNumber: true, receivedOn: true, amount: true, method: true, reference: true, payerName: true, note: true,
      status: true, verificationStatus: true, reversedAt: true, reversalReason: true, receivedById: true, verifiedById: true, createdAt: true,
      student: { select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, enrollments: { where: { status: { in: ["ACTIVE", "ON_HOLD"] } }, orderBy: { enrollmentDate: "desc" }, take: 1, select: { rollNumber: true, class: { select: { name: true } }, section: { select: { name: true } }, academicYear: { select: { name: true } } } } } },
      allocations: { select: { amount: true, studentFee: { select: { title: true, amount: true, discountAmount: true, paidAmount: true, status: true, category: { select: { name: true } } } } } },
    },
  })
  if (!p) throw new NotFoundError("Receipt not found.")
  const [org, users, balance] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, logoUrl: true } }),
    userNames([p.receivedById, p.verifiedById]),
    prisma.studentFee.aggregate({ where: { organizationId, studentId: p.student.id, status: { in: ["UNPAID", "PARTIAL"] } }, _sum: { amount: true, discountAmount: true, paidAmount: true } }),
  ])
  return {
    ...p,
    amount: toPaisa(p.amount),
    organization: org,
    studentName: fullName(p.student),
    enrollment: p.student.enrollments[0] ?? null,
    lines: p.allocations.map((a) => ({ title: a.studentFee.title, category: a.studentFee.category.name, amount: toPaisa(a.amount) })),
    receivedBy: p.receivedById ? (users.get(p.receivedById) ?? null) : null,
    verifiedBy: p.verifiedById ? (users.get(p.verifiedById) ?? null) : null,
    balanceAfter: toPaisa(balance._sum.amount) - toPaisa(balance._sum.discountAmount) - toPaisa(balance._sum.paidAmount),
  }
}

export type Receipt = Awaited<ReturnType<typeof getReceipt>>
