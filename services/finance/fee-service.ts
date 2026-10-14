import "server-only"

import { DEFAULT_CATEGORIES } from "@/features/finance/constants"
import { feeState, toDecimal, toPaisa } from "@/features/finance/money"
import {
  assignStructureSchema,
  cancelFeeSchema,
  categorySchema,
  concessionSchema,
  feeStructureSchema,
  revokeSchema,
  studentFeeSchema,
} from "@/features/finance/schemas"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { Prisma } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"
import { requireFinance, type Ctx } from "@/services/finance/access"

// Fee heads, structures, the fees students owe, and concessions on them.

type Db = TransactionClient | typeof prisma

// Locks a student's fees (or the given fees) until the transaction ends, so
// concurrent payments or concessions can't both use the same balance.
export async function lockFees(tx: TransactionClient, organizationId: string, target: { studentId?: string; ids?: string[] }) {
  if (target.ids && target.ids.length === 0) return
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM student_fees
    WHERE organization_id = ${organizationId}::uuid
      ${target.studentId ? Prisma.sql`AND student_id = ${target.studentId}::uuid` : Prisma.empty}
      ${target.ids ? Prisma.sql`AND id IN (${Prisma.join(target.ids.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty}
    FOR UPDATE`)
}

// ------------------------------------------------------------ keeping fees consistent

// A fee's paid amount comes from its allocations of completed, verified
// payments; its discount from its active concessions. Recomputed (never
// adjusted by hand) whenever either changes.
export async function recomputeFees(db: Db, organizationId: string, feeIds: string[]) {
  const ids = [...new Set(feeIds)]
  if (ids.length === 0) return
  const [fees, paid, discounts] = await Promise.all([
    db.studentFee.findMany({ where: { id: { in: ids }, organizationId }, select: { id: true, amount: true, cancelledAt: true } }),
    db.paymentAllocation.groupBy({
      by: ["studentFeeId"],
      where: { organizationId, studentFeeId: { in: ids }, payment: { status: "COMPLETED", verificationStatus: "VERIFIED" } },
      _sum: { amount: true },
    }),
    db.feeConcession.groupBy({ by: ["studentFeeId"], where: { organizationId, studentFeeId: { in: ids }, revokedAt: null }, _sum: { amount: true } }),
  ])
  for (const fee of fees) {
    const p = toPaisa(paid.find((x) => x.studentFeeId === fee.id)?._sum.amount)
    const d = toPaisa(discounts.find((x) => x.studentFeeId === fee.id)?._sum.amount)
    const amount = toPaisa(fee.amount)
    if (p + d > amount) throw new ConflictError("Payments and concessions would be more than the fee itself.")
    const { status } = feeState({ amount, discount: d, paid: p, cancelled: fee.cancelledAt !== null })
    await db.studentFee.update({ where: { id: fee.id }, data: { paidAmount: toDecimal(p), discountAmount: toDecimal(d), status } })
  }
}

// ------------------------------------------------------------ categories

export async function listCategories(ctx: Ctx) {
  requireFinance(ctx, "staff")
  return prisma.financeCategory.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true, kind: true, name: true, code: true, description: true, isActive: true,
      _count: { select: { feeStructures: true, studentFees: true, entries: true } },
    },
  })
}

export type CategoryRow = Awaited<ReturnType<typeof listCategories>>[number]

export async function saveCategory(ctx: Ctx, id: string | null, raw: unknown) {
  requireFinance(ctx, "finance.update")
  const input = categorySchema.parse(raw)
  const organizationId = ctx.organization.id
  if (id) {
    const existing = await prisma.financeCategory.findFirst({ where: { id, organizationId }, select: { kind: true, _count: { select: { feeStructures: true, studentFees: true, entries: true } } } })
    if (!existing) throw new NotFoundError("Category not found.")
    const used = existing._count.feeStructures + existing._count.studentFees + existing._count.entries
    if (existing.kind !== input.kind && used) throw new ConflictError("This category is in use, so its type can't change.")
  }
  const clash = await prisma.financeCategory.findFirst({ where: { organizationId, kind: input.kind, name: { equals: input.name, mode: "insensitive" }, ...(id && { id: { not: id } }) }, select: { id: true } })
  if (clash) throw new ValidationError({ name: ["A category with this name already exists."] })
  return prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.financeCategory.update({ where: { id }, data: input, select: { id: true } })
      : await tx.financeCategory.create({ data: { ...input, organizationId }, select: { id: true } })
    await audit(tx, ctx, { action: id ? "finance.category.update" : "finance.category.create", entityType: "finance", entityId: saved.id, summary: `${id ? "Updated" : "Added"} ${input.kind.toLowerCase()} category “${input.name}”` })
    return saved
  })
}

