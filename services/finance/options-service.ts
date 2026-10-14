import "server-only"

import { prisma } from "@/lib/prisma"
import { requireFinance, type Ctx } from "@/services/finance/access"

// Choices for finance forms and filters.
export async function financeOptions(ctx: Ctx) {
  requireFinance(ctx, "staff")
  const organizationId = ctx.organization.id
  const [years, levels, programs, classes, categories] = await Promise.all([
    prisma.academicYear.findMany({ where: { organizationId, status: { not: "ARCHIVED" } }, orderBy: { startDate: "desc" }, select: { id: true, name: true, isCurrent: true } }),
    prisma.educationLevel.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.program.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, educationLevelId: true } }),
    prisma.academicClass.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sequence: "asc" }, { name: "asc" }], select: { id: true, name: true, educationLevelId: true, programId: true } }),
    prisma.financeCategory.findMany({ where: { organizationId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true } }),
  ])
  return {
    years,
    currentYearId: years.find((y) => y.isCurrent)?.id ?? null,
    levels,
    programs,
    classes,
    feeCategories: categories.filter((c) => c.kind === "FEE"),
    incomeCategories: categories.filter((c) => c.kind === "INCOME"),
    expenseCategories: categories.filter((c) => c.kind === "EXPENSE"),
  }
}

export type FinanceOptions = Awaited<ReturnType<typeof financeOptions>>
