import "server-only"

import { randomUUID } from "node:crypto"

import type { GuardianNotificationChannel } from "@/features/guardians/notifications"
import { SHEET_STATUS_LABELS, sheetLabel } from "@/features/exams/constants"
import type { SheetFilters } from "@/features/exams/filters"
import { holdSchema, publishSchema, returnSheetsSchema, revisionSchema, sheetIdsSchema, transitionSchema } from "@/features/exams/schemas"
import { fullName } from "@/features/students/constants"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { Prisma, type MarksSheetStatus } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { audit } from "@/services/audit/audit-service"
import { requireAnyPermission } from "@/services/exams/access-service"
import { findExam } from "@/services/exams/examination-service"
import { calculateExam, publicationCheck, toBreakdown } from "@/services/exams/result-service"
import { currentRules } from "@/services/exams/rules-service"
import { deliverGuardianNotice, resolveGuardianRecipients } from "@/services/guardians/notification-service"

// The review workflow, enforced here on every transition (and, for marks
// themselves, by a database trigger):
//
//   sheet:  DRAFT/RETURNED --submit--> SUBMITTED --verify--> VERIFIED
//           --approve--> APPROVED; reviewers can return SUBMITTED/VERIFIED
//           sheets, approvers also APPROVED ones (while results aren't
//           approved). The policy can skip verification and can stop
//           people from verifying or approving marks they submitted.
//   exam:   SCHEDULED/REVISION --approve--> APPROVED --publish--> PUBLISHED
//           --open revision--> REVISION; approval can be revoked before
//           publication.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma

// No delivery channel (SMS, email, app) is configured yet; notices report
// recipients as unreached instead of claiming anything was sent.
const CHANNELS: readonly GuardianNotificationChannel[] = []

const OPEN_EXAM = ["SCHEDULED", "REVISION"]

type Skipped = { sheetId: string; label: string; reason: string }

async function loadSheets(db: Db, ctx: Ctx, ids: string[]) {
  const sheets = await db.marksSheet.findMany({
    where: { id: { in: ids }, organizationId: ctx.organization.id },
    include: {
      examination: { select: { id: true, name: true, status: true, resultPolicy: { select: { requireVerification: true, separateReviewer: true } } } },
      examinationSubject: { select: { subjectOffering: { select: { subject: { select: { name: true } } } }, class: { select: { name: true } } } },
      section: { select: { name: true } },
    },
  })
  if (sheets.length !== new Set(ids).size) throw new NotFoundError("Some marks sheets weren't found.")
  return sheets.map((s) => ({
    ...s,
    label: `${sheetLabel({ className: s.examinationSubject.class.name, sectionName: s.section?.name ?? null, subjectName: s.examinationSubject.subjectOffering.subject.name })} (${s.examination.name})`,
  }))
}

