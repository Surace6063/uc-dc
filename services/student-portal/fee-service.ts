import "server-only"

import { localDate } from "@/features/attendance/constants"
import { toPaisa } from "@/features/finance/money"
import { prisma } from "@/lib/prisma"
import { myStudent, type Ctx } from "@/services/student-portal/me-service"

// The signed-in student's own fees and payments. Read-only; the student ID
// always comes from the account's linked profile, never from the request.
// Only verified, non-reversed payments count as paid.
export async function myFeeAccount(ctx: Ctx) {
  const student = await myStudent(ctx)
  if (!student) return null
  const organizationId = ctx.organization.id
  const [fees, payments] = await Promise.all([
    prisma.studentFee.findMany({
      where: { organizationId, studentId: student.id },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: {
        id: true, title: true, amount: true, discountAmount: true, paidAmount: true, dueDate: true, status: true,
        academicYear: { select: { name: true } },
        category: { select: { name: true } },
        concessions: { where: { revokedAt: null }, select: { id: true, kind: true, title: true, amount: true } },
      },
    }),
    prisma.payment.findMany({
      where: { organizationId, studentId: student.id },
      orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
      select: { id: true, receiptNumber: true, receivedOn: true, amount: true, method: true, status: true, verificationStatus: true },
    }),
  ])
  const today = localDate()
  const rows = fees.map((f) => {
    const amount = toPaisa(f.amount)
    const discount = toPaisa(f.discountAmount)
    const paid = toPaisa(f.paidAmount)
    const balance = f.status === "CANCELLED" ? 0 : amount - discount - paid
    return {
      id: f.id, title: f.title, status: f.status, dueDate: f.dueDate, year: f.academicYear.name, category: f.category.name,
      amount, discount, paid, balance,
      overdue: balance > 0 && !!f.dueDate && f.dueDate.toISOString().slice(0, 10) < today,
      concessions: f.concessions.map((c) => ({ ...c, amount: toPaisa(c.amount) })),
    }
  })
  const open = rows.filter((f) => f.status !== "CANCELLED")
  const nextDue = open.filter((f) => f.balance > 0 && f.dueDate).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())[0] ?? null
  return {
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
    nextDue,
  }
}

export type MyFeeAccount = NonNullable<Awaited<ReturnType<typeof myFeeAccount>>>
