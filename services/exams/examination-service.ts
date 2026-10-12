import "server-only"

import { MARK_SCALE, validateConfiguration } from "@/features/exams/calculation"
import { EXAM_STATUS_LABELS } from "@/features/exams/constants"
import { addSubjectsSchema, examinationSchema, examinationSubjectSchema, transitionSchema } from "@/features/exams/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { ExaminationStatus, MarksSheetStatus } from "@/lib/generated/prisma/enums"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { fromDate, toDate } from "@/lib/validation"
import { audit, listEntityActivity } from "@/services/audit/audit-service"
import { requireAnyPermission } from "@/services/exams/access-service"
import { eligibleEnrollments } from "@/services/exams/eligibility"
import { examRules, loadSubjects, subjectTakenBy, toSubjectConfig, type SubjectRow } from "@/services/exams/rules-service"

// Examinations: details, subjects and components, and the lifecycle around
// marks entry. The configuration (subjects, components, full and pass
// marks) is only edited while the examination is a draft; scheduling freezes
// it so marks are always entered against a fixed structure.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma

function fieldError(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

export async function findExam(db: Db, ctx: Pick<AuthContext, "organization">, id: string) {
  const exam = await db.examination.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!exam) throw new NotFoundError("Examination not found.")
  return exam
}

// ------------------------------------------------------------------ details

async function checkReferences(db: Db, organizationId: string, input: ReturnType<typeof examinationSchema.parse>) {
  const [year, type, scale, policy, level, program] = await Promise.all([
    db.academicYear.findFirst({ where: { id: input.academicYearId, organizationId }, select: { id: true, name: true, startDate: true, endDate: true, status: true } }),
    db.assessmentType.findFirst({ where: { id: input.assessmentTypeId, organizationId }, select: { id: true, isActive: true } }),
    db.gradingScale.findFirst({ where: { id: input.gradingScaleId, organizationId }, select: { id: true, status: true } }),
    db.resultPolicy.findFirst({ where: { id: input.resultPolicyId, organizationId }, select: { id: true, isActive: true } }),
    input.educationLevelId ? db.educationLevel.findFirst({ where: { id: input.educationLevelId, organizationId }, select: { id: true } }) : null,
    input.programId ? db.program.findFirst({ where: { id: input.programId, organizationId }, select: { id: true, educationLevelId: true } }) : null,
  ])
  if (!year) fieldError("academicYearId", "Choose a valid academic year.")
  if (year.status === "ARCHIVED") fieldError("academicYearId", `${year.name} is archived.`)
  if (!type) fieldError("assessmentTypeId", "Choose a valid assessment type.")
  if (!scale || scale.status === "RETIRED") fieldError("gradingScaleId", "Choose a grading scale that isn't retired.")
  if (!policy || !policy.isActive) fieldError("resultPolicyId", "Choose an active result policy.")
  if (input.educationLevelId && !level) fieldError("educationLevelId", "Choose a valid level.")
  if (input.programId && !program) fieldError("programId", "Choose a valid program.")
  if (program && input.educationLevelId && program.educationLevelId !== input.educationLevelId) fieldError("programId", "This program belongs to another level.")
  const start = fromDate(year.startDate)
  const end = fromDate(year.endDate)
  if (input.startDate < start || input.endDate > end) fieldError("startDate", `The examination must fall within ${year.name} (${start} to ${end}).`)
  return { year, type }
}

