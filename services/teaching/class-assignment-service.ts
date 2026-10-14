import "server-only"

import { atLocalTime, localDate } from "@/features/attendance/constants"
import type { ClassAssignmentFilters } from "@/features/teaching/filters"
import { classAssignmentSchema, recordSubmissionSchema, reviewSubmissionSchema } from "@/features/teaching/schemas"
import { hasPermission } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { signedUrl } from "@/lib/supabase/storage"
import { audit } from "@/services/audit/audit-service"
import { assertTeaches, checkPlace, myTeacher, overseesTeaching, readScope, requireTeacher, resolveYear, type Ctx } from "@/services/teaching/scope-service"

// Class assignments (homework, coursework) and their submissions.
//   assignments.view     see assignments (one's own; academic heads everyone's)
//   assignments.create   set work for classes and subjects one teaches
//   assignments.update   edit, publish and close one's own
//   assignments.delete   delete one's own (only while nothing was submitted)
//   assignments.grade    record paper submissions and review work
// Students submit through their own portal; they see published work only.

const ENROLLED = ["ACTIVE", "ON_HOLD"] as const

const listSelect = {
  id: true, title: true, instructions: true, dueAt: true, maxMarks: true, status: true, publishedAt: true, createdAt: true,
  teacherId: true, academicYearId: true, classId: true, sectionId: true, subjectId: true,
  class: { select: { name: true } },
  section: { select: { name: true } },
  subject: { select: { name: true, code: true } },
  teacher: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ClassAssignmentSelect

function need(ctx: Ctx, key: "assignments.create" | "assignments.update" | "assignments.delete" | "assignments.grade", message: string) {
  if (!hasPermission(ctx, key)) throw new ForbiddenError(message)
}

// Enrolled students per class/section for a year, so each assignment shows
// how many students it was set for.
async function enrolledCounts(ctx: Ctx, rows: { academicYearId: string; classId: string; sectionId: string | null }[]) {
  if (rows.length === 0) return () => 0
  const counts = await prisma.enrollment.groupBy({
    by: ["academicYearId", "classId", "sectionId"],
    where: { organizationId: ctx.organization.id, status: { in: [...ENROLLED] }, classId: { in: [...new Set(rows.map((r) => r.classId))] } },
    _count: { _all: true },
  })
  return (r: { academicYearId: string; classId: string; sectionId: string | null }) =>
    counts.filter((c) => c.academicYearId === r.academicYearId && c.classId === r.classId && (r.sectionId === null || c.sectionId === r.sectionId)).reduce((n, c) => n + c._count._all, 0)
}

export async function listClassAssignments(ctx: Ctx, filters: ClassAssignmentFilters) {
  const scope = await readScope(ctx)
  const yearId = await resolveYear(ctx, filters.year)
  if (!scope) return { rows: [], total: 0, yearId, awaitingReview: 0, counts: { DRAFT: 0, PUBLISHED: 0, CLOSED: 0 } }
  const base: Prisma.ClassAssignmentWhereInput = {
    organizationId: ctx.organization.id,
    ...scope,
    ...(yearId && { academicYearId: yearId }),
    ...(filters.class && { classId: filters.class }),
    ...(filters.section && { sectionId: filters.section }),
    ...(filters.subject && { subjectId: filters.subject }),
    ...((filters.from || filters.to) && {
      dueAt: { ...(filters.from && { gte: atLocalTime(filters.from, "00:00") }), ...(filters.to && { lte: atLocalTime(filters.to, "23:59") }) },
    }),
    ...(filters.q && { title: { contains: filters.q, mode: "insensitive" } }),
  }
  const where: Prisma.ClassAssignmentWhereInput = {
    ...base,
    ...(filters.status && { status: filters.status }),
    ...(filters.review === "pending" && { submissions: { some: { status: "SUBMITTED" } } }),
  }
  const orderBy: Prisma.ClassAssignmentOrderByWithRelationInput[] =
    filters.sort === "title" ? [{ title: filters.dir }] : filters.sort === "status" ? [{ status: filters.dir }, { dueAt: "desc" }] : filters.sort === "createdAt" ? [{ createdAt: filters.dir }] : [{ dueAt: filters.dir }]
  const [total, rows, awaitingReview, byStatus] = await Promise.all([
    prisma.classAssignment.count({ where }),
    prisma.classAssignment.findMany({ where, orderBy, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, select: listSelect }),
    prisma.assignmentSubmission.count({ where: { organizationId: ctx.organization.id, status: "SUBMITTED", assignment: base } }),
    prisma.classAssignment.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ])
  const counts = { DRAFT: 0, PUBLISHED: 0, CLOSED: 0 }
  for (const g of byStatus) counts[g.status] = g._count._all
  const ids = rows.map((r) => r.id)
  const [subs, enrolled] = await Promise.all([
    ids.length ? prisma.assignmentSubmission.groupBy({ by: ["assignmentId", "status"], where: { organizationId: ctx.organization.id, assignmentId: { in: ids } }, _count: { _all: true } }) : [],
    enrolledCounts(ctx, rows),
  ])
  return {
    yearId, total, awaitingReview, counts,
    rows: rows.map((r) => {
      const mine = subs.filter((s) => s.assignmentId === r.id)
      return {
        ...r,
        maxMarks: r.maxMarks === null ? null : Number(r.maxMarks),
        students: enrolled(r),
        submitted: mine.reduce((n, s) => n + s._count._all, 0),
        awaitingReview: mine.find((s) => s.status === "SUBMITTED")?._count._all ?? 0,
      }
    }),
  }
}

export type ClassAssignmentRow = Awaited<ReturnType<typeof listClassAssignments>>["rows"][number]

async function ownAssignment(ctx: Ctx, id: string) {
  const teacher = await requireTeacher(ctx)
  const a = await prisma.classAssignment.findFirst({
    where: { id, organizationId: ctx.organization.id },
    select: { id: true, teacherId: true, title: true, status: true, publishedAt: true, maxMarks: true, academicYearId: true, classId: true, sectionId: true, dueAt: true },
  })
  if (!a) throw new NotFoundError("Assignment not found.")
  if (a.teacherId !== teacher.id) throw new ForbiddenError("You can only change assignments you set.")
  return { a, teacher }
}

export async function saveClassAssignment(ctx: Ctx, id: string | null, raw: unknown) {
  need(ctx, id ? "assignments.update" : "assignments.create", "You don't have permission to set assignments.")
  const input = classAssignmentSchema.parse(raw)
  const { teacher, a } = id ? await ownAssignment(ctx, id) : { teacher: await requireTeacher(ctx), a: null }
  const target = { academicYearId: input.academicYearId, classId: input.classId, sectionId: input.sectionId, subjectId: input.subjectId }
  await assertTeaches(ctx, target)
  if (a && a.status === "CLOSED") throw new ConflictError("Reopen this assignment before editing it.")
  const dueAt = atLocalTime(input.dueDate, input.dueTime)
  if (!a && dueAt < new Date()) throw new ValidationError({ dueDate: ["The due date has already passed."] })

  return prisma.$transaction(async (tx) => {
    const place = await checkPlace(tx, ctx, target)
    // Once students have the work, it can't move to another class.
    if (a && a.status !== "DRAFT" && (a.classId !== target.classId || a.sectionId !== target.sectionId)) {
      const submitted = await tx.assignmentSubmission.count({ where: { assignmentId: a.id } })
      if (submitted) throw new ConflictError("Students have already submitted this work, so it can't move to another class.")
    }
    const data = {
      ...target, title: input.title, instructions: input.instructions, dueAt, maxMarks: input.maxMarks, status: input.status,
      publishedAt: input.status === "PUBLISHED" ? (a?.publishedAt ?? new Date()) : null,
    }
    const saved = id
      ? await tx.classAssignment.update({ where: { id }, data, select: { id: true } })
      : await tx.classAssignment.create({ data: { ...data, organizationId: ctx.organization.id, teacherId: teacher.id }, select: { id: true } })
    await audit(tx, ctx, {
      action: id ? "class_assignment.update" : "class_assignment.create", entityType: "teacher", entityId: teacher.id,
      summary: `${id ? "Updated" : "Set"} assignment “${input.title}” for ${place.cls.name}${place.section ? ` ${place.section.name}` : ""} (${place.subject!.name})`,
      metadata: { assignmentId: saved.id, status: input.status },
    })
    return saved
  })
}

// Publish, close (no more submissions) or reopen.
export async function setClassAssignmentStatus(ctx: Ctx, id: string, status: "PUBLISHED" | "CLOSED") {
  need(ctx, "assignments.update", "You don't have permission to change assignments.")
  const { a, teacher } = await ownAssignment(ctx, id)
  await prisma.$transaction(async (tx) => {
    await tx.classAssignment.update({ where: { id }, data: { status, publishedAt: a.publishedAt ?? new Date() } })
    await audit(tx, ctx, {
      action: "class_assignment.status", entityType: "teacher", entityId: teacher.id,
      summary: `${status === "CLOSED" ? "Closed" : a.status === "CLOSED" ? "Reopened" : "Published"} assignment “${a.title}”`, metadata: { assignmentId: id },
    })
  })
}

export async function deleteClassAssignment(ctx: Ctx, id: string) {
  need(ctx, "assignments.delete", "You don't have permission to delete assignments.")
  const { a, teacher } = await ownAssignment(ctx, id)
  await prisma.$transaction(async (tx) => {
    if (await tx.assignmentSubmission.count({ where: { assignmentId: id } })) {
      throw new ConflictError("Students have submitted work for this assignment. Close it instead of deleting it.")
    }
    await tx.classAssignment.delete({ where: { id } })
    await audit(tx, ctx, { action: "class_assignment.delete", entityType: "teacher", entityId: teacher.id, summary: `Deleted assignment “${a.title}”`, metadata: { assignmentId: id } })
  })
}

// ------------------------------------------------------------ one assignment

// The assignment with every enrolled student and their submission, for the
// teacher who set it or academic heads.
export async function getClassAssignment(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  const a = await prisma.classAssignment.findFirst({
    where: { id, organizationId },
    select: { ...listSelect, academicYear: { select: { name: true } } },
  })
  if (!a) throw new NotFoundError("Assignment not found.")
  const teacher = await myTeacher(ctx)
  const isOwner = !!teacher && teacher.id === a.teacherId
  if (!isOwner && !overseesTeaching(ctx)) throw new NotFoundError("Assignment not found.")

  const [enrollments, submissions] = await Promise.all([
    prisma.enrollment.findMany({
      where: { organizationId, academicYearId: a.academicYearId, classId: a.classId, ...(a.sectionId && { sectionId: a.sectionId }), status: { in: [...ENROLLED] } },
      orderBy: [{ section: { name: "asc" } }, { rollNumber: "asc" }, { student: { firstName: "asc" } }],
      select: { rollNumber: true, section: { select: { name: true } }, student: { select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true } } },
    }),
    prisma.assignmentSubmission.findMany({
      where: { organizationId, assignmentId: id },
      select: { id: true, studentId: true, submittedAt: true, content: true, fileName: true, recordedById: true, status: true, marks: true, feedback: true, reviewedAt: true },
    }),
  ])
  const byStudent = new Map(submissions.map((s) => [s.studentId, { ...s, marks: s.marks === null ? null : Number(s.marks), late: s.submittedAt > a.dueAt }]))
  // Submissions from students who have since left the class still show.
  const enrolledIds = new Set(enrollments.map((e) => e.student.id))
  const leftIds = submissions.map((s) => s.studentId).filter((sid) => !enrolledIds.has(sid))
  const left = leftIds.length
    ? await prisma.student.findMany({ where: { id: { in: leftIds }, organizationId }, select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true } })
    : []
  const students = [
    ...enrollments.map((e) => ({ student: e.student, rollNumber: e.rollNumber, sectionName: e.section?.name ?? null, enrolled: true, submission: byStudent.get(e.student.id) ?? null })),
    ...left.map((s) => ({ student: s, rollNumber: null, sectionName: null, enrolled: false, submission: byStudent.get(s.id) ?? null })),
  ]
  return {
    assignment: { ...a, maxMarks: a.maxMarks === null ? null : Number(a.maxMarks) },
    students,
    isOwner,
    canGrade: isOwner && hasPermission(ctx, "assignments.grade"),
    canEdit: isOwner && hasPermission(ctx, "assignments.update"),
    summary: {
      students: enrollments.length,
      submitted: submissions.length,
      awaitingReview: submissions.filter((s) => s.status === "SUBMITTED").length,
      reviewed: submissions.filter((s) => s.status === "REVIEWED").length,
      late: [...byStudent.values()].filter((s) => s.late).length,
    },
  }
}

