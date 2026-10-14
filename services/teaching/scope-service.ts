import "server-only"

import { cache } from "react"

import type { TeachingAssignment } from "@/features/attendance/access"
import { teaches, type TeachingTarget } from "@/features/teaching/access"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ForbiddenError, ValidationError } from "@/lib/authorization/errors"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { myAssignments } from "@/services/attendance/access-service"

// Who may see and change teaching-workspace records (lesson plans,
// materials, class assignments, timetable periods, class notices):
//   teachers                their own, for classes and subjects they teach
//                           (active teaching assignments, checked here)
//   academic heads          everyone's, read-only (overseesTeaching)
// The organisation always comes from the session.

export type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma

// The signed-in member's teacher profile in this organisation, if any.
export const myTeacher = cache(async (ctx: Ctx) =>
  prisma.teacher.findFirst({
    where: { organizationId: ctx.organization.id, userId: ctx.user.id, archivedAt: null },
    select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true },
  })
)

// Principals, coordinators and others who oversee teaching see every
// teacher's records (they don't create them: that needs a teacher profile).
export function overseesTeaching(ctx: Pick<AuthContext, "permissions">) {
  return hasPermission(ctx, "academics.manage") || hasPermission(ctx, "teachers.assignments.manage") || hasPermission(ctx, "results.view_all")
}

export async function teachingAssignments(ctx: Ctx, academicYearId?: string, db: Db = prisma): Promise<TeachingAssignment[]> {
  return myAssignments(ctx, db, academicYearId)
}

// Which teachers' records the caller may read: everyone's, their own, or none.
export async function readScope(ctx: Ctx): Promise<{ teacherId?: string } | null> {
  if (overseesTeaching(ctx)) return {}
  const teacher = await myTeacher(ctx)
  return teacher ? { teacherId: teacher.id } : null
}

// The caller's teacher profile, required for creating teaching records.
export async function requireTeacher(ctx: Ctx) {
  const teacher = await myTeacher(ctx)
  if (!teacher) throw new ForbiddenError("Only teachers linked to a teacher profile can do this.")
  return teacher
}

// The year, class, section and subject exist in this organisation and fit
// together. Returns their names for messages and audit entries.
export async function checkPlace(db: Db, ctx: Pick<AuthContext, "organization">, t: TeachingTarget) {
  const organizationId = ctx.organization.id
  const [year, cls, section, subject] = await Promise.all([
    db.academicYear.findFirst({ where: { id: t.academicYearId, organizationId }, select: { id: true, name: true, status: true } }),
    db.academicClass.findFirst({ where: { id: t.classId, organizationId }, select: { id: true, name: true } }),
    t.sectionId ? db.section.findFirst({ where: { id: t.sectionId, classId: t.classId, organizationId }, select: { id: true, name: true } }) : null,
    t.subjectId ? db.subject.findFirst({ where: { id: t.subjectId, organizationId }, select: { id: true, name: true } }) : null,
  ])
  if (!year) throw new ValidationError({ academicYearId: ["Choose a valid academic year."] })
  if (year.status === "ARCHIVED") throw new ValidationError({ academicYearId: ["This academic year is archived."] })
  if (!cls) throw new ValidationError({ classId: ["Choose a valid class."] })
  if (t.sectionId && !section) throw new ValidationError({ sectionId: ["Choose a section of this class."] })
  if (t.subjectId && !subject) throw new ValidationError({ subjectId: ["Choose a valid subject."] })
  return { year, cls, section, subject }
}

// The caller teaches this class (and section, and subject when given).
export async function assertTeaches(ctx: Ctx, t: TeachingTarget, db: Db = prisma) {
  const assignments = await teachingAssignments(ctx, t.academicYearId, db)
  if (!teaches(assignments, t)) {
    throw new ForbiddenError(
      t.subjectId
        ? "You can only do this for subjects you're assigned to teach in that class."
        : "You can only do this for classes you're assigned to teach."
    )
  }
}

// The academic year a list shows: the requested one (if it belongs here),
// none for "all", otherwise the current year.
export async function resolveYear(ctx: Pick<AuthContext, "organization">, year: string | undefined) {
  if (year === "all") return null
  const organizationId = ctx.organization.id
  const found = year
    ? await prisma.academicYear.findFirst({ where: { id: year, organizationId }, select: { id: true } })
    : await prisma.academicYear.findFirst({ where: { organizationId, isCurrent: true }, select: { id: true } })
  return found?.id ?? null
}