export async function saveExamination(ctx: Ctx, id: string | null, raw: unknown) {
  requireAnyPermission(ctx, id ? "exams.update" : "exams.create")
  const input = examinationSchema.parse(raw)
  const organizationId = ctx.organization.id
  const data = {
    ...input,
    startDate: toDate(input.startDate),
    endDate: toDate(input.endDate),
    resultPublicationDate: toDate(input.resultPublicationDate),
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const { type } = await checkReferences(tx, organizationId, input)
      // Checked here for a clear message; the unique index is the backstop.
      const clash = await tx.examination.findFirst({
        where: { organizationId, academicYearId: input.academicYearId, name: { equals: input.name, mode: "insensitive" }, ...(id && { id: { not: id } }) },
        select: { id: true },
      })
      if (clash) fieldError("name", "An examination with this name already exists in this academic year.")
      if (!id) {
        if (!type.isActive) fieldError("assessmentTypeId", "This assessment type is inactive.")
        const exam = await tx.examination.create({ data: { ...data, organizationId, createdById: ctx.user.id } })
        await audit(tx, ctx, { action: "exam.create", entityType: "examination", entityId: exam.id, summary: `Created examination ${exam.name}` })
        return exam
      }
      const current = await findExam(tx, ctx, id)
      if (!["DRAFT", "SCHEDULED"].includes(current.status)) {
        throw new ConflictError(`A ${EXAM_STATUS_LABELS[current.status].toLowerCase()} examination can't be edited.`)
      }
      if (current.status !== "DRAFT") {
        // Scheduled: marks may exist, so the scope and rules stay as they are.
        const frozen = (["academicYearId", "gradingScaleId", "resultPolicyId"] as const).filter((k) => input[k] !== current[k])
        if (frozen.length) throw new ConflictError("The academic year, grading scale and result policy can't change once the examination is scheduled.")
      }
      if (current.academicYearId !== input.academicYearId && (await tx.examinationSubject.count({ where: { examinationId: id } })) > 0) {
        fieldError("academicYearId", "Remove the subjects before moving the examination to another academic year.")
      }
      const exam = await tx.examination.update({ where: { id }, data })
      await audit(tx, ctx, { action: "exam.update", entityType: "examination", entityId: id, summary: `Updated examination ${exam.name}` })
      return exam
    })
  } catch (error) {
    if (isUniqueViolation(error)) fieldError("name", "An examination with this name already exists in this academic year.")
    throw error
  }
}

export async function deleteExamination(ctx: Ctx, id: string) {
  requireAnyPermission(ctx, "exams.update")
  return prisma.$transaction(async (tx) => {
    const exam = await findExam(tx, ctx, id)
    if (exam.status !== "DRAFT") throw new ConflictError("Only draft examinations can be deleted. Archive it instead.")
    if ((await tx.marksSheet.count({ where: { examinationId: id } })) > 0) throw new ConflictError("This examination has marks.")
    await tx.examination.delete({ where: { id } })
    await audit(tx, ctx, { action: "exam.delete", entityType: "examination", entityId: null, summary: `Deleted draft examination ${exam.name}` })
  })
}

// --------------------------------------------------------------- subjects

function assertDraft(exam: { status: ExaminationStatus }) {
  if (exam.status !== "DRAFT") throw new ConflictError("Subjects and components can only change while the examination is a draft.")
}

// Adds class subject offerings of the examination's year, each with the
// given component template (editable per subject afterwards).
export async function addExamSubjects(ctx: Ctx, raw: unknown) {
  requireAnyPermission(ctx, "exams.update")
  const input = addSubjectsSchema.parse(raw)
  const organizationId = ctx.organization.id
  const total = input.components.reduce((sum, c) => sum + Math.round(c.maximumMarks * MARK_SCALE), 0) / MARK_SCALE
  const weighted = input.components.filter((c) => c.weightage !== null)
  if (weighted.length && weighted.length !== input.components.length) fieldError("components", "Give every component a weightage, or none.")
  if (input.passMarks !== null && !weighted.length && input.passMarks > total) fieldError("passMarks", "Pass marks can't exceed full marks.")
  return prisma.$transaction(async (tx) => {
    const exam = await findExam(tx, ctx, input.examinationId)
    assertDraft(exam)
    const offerings = await tx.subjectOffering.findMany({
      where: { id: { in: input.offeringIds }, organizationId, academicYearId: exam.academicYearId },
      select: { id: true, classId: true, creditHours: true, requirement: true, status: true, subject: { select: { name: true, creditHours: true } } },
    })
    if (offerings.length !== new Set(input.offeringIds).size) fieldError("offeringIds", "Some subjects aren't offered in this examination's academic year.")
    const existing = new Set((await tx.examinationSubject.findMany({ where: { examinationId: exam.id }, select: { subjectOfferingId: true } })).map((s) => s.subjectOfferingId))
    const added: string[] = []
    for (const o of offerings) {
      if (existing.has(o.id)) continue
      const credit = o.creditHours ?? o.subject.creditHours
      const subject = await tx.examinationSubject.create({
        data: {
          organizationId, examinationId: exam.id, subjectOfferingId: o.id, classId: o.classId,
          maximumMarks: weighted.length ? 100 : total,
          passMarks: input.passMarks,
          creditHours: credit ?? null,
          isCompulsory: o.requirement === "COMPULSORY",
        },
      })
      await tx.assessmentComponent.createMany({
        data: input.components.map((c, i) => ({
          organizationId, examinationSubjectId: subject.id, name: c.name, componentType: c.componentType,
          maximumMarks: c.maximumMarks, passMarks: c.passMarks, weightage: c.weightage, sequence: i,
        })),
      })
      added.push(o.subject.name)
    }
    await audit(tx, ctx, {
      action: "exam.subject.add", entityType: "examination", entityId: exam.id,
      summary: `Added ${added.length} subject${added.length === 1 ? "" : "s"} to ${exam.name}`, metadata: { subjects: added },
    })
    return { added: added.length, skipped: offerings.length - added.length }
  })
}