export type ClassAssignmentDetail = Awaited<ReturnType<typeof getClassAssignment>>

// Work handed in on paper, recorded by the teacher for an enrolled student.
export async function recordSubmission(ctx: Ctx, id: string, raw: unknown) {
  need(ctx, "assignments.grade", "You don't have permission to record submissions.")
  const input = recordSubmissionSchema.parse(raw)
  const { a, teacher } = await ownAssignment(ctx, id)
  if (a.status === "DRAFT") throw new ConflictError("Publish the assignment before recording submissions.")
  const enrolled = await prisma.enrollment.findFirst({
    where: { organizationId: ctx.organization.id, studentId: input.studentId, academicYearId: a.academicYearId, classId: a.classId, ...(a.sectionId && { sectionId: a.sectionId }), status: { in: [...ENROLLED] } },
    select: { student: { select: { firstName: true, lastName: true } } },
  })
  if (!enrolled) throw new ValidationError({ studentId: ["This student isn't enrolled in the class."] })
  // The unique constraint below still guards against two requests at once.
  if (await prisma.assignmentSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId: input.studentId } }, select: { id: true } })) {
    throw new ConflictError("This student's work is already recorded.")
  }
  const submittedOn = input.submittedOn ?? localDate()
  if (submittedOn > localDate()) throw new ValidationError({ submittedOn: ["The date can't be in the future."] })
  // Only the day is known for paper work: today's is recorded now; work
  // from the due day counts as on time; other days at midday.
  const dueDay = localDate(a.dueAt)
  const submittedAt = submittedOn === localDate() ? new Date() : submittedOn === dueDay ? a.dueAt : atLocalTime(submittedOn, "12:00")
  try {
    await prisma.$transaction(async (tx) => {
      await tx.assignmentSubmission.create({
        data: { organizationId: ctx.organization.id, assignmentId: id, studentId: input.studentId, submittedAt, content: input.content, recordedById: ctx.user.id },
      })
      await audit(tx, ctx, {
        action: "submission.record", entityType: "teacher", entityId: teacher.id,
        summary: `Recorded ${enrolled.student.firstName} ${enrolled.student.lastName}'s work for “${a.title}”`, metadata: { assignmentId: id, studentId: input.studentId },
      })
    })
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new ConflictError("This student's work is already recorded.")
    throw error
  }
}

