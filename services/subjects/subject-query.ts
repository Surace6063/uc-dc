import "server-only"

import type { SubjectFilters } from "@/features/subjects/filters"
import type { AuthContext } from "@/lib/authorization/context"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

// Server-side filtering, sorting and pagination of the subjects list, with
// per-subject offering and teacher counts for one academic year.
type Ctx = Pick<AuthContext, "organization">

const insensitive = (q: string) => ({ contains: q, mode: "insensitive" as const })

function statusWhere(status: SubjectFilters["status"]): Prisma.SubjectWhereInput {
  switch (status) {
    case "active":
      return { archivedAt: null, isActive: true }
    case "inactive":
      return { archivedAt: null, isActive: false }
    case "archived":
      return { archivedAt: { not: null } }
    case "all":
      return {}
    default:
      return { archivedAt: null }
  }
}

export function buildSubjectWhere(ctx: Ctx, filters: SubjectFilters, yearId: string | null): Prisma.SubjectWhereInput {
  const and: Prisma.SubjectWhereInput[] = [{ organizationId: ctx.organization.id }, statusWhere(filters.status)]
  if (filters.level) and.push({ educationLevelId: filters.level })
  if (filters.program) and.push({ programId: filters.program })
  if (filters.category) and.push({ categoryId: filters.category })
  if (filters.requirement) and.push({ requirement: filters.requirement })
  if (filters.q) {
    and.push({ OR: [{ name: insensitive(filters.q) }, { code: insensitive(filters.q) }, { localName: insensitive(filters.q) }] })
  }
  if (filters.offered && yearId) {
    const offered = { some: { academicYearId: yearId, status: "ACTIVE" as const } }
    and.push(filters.offered === "yes" ? { offerings: offered } : { offerings: { none: { academicYearId: yearId, status: "ACTIVE" } } })
  }
  return { AND: and }
}

const ORDER: Record<SubjectFilters["sort"], (dir: "asc" | "desc") => Prisma.SubjectOrderByWithRelationInput[]> = {
  name: (dir) => [{ name: dir }],
  code: (dir) => [{ code: dir }],
  credits: (dir) => [{ creditHours: { sort: dir, nulls: "last" } }, { name: "asc" }],
  updatedAt: (dir) => [{ updatedAt: dir }],
}

export async function listSubjects(ctx: Ctx, filters: SubjectFilters, yearId: string | null) {
  const organizationId = ctx.organization.id
  const where = buildSubjectWhere(ctx, filters, yearId)
  const [total, rows] = await Promise.all([
    prisma.subject.count({ where }),
    prisma.subject.findMany({
      where,
      orderBy: ORDER[filters.sort](filters.dir),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true, name: true, localName: true, code: true, requirement: true, creditHours: true, weeklyPeriods: true,
        theoryHours: true, practicalHours: true, isActive: true, archivedAt: true, updatedAt: true,
        category: { select: { name: true } },
        educationLevel: { select: { name: true } },
        program: { select: { code: true } },
      },
    }),
  ])
  const ids = rows.map((r) => r.id)
  const [offerings, teachers] = yearId
    ? await Promise.all([
        prisma.subjectOffering.groupBy({
          by: ["subjectId"],
          where: { organizationId, subjectId: { in: ids }, academicYearId: yearId, status: "ACTIVE" },
          _count: { _all: true },
        }),
        prisma.teacherAssignment.findMany({
          where: { organizationId, subjectId: { in: ids }, academicYearId: yearId, status: "ACTIVE" },
          distinct: ["subjectId", "teacherId"],
          select: { subjectId: true },
        }),
      ])
    : [[], []]
  return {
    total,
    rows: rows.map((r) => ({
      ...r,
      offerings: offerings.find((o) => o.subjectId === r.id)?._count._all ?? 0,
      teachers: teachers.filter((t) => t.subjectId === r.id).length,
    })),
  }
}

export type SubjectListRow = Awaited<ReturnType<typeof listSubjects>>["rows"][number]

export async function getSubjectStats(ctx: Ctx, yearId: string | null) {
  const organizationId = ctx.organization.id
  const [total, active, archived, offered, offerings, withoutTeacher] = await Promise.all([
    prisma.subject.count({ where: { organizationId, archivedAt: null } }),
    prisma.subject.count({ where: { organizationId, archivedAt: null, isActive: true } }),
    prisma.subject.count({ where: { organizationId, archivedAt: { not: null } } }),
    yearId
      ? prisma.subject.count({ where: { organizationId, offerings: { some: { academicYearId: yearId, status: "ACTIVE" } } } })
      : Promise.resolve(0),
    yearId
      ? prisma.subjectOffering.count({ where: { organizationId, academicYearId: yearId, status: "ACTIVE" } })
      : Promise.resolve(0),
    // Offerings of the year with no active teacher at all (any section).
    yearId
      ? prisma.$queryRaw<{ count: number }[]>`
          SELECT count(*)::int AS count
          FROM subject_offerings o
          WHERE o.organization_id = ${organizationId}::uuid
            AND o.academic_year_id = ${yearId}::uuid
            AND o.status = 'ACTIVE'
            AND NOT EXISTS (
              SELECT 1 FROM teacher_assignments a
              WHERE a.organization_id = o.organization_id
                AND a.academic_year_id = o.academic_year_id
                AND a.class_id = o.class_id
                AND a.subject_id = o.subject_id
                AND a.status = 'ACTIVE'
            )`.then((r) => r[0]?.count ?? 0)
      : Promise.resolve(0),
  ])
  return { total, active, archived, offered, offerings, withoutTeacher }
}

export type SubjectStats = Awaited<ReturnType<typeof getSubjectStats>>
