import "server-only"

import { randomUUID } from "node:crypto"

import { MATERIAL_MAX_BYTES, MATERIAL_MIME_TYPES } from "@/features/teaching/constants"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { EXTENSIONS, removeFiles, sniffMimeType, uploadFile } from "@/lib/supabase/storage"
import { optionalText } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"
import { myEnrollment, requireStudent, type Ctx, type MyEnrollment } from "@/services/student-portal/me-service"

// What a student studies: their class and teachers, subjects, timetable,
// the materials shared with them and the work set for them. Everything is
// limited to the student's own class (and section) in their enrollment year.

// Records for the student's class: whole-class rows, or their section's.
const forClass = (e: MyEnrollment) => ({
  academicYearId: e.academicYearId,
  classId: e.classId,
  OR: [{ sectionId: null }, ...(e.sectionId ? [{ sectionId: e.sectionId }] : [])],
})

const teacherName = (t: { firstName: string; lastName: string }) => `${t.firstName} ${t.lastName}`

// ------------------------------------------------------------ class and subjects

export async function myClassInfo(ctx: Ctx) {
  const e = await myEnrollment(ctx)
  if (!e) return null
  const assignments = await prisma.teacherAssignment.findMany({
    where: { organizationId: ctx.organization.id, status: "ACTIVE", ...forClass(e), teacher: { archivedAt: null } },
    select: { role: true, subject: { select: { id: true, name: true } }, teacher: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
  })
  const classTeachers = assignments.filter((a) => a.role === "CLASS_TEACHER" || a.role === "CO_TEACHER")
  const classmates = await prisma.enrollment.count({ where: { organizationId: ctx.organization.id, academicYearId: e.academicYearId, classId: e.classId, ...(e.sectionId && { sectionId: e.sectionId }), status: { in: ["ACTIVE", "ON_HOLD"] } } })
  return {
    enrollment: e,
    classTeachers: [...new Map(classTeachers.map((a) => [a.teacher.id, { name: teacherName(a.teacher), email: a.teacher.email, phone: a.teacher.phone, role: a.role }])).values()],
    classmates,
  }
}

// The subjects offered to the student's class (and section) this year, with
// who teaches each. Electives are listed for the whole section: the system
// doesn't record which elective each student chose.
export async function mySubjects(ctx: Ctx) {
  const e = await myEnrollment(ctx)
  if (!e) return []
  const organizationId = ctx.organization.id
  const offerings = await prisma.subjectOffering.findMany({
    where: {
      organizationId, academicYearId: e.academicYearId, classId: e.classId, status: "ACTIVE",
      OR: [{ sections: { none: {} } }, ...(e.sectionId ? [{ sections: { some: { sectionId: e.sectionId } } }] : [])],
    },
    orderBy: [{ requirement: "asc" }, { subject: { name: "asc" } }],
    select: { id: true, code: true, creditHours: true, weeklyPeriods: true, requirement: true, subject: { select: { id: true, name: true, code: true } } },
  })
  const teachers = await prisma.teacherAssignment.findMany({
    where: { organizationId, status: "ACTIVE", ...forClass(e), subjectId: { in: offerings.map((o) => o.subject.id) }, teacher: { archivedAt: null } },
    select: { subjectId: true, teacher: { select: { id: true, firstName: true, lastName: true } } },
  })
  return offerings.map((o) => ({
    ...o,
    teachers: [...new Map(teachers.filter((t) => t.subjectId === o.subject.id).map((t) => [t.teacher.id, teacherName(t.teacher)])).values()],
  }))
}

export type StudentSubject = Awaited<ReturnType<typeof mySubjects>>[number]

// ------------------------------------------------------------ timetable

export async function myTimetable(ctx: Ctx) {
  const e = await myEnrollment(ctx)
  if (!e) return []
  return prisma.timetableSlot.findMany({
    where: { organizationId: ctx.organization.id, ...forClass(e) },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    select: {
      id: true, dayOfWeek: true, startTime: true, endTime: true, room: true, sectionId: true,
      subject: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
  })
}

export type StudentSlot = Awaited<ReturnType<typeof myTimetable>>[number]

// ------------------------------------------------------------ materials

export async function myMaterials(ctx: Ctx, filters: { q?: string; subject?: string; page: number; pageSize: number }) {
  const e = await myEnrollment(ctx)
  if (!e) return { rows: [], total: 0 }
  // AND keeps the class/section condition and the search's OR separate.
  const where: Prisma.TeachingMaterialWhereInput = {
    AND: [
      { organizationId: ctx.organization.id, sharedWithStudents: true, ...forClass(e) },
      filters.subject ? { subjectId: filters.subject } : {},
      filters.q ? { OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { description: { contains: filters.q, mode: "insensitive" } }] } : {},
    ],
  }
  const [total, rows] = await Promise.all([
    prisma.teachingMaterial.count({ where }),
    prisma.teachingMaterial.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true, title: true, description: true, kind: true, fileName: true, sizeBytes: true, createdAt: true,
        subject: { select: { id: true, name: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
    }),
  ])
  return { rows, total }
}

export type StudentMaterial = Awaited<ReturnType<typeof myMaterials>>["rows"][number]

// May this student open this material? (Shared with their class.)
export async function studentMayOpenMaterial(ctx: Ctx, m: { sharedWithStudents: boolean; academicYearId: string; classId: string; sectionId: string | null }) {
  if (!m.sharedWithStudents) return false
  const e = await myEnrollment(ctx)
  return !!e && e.academicYearId === m.academicYearId && e.classId === m.classId && (m.sectionId === null || m.sectionId === e.sectionId)
}

// ------------------------------------------------------------ assignments

const submissionSelect = { id: true, status: true, submittedAt: true, content: true, fileName: true, marks: true, feedback: true, reviewedAt: true, recordedById: true } as const

// Published and closed work set for the student's class, with their own
// submission. Drafts are never shown.
export async function myAssignments(ctx: Ctx, filters: { status?: "pending" | "submitted" | "reviewed" | "overdue"; subject?: string; q?: string }) {
  const student = await requireStudent(ctx).catch(() => null)
  const e = await myEnrollment(ctx)
  if (!student || !e) return []
  const rows = await prisma.classAssignment.findMany({
    where: {
      organizationId: ctx.organization.id, status: { in: ["PUBLISHED", "CLOSED"] }, ...forClass(e),
      ...(filters.subject && { subjectId: filters.subject }),
      ...(filters.q && { title: { contains: filters.q, mode: "insensitive" } }),
    },
    orderBy: [{ dueAt: "desc" }],
    take: 200,
    select: {
      id: true, title: true, dueAt: true, maxMarks: true, status: true, publishedAt: true,
      subject: { select: { id: true, name: true } },
      teacher: { select: { firstName: true, lastName: true } },
      submissions: { where: { studentId: student.id }, select: submissionSelect },
    },
  })
  const now = new Date()
  const list = rows.map(({ submissions, ...a }) => {
    const s = submissions[0] ?? null
    const state: "pending" | "overdue" | "submitted" | "returned" | "reviewed" =
      s?.status === "REVIEWED" ? "reviewed" : s?.status === "RETURNED" ? "returned" : s ? "submitted" : a.dueAt < now ? "overdue" : "pending"
    return {
      ...a,
      maxMarks: a.maxMarks === null ? null : Number(a.maxMarks),
      submission: s ? { ...s, marks: s.marks === null ? null : Number(s.marks), late: s.submittedAt > a.dueAt } : null,
      state,
      // Work can be handed in while the assignment is open; returned work
      // can be handed in again.
      canSubmit: a.status === "PUBLISHED" && (!s || s.status !== "REVIEWED"),
    }
  })
  return list.filter((a) =>
    !filters.status ? true
    : filters.status === "pending" ? a.state === "pending" || a.state === "returned"
    : filters.status === "submitted" ? a.state === "submitted"
    : filters.status === "reviewed" ? a.state === "reviewed"
    : a.state === "overdue"
  )
}

export type StudentAssignment = Awaited<ReturnType<typeof myAssignments>>[number]

export async function getMyAssignment(ctx: Ctx, id: string) {
  const student = await requireStudent(ctx)
  const e = await myEnrollment(ctx)
  if (!e) throw new NotFoundError("Assignment not found.")
  const a = await prisma.classAssignment.findFirst({
    where: { id, organizationId: ctx.organization.id, status: { in: ["PUBLISHED", "CLOSED"] }, ...forClass(e) },
    select: {
      id: true, title: true, instructions: true, dueAt: true, maxMarks: true, status: true,
      subject: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
      submissions: { where: { studentId: student.id }, select: submissionSelect },
    },
  })
  if (!a) throw new NotFoundError("Assignment not found.")
  const { submissions, ...rest } = a
  const s = submissions[0] ?? null
  return {
    ...rest,
    maxMarks: rest.maxMarks === null ? null : Number(rest.maxMarks),
    submission: s ? { ...s, marks: s.marks === null ? null : Number(s.marks), late: s.submittedAt > rest.dueAt } : null,
    canSubmit: rest.status === "PUBLISHED" && (!s || s.status !== "REVIEWED"),
  }
}

export type StudentAssignmentDetail = Awaited<ReturnType<typeof getMyAssignment>>

async function readUpload(file: unknown) {
  if (!(file instanceof File) || file.size === 0) return null
  if (file.size > MATERIAL_MAX_BYTES) throw new ValidationError({ file: [`The file must be ${MATERIAL_MAX_BYTES / 1024 / 1024} MB or smaller.`] })
  const body = await file.arrayBuffer()
  const mimeType = sniffMimeType(new Uint8Array(body.slice(0, 16)))
  if (!mimeType || !(MATERIAL_MIME_TYPES as readonly string[]).includes(mimeType)) throw new ValidationError({ file: ["Upload a PDF or an image (JPG, PNG or WebP)."] })
  return { body, mimeType, name: file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file" }
}

// Hand in (or hand in again) the student's own work: a note and/or a file.
// Allowed while the assignment is published and the work isn't reviewed.
export async function submitMyAssignment(ctx: Ctx, id: string, form: FormData) {
  const student = await requireStudent(ctx)
  const assignment = await getMyAssignment(ctx, id)
  if (assignment.status !== "PUBLISHED") throw new ConflictError("This assignment is closed for submissions.")
  if (assignment.submission?.status === "REVIEWED") throw new ConflictError("Your work has already been reviewed.")
  const raw = form.get("content")
  const content = optionalText(5000).parse(typeof raw === "string" ? raw : "")
  const upload = await readUpload(form.get("file"))
  if (!content && !upload && !assignment.submission?.fileName) throw new ValidationError({ content: ["Write your answer or attach a file."] })

  const previous = await prisma.assignmentSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId: student.id } }, select: { id: true, storagePath: true } })
  let path: string | null = null
  if (upload) {
    path = `${ctx.organization.id}/students/${student.id}/submissions/${randomUUID()}.${EXTENSIONS[upload.mimeType]}`
    await uploadFile(path, upload.body, upload.mimeType)
  }
  const file = upload && path ? { storagePath: path, fileName: upload.name, mimeType: upload.mimeType, sizeBytes: upload.body.byteLength } : {}
  try {
    await prisma.$transaction(async (tx) => {
      const data = { content, submittedAt: new Date(), status: "SUBMITTED" as const, recordedById: null, ...file }
      if (previous) await tx.assignmentSubmission.update({ where: { id: previous.id }, data })
      else await tx.assignmentSubmission.create({ data: { ...data, organizationId: ctx.organization.id, assignmentId: id, studentId: student.id } })
      await audit(tx, ctx, {
        action: previous ? "submission.resubmit" : "submission.submit", entityType: "student", entityId: student.id,
        summary: `${previous ? "Re-submitted" : "Submitted"} work for “${assignment.title}”`, metadata: { assignmentId: id },
      })
    })
  } catch (error) {
    if (path) await removeFiles([path])
    if ((error as { code?: string }).code === "P2002") throw new ConflictError("Your work was just submitted. Refresh the page.")
    throw error
  }
  // A replaced file is removed once the new one is recorded.
  if (path && previous?.storagePath) await removeFiles([previous.storagePath])
}