export async function reviewSubmission(ctx: Ctx, id: string, submissionId: string, raw: unknown) {
  need(ctx, "assignments.grade", "You don't have permission to review work.")
  const input = reviewSubmissionSchema.parse(raw)
  const { a, teacher } = await ownAssignment(ctx, id)
  if (input.marks !== null && a.maxMarks !== null && input.marks > Number(a.maxMarks)) {
    throw new ValidationError({ marks: [`Marks can't be more than ${Number(a.maxMarks)}.`] })
  }
  const submission = await prisma.assignmentSubmission.findFirst({ where: { id: submissionId, assignmentId: id, organizationId: ctx.organization.id }, select: { id: true, studentId: true } })
  if (!submission) throw new NotFoundError("Submission not found.")
  await prisma.$transaction(async (tx) => {
    await tx.assignmentSubmission.update({
      where: { id: submissionId },
      data: { status: input.status, marks: input.marks, feedback: input.feedback, reviewedAt: new Date(), reviewedById: ctx.user.id },
    })
    await audit(tx, ctx, {
      action: "submission.review", entityType: "teacher", entityId: teacher.id,
      summary: `${input.status === "RETURNED" ? "Returned" : "Reviewed"} work for “${a.title}”`, metadata: { assignmentId: id, submissionId, studentId: submission.studentId },
    })
  })
}

// A signed link to a submitted file: for the student who submitted it, the
// teacher who set the work, or academic heads. Anyone else: "not found".
export async function submissionFileUrl(ctx: Ctx, assignmentId: string, submissionId: string) {
  const s = await prisma.assignmentSubmission.findFirst({
    where: { id: submissionId, assignmentId, organizationId: ctx.organization.id },
    select: { storagePath: true, fileName: true, student: { select: { userId: true } }, assignment: { select: { teacherId: true } } },
  })
  if (!s?.storagePath) throw new NotFoundError("File not found.")
  const own = s.student.userId === ctx.user.id
  const teacher = own ? null : await myTeacher(ctx)
  if (!own && !overseesTeaching(ctx) && teacher?.id !== s.assignment.teacherId) throw new NotFoundError("File not found.")
  return signedUrl(s.storagePath, 60, s.fileName ?? undefined)
}
