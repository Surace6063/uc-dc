import "server-only"

import { PORTAL_STUDENT_STATUSES } from "@/features/guardians/constants"
import { portalPreferencesSchema } from "@/features/guardians/schemas"
import { fullName } from "@/features/students/constants"
import type { AuthContext } from "@/lib/authorization/context"
import { NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"

type Ctx = Pick<AuthContext, "organization" | "user">

// Parent portal access is decided by data, never by role: the signed-in user
// must be linked to a guardian profile of the current organisation that is
// not archived and whose portal status is ACTIVE, and that guardian's link
// to the student must allow portal access. Every parent-facing read goes
// through these helpers, so a student ID from the client is never trusted.

export function portalGuardianWhere(ctx: Ctx): Prisma.GuardianWhereInput {
  return { organizationId: ctx.organization.id, userId: ctx.user.id, archivedAt: null, portalStatus: "ACTIVE" }
}

export function portalLinkWhere(ctx: Ctx): Prisma.StudentGuardianWhereInput {
  return { organizationId: ctx.organization.id, canAccessStudentPortalData: true, guardian: portalGuardianWhere(ctx) }
}

// Students the signed-in guardian may see in the portal.
export function portalStudentWhere(ctx: Ctx): Prisma.StudentWhereInput {
  return {
    organizationId: ctx.organization.id,
    archivedAt: null,
    status: { in: [...PORTAL_STUDENT_STATUSES] },
    guardians: { some: portalLinkWhere(ctx) },
  }
}

// The guardian profile behind the signed-in user, or null.
export async function getPortalGuardian(ctx: Ctx) {
  return prisma.guardian.findFirst({
    where: portalGuardianWhere(ctx),
    select: {
      id: true, fullName: true, guardianCode: true, phone: true, alternatePhone: true, email: true,
      preferredContactMethod: true, preferredLanguage: true,
    },
  })
}

// Whether the user has *any* guardian profile here (even a disabled one),
// to explain an empty portal rather than show "access denied".
export async function getGuardianAccountState(ctx: Ctx) {
  const guardian = await prisma.guardian.findFirst({
    where: { organizationId: ctx.organization.id, userId: ctx.user.id },
    select: { archivedAt: true, portalStatus: true },
  })
  if (!guardian) return "none" as const
  if (guardian.archivedAt || guardian.portalStatus !== "ACTIVE") return "disabled" as const
  return "active" as const
}

const currentEnrollment = {
  where: { status: { in: ["ACTIVE", "ON_HOLD"] as ("ACTIVE" | "ON_HOLD")[] } },
  orderBy: [{ enrollmentDate: "desc" as const }, { createdAt: "desc" as const }],
  take: 1,
  select: {
    academicYearId: true, classId: true, sectionId: true, rollNumber: true, status: true,
    academicYear: { select: { name: true } },
    educationLevel: { select: { name: true } },
    program: { select: { name: true } },
    class: { select: { name: true } },
    section: { select: { name: true } },
    batch: { select: { name: true } },
  },
}

export async function listPortalChildren(ctx: Ctx) {
  const rows = await prisma.student.findMany({
    where: portalStudentWhere(ctx),
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 20,
    select: {
      id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, status: true,
      profileImagePath: true,
      enrollments: currentEnrollment,
      guardians: {
        where: portalLinkWhere(ctx),
        select: {
          relationship: true, receivesAcademicNotifications: true, receivesAttendanceNotifications: true,
          receivesGeneralAnnouncements: true,
        },
      },
    },
  })
  return rows.map((s) => ({
    id: s.id,
    name: fullName(s),
    firstName: s.firstName,
    lastName: s.lastName,
    admissionNumber: s.admissionNumber,
    status: s.status,
    profileImagePath: s.profileImagePath,
    relationship: s.guardians[0]?.relationship ?? null,
    preferences: {
      receivesAcademicNotifications: s.guardians[0]?.receivesAcademicNotifications ?? false,
      receivesAttendanceNotifications: s.guardians[0]?.receivesAttendanceNotifications ?? false,
      receivesGeneralAnnouncements: s.guardians[0]?.receivesGeneralAnnouncements ?? false,
    },
    enrollment: s.enrollments[0] ?? null,
  }))
}

export type PortalChild = Awaited<ReturnType<typeof listPortalChildren>>[number]

// The access check for one child. Throws the same NotFoundError for a
// student who doesn't exist, belongs elsewhere, or isn't this guardian's.
export async function requireGuardianStudentAccess(ctx: Ctx, studentId: string, need?: "financial") {
  const link = await prisma.studentGuardian.findFirst({
    where: {
      ...portalLinkWhere(ctx),
      studentId,
      student: { archivedAt: null, status: { in: [...PORTAL_STUDENT_STATUSES] } },
      ...(need === "financial" && { receivesBillingNotifications: true }),
    },
    select: {
      guardianId: true, studentId: true, relationship: true, isPrimary: true, isEmergencyContact: true,
      canPickupStudent: true, receivesAcademicNotifications: true, receivesAttendanceNotifications: true,
      receivesBillingNotifications: true, receivesGeneralAnnouncements: true,
    },
  })
  if (!link) throw new NotFoundError("Student not found.")
  return link
}

// What the portal shows for one child: identity, current placement and class
// teacher. No medical notes, documents, other guardians, internal notes or
// status history.
export async function getPortalChildOverview(ctx: Ctx, studentId: string) {
  const link = await requireGuardianStudentAccess(ctx, studentId)
  const student = await prisma.student.findFirst({
    where: { id: studentId, organizationId: ctx.organization.id },
    select: {
      id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true, status: true,
      dateOfBirth: true, gender: true, admissionDate: true, profileImagePath: true,
      enrollments: currentEnrollment,
    },
  })
  if (!student) throw new NotFoundError("Student not found.")
  const enrollment = student.enrollments[0] ?? null
  const classTeachers = enrollment
    ? await prisma.teacherAssignment.findMany({
        where: {
          organizationId: ctx.organization.id,
          academicYearId: enrollment.academicYearId,
          classId: enrollment.classId,
          role: "CLASS_TEACHER",
          status: "ACTIVE",
          OR: [{ sectionId: enrollment.sectionId }, { sectionId: null }],
          teacher: { archivedAt: null },
        },
        take: 2,
        // Name only: staff contact details aren't shared through the portal.
        select: { teacher: { select: { firstName: true, middleName: true, lastName: true } } },
      })
    : []
  return {
    student: { ...student, name: fullName(student) },
    enrollment,
    classTeachers: classTeachers.map((a) => fullName(a.teacher)),
    link,
  }
}

// Self-service: a guardian may change how they're contacted and opt in or out
// of academic, attendance and general notices for children they can see.
// Fee notices and portal access stay with the school.
export async function updatePortalPreferences(ctx: Ctx, raw: unknown) {
  const input = portalPreferencesSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const guardian = await tx.guardian.findFirst({ where: portalGuardianWhere(ctx), select: { id: true } })
    if (!guardian) throw new NotFoundError("Guardian profile not found.")
    const allowed = new Set(
      (
        await tx.studentGuardian.findMany({
          where: { guardianId: guardian.id, organizationId: ctx.organization.id, canAccessStudentPortalData: true },
          select: { studentId: true },
        })
      ).map((l) => l.studentId)
    )
    input.children.forEach((child, i) => {
      if (!allowed.has(child.studentId)) throw new ValidationError({ [`children.${i}`]: ["Not one of your children."] })
    })
    await tx.guardian.update({
      where: { id: guardian.id },
      data: {
        preferredContactMethod: input.preferredContactMethod,
        preferredLanguage: input.preferredLanguage,
        alternatePhone: input.alternatePhone,
      },
    })
    for (const child of input.children) {
      await tx.studentGuardian.update({
        where: { studentId_guardianId: { studentId: child.studentId, guardianId: guardian.id } },
        data: {
          receivesAcademicNotifications: child.receivesAcademicNotifications,
          receivesAttendanceNotifications: child.receivesAttendanceNotifications,
          receivesGeneralAnnouncements: child.receivesGeneralAnnouncements,
        },
      })
    }
    await audit(tx, ctx, {
      action: "guardian.self_update", entityType: "guardian", entityId: guardian.id,
      summary: "Updated their contact and notification preferences in the parent portal",
    })
  })
}
