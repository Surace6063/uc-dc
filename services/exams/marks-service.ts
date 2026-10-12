import "server-only"

import { toHundredths, type RulesSnapshot } from "@/features/exams/calculation"
import { EDITABLE_SHEET_STATUSES, EXAM_STATUS_LABELS, SHEET_STATUS_LABELS } from "@/features/exams/constants"
import { saveMarksSchema, sheetScopeSchema } from "@/features/exams/schemas"
import { fullName } from "@/features/students/constants"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { MarkStatus, Prisma } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { fromDate } from "@/lib/validation"
import { myAssignments } from "@/services/attendance/access-service"
import { audit } from "@/services/audit/audit-service"
import { assertCanEnterMarks, canManageMarks, canReviewMarks, mayEnterMarks } from "@/services/exams/access-service"
import { eligibleEnrollments, rollOrder } from "@/services/exams/eligibility"
import { sheetProgress } from "@/services/exams/examination-service"
import { examRules, loadSubjects, subjectInclude, subjectTakenBy, toSubjectConfig } from "@/services/exams/rules-service"

// Marks entry: one sheet is one examination subject for one section (or the
// whole class). Marks are written only while the examination is scheduled
// (or under revision) and the sheet is a draft or was returned; submitted
// sheets change only after a reviewer returns them, and from the first
// submission on every changed mark is kept in StudentMarkHistory.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma

const OPEN_EXAM = ["SCHEDULED", "REVISION"] as const

function fieldError(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] }, message)
}

async function resolveSheet(db: Db, ctx: Pick<AuthContext, "organization">, scope: { examinationSubjectId: string; sectionId: string | null }) {
  const organizationId = ctx.organization.id
  const subject = await db.examinationSubject.findFirst({
    where: { id: scope.examinationSubjectId, organizationId },
    include: { ...subjectInclude, examination: true },
  })
  if (!subject) throw new NotFoundError("Subject not found in this examination.")
  let section: { id: string; name: string } | null = null
  if (scope.sectionId) {
    section = await db.section.findFirst({ where: { id: scope.sectionId, classId: subject.classId, organizationId }, select: { id: true, name: true } })
    if (!section) fieldError("sectionId", "Choose a section of this class.")
    if (!subjectTakenBy(subject, subject.classId, section.id)) fieldError("sectionId", `${subject.subjectOffering.subject.name} isn't taught in section ${section.name}.`)
  }
  const exam = subject.examination
  const sheet = await db.marksSheet.findFirst({ where: { examinationSubjectId: subject.id, sectionId: section?.id ?? null, organizationId } })
  return {
    exam,
    subject,
    section,
    sheet,
    target: { academicYearId: exam.academicYearId, classId: subject.classId, sectionId: section?.id ?? null, subjectId: subject.subjectOffering.subjectId },
  }
}

async function sheetStudents(db: Db, organizationId: string, r: Awaited<ReturnType<typeof resolveSheet>>) {
  const all = await eligibleEnrollments(db, organizationId, r.exam, { classIds: [r.subject.classId], sectionIds: [r.section?.id ?? null] })
  return new Map([...all].filter(([, e]) => subjectTakenBy(r.subject, e.classId, e.sectionId)))
}

const hasClasslessStudents = async (db: Db, organizationId: string, r: Awaited<ReturnType<typeof resolveSheet>>) =>
  r.section !== null || (await db.section.count({ where: { classId: r.subject.classId, organizationId } })) === 0 || (await sheetStudents(db, organizationId, r)).size > 0

// ----------------------------------------------------------------- loading

