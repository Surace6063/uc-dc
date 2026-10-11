import "server-only"

import { CONTRACT_ALERT_DAYS } from "@/features/staff/constants"
import type { StaffFilters } from "@/features/staff/filters"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { toDate } from "@/lib/validation"
import { staffListScope } from "@/services/staff/staff-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10)

// Still employed: the statuses that can be "on probation" or have a running contract.
const EMPLOYED: Prisma.StaffWhereInput = { employmentStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }

// Contracts ending between today and the alert window, for staff still employed.
export function contractExpiringWhere(): Prisma.StaffWhereInput {
  return {
    ...EMPLOYED,
    contractEndDate: { gte: toDate(isoDay()), lte: toDate(isoDay(CONTRACT_ALERT_DAYS)) },
  }
}

const pendingVerification: Prisma.StaffWhereInput = {
  OR: [
    { qualifications: { some: { verificationStatus: "PENDING" } } },
    { documents: { some: { verificationStatus: "PENDING" } } },
  ],
}

// "Incomplete profile": no phone, no email, no qualification or no department.
export const incompleteStaffWhere: Prisma.StaffWhereInput = {
  OR: [{ phone: null }, { email: null }, { qualifications: { none: {} } }, { departmentId: null }],
}

async function documentsWhere(ctx: Ctx, mode: "complete" | "missing"): Promise<Prisma.StaffWhereInput> {
  const requirements = await prisma.documentRequirement.findMany({
    where: { organizationId: ctx.organization.id, audience: "STAFF", isRequired: true, isActive: true },
    select: { id: true },
  })
  if (requirements.length === 0) return mode === "complete" ? {} : { id: { in: [] } }
  const all: Prisma.StaffWhereInput[] = requirements.map((r) => ({ documents: { some: { requirementId: r.id } } }))
  return mode === "complete" ? { AND: all } : { NOT: { AND: all } }
}

