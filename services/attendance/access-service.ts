import "server-only"

import { canTakeRegister, type RegisterTarget, type TeachingAssignment } from "@/features/attendance/access"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ForbiddenError } from "@/lib/authorization/errors"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"

// Record-level scoping for student attendance. Permissions say *what* a
// member may do; these helpers say *which* registers and records:
//   attendance.view_all / attendance.manage  every class
//   attendance.create (teachers)              classes and subjects they are
//                                             assigned to teach
//   students (own) and guardians (linked)     see portal-service
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma

export const canSeeAll = (ctx: Pick<AuthContext, "permissions">) =>
  hasPermission(ctx, "attendance.view_all") || hasPermission(ctx, "attendance.manage")

// Active teaching assignments of the signed-in user's teacher profile.
export async function myAssignments(ctx: Ctx, db: Db = prisma, academicYearId?: string): Promise<TeachingAssignment[]> {
  return db.teacherAssignment.findMany({
    where: {
      organizationId: ctx.organization.id,
      status: "ACTIVE",
      classId: { not: null },
      ...(academicYearId && { academicYearId }),
      teacher: { userId: ctx.user.id, archivedAt: null },
    },
    select: { academicYearId: true, classId: true, sectionId: true, subjectId: true, role: true },
  })
}

// May the caller take or edit this register? attendance.manage covers every
// class; attendance.create covers the caller's own teaching assignments.
export async function assertCanTake(ctx: Ctx, target: RegisterTarget, db: Db = prisma) {
  if (hasPermission(ctx, "attendance.manage")) return
  if (!hasPermission(ctx, "attendance.create")) throw new ForbiddenError("You don't have permission to take attendance.")
  const assignments = await myAssignments(ctx, db, target.academicYearId)
  if (!canTakeRegister(assignments, target)) {
    throw new ForbiddenError(
      target.sessionType === "DAILY"
        ? "Only the class teacher of this class or section can take its daily attendance."
        : "Only a teacher assigned to this subject in this class can take its attendance."
    )
  }
}

// Narrows student attendance records to what the caller may see. Teachers
// without attendance.view_all see their assigned classes (sections) and
// registers they took themselves; everyone else sees nothing here.
export async function recordScopeWhere(ctx: Ctx): Promise<Prisma.StudentAttendanceWhereInput> {
  if (canSeeAll(ctx)) return {}
  const assignments = await myAssignments(ctx)
  return {
    OR: [
      { session: { takenById: ctx.user.id } },
      ...assignments.map((a) => ({
        academicYearId: a.academicYearId,
        classId: a.classId!,
        ...(a.sectionId && { sectionId: a.sectionId }),
      })),
    ],
  }
}

export async function sessionScopeWhere(ctx: Ctx): Promise<Prisma.AttendanceSessionWhereInput> {
  if (canSeeAll(ctx)) return {}
  const assignments = await myAssignments(ctx)
  return {
    OR: [
      { takenById: ctx.user.id },
      ...assignments.map((a) => ({
        academicYearId: a.academicYearId,
        classId: a.classId!,
        ...(a.sectionId && { sectionId: a.sectionId }),
      })),
    ],
  }
}

// Whether the caller works with student registers at all (vs. only seeing
// their own attendance as a student, parent or employee).
export async function hasRegisterAccess(ctx: Ctx) {
  if (canSeeAll(ctx)) return true
  if (!hasPermission(ctx, "attendance.create")) return false
  return (await myAssignments(ctx)).length > 0
}