async function transition(
  ctx: Ctx,
  raw: unknown,
  kind: "verify" | "approve" | "return"
): Promise<{ done: number; skipped: Skipped[] }> {
  if (kind === "verify") requireAnyPermission(ctx, "exams.review")
  else if (kind === "approve") requireAnyPermission(ctx, "exams.approve")
  else requireAnyPermission(ctx, "exams.review", "exams.approve")
  const input = kind === "return" ? returnSheetsSchema.parse(raw) : sheetIdsSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const sheets = await loadSheets(tx, ctx, input.sheetIds)
    const skipped: Skipped[] = []
    const ok: typeof sheets = []
    for (const s of sheets) {
      const policy = s.examination.resultPolicy
      const skip = (reason: string) => skipped.push({ sheetId: s.id, label: s.label, reason })
      if (!OPEN_EXAM.includes(s.examination.status)) {
        skip(s.examination.status === "APPROVED" ? "Results are approved; revoke the approval first." : "The examination isn't open for marks.")
        continue
      }
      const own = s.submittedById === ctx.user.id
      if (kind === "verify") {
        if (s.status !== "SUBMITTED") skip(`It is ${SHEET_STATUS_LABELS[s.status].toLowerCase()}, not submitted.`)
        else if (policy.separateReviewer && own) skip("You submitted these marks; someone else must verify them.")
        else ok.push(s)
      } else if (kind === "approve") {
        const ready: MarksSheetStatus[] = policy.requireVerification ? ["VERIFIED"] : ["SUBMITTED", "VERIFIED"]
        if (!ready.includes(s.status)) skip(policy.requireVerification && s.status === "SUBMITTED" ? "It must be verified before approval." : `It is ${SHEET_STATUS_LABELS[s.status].toLowerCase()}.`)
        else if (policy.separateReviewer && own) skip("You submitted these marks; someone else must approve them.")
        else ok.push(s)
      } else {
        const returnable: MarksSheetStatus[] = hasPermission(ctx, "exams.approve") ? ["SUBMITTED", "VERIFIED", "APPROVED"] : ["SUBMITTED", "VERIFIED"]
        if (!returnable.includes(s.status)) skip(s.status === "APPROVED" ? "Only an approver can return approved marks." : `It is ${SHEET_STATUS_LABELS[s.status].toLowerCase()}; there is nothing to return.`)
        else ok.push(s)
      }
    }
    const now = new Date()
    for (const s of ok) {
      const data: Prisma.MarksSheetUpdateInput =
        kind === "verify"
          ? { status: "VERIFIED", verifiedAt: now, verifiedById: ctx.user.id }
          : kind === "approve"
            ? { status: "APPROVED", approvedAt: now, approvedById: ctx.user.id }
            : { status: "RETURNED", returnedAt: now, returnedById: ctx.user.id, returnNote: input.note, verifiedAt: null, verifiedById: null, approvedAt: null, approvedById: null }
      // Conditional on the status read above, so a concurrent change fails.
      const updated = await tx.marksSheet.updateMany({ where: { id: s.id, status: s.status }, data: data as Prisma.MarksSheetUpdateManyMutationInput })
      if (updated.count !== 1) throw new ConflictError(`${s.label} changed while you were reviewing it. Reload and try again.`)
    }
    if (ok.length) {
      await audit(
        tx,
        ctx,
        ok.map((s) => ({
          action: `exam.marks.${kind}`,
          entityType: "marks_sheet",
          entityId: s.id,
          summary: `${kind === "verify" ? "Verified" : kind === "approve" ? "Approved" : "Returned"} marks for ${s.label}`,
          metadata: { examinationId: s.examinationId, ...(input.note && { note: input.note }) },
        }))
      )
    }
    return { done: ok.length, skipped }
  })
}

export const verifySheets = (ctx: Ctx, raw: unknown) => transition(ctx, raw, "verify")
export const approveSheets = (ctx: Ctx, raw: unknown) => transition(ctx, raw, "approve")
export const returnSheets = (ctx: Ctx, raw: unknown) => transition(ctx, raw, "return")

// ------------------------------------------------------- examination level