// Adds the suggested categories that don't exist yet.
export async function addDefaultCategories(ctx: Ctx) {
  requireFinance(ctx, "finance.update")
  const organizationId = ctx.organization.id
  const result = await prisma.financeCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, organizationId, sortOrder: i })),
    skipDuplicates: true,
  })
  if (result.count) await audit(prisma, ctx, { action: "finance.category.defaults", entityType: "finance", summary: `Added ${result.count} suggested finance categories` })
  return result.count
}

async function requireCategory(db: Db, ctx: Ctx, id: string, kind: "FEE" | "INCOME" | "EXPENSE", field = "categoryId") {
  const c = await db.financeCategory.findFirst({ where: { id, organizationId: ctx.organization.id, kind }, select: { id: true, name: true, isActive: true } })
  if (!c) throw new ValidationError({ [field]: ["Choose a valid category."] })
  return c
}

// ------------------------------------------------------------ fee structures

export async function listFeeStructures(ctx: Ctx, academicYearId: string | null) {
  requireFinance(ctx, "staff")
  return prisma.feeStructure.findMany({
    where: { organizationId: ctx.organization.id, ...(academicYearId && { academicYearId }) },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, description: true, amount: true, isActive: true, academicYearId: true, categoryId: true,
      educationLevelId: true, programId: true, classId: true,
      academicYear: { select: { name: true } },
      category: { select: { name: true } },
      educationLevel: { select: { name: true } },
      program: { select: { name: true, code: true } },
      class: { select: { name: true } },
      installments: { orderBy: { sequence: "asc" }, select: { sequence: true, label: true, dueDate: true, amount: true } },
      _count: { select: { studentFees: { where: { cancelledAt: null } } } },
    },
  })
}

export type FeeStructureRow = Awaited<ReturnType<typeof listFeeStructures>>[number]

export async function saveFeeStructure(ctx: Ctx, id: string | null, raw: unknown) {
  requireFinance(ctx, "finance.update")
  const input = feeStructureSchema.parse(raw)
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const [year] = await Promise.all([
      tx.academicYear.findFirst({ where: { id: input.academicYearId, organizationId }, select: { id: true } }),
      requireCategory(tx, ctx, input.categoryId, "FEE"),
    ])
    if (!year) throw new ValidationError({ academicYearId: ["Choose a valid academic year."] })
    if (input.educationLevelId && !(await tx.educationLevel.findFirst({ where: { id: input.educationLevelId, organizationId }, select: { id: true } }))) throw new ValidationError({ educationLevelId: ["Choose a valid level."] })
    if (input.programId && !(await tx.program.findFirst({ where: { id: input.programId, organizationId }, select: { id: true } }))) throw new ValidationError({ programId: ["Choose a valid program."] })
    if (input.classId && !(await tx.academicClass.findFirst({ where: { id: input.classId, organizationId }, select: { id: true } }))) throw new ValidationError({ classId: ["Choose a valid class."] })

    if (id) {
      const existing = await tx.feeStructure.findFirst({ where: { id, organizationId }, select: { id: true, _count: { select: { studentFees: true } } } })
      if (!existing) throw new NotFoundError("Fee structure not found.")
      // Once assigned, the amounts and installments are fixed (fees already
      // reflect them); name, description and active state can change.
      if (existing._count.studentFees) {
        const current = await tx.feeStructure.findUniqueOrThrow({ where: { id }, select: { amount: true, academicYearId: true, installments: { select: { amount: true, dueDate: true } } } })
        const same =
          toPaisa(current.amount) === input.amount &&
          current.academicYearId === input.academicYearId &&
          current.installments.length === input.installments.length &&
          current.installments.every((x, i) => toPaisa(x.amount) === input.installments[i].amount)
        if (!same) throw new ConflictError("This structure has been assigned to students, so its amounts and installments can't change. Create a new structure instead.")
        await tx.feeStructure.update({ where: { id }, data: { name: input.name, description: input.description, isActive: input.isActive } })
        await audit(tx, ctx, { action: "finance.structure.update", entityType: "finance", entityId: id, summary: `Updated fee structure “${input.name}”` })
        return { id }
      }
    }
    const data = {
      academicYearId: input.academicYearId, categoryId: input.categoryId, name: input.name, description: input.description,
      educationLevelId: input.educationLevelId, programId: input.programId, classId: input.classId, amount: toDecimal(input.amount), isActive: input.isActive,
    }
    const saved = id
      ? await tx.feeStructure.update({ where: { id }, data, select: { id: true } })
      : await tx.feeStructure.create({ data: { ...data, organizationId, createdById: ctx.user.id }, select: { id: true } })
    await tx.feeInstallment.deleteMany({ where: { feeStructureId: saved.id } })
    if (input.installments.length) {
      await tx.feeInstallment.createMany({
        data: input.installments.map((x, i) => ({ feeStructureId: saved.id, sequence: i + 1, label: x.label, dueDate: toDate(x.dueDate), amount: toDecimal(x.amount) })),
      })
    }
    await audit(tx, ctx, { action: id ? "finance.structure.update" : "finance.structure.create", entityType: "finance", entityId: saved.id, summary: `${id ? "Updated" : "Created"} fee structure “${input.name}”` })
    return saved
  })
}

