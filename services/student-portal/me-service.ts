import "server-only"

import { cache } from "react"

import type { AuthContext } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { prisma } from "@/lib/prisma"

// The student portal: everything is for the student linked to the signed-in
// account. A student ID is never taken from the request, so one student
// can't reach another's records.

export type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

const COUNTED = ["ACTIVE", "ON_HOLD"] as const

export const myStudent = cache(async (ctx: Ctx) =>
  prisma.student.findFirst({
    where: { organizationId: ctx.organization.id, userId: ctx.user.id, archivedAt: null },
    select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, status: true, profileImagePath: true },
  })
)

export async function requireStudent(ctx: Ctx) {
  const student = await myStudent(ctx)
  if (!student) throw new NotFoundError("Your account isn't linked to a student profile.")
  return student
}

// The student's enrollment in the current academic year, or their latest
// active one when the current year has none (between years).
export const myEnrollment = cache(async (ctx: Ctx) => {
  const student = await myStudent(ctx)
  if (!student) return null
  const select = {
    id: true, rollNumber: true, status: true, academicYearId: true, classId: true, sectionId: true, educationLevelId: true,
    academicYear: { select: { id: true, name: true, isCurrent: true } },
    educationLevel: { select: { id: true, name: true } },
    program: { select: { id: true, name: true, code: true } },
    class: { select: { id: true, name: true } },
    section: { select: { id: true, name: true } },
    batch: { select: { name: true } },
  } as const
  const where = { organizationId: ctx.organization.id, studentId: student.id, status: { in: [...COUNTED] } }
  return (
    (await prisma.enrollment.findFirst({ where: { ...where, academicYear: { isCurrent: true } }, orderBy: { enrollmentDate: "desc" }, select })) ??
    (await prisma.enrollment.findFirst({ where, orderBy: { enrollmentDate: "desc" }, select }))
  )
})

export type MyEnrollment = NonNullable<Awaited<ReturnType<typeof myEnrollment>>>

export const fullName = (s: { firstName: string; middleName?: string | null; lastName: string }) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")