// The one place list filters become a query. Listing, counts and exports all
// call this, so they always agree. Organisation and the viewer's scope
// (everyone, or their own department) are applied first; filters on
// restricted fields are ignored for roles that can't see those fields.
export async function buildStaffWhere(
  ctx: Ctx,
  filters: StaffFilters,
  options: { ids?: string[]; scope?: Prisma.StaffWhereInput | null } = {}
): Promise<Prisma.StaffWhereInput> {
  const scope = options.scope !== undefined ? options.scope : await staffListScope(ctx)
  // No scope at all: match nothing.
  if (scope === null) return { id: { in: [] } }
  const and: Prisma.StaffWhereInput[] = [{ organizationId: ctx.organization.id }, scope]
  const employment = hasPermission(ctx, "staff.employment.view")
  const sensitive = hasPermission(ctx, "staff.sensitive.view")

  if (options.ids) and.push({ id: { in: options.ids } })
  if (filters.view === "current") and.push({ archivedAt: null })
  if (filters.view === "archived") and.push({ archivedAt: { not: null } })

  if (filters.q) {
    // Every word must match somewhere: "sita thapa" finds first + last name.
    for (const term of filters.q.split(/\s+/).filter(Boolean).slice(0, 5)) {
      const contains = { contains: term, mode: "insensitive" as const }
      and.push({
        OR: [
          { firstName: contains },
          { middleName: contains },
          { lastName: contains },
          { nameNepali: contains },
          { employeeId: contains },
          { email: contains },
          { phone: { contains: term } },
          { designation: { name: contains } },
          { department: { OR: [{ name: contains }, { code: contains }] } },
        ],
      })
    }
  }

  if (filters.status.length) and.push({ employmentStatus: { in: filters.status } })
  if (filters.type.length) and.push({ employmentType: { in: filters.type } })
  if (filters.department) and.push({ departmentId: filters.department })
  if (filters.designation) and.push({ designationId: filters.designation })
  if (filters.category) and.push({ designation: { category: filters.category } })
  if (filters.joinedFrom) and.push({ dateOfJoining: { gte: toDate(filters.joinedFrom) } })
  if (filters.joinedTo) and.push({ dateOfJoining: { lte: toDate(filters.joinedTo) } })
  if (employment) {
    if (filters.contractEndFrom) and.push({ contractEndDate: { gte: toDate(filters.contractEndFrom) } })
    if (filters.contractEndTo) and.push({ contractEndDate: { lte: toDate(filters.contractEndTo) } })
    if (filters.contractExpiring) and.push(contractExpiringWhere())
    if (filters.probation === "yes") and.push({ ...EMPLOYED, onProbation: true })
    if (filters.probation === "no") and.push({ onProbation: false })
    if (filters.manager) and.push({ reportingToId: filters.manager })
  }

  if (filters.qualLevel || filters.specialization || filters.qualVerification) {
    and.push({
      qualifications: {
        some: {
          ...(filters.qualLevel && { level: filters.qualLevel }),
          ...(filters.qualVerification && { verificationStatus: filters.qualVerification }),
          ...(filters.specialization && {
            OR: [
              { specialization: { contains: filters.specialization, mode: "insensitive" } },
              { title: { contains: filters.specialization, mode: "insensitive" } },
            ],
          }),
        },
      },
    })
  }
  const certification: Prisma.StaffQualificationWhereInput = { kind: { in: ["CERTIFICATION", "TRAINING"] } }
  if (filters.certification === "has") and.push({ qualifications: { some: certification } })
  if (filters.certification === "missing") and.push({ qualifications: { none: certification } })

  if (filters.phone === "has") and.push({ phone: { not: null } })
  if (filters.phone === "missing") and.push({ phone: null })
  if (filters.email === "has") and.push({ email: { not: null } })
  if (filters.email === "missing") and.push({ email: null })
  if (filters.qualifications === "has") and.push({ qualifications: { some: {} } })
  if (filters.qualifications === "missing") and.push({ qualifications: { none: {} } })
  if (filters.documents) and.push(await documentsWhere(ctx, filters.documents))
  if (filters.pendingVerification) and.push(pendingVerification)
  if (filters.incomplete) and.push(incompleteStaffWhere)

  if (sensitive && (filters.province || filters.district || filters.municipality)) {
    and.push({
      addresses: {
        some: {
          type: "PERMANENT",
          ...(filters.province && { province: filters.province }),
          ...(filters.district && { district: { equals: filters.district, mode: "insensitive" } }),
          ...(filters.municipality && { municipality: { contains: filters.municipality, mode: "insensitive" } }),
        },
      },
    })
  }
  if (filters.account === "yes") and.push({ userId: { not: null } })
  if (filters.account === "no") and.push({ userId: null })
  if (filters.responsibilities === "yes") and.push({ assignments: { some: { status: "ACTIVE" } } })
  if (filters.responsibilities === "no") and.push({ assignments: { none: { status: "ACTIVE" } } })

  return { AND: and }
}

export function staffOrderBy(filters: StaffFilters, canSeeContracts: boolean): Prisma.StaffOrderByWithRelationInput[] {
  const dir = filters.dir
  const primary: Prisma.StaffOrderByWithRelationInput[] =
    filters.sort === "name"
      ? [{ firstName: dir }, { lastName: dir }]
      : filters.sort === "employeeId"
        ? [{ employeeId: dir }]
        : filters.sort === "dateOfJoining"
          ? [{ dateOfJoining: dir }]
          : filters.sort === "contractEndDate" && canSeeContracts
            ? [{ contractEndDate: { sort: dir, nulls: "last" } }]
            : filters.sort === "designation"
              ? [{ designation: { name: dir } }]
              : filters.sort === "department"
                ? [{ department: { name: dir } }]
                : filters.sort === "createdAt"
                  ? [{ createdAt: dir }]
                  : [{ firstName: dir }, { lastName: dir }]
  // A unique tiebreaker keeps pagination stable.
  return [...primary, { id: "asc" }]
}