// Students a structure applies to: enrolled (active or on hold) in its year,
// in its level, program or class when it names one.
function eligibleWhere(organizationId: string, s: { academicYearId: string; educationLevelId: string | null; programId: string | null; classId: string | null }): Prisma.EnrollmentWhereInput {
  return {
    organizationId, academicYearId: s.academicYearId, status: { in: ["ACTIVE", "ON_HOLD"] },
    ...(s.educationLevelId && { educationLevelId: s.educationLevelId }),
    ...(s.programId && { programId: s.programId }),
    ...(s.classId && { classId: s.classId }),
  }
}

// Creates the fees a structure implies (one per installment) for its
// students. Students who already have it are skipped.
export async function assignFeeStructure(ctx: Ctx, raw: unknown) {
  requireFinance(ctx, "finance.create")
  const input = assignStructureSchema.parse(raw)
  const organizationId = ctx.organization.id
  const s = await prisma.feeStructure.findFirst({
    where: { id: input.feeStructureId, organizationId },
    select: { id: true, name: true, isActive: true, academicYearId: true, categoryId: true, educationLevelId: true, programId: true, classId: true, amount: true, installments: { orderBy: { sequence: "asc" } } },
  })
  if (!s) throw new NotFoundError("Fee structure not found.")
  if (!s.isActive) throw new ConflictError("This fee structure is inactive.")
  const enrolled = await prisma.enrollment.findMany({
    where: { ...eligibleWhere(organizationId, s), ...(input.studentIds.length && { studentId: { in: input.studentIds } }), student: { archivedAt: null } },
    select: { studentId: true },
  })
  const studentIds = [...new Set(enrolled.map((e) => e.studentId))]
  if (input.studentIds.length && studentIds.length !== new Set(input.studentIds).size) {
    throw new ValidationError({ studentIds: ["Some chosen students aren't enrolled where this fee applies."] })
  }
  const parts = s.installments.length
    ? s.installments.map((x) => ({ sequence: x.sequence, title: `${s.name} · ${x.label}`, amount: x.amount, dueDate: x.dueDate }))
    : [{ sequence: 0, title: s.name, amount: s.amount, dueDate: null }]
  const rows = studentIds.flatMap((studentId) =>
    parts.map((p) => ({
      organizationId, studentId, academicYearId: s.academicYearId, categoryId: s.categoryId, feeStructureId: s.id,
      installmentSequence: p.sequence, title: p.title, amount: p.amount, dueDate: p.dueDate, createdById: ctx.user.id,
    }))
  )
  return prisma.$transaction(async (tx) => {
    const created = rows.length ? (await tx.studentFee.createMany({ data: rows, skipDuplicates: true })).count : 0
    await audit(tx, ctx, { action: "finance.fee.assign", entityType: "finance", entityId: s.id, summary: `Assigned “${s.name}” to ${studentIds.length} student(s): ${created} new fee line(s)`, metadata: { students: studentIds.length, created } })
    return { students: studentIds.length, created, skipped: rows.length - created }
  })
}

// A one-off charge for one student (fine, certificate, trip, …).
export async function addStudentFee(ctx: Ctx, raw: unknown) {
  requireFinance(ctx, "finance.create")
  const input = studentFeeSchema.parse(raw)
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const [student, year] = await Promise.all([
      tx.student.findFirst({ where: { id: input.studentId, organizationId }, select: { id: true, firstName: true, lastName: true } }),
      tx.academicYear.findFirst({ where: { id: input.academicYearId, organizationId }, select: { id: true } }),
      requireCategory(tx, ctx, input.categoryId, "FEE"),
    ])
    if (!student) throw new ValidationError({ studentId: ["Choose a valid student."] })
    if (!year) throw new ValidationError({ academicYearId: ["Choose a valid academic year."] })
    const fee = await tx.studentFee.create({
      data: { organizationId, studentId: input.studentId, academicYearId: input.academicYearId, categoryId: input.categoryId, title: input.title, amount: toDecimal(input.amount), dueDate: toDate(input.dueDate), note: input.note, createdById: ctx.user.id },
      select: { id: true },
    })
    await audit(tx, ctx, { action: "finance.fee.create", entityType: "student", entityId: student.id, summary: `Charged ${student.firstName} ${student.lastName} “${input.title}”`, metadata: { studentFeeId: fee.id } })
    return fee
  })
}

