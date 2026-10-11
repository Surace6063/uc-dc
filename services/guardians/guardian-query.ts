import "server-only"

import type { GuardianFilters } from "@/features/guardians/filters"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

// Guardians linked to two or more students. Prisma can't filter on a
// relation count, so this one filter runs a grouped query first.
async function guardiansWithSeveralChildren(organizationId: string) {
  const rows = await prisma.studentGuardian.groupBy({
    by: ["guardianId"],
    where: { organizationId },
    having: { guardianId: { _count: { gt: 1 } } },
  })
  return rows.map((r) => r.guardianId)
}

function invitationWhere(state: NonNullable<GuardianFilters["invitation"]>, now: Date): Prisma.GuardianWhereInput {
  switch (state) {
    case "none":
      return { invitations: { none: {} } }
    case "pending":
      return { invitations: { some: { status: "PENDING", expiresAt: { gt: now } } } }
    case "expired":
      // The most recent invitation lapsed and nothing newer is open or accepted.
      return {
        invitations: { some: { status: "PENDING", expiresAt: { lte: now } } },
        NOT: { invitations: { some: { OR: [{ status: "ACCEPTED" }, { status: "PENDING", expiresAt: { gt: now } }] } } },
      }
    case "accepted":
      return { invitations: { some: { status: "ACCEPTED" } } }
    case "revoked":
      return {
        invitations: { some: { status: "REVOKED" } },
        NOT: { invitations: { some: { status: { in: ["PENDING", "ACCEPTED"] } } } },
      }
  }
}

// The one place list filters become a query. Listing, counts and exports all
// call this, so they always agree. The organisation is always applied first.
export async function buildGuardianWhere(
  ctx: Ctx,
  filters: GuardianFilters,
  options: { ids?: string[] } = {}
): Promise<Prisma.GuardianWhereInput> {
  const organizationId = ctx.organization.id
  const and: Prisma.GuardianWhereInput[] = [{ organizationId }]
  // Filters that reveal which students someone is linked to need students.view.
  const canSeeStudents = hasPermission(ctx, "students.view")

  if (options.ids) and.push({ id: { in: options.ids } })
  if (filters.view === "current") and.push({ archivedAt: null })
  if (filters.view === "archived") and.push({ archivedAt: { not: null } })

  if (filters.q) {
    // Every word must match somewhere: "hari 9841" finds name + phone.
    for (const term of filters.q.split(/\s+/).filter(Boolean).slice(0, 5)) {
      const contains = { contains: term, mode: "insensitive" as const }
      and.push({
        OR: [
          { fullName: contains },
          { guardianCode: contains },
          { email: contains },
          { phone: { contains: term } },
          { alternatePhone: { contains: term } },
          { occupation: contains },
          ...(canSeeStudents
            ? [{ students: { some: { student: { OR: [{ firstName: contains }, { lastName: contains }, { admissionNumber: contains }] } } } }]
            : []),
        ],
      })
    }
  }

  if (filters.relationship) and.push({ students: { some: { relationship: filters.relationship } } })
  if (filters.portal.length) and.push({ portalStatus: { in: filters.portal } })
  if (filters.invitation) and.push(invitationWhere(filters.invitation, new Date()))
  if (filters.primary === "yes") and.push({ students: { some: { isPrimary: true } } })
  if (filters.primary === "no") and.push({ students: { none: { isPrimary: true } } })
  if (filters.email === "has") and.push({ email: { not: null } })
  if (filters.email === "missing") and.push({ email: null })
  if (filters.children === "0") and.push({ students: { none: {} } })
  if (filters.children === "1" || filters.children === "2+") {
    const several = await guardiansWithSeveralChildren(organizationId)
    and.push(filters.children === "2+" ? { id: { in: several } } : { students: { some: {} }, id: { notIn: several } })
  }
  if (filters.student && canSeeStudents) and.push({ students: { some: { studentId: filters.student } } })

  return { AND: and }
}