export async function getMarksSheet(ctx: Ctx, rawScope: unknown) {
  const scope = sheetScopeSchema.parse(rawScope)
  const organizationId = ctx.organization.id
  const r = await resolveSheet(prisma, ctx, scope)
  const canEnter = await mayEnterMarks(ctx, r.target)
  if (!canEnter && !canReviewMarks(ctx)) throw new ForbiddenError("You can only open marks for subjects you teach.")
  if (!r.section && !(await hasClasslessStudents(prisma, organizationId, r))) fieldError("sectionId", "Choose a section.")

  const [enrollments, marks, remarks, { rules }] = await Promise.all([
    sheetStudents(prisma, organizationId, r),
    r.sheet ? prisma.studentMark.findMany({ where: { marksSheetId: r.sheet.id, organizationId } }) : [],
    prisma.markRemark.findMany({ where: { organizationId, examinationSubjectId: r.subject.id } }),
    examRules(prisma, organizationId, r.exam),
  ])
  // Students with marks here but no longer placed in this class/section.
  const formerIds = [...new Set(marks.map((m) => m.studentId))].filter((id) => !enrollments.has(id))
  const former = formerIds.length
    ? await prisma.student.findMany({
        where: { id: { in: formerIds }, organizationId },
        select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true },
      })
    : []
  const marksBy = new Map<string, Record<string, { status: MarkStatus; marks: number | null }>>()
  for (const m of marks) {
    const row = marksBy.get(m.studentId) ?? {}
    row[m.componentId] = { status: m.status, marks: toHundredths(m.marksObtained) }
    marksBy.set(m.studentId, row)
  }
  const remarkBy = new Map(remarks.map((x) => [x.studentId, x]))
  const students = [
    ...[...enrollments.values()].map((e) => ({ student: e.student, rollNumber: e.rollNumber, sectionName: e.section?.name ?? null, eligible: true })),
    ...former.map((s) => ({ student: s, rollNumber: null, sectionName: null, eligible: false })),
  ]
    .map(({ student, rollNumber, sectionName, eligible }) => ({
      studentId: student.id,
      name: fullName(student),
      admissionNumber: student.admissionNumber,
      rollNumber,
      sectionName,
      eligible,
      marks: marksBy.get(student.id) ?? {},
      remark: remarkBy.get(student.id)?.remark ?? null,
      internalNote: remarkBy.get(student.id)?.internalNote ?? null,
    }))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || rollOrder(a.rollNumber, b.rollNumber) || a.name.localeCompare(b.name))

  const examOpen = (OPEN_EXAM as readonly string[]).includes(r.exam.status)
  const sheetEditable = !r.sheet || EDITABLE_SHEET_STATUSES.includes(r.sheet.status)
  const config = toSubjectConfig(r.subject)
  // Previews use the same calculation as results, without grace marks
  // (which depend on the student's other subjects).
  const previewRules: RulesSnapshot = { ...rules, policy: { ...rules.policy, graceMarksPerSubject: null, graceMaxSubjects: 0 } }
  return {
    scope,
    exam: { id: r.exam.id, name: r.exam.name, status: r.exam.status, startDate: fromDate(r.exam.startDate), endDate: fromDate(r.exam.endDate) },
    title: [r.subject.class.name, r.section ? `Section ${r.section.name}` : null, r.subject.subjectOffering.subject.name].filter(Boolean).join(" · "),
    // The calculation engine's view of the subject, for previews.
    config,
    subject: {
      id: config.id,
      name: config.name,
      isCompulsory: config.isCompulsory,
      maxText: r.subject.maximumMarks.toString(),
      passText: r.subject.passMarks?.toString() ?? null,
      components: r.subject.components.map((c) => ({
        id: c.id, name: c.name, type: c.componentType, max: toHundredths(c.maximumMarks), pass: toHundredths(c.passMarks), weight: toHundredths(c.weightage),
      })),
    },
    sheet: r.sheet
      ? {
          id: r.sheet.id,
          status: r.sheet.status,
          updatedAt: r.sheet.updatedAt.toISOString(),
          submittedAt: r.sheet.submittedAt,
          firstSubmittedAt: r.sheet.firstSubmittedAt,
          returnNote: r.sheet.returnNote,
        }
      : null,
    students,
    previewRules,
    canEdit: canEnter && examOpen && sheetEditable,
    // Why the grid is read-only, if it is.
    readOnlyReason: !canEnter
      ? "You can review these marks but not change them."
      : !examOpen
        ? `The examination is ${EXAM_STATUS_LABELS[r.exam.status].toLowerCase()}; marks entry is closed.`
        : !sheetEditable
          ? `These marks are ${SHEET_STATUS_LABELS[r.sheet!.status].toLowerCase()}. A reviewer must return them before they can change.`
          : null,
    needsReason: !!r.sheet?.firstSubmittedAt,
  }
}

