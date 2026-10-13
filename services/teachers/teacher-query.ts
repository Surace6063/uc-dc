import "server-only"

import type { TeacherFilters } from "@/features/teachers/filters"
import type { AuthContext } from "@/lib/authorization/context"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { resolveYearScope } from "@/services/students/student-query"

type Ctx = Pick<AuthContext, "organization">

// Conditions on an active assignment. All academic filters go into one
// `some`, so they must match the same assignment.
export function assignmentWhere(ctx: Ctx, filters: TeacherFilters, yearId: string | null): Prisma.TeacherAssignmentWhereInput {
  return {
    organizationId: ctx.organization.id,
    status: "ACTIVE",
    ...(yearId && { academicYearId: yearId }),
    ...(filters.level && { educationLevelId: filters.level }),
    ...(filters.program && { programId: filters.program }),
    ...(filters.class && { classId: filters.class }),
    ...(filters.section && { sectionId: filters.section }),
    ...(filters.subject && { subjectId: filters.subject }),
    ...(filters.batch && { batchId: filters.batch }),
  }
}

const hasAcademicFilter = (f: TeacherFilters) => Boolean(f.level || f.program || f.class || f.section || f.subject || f.batch)

const pendingVerification: Prisma.TeacherWhereInput = {
  OR: [
    { qualifications: { some: { verificationStatus: "PENDING" } } },
    { certifications: { some: { verificationStatus: "PENDING" } } },
    { documents: { some: { verificationStatus: "PENDING" } } },
  ],
}

// "Incomplete profile": no phone, no email or no qualification recorded.
export const incompleteTeacherWhere: Prisma.TeacherWhereInput = {
  OR: [{ phone: null }, { email: null }, { qualifications: { none: {} } }],
}

async function documentsWhere(ctx: Ctx, mode: "complete" | "missing"): Promise<Prisma.TeacherWhereInput> {
  const requirements = await prisma.documentRequirement.findMany({
    where: { organizationId: ctx.organization.id, audience: "TEACHER", isRequired: true, isActive: true },
    select: { id: true },
  })
  if (requirements.length === 0) return mode === "complete" ? {} : { id: { in: [] } }
  const all: Prisma.TeacherWhereInput[] = requirements.map((r) => ({ documents: { some: { requirementId: r.id } } }))
  return mode === "complete" ? { AND: all } : { NOT: { AND: all } }
}

export async function buildTeacherWhere(
  ctx: Ctx,
  filters: TeacherFilters,
  yearId: string | null,
  options: { ids?: string[] } = {}
): Promise<Prisma.TeacherWhereInput> {
  const and: Prisma.TeacherWhereInput[] = [{ organizationId: ctx.organization.id }]
  if (options.ids) and.push({ id: { in: options.ids } })
  if (filters.view === "current") and.push({ archivedAt: null })
  if (filters.view === "archived") and.push({ archivedAt: { not: null } })

  if (filters.q) {
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
          { department: { name: contains } },
        ],
      })
    }
  }

  if (filters.status.length) and.push({ employmentStatus: { in: filters.status } })
  if (filters.type.length) and.push({ employmentType: { in: filters.type } })
  if (filters.designation) and.push({ designationId: filters.designation })
  if (filters.rank) and.push({ academicRank: filters.rank === "unrecorded" ? null : filters.rank })
  if (filters.otherJob) and.push({ fullTimeElsewhere: filters.otherJob === "unrecorded" ? null : filters.otherJob === "yes" })
  if (filters.department) and.push({ departmentId: filters.department })
  if (filters.joinedFrom) and.push({ dateOfJoining: { gte: new Date(filters.joinedFrom) } })
  if (filters.joinedTo) and.push({ dateOfJoining: { lte: new Date(filters.joinedTo) } })
  if (filters.contractEndFrom) and.push({ contractEndDate: { gte: new Date(filters.contractEndFrom) } })
  if (filters.contractEndTo) and.push({ contractEndDate: { lte: new Date(filters.contractEndTo) } })

  const active = assignmentWhere(ctx, filters, yearId)
  if (hasAcademicFilter(filters) || filters.assigned === "yes") and.push({ assignments: { some: active } })
  if (filters.assigned === "no") and.push({ assignments: { none: active } })

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
  if (filters.certification === "has") and.push({ certifications: { some: {} } })
  if (filters.certification === "missing") and.push({ certifications: { none: {} } })
  if (filters.phone === "has") and.push({ phone: { not: null } })
  if (filters.phone === "missing") and.push({ phone: null })
  if (filters.email === "has") and.push({ email: { not: null } })
  if (filters.email === "missing") and.push({ email: null })
  if (filters.qualifications === "has") and.push({ qualifications: { some: {} } })
  if (filters.qualifications === "missing") and.push({ qualifications: { none: {} } })
  if (filters.documents) and.push(await documentsWhere(ctx, filters.documents))
  if (filters.pendingVerification) and.push(pendingVerification)
  if (filters.incomplete) and.push(incompleteTeacherWhere)

  return { AND: and }
}