// Cancels a fee nobody has paid towards. Paid fees need their payments
// reversed first, so money is never silently written off.
export async function cancelStudentFee(ctx: Ctx, feeId: string, raw: unknown) {
  requireFinance(ctx, "finance.adjust")
  const { reason } = cancelFeeSchema.parse(raw)
  await prisma.$transaction(async (tx) => {
    await lockFees(tx, ctx.organization.id, { ids: [feeId] })
    const fee = await tx.studentFee.findFirst({ where: { id: feeId, organizationId: ctx.organization.id }, select: { id: true, title: true, studentId: true, cancelledAt: true } })
    if (!fee) throw new NotFoundError("Fee not found.")
    if (fee.cancelledAt) throw new ConflictError("This fee is already cancelled.")
    const live = await tx.paymentAllocation.count({ where: { studentFeeId: feeId, payment: { status: "COMPLETED" } } })
    if (live) throw new ConflictError("Payments have been made towards this fee. Reverse them before cancelling it.")
    await tx.feeConcession.updateMany({ where: { studentFeeId: feeId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: ctx.user.id, revokeReason: "Fee cancelled" } })
    await tx.studentFee.update({ where: { id: feeId }, data: { cancelledAt: new Date(), cancelledById: ctx.user.id, cancelReason: reason, status: "CANCELLED", discountAmount: "0" } })
    await audit(tx, ctx, { action: "finance.fee.cancel", entityType: "student", entityId: fee.studentId, summary: `Cancelled fee “${fee.title}”: ${reason}`, metadata: { studentFeeId: feeId } })
  })
}

// ------------------------------------------------------------ concessions

export async function addConcession(ctx: Ctx, raw: unknown) {
  requireFinance(ctx, "finance.adjust")
  const input = concessionSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    await lockFees(tx, ctx.organization.id, { ids: [input.studentFeeId] })
    const fee = await tx.studentFee.findFirst({
      where: { id: input.studentFeeId, organizationId: ctx.organization.id },
      select: { id: true, title: true, studentId: true, amount: true, discountAmount: true, paidAmount: true, cancelledAt: true },
    })
    if (!fee) throw new ValidationError({ studentFeeId: ["Choose a valid fee."] })
    if (fee.cancelledAt) throw new ConflictError("This fee is cancelled.")
    const amount = input.amount ?? Math.round((toPaisa(fee.amount) * input.percent!) / 100)
    const room = toPaisa(fee.amount) - toPaisa(fee.discountAmount) - toPaisa(fee.paidAmount)
    if (amount <= 0) throw new ValidationError({ amount: ["The concession must be more than zero."] })
    if (amount > room) throw new ValidationError({ amount: [`At most the fee's unpaid balance, Rs. ${(room / 100).toFixed(2)}.`] })
    const c = await tx.feeConcession.create({
      data: {
        organizationId: ctx.organization.id, studentFeeId: fee.id, studentId: fee.studentId, kind: input.kind,
        scholarshipCategory: input.kind === "SCHOLARSHIP" ? input.scholarshipCategory : null, title: input.title, amount: toDecimal(amount), reason: input.reason, approvedById: ctx.user.id,
      },
      select: { id: true },
    })
    await recomputeFees(tx, ctx.organization.id, [fee.id])
    await audit(tx, ctx, { action: "finance.concession.create", entityType: "student", entityId: fee.studentId, summary: `${input.kind === "SCHOLARSHIP" ? "Scholarship" : input.kind === "WAIVER" ? "Waiver" : "Discount"} “${input.title}” of Rs. ${(amount / 100).toFixed(2)} on “${fee.title}”`, metadata: { concessionId: c.id } })
    return c
  })
}

export async function revokeConcession(ctx: Ctx, concessionId: string, raw: unknown) {
  requireFinance(ctx, "finance.adjust")
  const { reason } = revokeSchema.parse(raw)
  await prisma.$transaction(async (tx) => {
    const c = await tx.feeConcession.findFirst({ where: { id: concessionId, organizationId: ctx.organization.id }, select: { id: true, title: true, studentId: true, studentFeeId: true, revokedAt: true } })
    if (!c) throw new NotFoundError("Concession not found.")
    if (c.revokedAt) throw new ConflictError("This concession is already revoked.")
    await lockFees(tx, ctx.organization.id, { ids: [c.studentFeeId] })
    await tx.feeConcession.update({ where: { id: concessionId }, data: { revokedAt: new Date(), revokedById: ctx.user.id, revokeReason: reason } })
    await recomputeFees(tx, ctx.organization.id, [c.studentFeeId])
    await audit(tx, ctx, { action: "finance.concession.revoke", entityType: "student", entityId: c.studentId, summary: `Revoked “${c.title}”: ${reason}`, metadata: { concessionId } })
  })
}