export type MarksSheetData = Awaited<ReturnType<typeof getMarksSheet>>

// --------------------------------------------------------------- saving

export async function saveMarks(ctx: Ctx, raw: unknown) {
  const input = saveMarksSchema.parse(raw)
  const organizationId = ctx.organization.id
  const ids = input.entries.map((e) => e.studentId)
  if (new Set(ids).size !== ids.length) fieldError("entries", "A student appears twice.")

  return prisma
    .$transaction(async (tx) => {
      const r = await resolveSheet(tx, ctx, input.scope)
      if (!(OPEN_EXAM as readonly string[]).includes(r.exam.status)) {
        throw new ConflictError(`${r.exam.name} is ${EXAM_STATUS_LABELS[r.exam.status].toLowerCase()}; marks entry is closed.`)
      }
      await assertCanEnterMarks(ctx, r.target, tx)

      // Serialise saves to one sheet, then check nobody saved since the grid loaded.
      let sheet = r.sheet
      if (sheet) {
        await tx.$queryRaw`SELECT id FROM marks_sheets WHERE id = ${sheet.id}::uuid FOR UPDATE`
        sheet = await tx.marksSheet.findUniqueOrThrow({ where: { id: sheet.id } })
      }
      if (sheet && sheet.id !== input.sheetId) throw new ConflictError("Someone else has started these marks. Reload to see them.")
      if (!sheet && input.sheetId) throw new ConflictError("These marks no longer exist. Reload the page.")
      if (sheet && input.expectedUpdatedAt && sheet.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new ConflictError("These marks were changed by someone else after you opened them. Reload to see the latest.")
      }
      if (sheet && !EDITABLE_SHEET_STATUSES.includes(sheet.status)) {
        throw new ConflictError(`These marks are ${SHEET_STATUS_LABELS[sheet.status].toLowerCase()} and can't be changed until a reviewer returns them.`)
      }
      if (!r.section && !(await hasClasslessStudents(tx, organizationId, r))) fieldError("sectionId", "Choose a section.")
      if (!sheet) {
        sheet = await tx.marksSheet.create({
          data: {
            organizationId, examinationId: r.exam.id, examinationSubjectId: r.subject.id, classId: r.subject.classId,
            sectionId: r.section?.id ?? null, createdById: ctx.user.id,
          },
        })
      }

      const components = new Map(r.subject.components.map((c) => [c.id, { ...c, max: toHundredths(c.maximumMarks) }]))
      const enrollments = await sheetStudents(tx, organizationId, r)
      const existing = await tx.studentMark.findMany({ where: { marksSheetId: sheet.id, organizationId } })
      const existingBy = new Map(existing.map((m) => [`${m.studentId}:${m.componentId}`, m]))

      // Validate every cell first; report all problems at once.
      const errors: Record<string, string[]> = {}
      type Change = { studentId: string; componentId: string; status: MarkStatus | null; marks: number | null }
      const changes: Change[] = []
      input.entries.forEach((entry, i) => {
        const enrolled = enrollments.has(entry.studentId)
        entry.marks.forEach((cell, j) => {
          const path = `entries.${i}.marks.${j}`
          const component = components.get(cell.componentId)
          if (!component) return void (errors[path] = ["This component isn't part of the subject."])
          if (cell.status === "SCORED") {
            if (cell.marks === null) return void (errors[path] = ["Enter the marks."])
            const h = Math.round(cell.marks * 100)
            if (Math.abs(cell.marks * 100 - h) > 1e-6) return void (errors[path] = ["Use at most 2 decimals."])
            if (h > component.max) return void (errors[path] = [`Above the full marks (${component.maximumMarks.toString()}).`])
          } else if (cell.marks !== null) {
            return void (errors[path] = ["Marks can only be given with the “scored” status."])
          }
          const current = existingBy.get(`${entry.studentId}:${cell.componentId}`)
          const marks = cell.status === "SCORED" ? Math.round(cell.marks! * 100) : null
          const same = current ? current.status === cell.status && toHundredths(current.marksObtained) === marks : cell.status === null
          if (same) return
          if (!enrolled && cell.status !== null) return void (errors[path] = ["This student isn't placed in this class or section during the examination."])
          changes.push({ studentId: entry.studentId, componentId: cell.componentId, status: cell.status, marks })
        })
      })
      if (Object.keys(errors).length) throw new ValidationError(errors, "Some marks need attention.")
      if (sheet.firstSubmittedAt && changes.length > 0 && !input.reason) {
        throw new ValidationError({ reason: ["Give a reason for changing marks that were already submitted."] }, "Give a reason for changing marks that were already submitted.")
      }

      let created = 0
      let updated = 0
      let cleared = 0
      const history: Prisma.StudentMarkHistoryCreateManyInput[] = []
      for (const c of changes) {
        const current = existingBy.get(`${c.studentId}:${c.componentId}`)
        if (c.status === null) {
          if (current) {
            await tx.studentMark.delete({ where: { id: current.id } })
            cleared++
          }
        } else if (current) {
          await tx.studentMark.update({ where: { id: current.id }, data: { status: c.status, marksObtained: c.marks === null ? null : c.marks / 100, enteredById: ctx.user.id } })
          updated++
        } else {
          await tx.studentMark.create({
            data: {
              organizationId, examinationId: r.exam.id, examinationSubjectId: r.subject.id, componentId: c.componentId, marksSheetId: sheet.id,
              studentId: c.studentId, enrollmentId: enrollments.get(c.studentId)!.id, status: c.status,
              marksObtained: c.marks === null ? null : c.marks / 100, enteredById: ctx.user.id,
            },
          })
          created++
        }
        if (sheet.firstSubmittedAt) {
          history.push({
            organizationId, examinationId: r.exam.id, componentId: c.componentId, studentId: c.studentId,
            fromStatus: current?.status ?? null, fromMarks: current?.marksObtained ?? null,
            toStatus: c.status, toMarks: c.marks === null ? null : c.marks / 100,
            reason: input.reason!, changedById: ctx.user.id,
          })
        }
      }
      if (history.length) await tx.studentMarkHistory.createMany({ data: history })

      // Remarks: shared (report card) and internal (staff only).
      const remarks = await tx.markRemark.findMany({ where: { organizationId, examinationSubjectId: r.subject.id, studentId: { in: ids } } })
      const remarkBy = new Map(remarks.map((x) => [x.studentId, x]))
      for (const entry of input.entries) {
        const current = remarkBy.get(entry.studentId)
        if ((current?.remark ?? null) === entry.remark && (current?.internalNote ?? null) === entry.internalNote) continue
        if (!enrollments.has(entry.studentId) && (entry.remark || entry.internalNote)) continue
        if (!entry.remark && !entry.internalNote) {
          if (current) await tx.markRemark.delete({ where: { id: current.id } })
        } else if (current) {
          await tx.markRemark.update({ where: { id: current.id }, data: { remark: entry.remark, internalNote: entry.internalNote, updatedById: ctx.user.id } })
        } else {
          await tx.markRemark.create({
            data: { organizationId, examinationSubjectId: r.subject.id, studentId: entry.studentId, remark: entry.remark, internalNote: entry.internalNote, updatedById: ctx.user.id },
          })
        }
      }

      // Submission needs every component of every student who takes the subject.
      if (input.submit) {
        const after = await tx.studentMark.groupBy({ by: ["studentId"], where: { marksSheetId: sheet.id, organizationId }, _count: { _all: true } })
        const countBy = new Map(after.map((a) => [a.studentId, a._count._all]))
        const comps = components.size
        const incomplete = [...enrollments.values()].filter((e) => {
          const n = countBy.get(e.studentId) ?? 0
          return r.subject.isCompulsory ? n < comps : n > 0 && n < comps
        })
        if (incomplete.length) {
          const names = incomplete.slice(0, 5).map((e) => fullName(e.student)).join(", ")
          fieldError("entries", `Marks are missing for ${incomplete.length} student${incomplete.length === 1 ? "" : "s"} (${names}${incomplete.length > 5 ? "…" : ""}). Enter marks or a status (AB, EX, INC, WH) for every component.`)
        }
        if (after.length === 0) fieldError("entries", "Enter marks before submitting.")
      }

      const now = new Date()
      sheet = await tx.marksSheet.update({
        where: { id: sheet.id },
        data: {
          updatedAt: now,
          ...(input.submit && {
            status: "SUBMITTED",
            submittedAt: now,
            submittedById: ctx.user.id,
            firstSubmittedAt: sheet.firstSubmittedAt ?? now,
            verifiedAt: null,
            verifiedById: null,
            approvedAt: null,
            approvedById: null,
          }),
        },
      })
      const label = [r.subject.class.name, r.section ? `Section ${r.section.name}` : null, r.subject.subjectOffering.subject.name].filter(Boolean).join(" · ")
      await audit(tx, ctx, {
        action: input.submit ? "exam.marks.submit" : "exam.marks.save",
        entityType: "marks_sheet",
        entityId: sheet.id,
        summary: `${input.submit ? "Submitted" : "Saved"} marks for ${label} (${r.exam.name})`,
        metadata: { examinationId: r.exam.id, created, updated, cleared, ...(input.reason && { reason: input.reason }) },
      })
      return { sheetId: sheet.id, status: sheet.status, updatedAt: sheet.updatedAt.toISOString(), created, updated, cleared }
    })
    .catch((error) => {
      if (isUniqueViolation(error, "marks_sheets")) throw new ConflictError("Someone else has just started these marks. Reload to see them.")
      if (isUniqueViolation(error, "student_marks")) throw new ConflictError("Some marks were just saved by someone else. Reload and try again.")
      throw error
    })
}