export async function saveExamSubject(ctx: Ctx, examinationSubjectId: string, raw: unknown) {
  requireAnyPermission(ctx, "exams.update")
  const input = examinationSubjectSchema.parse(raw)
  const organizationId = ctx.organization.id
  const names = input.components.map((c) => c.name.toLowerCase())
  if (new Set(names).size !== names.length) fieldError("components", "Component names must be different.")
  input.components.forEach((c, i) => {
    if (c.passMarks !== null && c.passMarks > c.maximumMarks) throw new ValidationError({ [`components.${i}.passMarks`]: ["Can't exceed full marks."] })
  })
  const weighted = input.components.filter((c) => c.weightage !== null)
  if (weighted.length && weighted.length !== input.components.length) fieldError("components", "Give every component a weightage, or none.")
  if (weighted.length && Math.round(weighted.reduce((s, c) => s + (c.weightage ?? 0), 0) * 100) !== 10_000) fieldError("components", "Component weightages must add up to 100%.")
  if (!weighted.length) {
    const total = input.components.reduce((s, c) => s + Math.round(c.maximumMarks * MARK_SCALE), 0)
    if (total !== Math.round(input.maximumMarks * MARK_SCALE)) fieldError("maximumMarks", `Components add up to ${total / MARK_SCALE}; set full marks to match.`)
  }
  return prisma.$transaction(async (tx) => {
    const subject = await tx.examinationSubject.findFirst({
      where: { id: examinationSubjectId, organizationId },
      include: { examination: true, subjectOffering: { select: { subject: { select: { name: true } } } } },
    })
    if (!subject) throw new NotFoundError("Subject not found.")
    const exam = subject.examination
    if (input.examDate && (input.examDate < fromDate(exam.startDate) || input.examDate > fromDate(exam.endDate))) {
      fieldError("examDate", `The paper must be within the examination dates (${fromDate(exam.startDate)} to ${fromDate(exam.endDate)}).`)
    }
    const scheduleOnly = exam.status !== "DRAFT"
    if (scheduleOnly) {
      // Once scheduled only the timetable (date, time, venue, order) can change.
      if (!["SCHEDULED"].includes(exam.status)) throw new ConflictError("This examination can no longer be changed.")
      await tx.examinationSubject.update({
        where: { id: subject.id },
        data: { examDate: toDate(input.examDate), startTime: input.startTime, endTime: input.endTime, venue: input.venue, sequence: input.sequence },
      })
    } else {
      await tx.examinationSubject.update({
        where: { id: subject.id },
        data: {
          maximumMarks: input.maximumMarks, passMarks: input.passMarks, creditHours: input.creditHours, isCompulsory: input.isCompulsory,
          examDate: toDate(input.examDate), startTime: input.startTime, endTime: input.endTime, venue: input.venue, sequence: input.sequence,
        },
      })
      await tx.assessmentComponent.deleteMany({ where: { examinationSubjectId: subject.id } })
      await tx.assessmentComponent.createMany({
        data: input.components.map((c, i) => ({
          organizationId, examinationSubjectId: subject.id, name: c.name, componentType: c.componentType,
          maximumMarks: c.maximumMarks, passMarks: c.passMarks, weightage: c.weightage, sequence: i,
        })),
      })
    }
    await audit(tx, ctx, {
      action: scheduleOnly ? "exam.subject.schedule" : "exam.subject.update", entityType: "examination", entityId: exam.id,
      summary: `${scheduleOnly ? "Updated the timetable of" : "Updated"} ${subject.subjectOffering.subject.name} in ${exam.name}`,
      metadata: { maximumMarks: input.maximumMarks, passMarks: input.passMarks, components: input.components.map((c) => `${c.name} ${c.maximumMarks}`) },
    })
    return { scheduleOnly }
  })
}

