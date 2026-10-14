import "server-only"

import { cache } from "react"

import { navKindFor, type NavKind } from "@/components/navigation/nav-config"
import type { AuthContext } from "@/lib/authorization/context"
import { prisma } from "@/lib/prisma"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

// Which sidebar configuration the signed-in member gets. Navigation only:
// every page still checks permissions on the server.
export const resolveNavKind = cache(async (ctx: Ctx): Promise<NavKind> => {
  const where = { organizationId: ctx.organization.id, userId: ctx.user.id, archivedAt: null }
  const [student, teacher] = await Promise.all([
    prisma.student.findFirst({ where, select: { id: true } }),
    prisma.teacher.findFirst({ where, select: { id: true } }),
  ])
  return navKindFor({ permissions: ctx.permissions, studentProfile: student !== null, teacherProfile: teacher !== null })
})

// The member's own teacher or staff profile page, if they have one.
export async function myProfileHref(ctx: Ctx) {
  const where = { organizationId: ctx.organization.id, userId: ctx.user.id, archivedAt: null }
  const [teacher, staff] = await Promise.all([
    prisma.teacher.findFirst({ where, select: { id: true } }),
    prisma.staff.findFirst({ where, select: { id: true } }),
  ])
  if (teacher) return `/dashboard/teachers/${teacher.id}`
  if (await prisma.student.findFirst({ where, select: { id: true } })) return "/dashboard/student/profile"
  if (staff) return `/dashboard/staff/${staff.id}`
  return null
}