// ------------------------------------------------------------ picking

// Examinations open for marks and, for the chosen one, the sheets the
// caller may enter (teachers) or review (reviewers, managers).
export async function marksPicker(ctx: Ctx, examinationId?: string) {
  const organizationId = ctx.organization.id
  const seeAll = canManageMarks(ctx) || canReviewMarks(ctx)
  const assignments = seeAll || !hasPermission(ctx, "exams.grade") ? [] : await myAssignments(ctx)
  const exams = await prisma.examination.findMany({
    where: {
      organizationId,
      status: { in: ["SCHEDULED", "REVISION", "APPROVED", "PUBLISHED"] },
      ...(!seeAll && {
        OR: assignments
          .filter((a) => a.subjectId)
          .map((a) => ({ academicYearId: a.academicYearId, subjects: { some: { classId: a.classId!, subjectOffering: { subjectId: a.subjectId! } } } })),
      }),
    },
    orderBy: [{ startDate: "desc" }],
    take: 50,
    select: { id: true, name: true, status: true, academicYear: { select: { name: true } } },
  })
  if (!seeAll && assignments.length === 0) return { exams: [], sheets: [], examinationId: null }
  const chosen = exams.find((e) => e.id === examinationId) ?? exams.find((e) => e.status === "SCHEDULED" || e.status === "REVISION") ?? exams[0]
  if (!chosen) return { exams, sheets: [], examinationId: null }
  const exam = await prisma.examination.findUniqueOrThrow({ where: { id: chosen.id } })
  const subjects = await loadSubjects(prisma, organizationId, exam.id)
  const progress = await sheetProgress(prisma, organizationId, exam, subjects)
  const subjectOf = new Map(subjects.map((s) => [s.id, s.subjectOffering.subjectId]))
  const sheets = seeAll
    ? progress
    : progress.filter((p) =>
        assignments.some(
          (a) => a.academicYearId === exam.academicYearId && a.classId === p.classId && a.subjectId === subjectOf.get(p.examinationSubjectId) && (a.sectionId === null || a.sectionId === p.sectionId)
        )
      )
  return { exams, sheets, examinationId: chosen.id }
}