export async function removeExamSubject(ctx: Ctx, examinationSubjectId: string) {
  requireAnyPermission(ctx, "exams.update")
  return prisma.$transaction(async (tx) => {
    const subject = await tx.examinationSubject.findFirst({
      where: { id: examinationSubjectId, organizationId: ctx.organization.id },
      include: { examination: true, subjectOffering: { select: { subject: { select: { name: true } } } } },
    })
    if (!subject) throw new NotFoundError("Subject not found.")
    assertDraft(subject.examination)
    await tx.examinationSubject.delete({ where: { id: subject.id } })
    await audit(tx, ctx, { action: "exam.subject.remove", entityType: "examination", entityId: subject.examinationId, summary: `Removed ${subject.subjectOffering.subject.name} from ${subject.examination.name}` })
  })
}

// ---------------------------------------------------------------- lifecycle

// Freezes the configuration and opens marks entry. The grading scale must
// be active (a verified scale) and the configuration must calculate.
export async function scheduleExamination(ctx: Ctx, raw: unknown) {
  requireAnyPermission(ctx, "exams.update")
  const { examinationId } = transitionSchema.parse(raw)
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const exam = await findExam(tx, ctx, examinationId)
    if (exam.status !== "DRAFT") throw new ConflictError("Only draft examinations can be scheduled.")
    const scale = await tx.gradingScale.findFirst({ where: { id: exam.gradingScaleId, organizationId }, select: { status: true, name: true } })
    if (scale?.status !== "ACTIVE") throw new ConflictError(`Activate the grading scale ${scale?.name ?? ""} first (scales are verified and activated in examination settings).`)
    const { rules } = await examRules(tx, organizationId, exam)
    const issues = validateConfiguration((await loadSubjects(tx, organizationId, exam.id)).map(toSubjectConfig), rules)
    if (issues.errors.length) throw new ValidationError({ configuration: issues.errors }, issues.errors[0])
    await tx.examination.update({ where: { id: exam.id }, data: { status: "SCHEDULED" } })
    await audit(tx, ctx, { action: "exam.schedule", entityType: "examination", entityId: exam.id, summary: `Scheduled ${exam.name}; marks entry is open`, metadata: { warnings: issues.warnings } })
    return { warnings: issues.warnings }
  })
}

export async function unscheduleExamination(ctx: Ctx, raw: unknown) {
  requireAnyPermission(ctx, "exams.update")
  const { examinationId } = transitionSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const exam = await findExam(tx, ctx, examinationId)
    if (exam.status !== "SCHEDULED") throw new ConflictError("Only scheduled examinations can go back to draft.")
    if ((await tx.marksSheet.count({ where: { examinationId } })) > 0) throw new ConflictError("Marks have already been entered, so the configuration can no longer change.")
    await tx.examination.update({ where: { id: examinationId }, data: { status: "DRAFT" } })
    await audit(tx, ctx, { action: "exam.unschedule", entityType: "examination", entityId: examinationId, summary: `Moved ${exam.name} back to draft` })
  })
}

export async function setExaminationArchived(ctx: Ctx, raw: unknown, archived: boolean) {
  requireAnyPermission(ctx, "exams.update")
  const { examinationId } = transitionSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const exam = await findExam(tx, ctx, examinationId)
    const published = (await tx.resultPublication.count({ where: { examinationId, status: "ACTIVE" } })) > 0
    if (archived) {
      if (!["DRAFT", "PUBLISHED"].includes(exam.status)) {
        throw new ConflictError("Only draft or published examinations can be archived; finish or cancel the marks workflow first.")
      }
      await tx.examination.update({ where: { id: examinationId }, data: { status: "ARCHIVED", archivedAt: new Date() } })
    } else {
      if (exam.status !== "ARCHIVED") throw new ConflictError("This examination isn't archived.")
      await tx.examination.update({ where: { id: examinationId }, data: { status: published ? "PUBLISHED" : "DRAFT", archivedAt: null } })
    }
    // Published results stay visible in the portals either way.
    await audit(tx, ctx, { action: archived ? "exam.archive" : "exam.restore", entityType: "examination", entityId: examinationId, summary: `${archived ? "Archived" : "Restored"} ${exam.name}` })
  })
}

// ------------------------------------------------------- marks progress

export type SheetProgress = {
  key: string
  examinationSubjectId: string
  subjectName: string
  subjectCode: string
  isCompulsory: boolean
  classId: string
  className: string
  sectionId: string | null
  sectionName: string | null
  students: number
  componentCount: number
  entered: number
  expected: number
  sheetId: string | null
  // Must be approved before results: compulsory subjects, and optional ones
  // once someone has started entering marks.
  required: boolean
  status: MarksSheetStatus | "NOT_STARTED"
  submittedAt: Date | null
  returnNote: string | null
  updatedAt: Date | null
}

