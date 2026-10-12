import "server-only"

import { canEnterMarks, teachesClass, type MarksTarget } from "@/features/exams/access"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ForbiddenError, PermissionDeniedError } from "@/lib/authorization/errors"
import type { PermissionKey } from "@/lib/authorization/permissions"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { myAssignments } from "@/services/attendance/access-service"

// Record-level scoping for examinations. Permissions say *what* a member
// may do; these helpers say *which* marks and results:
//   exams.marks.manage          every marks sheet
//   exams.grade (teachers)      sheets of subjects they're assigned to teach
//   results.view_all            every class's results
//   results.view (teachers)     published results of classes they teach
//   students and guardians      portal-service (own / linked children only)
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma

// Services check permissions themselves as well as the actions calling
// them, so no caller can skip a step of the workflow.
export function requireAnyPermission(ctx: Pick<AuthContext, "permissions">, ...keys: PermissionKey[]) {
  if (!keys.some((key) => hasPermission(ctx, key))) throw new PermissionDeniedError(keys[0])
}

export const canManageMarks = (ctx: Pick<AuthContext, "permissions">) => hasPermission(ctx, "exams.marks.manage")
export const canSeeAllResults = (ctx: Pick<AuthContext, "permissions">) => hasPermission(ctx, "results.view_all")

// Reviewers and approvers may open any sheet read-only.
export const canReviewMarks = (ctx: Pick<AuthContext, "permissions">) =>
  hasPermission(ctx, "exams.review") || hasPermission(ctx, "exams.approve") || canManageMarks(ctx)

// Whether the member works on the staff side of examinations (rather than
// only seeing their own or their children's results).
export function hasExamStaffAccess(ctx: Pick<AuthContext, "permissions">) {
  return (
    ["exams.create", "exams.update", "exams.configure", "exams.grade", "exams.marks.manage", "exams.review", "exams.approve", "exams.publish", "results.view_all"] as const
  ).some((p) => hasPermission(ctx, p))
}

export async function assertCanEnterMarks(ctx: Ctx, target: MarksTarget, db: Db = prisma) {
  if (canManageMarks(ctx)) return
  if (!hasPermission(ctx, "exams.grade")) throw new ForbiddenError("You don't have permission to enter marks.")
  const assignments = await myAssignments(ctx, db, target.academicYearId)
  if (!canEnterMarks(assignments, target)) {
    throw new ForbiddenError("Only a teacher assigned to this subject in this class (and section) can enter its marks.")
  }
}

export async function mayEnterMarks(ctx: Ctx, target: MarksTarget, db: Db = prisma) {
  try {
    await assertCanEnterMarks(ctx, target, db)
    return true
  } catch (error) {
    if (error instanceof ForbiddenError) return false
    throw error
  }
}

// Classes (and sections) whose published results a teacher may see.
export async function resultScopeWhere(ctx: Ctx, academicYearId?: string): Promise<Prisma.StudentResultWhereInput> {
  if (canSeeAllResults(ctx)) return {}
  if (!hasPermission(ctx, "results.view")) return { id: { in: [] } }
  const assignments = await myAssignments(ctx, prisma, academicYearId)
  if (assignments.length === 0) return { id: { in: [] } }
  return {
    OR: assignments.map((a) => ({
      academicYearId: a.academicYearId,
      classId: a.classId!,
      ...(a.sectionId && { sectionId: a.sectionId }),
    })),
  }
}

export async function mayViewClassResults(ctx: Ctx, t: { academicYearId: string; classId: string; sectionId: string | null }) {
  if (canSeeAllResults(ctx)) return true
  if (!hasPermission(ctx, "results.view")) return false
  return teachesClass(await myAssignments(ctx, prisma, t.academicYearId), t)
}
