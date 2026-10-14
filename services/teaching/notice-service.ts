import "server-only"

import { atLocalTime } from "@/features/attendance/constants"
import type { NoticeFilters } from "@/features/teaching/filters"
import { noticeSchema } from "@/features/teaching/schemas"
import { hasPermission } from "@/lib/authorization/context"
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"
import { portalStudentWhere } from "@/services/guardians/portal-service"
import { assertTeaches, checkPlace, myTeacher, resolveYear, teachingAssignments, type Ctx } from "@/services/teaching/scope-service"

// Notices (announcements).
//   communication.view   read notices meant for you
//   notices.manage       post to anyone, and manage every notice
//   teachers             post to classes they teach; edit their own
// Who sees a notice follows its audience:
//   staff side (teachers, staff, office)  everyone + staff notices, class
//                                         notices of classes they teach,
//                                         and notices they posted
//   students                              everyone + student notices + their
//                                         class (or section)
//   parents                               everyone + parent notices + their
//                                         children's classes

export const canManageNotices = (ctx: Pick<Ctx, "permissions">) => hasPermission(ctx, "notices.manage")
export const canReadNotices = (ctx: Pick<Ctx, "permissions">) => hasPermission(ctx, "communication.view") || canManageNotices(ctx)

const ENROLLED = ["ACTIVE", "ON_HOLD"] as const

const classMatch = (e: { classId: string; sectionId: string | null }): Prisma.NoticeWhereInput => ({
  audience: "CLASS",
  classId: e.classId,
  OR: [{ sectionId: null }, ...(e.sectionId ? [{ sectionId: e.sectionId }] : [])],
})

// What the signed-in member may read.
async function visibleWhere(ctx: Ctx): Promise<Prisma.NoticeWhereInput> {
  const organizationId = ctx.organization.id
  if (canManageNotices(ctx)) return { organizationId }
  const [student, children] = await Promise.all([
    prisma.student.findFirst({ where: { organizationId, userId: ctx.user.id, archivedAt: null }, select: { id: true } }),
    prisma.student.findMany({ where: portalStudentWhere(ctx), select: { id: true } }),
  ])
  const enrolledIn = async (studentIds: string[]) =>
    studentIds.length
      ? prisma.enrollment.findMany({ where: { organizationId, studentId: { in: studentIds }, status: { in: [...ENROLLED] }, academicYear: { isCurrent: true } }, select: { classId: true, sectionId: true } })
      : []
  const [ownClasses, childClasses] = await Promise.all([enrolledIn(student ? [student.id] : []), enrolledIn(children.map((c) => c.id))])

  const or: Prisma.NoticeWhereInput[] = [{ audience: "EVERYONE" }, { authorId: ctx.user.id }]
  // Members who are neither a student nor only a parent are staff side.
  const staffSide = !student && (children.length === 0 || (await myTeacher(ctx)) !== null)
  if (staffSide) {
    or.push({ audience: "STAFF" })
    const taught = await teachingAssignments(ctx)
    for (const a of taught) or.push(classMatch({ classId: a.classId!, sectionId: a.sectionId }))
    // A whole-class assignment also covers section notices.
    for (const a of taught.filter((x) => x.sectionId === null)) or.push({ audience: "CLASS", classId: a.classId! })
  }
  if (student) {
    or.push({ audience: "STUDENTS" })
    for (const e of ownClasses) or.push(classMatch(e))
  }
  if (children.length) {
    or.push({ audience: "PARENTS" })
    for (const e of childClasses) or.push(classMatch(e))
  }
  return { organizationId, OR: or }
}

const noticeSelect = {
  id: true, title: true, body: true, audience: true, pinned: true, publishedAt: true, expiresAt: true, authorId: true, classId: true, sectionId: true,
  class: { select: { name: true } },
  section: { select: { name: true } },
  author: { select: { name: true } },
} satisfies Prisma.NoticeSelect

export type NoticeRow = Prisma.NoticeGetPayload<{ select: typeof noticeSelect }> & { canEdit: boolean }

