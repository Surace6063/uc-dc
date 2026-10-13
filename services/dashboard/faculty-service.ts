import "server-only"

import { cache } from "react"

import { highestQualifications, rankByGender, studentTeacherRatio as ratioOf } from "@/features/dashboard/calculations"
import type { AuthContext } from "@/lib/authorization/context"
import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { countStudents, ELIGIBLE_TEACHER, facultyKpis, teacherScope } from "@/services/dashboard/kpi-service"
import type { DashboardScope } from "@/features/dashboard/scope"
import { genderKey, studentOverview } from "@/services/dashboard/overview-service"

// Faculty and HR figures. "Eligible teaching faculty" everywhere means
// teachers who are active or on leave and not archived (ELIGIBLE_TEACHER in
// kpi-service); headcount, not full-time equivalents.
type Ctx = Pick<AuthContext, "organization" | "permissions">

// The faculty-profile filters (department, employment type) on top of the
// dashboard's teacher scope. Used by the designation and qualification
// charts only; ratios always use every eligible teacher.
function profileScope(ctx: Ctx, scope: DashboardScope): Prisma.TeacherWhereInput {
  return {
    AND: [
      teacherScope(ctx, scope),
      {
        ...(scope.staff.departmentId && { departmentId: scope.staff.departmentId }),
        ...(scope.staff.employmentType && { employmentType: scope.staff.employmentType }),
      },
    ],
  }
}

// ------------------------------------------------------------ designation

export const facultyByDesignation = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const organizationId = ctx.organization.id
  const rows = await prisma.teacher.groupBy({ by: ["designationId"], where: profileScope(ctx, scope), _count: { _all: true } })
  const designations = await prisma.designation.findMany({
    where: { organizationId, id: { in: rows.map((r) => r.designationId).filter((id): id is string => !!id) } },
    select: { id: true, name: true, sortOrder: true },
  })
  const designationOf = new Map(designations.map((d) => [d.id, d]))
  return rows
    .map((r) => {
      const d = r.designationId ? designationOf.get(r.designationId) : undefined
      return { designation: d?.name ?? "No designation", sortOrder: d?.sortOrder ?? Number.MAX_SAFE_INTEGER, teachers: r._count._all }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || b.teachers - a.teachers)
    .map(({ designation, teachers }) => ({ designation, teachers }))
})

export type FacultyByDesignation = Awaited<ReturnType<typeof facultyByDesignation>>

// ------------------------------------------------------------ academic rank

// Eligible teachers by academic rank and gender; teachers without a rank
// recorded are their own group, never folded into one.
export const facultyByRank = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const rows = await prisma.teacher.groupBy({ by: ["academicRank", "gender"], where: profileScope(ctx, scope), _count: { _all: true } })
  return rankByGender(rows.map((r) => ({ rank: r.academicRank, gender: genderKey(r.gender), count: r._count._all })))
})

export type FacultyByRank = Awaited<ReturnType<typeof facultyByRank>>

// ------------------------------------------------------------ qualification

// Each eligible teacher once, by their highest recorded qualification
// (QUALIFICATION_RANK in the teachers module); teachers with none recorded
// are their own category. `verified` counts teachers whose highest
// qualification has been verified.
export const facultyQualifications = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const where = profileScope(ctx, scope)
  const [teachers, rows] = await Promise.all([
    prisma.teacher.count({ where }),
    prisma.teacherQualification.groupBy({
      by: ["teacherId", "level", "verificationStatus"],
      where: { organizationId: ctx.organization.id, teacher: where },
      _count: { _all: true },
    }),
  ])
  return highestQualifications(teachers, rows)
})

export type FacultyQualifications = Awaited<ReturnType<typeof facultyQualifications>>

// ------------------------------------------------------------ student–teacher ratio

