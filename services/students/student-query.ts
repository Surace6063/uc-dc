import "server-only"

import type { StudentFilters } from "@/features/students/filters"
import type { AuthContext } from "@/lib/authorization/context"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

// Permissions are optional: without them, permission-gated filters are ignored.
type Ctx = Pick<AuthContext, "organization"> & Partial<Pick<AuthContext, "permissions">>

// The academic year a list is scoped to: an explicit year, every year, or
// (by default) the organisation's current year.
export async function resolveYearScope(ctx: Ctx, year: StudentFilters["year"]) {
  if (year === "all") return null
  if (year) {
    // Only accept a year from this organisation; anything else is ignored.
    const owned = await prisma.academicYear.findFirst({
      where: { id: year, organizationId: ctx.organization.id },
      select: { id: true },
    })
    return owned?.id ?? null
  }
  const current = await prisma.academicYear.findFirst({
    where: { organizationId: ctx.organization.id, isCurrent: true },
    select: { id: true },
  })
  return current?.id ?? null
}

function yearsAgo(years: number) {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - years)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

// Conditions on the enrollment that "places" a student in the list. All
// academic filters go into one `some` so they must match the same enrollment.
export function enrollmentWhere(
  ctx: Ctx,
  filters: StudentFilters,
  yearId: string | null
): Prisma.EnrollmentWhereInput | null {
  const where: Prisma.EnrollmentWhereInput = { organizationId: ctx.organization.id }
  let scoped = false
  const set = <K extends keyof Prisma.EnrollmentWhereInput>(key: K, value: Prisma.EnrollmentWhereInput[K]) => {
    where[key] = value
    scoped = true
  }
  if (yearId) set("academicYearId", yearId)
  if (filters.level) set("educationLevelId", filters.level)
  if (filters.program) set("programId", filters.program)
  if (filters.faculty) set("program", { facultyId: filters.faculty })
  if (filters.class) set("classId", filters.class)
  if (filters.section) set("sectionId", filters.section)
  if (filters.batch) set("batchId", filters.batch)
  if (filters.enrollmentStatus.length) set("status", { in: filters.enrollmentStatus })
  if (filters.enrollmentType) set("enrollmentType", filters.enrollmentType)
  return scoped ? where : null
}

// Students missing a guardian with any phone number.
const missingGuardianContact: Prisma.StudentWhereInput = {
  guardians: { none: { guardian: { phone: { not: null } } } },
}

// "Incomplete record": no date of birth, no permanent address, or no
// guardian contact. Kept deliberately small and explainable.
export const incompleteWhere: Prisma.StudentWhereInput = {
  OR: [
    { dateOfBirth: null },
    { addresses: { none: { type: "PERMANENT", district: { not: null } } } },
    missingGuardianContact,
  ],
}

async function documentsWhere(
  ctx: Ctx,
  mode: "complete" | "missing"
): Promise<Prisma.StudentWhereInput> {
  // Required, active document types (a handful per organisation).
  const requirements = await prisma.documentRequirement.findMany({
    where: { organizationId: ctx.organization.id, audience: "STUDENT", isRequired: true, isActive: true },
    select: { id: true, educationLevelId: true },
  })
  if (requirements.length === 0) return mode === "complete" ? {} : { id: { in: [] } }

  // A requirement is satisfied if a document of that type exists, or if it
  // is level-specific and the student has no open placement in that level.
  const satisfied: Prisma.StudentWhereInput[] = requirements.map((r) => {
    const hasDocument: Prisma.StudentWhereInput = { documents: { some: { requirementId: r.id } } }
    if (!r.educationLevelId) return hasDocument
    return {
      OR: [
        hasDocument,
        {
          enrollments: {
            none: { educationLevelId: r.educationLevelId, status: { in: ["ACTIVE", "ON_HOLD"] } },
          },
        },
      ],
    }
  })
  return mode === "complete" ? { AND: satisfied } : { NOT: { AND: satisfied } }
}