// One table row: basic fields; the contract end date only for roles with
// employment access. Never salary, identifiers, notes or documents.
export function staffRowSelect(canSeeContracts: boolean) {
  return {
    id: true,
    employeeId: true,
    firstName: true,
    middleName: true,
    lastName: true,
    nameNepali: true,
    email: true,
    phone: true,
    gender: true,
    dateOfJoining: true,
    employmentType: true,
    employmentStatus: true,
    contractEndDate: canSeeContracts,
    onProbation: canSeeContracts,
    profileImagePath: true,
    archivedAt: true,
    userId: true,
    designation: { select: { name: true, category: true } },
    department: { select: { name: true } },
    _count: { select: { assignments: { where: { status: "ACTIVE" } } } },
  } satisfies Prisma.StaffSelect
}

export async function listStaff(ctx: Ctx, filters: StaffFilters) {
  const canSeeContracts = hasPermission(ctx, "staff.employment.view")
  const where = await buildStaffWhere(ctx, filters)
  // Count and page come from the same `where`, so they always agree.
  const [total, rows] = await Promise.all([
    prisma.staff.count({ where }),
    prisma.staff.findMany({
      where,
      orderBy: staffOrderBy(filters, canSeeContracts),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: staffRowSelect(canSeeContracts),
    }),
  ])
  return {
    total,
    rows: rows.map((r) => ({
      ...r,
      contractEndDate: (r.contractEndDate as Date | null | undefined) ?? null,
      onProbation: (r.onProbation as boolean | undefined) ?? false,
    })),
  }
}

export type StaffListRow = Awaited<ReturnType<typeof listStaff>>["rows"][number]

// Summary cards. Each counts staff profiles (never assignments), within the
// viewer's scope.
export async function getStaffStats(ctx: Ctx) {
  const scope = await staffListScope(ctx)
  const empty = { total: 0, active: 0, onLeave: 0, newHires: 0, expiring: 0, probation: 0, incomplete: 0, pending: 0, byDepartment: [] }
  if (scope === null) return { ...empty, newHiresFrom: isoDay(-90), contractsVisible: false }
  const organizationId = ctx.organization.id
  const current: Prisma.StaffWhereInput = { organizationId, archivedAt: null, ...scope }
  const contractsVisible = hasPermission(ctx, "staff.employment.view")
  // New hires: joined in the last 90 days.
  const newHiresFrom = isoDay(-90)

  const [total, active, onLeave, newHires, expiring, probation, incomplete, pending, byDepartment, departments] = await Promise.all([
    prisma.staff.count({ where: current }),
    prisma.staff.count({ where: { ...current, employmentStatus: "ACTIVE" } }),
    prisma.staff.count({ where: { ...current, employmentStatus: "ON_LEAVE" } }),
    prisma.staff.count({ where: { ...current, dateOfJoining: { gte: toDate(newHiresFrom) } } }),
    contractsVisible ? prisma.staff.count({ where: { AND: [current, contractExpiringWhere()] } }) : Promise.resolve(0),
    contractsVisible ? prisma.staff.count({ where: { ...current, ...EMPLOYED, onProbation: true } }) : Promise.resolve(0),
    prisma.staff.count({ where: { AND: [current, incompleteStaffWhere] } }),
    prisma.staff.count({ where: { AND: [current, pendingVerification] } }),
    prisma.staff.groupBy({
      by: ["departmentId"],
      where: { ...current, employmentStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } },
      _count: { _all: true },
    }),
    prisma.department.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ])
  const counts = new Map(byDepartment.map((row) => [row.departmentId, row._count._all]))
  return {
    total, active, onLeave, newHires, expiring, probation, incomplete, pending, newHiresFrom, contractsVisible,
    byDepartment: departments
      .filter((d) => counts.has(d.id))
      .map((d) => ({ id: d.id, name: d.name, count: counts.get(d.id)! })),
  }
}