export async function listNotices(ctx: Ctx, filters: NoticeFilters) {
  if (!canReadNotices(ctx)) return { rows: [], total: 0 }
  const now = new Date()
  const where: Prisma.NoticeWhereInput = {
    AND: [
      await visibleWhere(ctx),
      { publishedAt: { lte: now } },
      filters.expired === "show" ? {} : { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      filters.audience ? { audience: filters.audience } : {},
      filters.class ? { classId: filters.class } : {},
      filters.view === "mine" ? { authorId: ctx.user.id } : {},
      filters.q ? { OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { body: { contains: filters.q, mode: "insensitive" } }] } : {},
    ],
  }
  const [total, rows] = await Promise.all([
    prisma.notice.count({ where }),
    prisma.notice.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: noticeSelect,
    }),
  ])
  const manager = canManageNotices(ctx)
  return { total, rows: rows.map((r) => ({ ...r, canEdit: manager || r.authorId === ctx.user.id })) }
}

// Latest notices for a dashboard.
export async function recentNotices(ctx: Ctx, take = 5) {
  return (await listNotices(ctx, { page: 1, pageSize: take, view: "all", q: undefined, audience: undefined, class: undefined, expired: undefined })).rows
}

async function editableNotice(ctx: Ctx, id: string) {
  const notice = await prisma.notice.findFirst({ where: { id, organizationId: ctx.organization.id }, select: { id: true, authorId: true, title: true } })
  if (!notice) throw new NotFoundError("Notice not found.")
  if (!canManageNotices(ctx) && notice.authorId !== ctx.user.id) throw new ForbiddenError("You can only change notices you posted.")
  return notice
}

export async function saveNotice(ctx: Ctx, id: string | null, raw: unknown) {
  if (!canReadNotices(ctx)) throw new ForbiddenError("You don't have permission to post notices.")
  const input = noticeSchema.parse(raw)
  if (id) await editableNotice(ctx, id)
  const manager = canManageNotices(ctx)
  if (!manager && input.audience !== "CLASS") throw new ForbiddenError("You can post notices to classes you teach. Ask the office to send notices to everyone.")

  let classId: string | null = null
  let sectionId: string | null = null
  if (input.audience === "CLASS") {
    const academicYearId = input.academicYearId ?? (await resolveYear(ctx, undefined))
    if (!academicYearId) throw new ValidationError({ academicYearId: ["Set a current academic year first."] })
    const target = { academicYearId, classId: input.classId!, sectionId: input.sectionId, subjectId: null }
    await checkPlace(prisma, ctx, target)
    if (!manager) await assertTeaches(ctx, target)
    classId = target.classId
    sectionId = target.sectionId
  }
  const data = {
    title: input.title, body: input.body, audience: input.audience, classId, sectionId,
    pinned: input.pinned, expiresAt: input.expiresOn ? atLocalTime(input.expiresOn, "23:59") : null,
  }
  return prisma.$transaction(async (tx) => {
    const notice = id
      ? await tx.notice.update({ where: { id }, data, select: { id: true } })
      : await tx.notice.create({ data: { ...data, organizationId: ctx.organization.id, authorId: ctx.user.id }, select: { id: true } })
    await audit(tx, ctx, { action: id ? "notice.update" : "notice.create", entityType: "notice", entityId: notice.id, summary: `${id ? "Updated" : "Posted"} notice “${input.title}”` })
    return notice
  })
}

export async function deleteNotice(ctx: Ctx, id: string) {
  const notice = await editableNotice(ctx, id)
  await prisma.$transaction(async (tx) => {
    await tx.notice.delete({ where: { id } })
    await audit(tx, ctx, { action: "notice.delete", entityType: "notice", entityId: id, summary: `Deleted notice “${notice.title}”` })
  })
}

// Classes the office can post a class notice to.
export async function noticeClassOptions(ctx: Ctx) {
  if (!canManageNotices(ctx)) return null
  return prisma.academicClass.findMany({
    where: { organizationId: ctx.organization.id, archivedAt: null, isActive: true },
    orderBy: [{ sequence: "asc" }, { name: "asc" }],
    select: { id: true, name: true, sections: { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } } },
  })
}