// One row per expected marks sheet: each subject × each section (or whole
// class) that has eligible students taking it, plus any sheet that exists
// without students any more. Optional subjects expect marks only from
// students who have some.
export async function sheetProgress(
  db: Db,
  organizationId: string,
  exam: { id: string; academicYearId: string; startDate: Date; endDate: Date },
  subjects: SubjectRow[]
): Promise<SheetProgress[]> {
  if (subjects.length === 0) return []
  const enrollments = await eligibleEnrollments(db, organizationId, exam, { classIds: [...new Set(subjects.map((s) => s.classId))] })
  const [sheets, marked, sections] = await Promise.all([
    db.marksSheet.findMany({ where: { organizationId, examinationId: exam.id } }),
    db.studentMark.groupBy({ by: ["examinationSubjectId", "studentId"], where: { organizationId, examinationId: exam.id }, _count: { _all: true } }),
    db.section.findMany({ where: { organizationId, classId: { in: [...new Set(subjects.map((s) => s.classId))] } }, select: { id: true, name: true, sortOrder: true } }),
  ])
  const sectionInfo = new Map(sections.map((s) => [s.id, s]))
  const markCount = new Map(marked.map((m) => [`${m.examinationSubjectId}:${m.studentId}`, m._count._all]))
  const rows: SheetProgress[] = []
  for (const s of subjects) {
    const groups = new Map<string, { sectionId: string | null; students: string[] }>()
    for (const e of enrollments.values()) {
      if (!subjectTakenBy(s, e.classId, e.sectionId)) continue
      const k = e.sectionId ?? ""
      const g = groups.get(k) ?? { sectionId: e.sectionId, students: [] }
      g.students.push(e.studentId)
      groups.set(k, g)
    }
    for (const sheet of sheets.filter((x) => x.examinationSubjectId === s.id)) {
      if (!groups.has(sheet.sectionId ?? "")) groups.set(sheet.sectionId ?? "", { sectionId: sheet.sectionId, students: [] })
    }
    const comps = s.components.length
    for (const g of groups.values()) {
      const sheet = sheets.find((x) => x.examinationSubjectId === s.id && x.sectionId === g.sectionId) ?? null
      const counts = g.students.map((id) => markCount.get(`${s.id}:${id}`) ?? 0)
      const entered = counts.reduce((sum, n) => sum + n, 0)
      const takers = s.isCompulsory ? g.students.length : counts.filter((n) => n > 0).length
      rows.push({
        key: `${s.id}:${g.sectionId ?? ""}`,
        examinationSubjectId: s.id,
        subjectName: s.subjectOffering.subject.name,
        subjectCode: s.subjectOffering.code ?? s.subjectOffering.subject.code,
        isCompulsory: s.isCompulsory,
        classId: s.classId,
        className: s.class.name,
        sectionId: g.sectionId,
        sectionName: g.sectionId ? (sectionInfo.get(g.sectionId)?.name ?? null) : null,
        students: g.students.length,
        componentCount: comps,
        entered,
        expected: takers * comps,
        sheetId: sheet?.id ?? null,
        required: (s.isCompulsory && g.students.length > 0) || sheet !== null,
        status: sheet?.status ?? "NOT_STARTED",
        submittedAt: sheet?.submittedAt ?? null,
        returnNote: sheet?.status === "RETURNED" ? sheet.returnNote : null,
        updatedAt: sheet?.updatedAt ?? null,
      })
    }
  }
  return rows.sort(
    (a, b) =>
      a.className.localeCompare(b.className, undefined, { numeric: true }) ||
      (sectionInfo.get(a.sectionId ?? "")?.sortOrder ?? 0) - (sectionInfo.get(b.sectionId ?? "")?.sortOrder ?? 0) ||
      (a.sectionName ?? "").localeCompare(b.sectionName ?? "") ||
      a.subjectName.localeCompare(b.subjectName)
  )
}

// ------------------------------------------------------------------ detail