async function lockExam(tx: TransactionClient, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM examinations WHERE id = ${id}::uuid AND organization_id = ${ctx.organization.id}::uuid FOR UPDATE`
  return findExam(tx, ctx, id)
}

// Approves the results: every expected marks sheet approved, no student
// with missing marks, a valid configuration. Takes the rules snapshot on
// first approval; revisions keep the snapshot results were published with.
export async function approveExamination(ctx: Ctx, raw: unknown) {
  requireAnyPermission(ctx, "exams.approve")
  const { examinationId } = transitionSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const exam = await lockExam(tx, ctx, examinationId)
    if (!OPEN_EXAM.includes(exam.status)) throw new ConflictError("Only scheduled examinations (or ones under revision) can have their results approved.")
    const rules = exam.rulesSnapshot ? null : await currentRules(tx, ctx.organization.id, exam)
    if (rules) await tx.examination.update({ where: { id: exam.id }, data: { rulesSnapshot: rules as unknown as Prisma.InputJsonValue } })
    const check = await publicationCheck(ctx, examinationId, tx)
    if (check.errors.length) throw new ValidationError({ approval: check.errors }, check.errors[0])
    await tx.examination.update({ where: { id: exam.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: ctx.user.id } })
    await audit(tx, ctx, {
      action: "exam.approve", entityType: "examination", entityId: exam.id,
      summary: `Approved the results of ${exam.name} (${check.summary.students} students)`,
      metadata: { counts: check.summary.counts, warnings: check.warnings },
    })
    return check
  }, { timeout: 60_000 })
}

export async function revokeApproval(ctx: Ctx, raw: unknown) {
  requireAnyPermission(ctx, "exams.approve")
  const { examinationId, reason } = transitionSchema.parse(raw)
  if (!reason) throw new ValidationError({ reason: ["Give a reason."] })
  return prisma.$transaction(async (tx) => {
    const exam = await lockExam(tx, ctx, examinationId)
    if (exam.status !== "APPROVED") throw new ConflictError("These results aren't approved.")
    const published = (await tx.resultPublication.count({ where: { examinationId, status: "ACTIVE" } })) > 0
    await tx.examination.update({
      where: { id: exam.id },
      // Before the first publication the snapshot is retaken at the next approval.
      data: { status: published ? "REVISION" : "SCHEDULED", approvedAt: null, approvedById: null, ...(!published && { rulesSnapshot: Prisma.DbNull }) },
    })
    await audit(tx, ctx, { action: "exam.approval.revoke", entityType: "examination", entityId: exam.id, summary: `Revoked the approval of ${exam.name}`, metadata: { reason } })
  })
}

// Publishes the approved results as a new immutable version (superseding
// the previous one), then prepares guardian notices.
export async function publishResults(ctx: Ctx, raw: unknown) {
  requireAnyPermission(ctx, "exams.publish")
  const input = publishSchema.parse(raw)
  const organizationId = ctx.organization.id
  const published = await prisma
    .$transaction(
      async (tx) => {
        const exam = await lockExam(tx, ctx, input.examinationId)
        if (exam.status !== "APPROVED") throw new ConflictError("Results must be approved before they're published.")
        if (!exam.rulesSnapshot) throw new ConflictError("The approval has no rules snapshot. Revoke and approve again.")
        const previous = await tx.resultPublication.findFirst({ where: { examinationId: exam.id, status: "ACTIVE" } })
        if (previous && !input.reason) throw new ValidationError({ reason: ["Explain what this revised version corrects."] })
        const check = await publicationCheck(ctx, exam.id, tx)
        if (check.errors.length) throw new ValidationError({ publication: check.errors }, check.errors[0])

        const { rows, rules } = await calculateExam(tx, ctx, exam.id)
        if (previous) await tx.resultPublication.update({ where: { id: previous.id }, data: { status: "SUPERSEDED", supersededAt: new Date() } })
        const publication = await tx.resultPublication.create({
          data: {
            organizationId, examinationId: exam.id, version: (previous?.version ?? 0) + 1, reason: input.reason, publishedById: ctx.user.id,
            rulesSnapshot: rules as unknown as Prisma.InputJsonValue,
            summary: { students: rows.length, counts: check.summary.counts, passRate: check.summary.passRate } as Prisma.InputJsonValue,
          },
        })
        const results: Prisma.StudentResultCreateManyInput[] = []
        const subjects: Prisma.StudentSubjectResultCreateManyInput[] = []
        for (const r of rows) {
          const id = randomUUID()
          const c = r.calculation
          results.push({
            id, organizationId, publicationId: publication.id, examinationId: exam.id, studentId: r.studentId, enrollmentId: r.enrollmentId,
            academicYearId: exam.academicYearId, classId: r.classId, sectionId: r.sectionId, status: c.status,
            totalObtained: c.totalObtained === null ? null : c.totalObtained / 100,
            totalMaximum: c.totalMaximum === null ? null : c.totalMaximum / 100,
            percentage: c.percentage === null ? null : c.percentage / 10_000,
            grade: c.grade, gradePoint: c.gradePoint === null ? null : c.gradePoint / 100,
            gpa: c.gpa === null ? null : c.gpa / 10_000, rank: r.rank,
            breakdown: toBreakdown(r, rules) as unknown as Prisma.InputJsonValue,
          })
          // Withheld results keep no per-subject figures outside the breakdown.
          for (const s of c.status === "WITHHELD" ? [] : c.subjects) {
            if (s.status === "NOT_TAKEN") continue
            subjects.push({
              organizationId, publicationId: publication.id, resultId: id, examinationSubjectId: s.examinationSubjectId, subjectId: s.subjectId,
              classId: r.classId, sectionId: r.sectionId, isCompulsory: s.isCompulsory, status: s.status,
              obtained: s.obtained === null ? null : s.obtained / 100, maximum: s.maximum === null ? null : s.maximum / 100,
              percentage: s.percentage === null ? null : s.percentage / 10_000, grade: s.grade,
              gradePoint: s.gradePoint === null ? null : s.gradePoint / 100,
            })
          }
        }
        for (let i = 0; i < results.length; i += 1000) await tx.studentResult.createMany({ data: results.slice(i, i + 1000) })
        for (let i = 0; i < subjects.length; i += 2000) await tx.studentSubjectResult.createMany({ data: subjects.slice(i, i + 2000) })
        await tx.examination.update({ where: { id: exam.id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: ctx.user.id } })
        await audit(tx, ctx, {
          action: previous ? "exam.publish.revision" : "exam.publish",
          entityType: "examination",
          entityId: exam.id,
          summary: `Published ${previous ? `revised results (version ${publication.version})` : "results"} of ${exam.name} for ${rows.length} students`,
          metadata: { publicationId: publication.id, version: publication.version, counts: check.summary.counts, ...(input.reason && { reason: input.reason }), ...(check.changedFromPrevious !== null && { changed: check.changedFromPrevious }) },
        })
        return { publicationId: publication.id, version: publication.version, students: rows.length, examName: exam.name, studentIds: rows.map((r) => r.studentId), revision: !!previous }
      },
      { timeout: 120_000 }
    )
    .catch((error) => {
      if (isUniqueViolation(error, "result_publications")) throw new ConflictError("These results were just published by someone else.")
      throw error
    })

  // Notices never hold up or undo a publication.
  const notices = input.notifyGuardians ? await noticePublication(ctx, published).catch((error) => (console.error(error), null)) : null
  return { ...published, notices }
}

async function noticePublication(ctx: Ctx, p: { publicationId: string; examName: string; studentIds: string[]; revision: boolean }) {
  const claimed = await prisma.resultPublication.updateMany({ where: { id: p.publicationId, organizationId: ctx.organization.id, notifiedAt: null }, data: { notifiedAt: new Date() } })
  if (claimed.count === 0) return null
  const recipients = await resolveGuardianRecipients(ctx, { studentIds: p.studentIds, category: "academic" })
  const students = new Map(
    (await prisma.student.findMany({ where: { id: { in: p.studentIds }, organizationId: ctx.organization.id }, select: { id: true, firstName: true, middleName: true, lastName: true } })).map((s) => [s.id, fullName(s)])
  )
  let sent = 0
  let unreached = 0
  for (const recipient of recipients) {
    // Each guardian hears only about their own children; marks stay in the portal.
    const names = recipient.studentIds.map((id) => students.get(id)).filter(Boolean).join(", ")
    const result = await deliverGuardianNotice(
      [recipient],
      {
        category: "academic",
        title: p.revision ? `Revised results: ${p.examName}` : `Results published: ${p.examName}`,
        body: `${p.revision ? "Revised results" : "Results"} of ${p.examName} for ${names} are available in the parent portal.`,
      },
      CHANNELS
    )
    sent += result.sent
    unreached += result.unreached.length
  }
  await audit(prisma, ctx, {
    action: "exam.notice.publication", entityType: "examination", entityId: null,
    summary: `Prepared result notices for ${recipients.length} guardian${recipients.length === 1 ? "" : "s"} (${sent} sent, ${unreached} not reached: no delivery channel configured)`,
    metadata: { publicationId: p.publicationId },
  })
  return { recipients: recipients.length, sent, unreached }
}

// Starts a correction of published results. The published version stays
// visible until a revised one is published; the chosen sheets go back to
// their teachers, and every change is recorded with its reason.
export async function openRevision(ctx: Ctx, raw: unknown) {
  requireAnyPermission(ctx, "exams.approve")
  const input = revisionSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const exam = await lockExam(tx, ctx, input.examinationId)
    if (exam.status !== "PUBLISHED") throw new ConflictError("Only published results can be revised.")
    if (input.sheetIds.length) {
      const sheets = await tx.marksSheet.findMany({ where: { id: { in: input.sheetIds }, examinationId: exam.id, organizationId: ctx.organization.id } })
      if (sheets.length !== new Set(input.sheetIds).size) throw new NotFoundError("Some marks sheets aren't part of this examination.")
      await tx.marksSheet.updateMany({
        where: { id: { in: input.sheetIds } },
        data: { status: "RETURNED", returnedAt: new Date(), returnedById: ctx.user.id, returnNote: input.reason, verifiedAt: null, verifiedById: null, approvedAt: null, approvedById: null },
      })
    }
    await tx.examination.update({ where: { id: exam.id }, data: { status: "REVISION", approvedAt: null, approvedById: null } })
    await audit(tx, ctx, {
      action: "exam.revision.open", entityType: "examination", entityId: exam.id,
      summary: `Opened a correction of the published results of ${exam.name}${input.sheetIds.length ? ` (${input.sheetIds.length} marks sheet${input.sheetIds.length === 1 ? "" : "s"} returned)` : ""}`,
      metadata: { reason: input.reason, sheetIds: input.sheetIds },
    })
  })
}

// ------------------------------------------------------------------ holds

const HOLD_STATES = ["SCHEDULED", "APPROVED", "REVISION"]

export async function placeHold(ctx: Ctx, raw: unknown) {
  requireAnyPermission(ctx, "exams.approve", "exams.publish")
  const input = holdSchema.parse(raw)
  return prisma
    .$transaction(async (tx) => {
      const exam = await findExam(tx, ctx, input.examinationId)
      if (!HOLD_STATES.includes(exam.status)) throw new ConflictError(exam.status === "PUBLISHED" ? "Open a revision to withhold a published result." : "Results can't be withheld at this stage.")
      const student = await tx.student.findFirst({ where: { id: input.studentId, organizationId: ctx.organization.id }, select: { firstName: true, middleName: true, lastName: true } })
      if (!student) throw new NotFoundError("Student not found.")
      if (await tx.resultHold.findFirst({ where: { examinationId: exam.id, studentId: input.studentId, releasedAt: null }, select: { id: true } })) {
        throw new ConflictError("This result is already withheld.")
      }
      const hold = await tx.resultHold.create({ data: { organizationId: ctx.organization.id, examinationId: exam.id, studentId: input.studentId, reason: input.reason, createdById: ctx.user.id } })
      await audit(tx, ctx, { action: "exam.hold.place", entityType: "examination", entityId: exam.id, summary: `Withheld the result of ${fullName(student)} in ${exam.name}`, metadata: { reason: input.reason } })
      return hold
    })
    .catch((error) => {
      if (isUniqueViolation(error, "result_holds")) throw new ConflictError("This result is already withheld.")
      throw error
    })
}

export async function releaseHold(ctx: Ctx, holdId: string) {
  requireAnyPermission(ctx, "exams.approve", "exams.publish")
  return prisma.$transaction(async (tx) => {
    const hold = await tx.resultHold.findFirst({
      where: { id: holdId, organizationId: ctx.organization.id, releasedAt: null },
      include: { examination: { select: { id: true, name: true, status: true } }, student: { select: { firstName: true, middleName: true, lastName: true } } },
    })
    if (!hold) throw new NotFoundError("Hold not found.")
    if (!HOLD_STATES.includes(hold.examination.status)) throw new ConflictError("Open a revision to release a published hold.")
    await tx.resultHold.update({ where: { id: hold.id }, data: { releasedAt: new Date(), releasedById: ctx.user.id } })
    await audit(tx, ctx, { action: "exam.hold.release", entityType: "examination", entityId: hold.examinationId, summary: `Released the hold on ${fullName(hold.student)}'s result in ${hold.examination.name}` })
  })
}

