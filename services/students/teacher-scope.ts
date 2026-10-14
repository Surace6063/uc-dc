import "server-only"

import { isAdministrative } from "@/lib/authorization/administrative"
import type { AuthContext } from "@/lib/authorization/context"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

// Teachers see the students they teach. A member with a linked teacher
// profile and no administrative permission (the same rule that gives them
// the teacher portal) is limited to students enrolled in classes (and
// sections) they have an active teaching assignment for. Everyone else's
// access is unchanged: it follows their role's permissions.
//
// Returns the extra condition, or null when no limit applies.
export async function teacherStudentScope(
  ctx: Pick<AuthContext, "organization"> & Partial<Pick<AuthContext, "user" | "permissions">>
): Promise<Prisma.StudentWhereInput | null> {
  if (!ctx.user || !ctx.permissions || isAdministrative(ctx.permissions)) return null
  const organizationId = ctx.organization.id
  const teacher = await prisma.teacher.findFirst({ where: { organizationId, userId: ctx.user.id, archivedAt: null }, select: { id: true } })
  if (!teacher) return null
  const assignments = await prisma.teacherAssignment.findMany({
    where: { organizationId, teacherId: teacher.id, status: "ACTIVE", classId: { not: null } },
    select: { academicYearId: true, classId: true, sectionId: true },
  })
  if (assignments.length === 0) return { id: { in: [] } }
  return {
    enrollments: {
      some: {
        organizationId,
        OR: assignments.map((a) => ({ academicYearId: a.academicYearId, classId: a.classId!, ...(a.sectionId && { sectionId: a.sectionId }) })),
      },
    },
  }
}