export function guardianOrderBy(filters: GuardianFilters): Prisma.GuardianOrderByWithRelationInput[] {
  const dir = filters.dir
  const primary: Prisma.GuardianOrderByWithRelationInput[] =
    filters.sort === "guardianCode"
      ? [{ guardianCode: { sort: dir, nulls: "last" } }]
      : filters.sort === "children"
        ? [{ students: { _count: dir } }]
        : filters.sort === "createdAt"
          ? [{ createdAt: dir }]
          : [{ fullName: dir }]
  // A unique tiebreaker keeps pagination stable.
  return [...primary, { id: "asc" }]
}

// One table row. Children's names only for roles that may see students;
// never date of birth, addresses or notes.
function guardianRowSelect(canSeeStudents: boolean) {
  return {
    id: true,
    guardianCode: true,
    fullName: true,
    phone: true,
    email: true,
    occupation: true,
    preferredContactMethod: true,
    portalStatus: true,
    profileImagePath: true,
    archivedAt: true,
    createdAt: true,
    userId: true,
    // take: 0 keeps the row type stable while returning nothing.
    students: {
      orderBy: { createdAt: "asc" as const },
      take: canSeeStudents ? 4 : 0,
      select: {
        relationship: true,
        isPrimary: true,
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
      },
    },
    invitations: {
      orderBy: { createdAt: "desc" as const },
      take: 1,
      select: { status: true, expiresAt: true },
    },
    _count: { select: { students: true } },
  } satisfies Prisma.GuardianSelect
}

export async function listGuardians(ctx: Ctx, filters: GuardianFilters) {
  const canSeeStudents = hasPermission(ctx, "students.view")
  const where = await buildGuardianWhere(ctx, filters)
  // Count and page come from the same `where`, so they always agree.
  const [total, rows] = await Promise.all([
    prisma.guardian.count({ where }),
    prisma.guardian.findMany({
      where,
      orderBy: guardianOrderBy(filters),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: guardianRowSelect(canSeeStudents),
    }),
  ])
  // Primary-contact counts for this page only.
  const primary = await prisma.studentGuardian.groupBy({
    by: ["guardianId"],
    where: { organizationId: ctx.organization.id, guardianId: { in: rows.map((r) => r.id) }, isPrimary: true },
    _count: { _all: true },
  })
  const primaryBy = new Map(primary.map((p) => [p.guardianId, p._count._all]))
  return {
    total,
    rows: rows.map(({ students, invitations, ...r }) => ({
      ...r,
      children: students.map((s) => ({
        id: s.student.id,
        name: `${s.student.firstName} ${s.student.lastName}`,
        admissionNumber: s.student.admissionNumber,
        relationship: s.relationship,
        isPrimary: s.isPrimary,
      })),
      childCount: r._count.students,
      primaryFor: primaryBy.get(r.id) ?? 0,
      latestInvitation: invitations[0] ?? null,
    })),
  }
}

export type GuardianListRow = Awaited<ReturnType<typeof listGuardians>>["rows"][number]

// Summary cards: real, organisation-scoped counts of guardian profiles.
export async function getGuardianStats(ctx: Ctx) {
  const organizationId = ctx.organization.id
  const current: Prisma.GuardianWhereInput = { organizationId, archivedAt: null }
  const [total, active, withPortal, pendingInvitations] = await Promise.all([
    prisma.guardian.count({ where: { organizationId } }),
    prisma.guardian.count({ where: current }),
    prisma.guardian.count({ where: { ...current, portalStatus: "ACTIVE", userId: { not: null } } }),
    prisma.guardianInvitation.count({
      where: { organizationId, status: "PENDING", expiresAt: { gt: new Date() }, guardian: { archivedAt: null } },
    }),
  ])
  return { total, active, withPortal, withoutPortal: active - withPortal, pendingInvitations }
}
