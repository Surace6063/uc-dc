import "server-only"

import type { ClassFilters } from "@/features/classes/filters"
import type { AuthContext } from "@/lib/authorization/context"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

// Server-side filtering, sorting and pagination for the classes and sections
// lists. Every query is scoped to the caller's organisation; filter values
// only ever narrow that scope.
type Ctx = Pick<AuthContext, "organization" | "user">

const insensitive = (q: string) => ({ contains: q, mode: "insensitive" as const })

// Classes and sections the signed-in user teaches (through a linked teacher
// profile) in a year; null when they have no teacher profile.
export async function teachingScope(ctx: Ctx, yearId: string | null) {
  if (!yearId) return { classIds: [], sectionIds: [] }
  const assignments = await prisma.teacherAssignment.findMany({
    where: {
      organizationId: ctx.organization.id,
      academicYearId: yearId,
      status: "ACTIVE",
      classId: { not: null },
      teacher: { userId: ctx.user.id, archivedAt: null },
    },
    select: { classId: true, sectionId: true },
  })
  return {
    classIds: [...new Set(assignments.map((a) => a.classId!))],
    sectionIds: [...new Set(assignments.map((a) => a.sectionId).filter((id): id is string => !!id))],
  }
}

async function runningClassIds(organizationId: string, yearId: string) {
  const rows = await prisma.enrollment.groupBy({
    by: ["classId"],
    where: { organizationId, academicYearId: yearId, status: "ACTIVE", student: { archivedAt: null } },
  })
  return rows.map((r) => r.classId)
}