// ----------------------------------------------------------- review queue

export async function listReviewSheets(ctx: Ctx, filters: SheetFilters) {
  if (!hasPermission(ctx, "exams.review") && !hasPermission(ctx, "exams.approve") && !hasPermission(ctx, "exams.marks.manage")) {
    throw new ForbiddenError("You don't review marks.")
  }
  const organizationId = ctx.organization.id
  const status: MarksSheetStatus[] =
    filters.status === "ACTION"
      ? hasPermission(ctx, "exams.approve") && !hasPermission(ctx, "exams.review")
        ? ["VERIFIED", "SUBMITTED"]
        : ["SUBMITTED", "VERIFIED"]
      : [filters.status as MarksSheetStatus]
  const where: Prisma.MarksSheetWhereInput = {
    organizationId,
    status: { in: status },
    examination: { status: { in: ["SCHEDULED", "REVISION", "APPROVED", "PUBLISHED"] } },
    ...(filters.exam && { examinationId: filters.exam }),
    ...(filters.class && { classId: filters.class }),
  }
  const [total, rows] = await Promise.all([
    prisma.marksSheet.count({ where }),
    prisma.marksSheet.findMany({
      where,
      orderBy: [{ submittedAt: "asc" }, { updatedAt: "asc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        examination: { select: { id: true, name: true, status: true, resultPolicy: { select: { requireVerification: true, separateReviewer: true } } } },
        examinationSubject: { select: { id: true, subjectOffering: { select: { subject: { select: { name: true } } } }, class: { select: { name: true } } } },
        section: { select: { name: true } },
        _count: { select: { marks: true } },
      },
    }),
  ])
  const userIds = [...new Set(rows.flatMap((r) => [r.submittedById, r.verifiedById]).filter((v): v is string => !!v))]
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]))
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      examinationId: r.examinationId,
      examName: r.examination.name,
      examOpen: OPEN_EXAM.includes(r.examination.status),
      examinationSubjectId: r.examinationSubjectId,
      sectionId: r.sectionId,
      label: sheetLabel({ className: r.examinationSubject.class.name, sectionName: r.section?.name ?? null, subjectName: r.examinationSubject.subjectOffering.subject.name }),
      status: r.status,
      marks: r._count.marks,
      submittedAt: r.submittedAt,
      submittedBy: r.submittedById ? (users.get(r.submittedById) ?? null) : null,
      verifiedBy: r.verifiedById ? (users.get(r.verifiedById) ?? null) : null,
      mine: r.submittedById === ctx.user.id,
      requireVerification: r.examination.resultPolicy.requireVerification,
      separateReviewer: r.examination.resultPolicy.separateReviewer,
    })),
  }
}

export type ReviewSheetRow = Awaited<ReturnType<typeof listReviewSheets>>["rows"][number]