// Unique counted students (kpi-service countStudents) ÷ eligible teaching
// faculty, rounded to one decimal; null when there are no teachers. A
// program's teachers are those with an active assignment to it (or one of
// its classes) this year; one teacher can count towards several programs.
export const studentTeacherRatio = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const [students, faculty] = await Promise.all([studentOverview(ctx, scope), facultyKpis(ctx, scope)])
  const programIds = students.byProgram.map((p) => p.programId).filter((id): id is string => !!id)
  const assignments = programIds.length
    ? await prisma.teacherAssignment.findMany({
        where: {
          organizationId: ctx.organization.id,
          academicYearId: scope.year.id,
          status: "ACTIVE",
          teacher: ELIGIBLE_TEACHER,
          OR: [{ programId: { in: programIds } }, { class: { programId: { in: programIds } } }],
        },
        select: { teacherId: true, programId: true, class: { select: { programId: true } } },
      })
    : []
  const teachersOf = new Map<string, Set<string>>()
  for (const a of assignments) {
    const programId = a.programId ?? a.class?.programId
    if (!programId) continue
    const set = teachersOf.get(programId) ?? new Set<string>()
    set.add(a.teacherId)
    teachersOf.set(programId, set)
  }
  return {
    overall: ratioOf(students.total, faculty.total),
    students: students.total,
    teachers: faculty.total,
    byProgram: students.byProgram
      .filter((p) => p.programId)
      .map((p) => {
        const teachers = teachersOf.get(p.programId!)?.size ?? 0
        return { program: p.program, name: p.name, students: p.total, teachers, ratio: ratioOf(p.total, teachers) }
      }),
  }
})

export type StudentTeacherRatio = Awaited<ReturnType<typeof studentTeacherRatio>>

// Eligible teachers as at a date, from employment history: joined by then,
// not archived, and with an active or on-leave status in their latest
// employment record on or before that date. Teachers without such a record
// (e.g. imported without history) fall back to their current status. With a
// program/class filter, teachers with a (not cancelled) assignment to it in
// that year.
async function eligibleTeachersAsOf(ctx: Ctx, scope: DashboardScope, yearId: string, asOf: Date) {
  const assignment = scope.classId
    ? Prisma.sql`AND (a.class_id = ${scope.classId}::uuid ${scope.classProgramId ? Prisma.sql`OR (a.class_id IS NULL AND a.program_id = ${scope.classProgramId}::uuid)` : Prisma.empty})`
    : scope.programIds
      ? Prisma.sql`AND (a.program_id = ANY(${scope.programIds}::uuid[]) OR c.program_id = ANY(${scope.programIds}::uuid[]))`
      : null
  const rows = await prisma.$queryRaw<{ teachers: number }[]>`
    SELECT count(*)::int AS teachers
    FROM teachers t
    WHERE t.organization_id = ${ctx.organization.id}::uuid
      AND t.archived_at IS NULL
      AND t.date_of_joining <= ${asOf}::date
      AND COALESCE(
        (SELECT r.employment_status::text FROM teacher_employment_records r
          WHERE r.teacher_id = t.id AND r.effective_date <= ${asOf}::date
          ORDER BY r.effective_date DESC, r.created_at DESC LIMIT 1),
        t.employment_status::text
      ) IN ('ACTIVE', 'ON_LEAVE')
      ${
        assignment
          ? Prisma.sql`AND EXISTS (
              SELECT 1 FROM teacher_assignments a LEFT JOIN academic_classes c ON c.id = a.class_id
              WHERE a.teacher_id = t.id AND a.academic_year_id = ${yearId}::uuid AND a.status <> 'CANCELLED' ${assignment})`
          : Prisma.empty
      }`
  return rows[0]?.teachers ?? 0
}

// Ratio per academic year of the trend, each year measured as at its end
// (or today for the year in progress). Years without students are gaps.
export const studentTeacherRatioTrend = cache(async (ctx: Ctx, scope: DashboardScope) => {
  const today = new Date()
  const years = await prisma.academicYear.findMany({
    where: { organizationId: ctx.organization.id, id: { in: scope.trendYears.map((y) => y.id) } },
    select: { id: true, endDate: true },
  })
  const endOf = new Map(years.map((y) => [y.id, y.endDate]))
  const [points, withoutHistory] = await Promise.all([
    Promise.all(
      scope.trendYears.map(async (y) => {
        const end = endOf.get(y.id) ?? today
        const asOf = end < today ? end : today
        const [students, teachers] = await Promise.all([countStudents(ctx, scope, y.id), eligibleTeachersAsOf(ctx, scope, y.id, asOf)])
        return { year: y.name, hasData: students > 0, students: students > 0 ? students : null, teachers: students > 0 ? teachers : null, ratio: students > 0 ? ratioOf(students, teachers) : null }
      })
    ),
    prisma.teacher.count({ where: { organizationId: ctx.organization.id, ...ELIGIBLE_TEACHER, employmentRecords: { none: {} } } }),
  ])
  return { points, teachersWithoutHistory: withoutHistory }
})

export type StudentTeacherRatioTrend = Awaited<ReturnType<typeof studentTeacherRatioTrend>>