export async function getExaminationDetail(ctx: Pick<AuthContext, "organization">, id: string) {
  const organizationId = ctx.organization.id
  const exam = await prisma.examination.findFirst({
    where: { id, organizationId },
    include: {
      academicYear: { select: { id: true, name: true } },
      assessmentType: { select: { id: true, name: true, category: true } },
      educationLevel: { select: { id: true, name: true } },
      program: { select: { id: true, name: true } },
      gradingScale: { select: { id: true, name: true, version: true, status: true } },
      resultPolicy: { select: { id: true, name: true } },
      publications: { orderBy: { version: "desc" }, select: { id: true, version: true, status: true, reason: true, publishedAt: true, publishedById: true, supersededAt: true, notifiedAt: true, summary: true } },
      holds: { where: { releasedAt: null }, select: { id: true, reason: true, createdAt: true, student: { select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true } } } },
    },
  })
  if (!exam) throw new NotFoundError("Examination not found.")
  const subjects = await loadSubjects(prisma, organizationId, id)
  const [{ rules, snapshotted }, progress, activity] = await Promise.all([
    examRules(prisma, organizationId, exam),
    sheetProgress(prisma, organizationId, exam, subjects),
    listEntityActivity(ctx, "examination", id, 30),
  ])
  const issues = validateConfiguration(subjects.map(toSubjectConfig), rules)
  const userIds = [...new Set([exam.createdById, exam.approvedById, exam.publishedById, ...exam.publications.map((p) => p.publishedById)].filter((v): v is string => !!v))]
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]))
  return {
    exam: {
      ...exam,
      startDate: fromDate(exam.startDate),
      endDate: fromDate(exam.endDate),
      resultPublicationDate: exam.resultPublicationDate ? fromDate(exam.resultPublicationDate) : null,
      approvedByName: exam.approvedById ? (users.get(exam.approvedById) ?? null) : null,
      createdByName: exam.createdById ? (users.get(exam.createdById) ?? null) : null,
    },
    publications: exam.publications.map((p) => ({ ...p, publishedByName: p.publishedById ? (users.get(p.publishedById) ?? null) : null })),
    subjects: subjects.map((s) => ({
      id: s.id,
      offeringId: s.subjectOfferingId,
      name: s.subjectOffering.subject.name,
      code: s.subjectOffering.code ?? s.subjectOffering.subject.code,
      classId: s.classId,
      className: s.class.name,
      maximumMarks: s.maximumMarks.toString(),
      passMarks: s.passMarks?.toString() ?? null,
      creditHours: s.creditHours?.toString() ?? null,
      isCompulsory: s.isCompulsory,
      examDate: s.examDate ? fromDate(s.examDate) : null,
      startTime: s.startTime,
      endTime: s.endTime,
      venue: s.venue,
      sequence: s.sequence,
      sectionLimited: s.subjectOffering.sections.length > 0,
      components: s.components.map((c) => ({
        id: c.id, name: c.name, componentType: c.componentType, maximumMarks: c.maximumMarks.toString(),
        passMarks: c.passMarks?.toString() ?? null, weightage: c.weightage?.toString() ?? null,
      })),
    })),
    progress,
    rules,
    rulesSnapshotted: snapshotted,
    issues,
    activity,
  }
}

export type ExaminationDetail = Awaited<ReturnType<typeof getExaminationDetail>>

// Offerings of the examination's year that can still be added, by class.
export async function availableOfferings(ctx: Pick<AuthContext, "organization">, examinationId: string) {
  const organizationId = ctx.organization.id
  const exam = await prisma.examination.findFirst({ where: { id: examinationId, organizationId }, select: { academicYearId: true, educationLevelId: true, programId: true } })
  if (!exam) throw new NotFoundError("Examination not found.")
  const taken = new Set((await prisma.examinationSubject.findMany({ where: { examinationId }, select: { subjectOfferingId: true } })).map((s) => s.subjectOfferingId))
  const offerings = await prisma.subjectOffering.findMany({
    where: {
      organizationId, academicYearId: exam.academicYearId, status: "ACTIVE",
      class: { archivedAt: null, ...(exam.educationLevelId && { educationLevelId: exam.educationLevelId }), ...(exam.programId && { programId: exam.programId }) },
    },
    orderBy: [{ class: { sequence: "asc" } }, { subject: { name: "asc" } }],
    select: { id: true, requirement: true, code: true, class: { select: { id: true, name: true } }, subject: { select: { name: true, code: true } } },
  })
  return offerings
    .filter((o) => !taken.has(o.id))
    .map((o) => ({ id: o.id, classId: o.class.id, className: o.class.name, name: o.subject.name, code: o.code ?? o.subject.code, requirement: o.requirement }))
}