export function teacherOrderBy(filters: TeacherFilters): Prisma.TeacherOrderByWithRelationInput[] {
  const dir = filters.dir
  const primary: Prisma.TeacherOrderByWithRelationInput[] =
    filters.sort === "name"
      ? [{ firstName: dir }, { lastName: dir }]
      : filters.sort === "employeeId"
        ? [{ employeeId: dir }]
        : filters.sort === "dateOfJoining"
          ? [{ dateOfJoining: dir }]
          : filters.sort === "designation"
            ? [{ designation: { name: dir } }]
            : filters.sort === "department"
              ? [{ department: { name: dir } }]
              : [{ createdAt: dir }]
  return [...primary, { id: "asc" }]
}

// One table row: basic, non-sensitive fields only.
export function teacherRowSelect(active: Prisma.TeacherAssignmentWhereInput) {
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
    profileImagePath: true,
    archivedAt: true,
    academicRank: true,
    designation: { select: { name: true } },
    department: { select: { name: true } },
    qualifications: {
      select: { level: true, title: true, verificationStatus: true },
    },
    assignments: {
      where: active,
      orderBy: { startDate: "asc" },
      take: 12,
      select: {
        role: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
        program: { select: { code: true } },
        educationLevel: { select: { name: true } },
        subject: { select: { name: true } },
      },
    },
    _count: { select: { assignments: { where: active } } },
  } satisfies Prisma.TeacherSelect
}

export async function listTeachers(ctx: Ctx, filters: TeacherFilters) {
  const yearId = await resolveYearScope(ctx, filters.year)
  const where = await buildTeacherWhere(ctx, filters, yearId)
  // Columns show the assignments in the selected year (all active ones when
  // "all years"), regardless of other academic filters.
  const active = assignmentWhere(ctx, { ...filters, level: undefined, program: undefined, class: undefined, section: undefined, subject: undefined, batch: undefined }, yearId)
  const [total, rows] = await Promise.all([
    prisma.teacher.count({ where }),
    prisma.teacher.findMany({
      where,
      orderBy: teacherOrderBy(filters),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: teacherRowSelect(active),
    }),
  ])
  return { total, rows, yearId }
}

export type TeacherListRow = Awaited<ReturnType<typeof listTeachers>>["rows"][number]

// Summary cards: counts of teachers (never assignments) in this organisation.
export async function getTeacherStats(ctx: Ctx, yearId: string | null) {
  const organizationId = ctx.organization.id
  const current: Prisma.TeacherWhereInput = { organizationId, archivedAt: null }
  const activeAssignment: Prisma.TeacherAssignmentWhereInput = {
    organizationId, status: "ACTIVE", ...(yearId && { academicYearId: yearId }),
  }
  const year = yearId ? await prisma.academicYear.findFirst({ where: { id: yearId, organizationId } }) : null
  // New hires: joined during the selected academic year, else the last 90 days.
  const since = year?.startDate ?? new Date(Date.now() - 90 * 864e5)
  const until = year?.endDate

  const [total, active, newHires, assigned, unassigned, incomplete, pending] = await Promise.all([
    prisma.teacher.count({ where: current }),
    prisma.teacher.count({ where: { ...current, employmentStatus: "ACTIVE" } }),
    prisma.teacher.count({ where: { ...current, dateOfJoining: { gte: since, ...(until && { lte: until }) } } }),
    prisma.teacher.count({ where: { ...current, assignments: { some: activeAssignment } } }),
    prisma.teacher.count({
      where: { ...current, employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] }, assignments: { none: activeAssignment } },
    }),
    prisma.teacher.count({ where: { AND: [current, incompleteTeacherWhere] } }),
    prisma.teacher.count({ where: { AND: [current, pendingVerification] } }),
  ])
  return {
    total, active, newHires, assigned, unassigned, incomplete, pending,
    newHiresRange: { from: since.toISOString().slice(0, 10), to: until?.toISOString().slice(0, 10) ?? null, yearName: year?.name ?? null },
  }
}