export async function buildStudentWhere(
  ctx: Ctx,
  filters: StudentFilters,
  yearId: string | null,
  options: { ids?: string[] } = {}
): Promise<Prisma.StudentWhereInput> {
  const and: Prisma.StudentWhereInput[] = [{ organizationId: ctx.organization.id }]

  if (options.ids) and.push({ id: { in: options.ids } })

  if (filters.view === "current") and.push({ archivedAt: null })
  if (filters.view === "archived") and.push({ archivedAt: { not: null } })

  const placement = enrollmentWhere(ctx, filters, yearId)
  if (placement) and.push({ enrollments: { some: placement } })

  if (filters.q) {
    // Every word must match somewhere: "aarav shrestha" finds first + last name.
    for (const term of filters.q.split(/\s+/).filter(Boolean).slice(0, 5)) {
      const contains = { contains: term, mode: "insensitive" as const }
      and.push({
        OR: [
          { firstName: contains },
          { middleName: contains },
          { lastName: contains },
          { admissionNumber: contains },
          { email: contains },
          { phone: { contains: term } },
          {
            guardians: {
              some: { guardian: { OR: [{ fullName: contains }, { phone: { contains: term } }] } },
            },
          },
        ],
      })
    }
  }

  if (filters.status.length) and.push({ status: { in: filters.status } })
  if (filters.gender) and.push({ gender: filters.gender })
  if (filters.admissionType) and.push({ admissionType: filters.admissionType })
  if (filters.admittedFrom) and.push({ admissionDate: { gte: new Date(filters.admittedFrom) } })
  if (filters.admittedTo) and.push({ admissionDate: { lte: new Date(filters.admittedTo) } })
  // Age N means born between N+1 years ago (exclusive) and N years ago.
  if (filters.ageMin !== undefined) and.push({ dateOfBirth: { lte: yearsAgo(filters.ageMin) } })
  if (filters.ageMax !== undefined) and.push({ dateOfBirth: { gt: yearsAgo(filters.ageMax + 1) } })
  if (filters.nationality) {
    and.push({ nationality: { equals: filters.nationality, mode: "insensitive" } })
  }

  if (filters.province || filters.district || filters.municipality) {
    and.push({
      addresses: {
        some: {
          type: "PERMANENT",
          ...(filters.province && { province: filters.province }),
          ...(filters.district && { district: { equals: filters.district, mode: "insensitive" } }),
          ...(filters.municipality && {
            municipality: { contains: filters.municipality, mode: "insensitive" },
          }),
        },
      },
    })
  }

  // Restricted detail: filtering by it would reveal it, so it needs the same permission.
  if (filters.bloodGroup && ctx.permissions?.includes("students.sensitive.view")) {
    and.push({ bloodGroup: filters.bloodGroup })
  }
  if (filters.createdFrom) and.push({ createdAt: { gte: new Date(filters.createdFrom) } })
  // Inclusive of the whole "to" day.
  if (filters.createdTo) and.push({ createdAt: { lt: new Date(new Date(filters.createdTo).getTime() + 864e5) } })

  if (filters.guardianContact === "has") and.push({ NOT: missingGuardianContact })
  if (filters.guardianContact === "missing") and.push(missingGuardianContact)
  if (filters.email === "has") and.push({ email: { not: null } })
  if (filters.email === "missing") and.push({ email: null })
  if (filters.photo === "has") and.push({ profileImagePath: { not: null } })
  if (filters.photo === "missing") and.push({ profileImagePath: null })
  if (filters.documents) and.push(await documentsWhere(ctx, filters.documents))
  if (filters.incomplete) and.push(incompleteWhere)

  return { AND: and }
}

export function studentOrderBy(filters: StudentFilters): Prisma.StudentOrderByWithRelationInput[] {
  const dir = filters.dir
  const primary: Prisma.StudentOrderByWithRelationInput[] =
    filters.sort === "name"
      ? [{ firstName: dir }, { lastName: dir }]
      : filters.sort === "admissionNumber"
        ? [{ admissionNumber: dir }]
        : filters.sort === "admissionDate"
          ? [{ admissionDate: dir }]
          : filters.sort === "gender"
            ? [{ gender: { sort: dir, nulls: "last" } }]
            : [{ createdAt: dir }]
  // A unique tiebreaker keeps pagination stable.
  return [...primary, { id: "asc" }]
}