function statusWhere(status: ClassFilters["status"]) {
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

export async function buildClassWhere(ctx: Ctx, filters: ClassFilters, yearId: string | null) {
  const organizationId = ctx.organization.id
  const and: Prisma.AcademicClassWhereInput[] = [{ organizationId }, statusWhere(filters.status)]
  if (filters.level) and.push({ educationLevelId: filters.level })
  if (filters.program) and.push({ programId: filters.program })
  if (filters.q) {
    and.push({ OR: [{ name: insensitive(filters.q) }, { code: insensitive(filters.q) }, { localName: insensitive(filters.q) }] })
  }
  if (filters.running && yearId) and.push({ id: { in: await runningClassIds(organizationId, yearId) } })
  if (filters.mine) and.push({ id: { in: (await teachingScope(ctx, yearId)).classIds } })
  return { AND: and } satisfies Prisma.AcademicClassWhereInput
}

const CLASS_ORDER: Record<ClassFilters["classSort"], (dir: "asc" | "desc") => Prisma.AcademicClassOrderByWithRelationInput[]> = {
  order: (dir) => [
    { educationLevel: { sortOrder: dir } },
    { program: { sortOrder: dir } },
    { sequence: dir },
    { name: dir },
  ],
  name: (dir) => [{ name: dir }],
  code: (dir) => [{ code: { sort: dir, nulls: "last" } }, { name: "asc" }],
  createdAt: (dir) => [{ createdAt: dir }],
}

// Per-class numbers for one academic year, for the rows on one page.
async function classNumbers(organizationId: string, classIds: string[], yearId: string | null) {
  const [sections, enrolled, teachers] = await Promise.all([
    prisma.section.groupBy({
      by: ["classId"],
      where: { organizationId, classId: { in: classIds }, archivedAt: null },
      _count: { _all: true },
      _sum: { capacity: true },
    }),
    yearId
      ? prisma.enrollment.groupBy({
          by: ["classId"],
          where: {
            organizationId,
            classId: { in: classIds },
            academicYearId: yearId,
            status: "ACTIVE",
            student: { archivedAt: null },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    yearId
      ? prisma.teacherAssignment.findMany({
          where: { organizationId, classId: { in: classIds }, academicYearId: yearId, status: "ACTIVE", role: "CLASS_TEACHER" },
          select: {
            classId: true,
            sectionId: true,
            teacher: { select: { firstName: true, middleName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
  ])
  return {
    sections: new Map(sections.map((s) => [s.classId, { count: s._count._all, capacity: s._sum.capacity }])),
    enrolled: new Map(enrolled.map((e) => [e.classId, e._count._all])),
    teachers,
  }
}

export async function listClasses(ctx: Ctx, filters: ClassFilters, yearId: string | null) {
  const organizationId = ctx.organization.id
  const where = await buildClassWhere(ctx, filters, yearId)
  const [total, rows] = await Promise.all([
    prisma.academicClass.count({ where }),
    prisma.academicClass.findMany({
      where,
      orderBy: CLASS_ORDER[filters.classSort](filters.dir),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true, name: true, localName: true, code: true, kind: true, sequence: true, capacity: true,
        isActive: true, archivedAt: true, createdAt: true,
        educationLevel: { select: { id: true, name: true, code: true } },
        program: { select: { id: true, name: true, code: true } },
      },
    }),
  ])
  const numbers = await classNumbers(organizationId, rows.map((r) => r.id), yearId)
  return {
    total,
    rows: rows.map((r) => {
      const sections = numbers.sections.get(r.id)
      const teachers = numbers.teachers.filter((t) => t.classId === r.id)
      return {
        ...r,
        sectionCount: sections?.count ?? 0,
        // A class capacity wins; otherwise the sum of its section capacities.
        capacity: r.capacity ?? (sections?.capacity || null),
        enrolled: numbers.enrolled.get(r.id) ?? 0,
        // Without sections the class itself has (at most) one class teacher.
        classTeachers: teachers.map((t) => t.teacher),
        classTeacherSlots: Math.max(1, sections?.count ?? 0),
      }
    }),
  }
}

export type ClassListRow = Awaited<ReturnType<typeof listClasses>>["rows"][number]

// ----------------------------------------------------------------- sections

export async function buildSectionWhere(ctx: Ctx, filters: ClassFilters, yearId: string | null) {
  const organizationId = ctx.organization.id
  const classWhere: Prisma.AcademicClassWhereInput = { organizationId }
  if (filters.level) classWhere.educationLevelId = filters.level
  if (filters.program) classWhere.programId = filters.program
  // Sections of archived classes only show when asking for archived/all.
  if (filters.status === "current" || filters.status === "active") classWhere.archivedAt = null

  const and: Prisma.SectionWhereInput[] = [{ organizationId, class: classWhere }, statusWhere(filters.status)]
  if (filters.class) and.push({ classId: filters.class })
  if (filters.q) {
    and.push({ OR: [{ name: insensitive(filters.q) }, { code: insensitive(filters.q) }, { class: { name: insensitive(filters.q) } }] })
  }
  if (filters.mine) {
    const scope = await teachingScope(ctx, yearId)
    and.push({ OR: [{ id: { in: scope.sectionIds } }, { classId: { in: scope.classIds } }] })
  }
  return { AND: and } satisfies Prisma.SectionWhereInput
}

const SECTION_ORDER: Record<ClassFilters["sectionSort"], (dir: "asc" | "desc") => Prisma.SectionOrderByWithRelationInput[]> = {
  class: (dir) => [
    { class: { educationLevel: { sortOrder: dir } } },
    { class: { sequence: dir } },
    { class: { name: dir } },
    { sortOrder: "asc" },
    { name: "asc" },
  ],
  name: (dir) => [{ name: dir }, { class: { sequence: "asc" } }],
  capacity: (dir) => [{ capacity: { sort: dir, nulls: "last" } }, { name: "asc" }],
}

export async function listSections(ctx: Ctx, filters: ClassFilters, yearId: string | null) {
  const organizationId = ctx.organization.id
  const where = await buildSectionWhere(ctx, filters, yearId)
  const [total, rows] = await Promise.all([
    prisma.section.count({ where }),
    prisma.section.findMany({
      where,
      orderBy: SECTION_ORDER[filters.sectionSort](filters.dir),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true, name: true, code: true, capacity: true, shift: true, medium: true, room: true,
        isActive: true, archivedAt: true,
        class: {
          select: {
            id: true, name: true, localName: true, archivedAt: true,
            educationLevel: { select: { name: true } },
            program: { select: { code: true } },
          },
        },
      },
    }),
  ])
  const ids = rows.map((r) => r.id)
  const [counts, teachers] = yearId
    ? await Promise.all([
        prisma.$queryRaw<{ section_id: string; gender: string | null; count: number }[]>`
          SELECT e.section_id, s.gender::text AS gender, count(*)::int AS count
          FROM enrollments e
          JOIN students s ON s.id = e.student_id
          WHERE e.organization_id = ${organizationId}::uuid
            AND e.academic_year_id = ${yearId}::uuid
            AND e.status = 'ACTIVE'
            AND e.section_id = ANY(${ids}::uuid[])
            AND s.archived_at IS NULL
          GROUP BY e.section_id, s.gender`,
        prisma.teacherAssignment.findMany({
          where: { organizationId, sectionId: { in: ids }, academicYearId: yearId, status: "ACTIVE", role: "CLASS_TEACHER" },
          select: { sectionId: true, teacher: { select: { firstName: true, middleName: true, lastName: true } } },
        }),
      ])
    : [[], []]

  return {
    total,
    rows: rows.map((r) => {
      const mine = counts.filter((c) => c.section_id === r.id)
      const sum = (gender?: string) =>
        mine.filter((c) => gender === undefined || c.gender === gender).reduce((n, c) => n + c.count, 0)
      return {
        ...r,
        enrolled: sum(),
        girls: sum("FEMALE"),
        boys: sum("MALE"),
        classTeacher: teachers.find((t) => t.sectionId === r.id)?.teacher ?? null,
      }
    }),
  }
}

export type SectionListRow = Awaited<ReturnType<typeof listSections>>["rows"][number]

// ------------------------------------------------------------------- stats

export async function getClassStats(ctx: Ctx, yearId: string | null) {
  const organizationId = ctx.organization.id
  const [total, active, archived, sections, enrolledRows, running] = await Promise.all([
    prisma.academicClass.count({ where: { organizationId, archivedAt: null } }),
    prisma.academicClass.count({ where: { organizationId, archivedAt: null, isActive: true } }),
    prisma.academicClass.count({ where: { organizationId, archivedAt: { not: null } } }),
    prisma.section.count({ where: { organizationId, archivedAt: null, class: { archivedAt: null } } }),
    yearId
      ? prisma.$queryRaw<{ gender: string | null; count: number }[]>`
          SELECT s.gender::text AS gender, count(*)::int AS count
          FROM enrollments e
          JOIN students s ON s.id = e.student_id
          WHERE e.organization_id = ${organizationId}::uuid
            AND e.academic_year_id = ${yearId}::uuid
            AND e.status = 'ACTIVE'
            AND s.archived_at IS NULL
          GROUP BY s.gender`
      : Promise.resolve([]),
    yearId ? runningClassIds(organizationId, yearId) : Promise.resolve([]),
  ])
  const count = (gender?: string) =>
    enrolledRows.filter((r) => gender === undefined || r.gender === gender).reduce((n, r) => n + r.count, 0)
  return {
    total,
    active,
    archived,
    running: running.length,
    sections,
    enrolled: count(),
    girls: count("FEMALE"),
    boys: count("MALE"),
  }
}

export type ClassStats = Awaited<ReturnType<typeof getClassStats>>
