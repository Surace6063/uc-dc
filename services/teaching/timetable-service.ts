import "server-only"

import { teaches } from "@/features/teaching/access"
import { timetableSlotSchema } from "@/features/teaching/schemas"
import { weekdayLabel } from "@/features/teaching/constants"
import { hasPermission } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"
import { checkPlace, myTeacher, overseesTeaching, teachingAssignments, type Ctx } from "@/services/teaching/scope-service"

// Weekly timetable periods.
//   classes.manage / academics.manage   any class's periods, any teacher
//   teachers                            periods for classes and subjects they
//                                       teach, always as their own
// Clashes are refused: a teacher in two places at once, or two periods for
// the same class (or section) at the same time.

export const canManageTimetable = (ctx: Pick<Ctx, "permissions">) => hasPermission(ctx, "classes.manage") || hasPermission(ctx, "academics.manage")

const slotSelect = {
  id: true, academicYearId: true, classId: true, sectionId: true, subjectId: true, teacherId: true,
  dayOfWeek: true, startTime: true, endTime: true, room: true, note: true,
  class: { select: { name: true } },
  section: { select: { name: true } },
  subject: { select: { name: true, code: true } },
  teacher: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TimetableSlotSelect

export type TimetableSlotRow = Prisma.TimetableSlotGetPayload<{ select: typeof slotSelect }>

const order: Prisma.TimetableSlotOrderByWithRelationInput[] = [{ dayOfWeek: "asc" }, { startTime: "asc" }]

// The signed-in teacher's own periods for a year.
export async function mySchedule(ctx: Ctx, academicYearId: string | null): Promise<TimetableSlotRow[]> {
  const teacher = await myTeacher(ctx)
  if (!teacher || !academicYearId) return []
  return prisma.timetableSlot.findMany({
    where: { organizationId: ctx.organization.id, academicYearId, teacherId: teacher.id },
    orderBy: order,
    select: slotSelect,
  })
}

// A class's (or section's) week. Whole-class periods show in every section.
export async function classSchedule(ctx: Ctx, input: { academicYearId: string; classId: string; sectionId: string | null }) {
  if (!canManageTimetable(ctx) && !overseesTeaching(ctx)) {
    const assignments = await teachingAssignments(ctx, input.academicYearId)
    if (!teaches(assignments, { ...input, subjectId: null })) throw new NotFoundError("Class not found.")
  }
  return prisma.timetableSlot.findMany({
    where: {
      organizationId: ctx.organization.id, academicYearId: input.academicYearId, classId: input.classId,
      ...(input.sectionId && { OR: [{ sectionId: input.sectionId }, { sectionId: null }] }),
    },
    orderBy: order,
    select: slotSelect,
  })
}

async function findSlot(ctx: Ctx, id: string) {
  const slot = await prisma.timetableSlot.findFirst({ where: { id, organizationId: ctx.organization.id }, select: { id: true, teacherId: true, academicYearId: true, classId: true, sectionId: true, subjectId: true } })
  if (!slot) throw new NotFoundError("Period not found.")
  return slot
}

export async function saveSlot(ctx: Ctx, slotId: string | null, raw: unknown) {
  const input = timetableSlotSchema.parse(raw)
  const manager = canManageTimetable(ctx)
  const teacher = await myTeacher(ctx)
  const target = { academicYearId: input.academicYearId, classId: input.classId, sectionId: input.sectionId, subjectId: input.subjectId }

  let teacherId = input.teacherId
  if (!manager) {
    if (!teacher) throw new ForbiddenError("You don't have permission to change the timetable.")
    if (slotId && (await findSlot(ctx, slotId)).teacherId !== teacher.id) throw new ForbiddenError("You can only change your own periods.")
    const assignments = await teachingAssignments(ctx, input.academicYearId)
    if (!teaches(assignments, target)) throw new ForbiddenError("You can only add periods for classes and subjects you teach.")
    teacherId = teacher.id
  } else if (slotId) {
    await findSlot(ctx, slotId)
  }

  return prisma.$transaction(async (tx) => {
    const place = await checkPlace(tx, ctx, target)
    if (teacherId) {
      const ok = await tx.teacher.findFirst({ where: { id: teacherId, organizationId: ctx.organization.id, archivedAt: null }, select: { id: true } })
      if (!ok) throw new ValidationError({ teacherId: ["Choose a valid teacher."] })
    }
    // Overlap on the same day: starts before the other ends and ends after it starts.
    const overlapping: Prisma.TimetableSlotWhereInput = {
      organizationId: ctx.organization.id, academicYearId: input.academicYearId, dayOfWeek: input.dayOfWeek,
      startTime: { lt: input.endTime }, endTime: { gt: input.startTime },
      ...(slotId && { id: { not: slotId } }),
    }
    const [teacherClash, classClash] = await Promise.all([
      teacherId ? tx.timetableSlot.findFirst({ where: { ...overlapping, teacherId }, select: { startTime: true, class: { select: { name: true } } } }) : null,
      tx.timetableSlot.findFirst({
        where: {
          ...overlapping, classId: input.classId,
          // A whole-class period clashes with any section; a section's with
          // that section or a whole-class period.
          ...(input.sectionId && { OR: [{ sectionId: input.sectionId }, { sectionId: null }] }),
        },
        select: { startTime: true, subject: { select: { name: true } } },
      }),
    ])
    if (teacherClash) throw new ConflictError(`That teacher already has ${teacherClash.class.name} at ${teacherClash.startTime} on ${weekdayLabel(input.dayOfWeek)}.`)
    if (classClash) throw new ConflictError(`${place.cls.name} already has ${classClash.subject?.name ?? "a period"} at ${classClash.startTime} on ${weekdayLabel(input.dayOfWeek)}.`)

    const data = {
      academicYearId: input.academicYearId, classId: input.classId, sectionId: input.sectionId, subjectId: input.subjectId,
      teacherId, dayOfWeek: input.dayOfWeek, startTime: input.startTime, endTime: input.endTime, room: input.room, note: input.note,
    }
    const slot = slotId
      ? await tx.timetableSlot.update({ where: { id: slotId }, data, select: { id: true } })
      : await tx.timetableSlot.create({ data: { ...data, organizationId: ctx.organization.id, createdById: ctx.user.id }, select: { id: true } })
    await audit(tx, ctx, {
      action: slotId ? "timetable.update" : "timetable.create", entityType: "class", entityId: input.classId,
      summary: `${slotId ? "Updated" : "Added"} period ${weekdayLabel(input.dayOfWeek)} ${input.startTime}–${input.endTime}${place.subject ? ` (${place.subject.name})` : ""}`,
      metadata: { slotId: slot.id },
    })
    return slot
  })
}

export async function deleteSlot(ctx: Ctx, slotId: string) {
  const slot = await findSlot(ctx, slotId)
  if (!canManageTimetable(ctx)) {
    const teacher = await myTeacher(ctx)
    if (!teacher || slot.teacherId !== teacher.id) throw new ForbiddenError("You can only remove your own periods.")
  }
  await prisma.$transaction(async (tx) => {
    await tx.timetableSlot.delete({ where: { id: slotId } })
    await audit(tx, ctx, { action: "timetable.delete", entityType: "class", entityId: slot.classId, summary: "Removed a timetable period", metadata: { slotId } })
  })
}

// Choices for coordinators building any class's timetable.
export async function timetableManagerOptions(ctx: Ctx) {
  const organizationId = ctx.organization.id
  const [classes, subjects, teachers] = await Promise.all([
    prisma.academicClass.findMany({
      where: { organizationId, archivedAt: null, isActive: true },
      orderBy: [{ sequence: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sections: { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } } },
    }),
    prisma.subject.findMany({ where: { organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.teacher.findMany({
      where: { organizationId, archivedAt: null, employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeId: true },
    }),
  ])
  return { classes, subjects, teachers }
}

export type TimetableManagerOptions = Awaited<ReturnType<typeof timetableManagerOptions>>