// What one table row needs, and nothing sensitive.
export function studentRowSelect(placement: Prisma.EnrollmentWhereInput | null) {
  return {
    id: true,
    admissionNumber: true,
    firstName: true,
    middleName: true,
    lastName: true,
    email: true,
    phone: true,
    gender: true,
    dateOfBirth: true,
    nationality: true,
    status: true,
    admissionDate: true,
    admissionType: true,
    profileImagePath: true,
    archivedAt: true,
    enrollments: {
      // The placement that matched the filters (or the latest one).
      where: placement ?? undefined,
      orderBy: [{ enrollmentDate: "desc" }, { createdAt: "desc" }],
      take: 1,
      select: {
        id: true,
        status: true,
        rollNumber: true,
        enrollmentType: true,
        academicYear: { select: { id: true, name: true } },
        educationLevel: { select: { id: true, name: true } },
        program: { select: { id: true, name: true, code: true } },
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        batch: { select: { id: true, name: true } },
      },
    },
    guardians: {
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      take: 1,
      select: { relationship: true, guardian: { select: { fullName: true, phone: true } } },
    },
  } satisfies Prisma.StudentSelect
}

export async function listStudents(ctx: Ctx, filters: StudentFilters) {
  const yearId = await resolveYearScope(ctx, filters.year)
  const where = await buildStudentWhere(ctx, filters, yearId)
  const placement = enrollmentWhere(ctx, filters, yearId)

  // Count and page come from the same `where`, so they always agree.
  const [total, rows] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: studentOrderBy(filters),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: studentRowSelect(placement),
    }),
  ])
  return { total, rows, yearId }
}

export type StudentListRow = Awaited<ReturnType<typeof listStudents>>["rows"][number]

// Summary cards. Each counts students (not enrollments), so a student with
// several placements is counted once.
export async function getStudentStats(ctx: Ctx, yearId: string | null) {
  const organizationId = ctx.organization.id
  const inYear: Prisma.StudentWhereInput = yearId
    ? { enrollments: { some: { organizationId, academicYearId: yearId } } }
    : {}
  const base: Prisma.StudentWhereInput = { organizationId, ...inYear }
  const current: Prisma.StudentWhereInput = { ...base, archivedAt: null }

  const [total, active, male, female, newAdmissions, incomplete, archived, byLevel, levels] = await Promise.all([
    prisma.student.count({ where: current }),
    prisma.student.count({ where: { ...current, status: "ACTIVE" } }),
    prisma.student.count({ where: { ...current, gender: "MALE" } }),
    prisma.student.count({ where: { ...current, gender: "FEMALE" } }),
    prisma.student.count({
      where: yearId
        ? {
            organizationId,
            archivedAt: null,
            enrollments: {
              some: { organizationId, academicYearId: yearId, enrollmentType: "NEW_ADMISSION" },
            },
          }
        : { ...current, admissionDate: { gte: yearsAgo(1) } },
    }),
    prisma.student.count({ where: { AND: [current, incompleteWhere] } }),
    prisma.student.count({ where: { ...base, archivedAt: { not: null } } }),
    // At most one ACTIVE placement per student per year (unique index), so
    // counting active placements in a year counts distinct students.
    yearId
      ? prisma.enrollment.groupBy({
          by: ["educationLevelId"],
          where: { organizationId, academicYearId: yearId, status: "ACTIVE", student: { archivedAt: null } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.educationLevel.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ])

  const levelCounts = new Map(byLevel.map((row) => [row.educationLevelId, row._count._all]))
  return {
    total,
    active,
    male,
    female,
    newAdmissions,
    newAdmissionsInYear: Boolean(yearId),
    incomplete,
    archived,
    byLevel: levels
      .filter((level) => levelCounts.has(level.id))
      .map((level) => ({ id: level.id, name: level.name, count: levelCounts.get(level.id)! })),
  }
}
