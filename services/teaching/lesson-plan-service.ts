import "server-only"

import type { LessonPlanFilters } from "@/features/teaching/filters"
import { lessonPlanSchema } from "@/features/teaching/schemas"
import { hasPermission } from "@/lib/authorization/context"
import { ForbiddenError, NotFoundError } from "@/lib/authorization/errors"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"
import { assertTeaches, checkPlace, readScope, requireTeacher, resolveYear, type Ctx } from "@/services/teaching/scope-service"

// Lesson plans: written by the teacher for a class and subject they teach.
//   courses.view     see plans (one's own; academic heads see everyone's)
//   courses.create   write plans
//   courses.update   edit and delete one's own plans

const listSelect = {
  id: true, title: true, topic: true, plannedDate: true, periods: true, status: true, deliveredOn: true, updatedAt: true,
  objectives: true, activities: true, resources: true, assessment: true, reflection: true,
  academicYearId: true, classId: true, sectionId: true, subjectId: true, teacherId: true,
  class: { select: { name: true } },
  section: { select: { name: true } },
  subject: { select: { name: true, code: true } },
  teacher: { select: { firstName: true, lastName: true } },
} satisfies Prisma.LessonPlanSelect

export type LessonPlanRow = Prisma.LessonPlanGetPayload<{ select: typeof listSelect }>

export async function listLessonPlans(ctx: Ctx, filters: LessonPlanFilters) {
  const scope = await readScope(ctx)
  const yearId = await resolveYear(ctx, filters.year)
  if (!scope) return { rows: [], total: 0, yearId, counts: { DRAFT: 0, PLANNED: 0, DELIVERED: 0 } }
  const base: Prisma.LessonPlanWhereInput = {
    organizationId: ctx.organization.id,
    ...scope,
    ...(yearId && { academicYearId: yearId }),
    ...(filters.class && { classId: filters.class }),
    ...(filters.section && { sectionId: filters.section }),
    ...(filters.subject && { subjectId: filters.subject }),
    ...((filters.from || filters.to) && { plannedDate: { ...(filters.from && { gte: toDate(filters.from) }), ...(filters.to && { lte: toDate(filters.to) }) } }),
    ...(filters.q && {
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { topic: { contains: filters.q, mode: "insensitive" } },
      ],
    }),
  }
  const where = { ...base, ...(filters.status && { status: filters.status }) }
  const orderBy: Prisma.LessonPlanOrderByWithRelationInput[] =
    filters.sort === "title" ? [{ title: filters.dir }] : filters.sort === "status" ? [{ status: filters.dir }, { plannedDate: "desc" }] : [{ plannedDate: filters.dir }, { createdAt: "desc" }]
  const [total, rows, byStatus] = await Promise.all([
    prisma.lessonPlan.count({ where }),
    prisma.lessonPlan.findMany({ where, orderBy, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, select: listSelect }),
    prisma.lessonPlan.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ])
  const counts = { DRAFT: 0, PLANNED: 0, DELIVERED: 0 }
  for (const s of byStatus) counts[s.status] = s._count._all
  return { rows, total, yearId, counts }
}

async function ownPlan(ctx: Ctx, planId: string) {
  const teacher = await requireTeacher(ctx)
  const plan = await prisma.lessonPlan.findFirst({ where: { id: planId, organizationId: ctx.organization.id }, select: { id: true, teacherId: true, title: true, deliveredOn: true } })
  if (!plan) throw new NotFoundError("Lesson plan not found.")
  if (plan.teacherId !== teacher.id) throw new ForbiddenError("You can only change your own lesson plans.")
  return { plan, teacher }
}

export async function saveLessonPlan(ctx: Ctx, planId: string | null, raw: unknown) {
  const input = lessonPlanSchema.parse(raw)
  const { teacher, plan } = planId ? await ownPlan(ctx, planId) : { teacher: await requireTeacher(ctx), plan: null }
  if (!hasPermission(ctx, planId ? "courses.update" : "courses.create")) throw new ForbiddenError("You don't have permission to write lesson plans.")
  const target = { academicYearId: input.academicYearId, classId: input.classId, sectionId: input.sectionId, subjectId: input.subjectId }
  await assertTeaches(ctx, target)

  return prisma.$transaction(async (tx) => {
    const place = await checkPlace(tx, ctx, target)
    const data = {
      ...target,
      title: input.title, topic: input.topic, plannedDate: toDate(input.plannedDate), periods: input.periods,
      objectives: input.objectives, activities: input.activities, resources: input.resources, assessment: input.assessment,
      status: input.status, reflection: input.reflection,
      // Delivered on the planned day unless already recorded.
      deliveredOn: input.status === "DELIVERED" ? (plan?.deliveredOn ?? toDate(input.plannedDate)) : null,
    }
    const saved = planId
      ? await tx.lessonPlan.update({ where: { id: planId }, data, select: { id: true } })
      : await tx.lessonPlan.create({ data: { ...data, organizationId: ctx.organization.id, teacherId: teacher.id }, select: { id: true } })
    await audit(tx, ctx, {
      action: planId ? "lesson_plan.update" : "lesson_plan.create", entityType: "teacher", entityId: teacher.id,
      summary: `${planId ? "Updated" : "Wrote"} lesson plan “${input.title}” (${place.cls.name}, ${place.subject!.name})`,
      metadata: { lessonPlanId: saved.id },
    })
    return saved
  })
}

export async function deleteLessonPlan(ctx: Ctx, planId: string) {
  if (!hasPermission(ctx, "courses.update")) throw new ForbiddenError("You don't have permission to delete lesson plans.")
  const { plan, teacher } = await ownPlan(ctx, planId)
  await prisma.$transaction(async (tx) => {
    await tx.lessonPlan.delete({ where: { id: planId } })
    await audit(tx, ctx, { action: "lesson_plan.delete", entityType: "teacher", entityId: teacher.id, summary: `Deleted lesson plan “${plan.title}”`, metadata: { lessonPlanId: planId } })
  })
}
