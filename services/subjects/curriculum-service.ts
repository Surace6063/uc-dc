import "server-only"

import { randomUUID } from "node:crypto"

import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES } from "@/features/students/constants"
import {
  curriculumSchema,
  newVersionSchema,
  reorderSchema,
  topicSchema,
  unitSchema,
} from "@/features/subjects/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { EXTENSIONS, removeFiles, signedUrl, sniffMimeType, uploadFile } from "@/lib/supabase/storage"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"

// Versioned curricula (what should be taught): units/chapters and topics with
// objectives and estimated hours. Only drafts change; an active syllabus is
// changed by creating a new version, so offerings that used the old version
// keep it exactly. Lesson delivery belongs to the LMS, not here.
type Ctx = Pick<AuthContext, "organization" | "user">

function fieldError(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

const today = () => toDate(new Date().toISOString().slice(0, 10))

async function findCurriculum(db: TransactionClient | typeof prisma, ctx: Ctx, id: string) {
  const curriculum = await db.curriculum.findFirst({
    where: { id, organizationId: ctx.organization.id },
    include: { subject: { select: { id: true, name: true, archivedAt: true } } },
  })
  if (!curriculum) throw new NotFoundError("Curriculum not found.")
  return curriculum
}

async function requireDraft(db: TransactionClient | typeof prisma, ctx: Ctx, id: string) {
  const curriculum = await findCurriculum(db, ctx, id)
  if (curriculum.status !== "DRAFT") {
    throw new ConflictError("Only draft curricula can be changed. Create a new version to revise this syllabus.")
  }
  return curriculum
}

async function checkScope(db: TransactionClient, ctx: Ctx, input: { educationLevelId: string | null; programId: string | null }) {
  const organizationId = ctx.organization.id
  let educationLevelId = input.educationLevelId
  if (input.programId) {
    const program = await db.program.findFirst({ where: { id: input.programId, organizationId } })
    if (!program) fieldError("programId", "Choose a valid program.")
    if (educationLevelId && educationLevelId !== program.educationLevelId) {
      fieldError("programId", "This program belongs to a different education level.")
    }
    educationLevelId = program.educationLevelId
  }
  if (educationLevelId && !(await db.educationLevel.findFirst({ where: { id: educationLevelId, organizationId } }))) {
    fieldError("educationLevelId", "Choose a valid education level.")
  }
  return { educationLevelId, programId: input.programId }
}

const VERSION_TAKEN = "This subject already has a curriculum with this name and version."

// ---------------------------------------------------------------- reading

export async function getCurriculum(ctx: Pick<AuthContext, "organization">, id: string) {
  const organizationId = ctx.organization.id
  const curriculum = await prisma.curriculum.findFirst({
    where: { id, organizationId },
    include: {
      subject: { select: { id: true, name: true, code: true, archivedAt: true } },
      educationLevel: { select: { id: true, name: true } },
      program: { select: { id: true, name: true, code: true } },
      previousVersion: { select: { id: true, version: true } },
      nextVersions: { select: { id: true, version: true, status: true } },
      units: {
        orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
        include: { topics: { orderBy: [{ sequence: "asc" }, { createdAt: "asc" }] } },
      },
      offerings: {
        orderBy: { academicYear: { startDate: "desc" } },
        select: { id: true, academicYear: { select: { name: true } }, class: { select: { id: true, name: true } } },
      },
    },
  })
  if (!curriculum) return null
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  return {
    ...curriculum,
    effectiveFrom: iso(curriculum.effectiveFrom),
    effectiveTo: iso(curriculum.effectiveTo),
    createdAt: curriculum.createdAt.toISOString(),
    updatedAt: curriculum.updatedAt.toISOString(),
    units: curriculum.units.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
      topics: u.topics.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })),
    })),
  }
}

export type CurriculumDetail = NonNullable<Awaited<ReturnType<typeof getCurriculum>>>

// ------------------------------------------------------------- curricula

export async function createCurriculum(ctx: Ctx, subjectId: string, raw: unknown) {
  const input = curriculumSchema.parse(raw)
  const organizationId = ctx.organization.id
  try {
    return await prisma.$transaction(async (tx) => {
      const subject = await tx.subject.findFirst({ where: { id: subjectId, organizationId } })
      if (!subject) throw new NotFoundError("Subject not found.")
      if (subject.archivedAt) throw new ConflictError("Restore this subject before adding curricula.")
      const scope = await checkScope(tx, ctx, input)
      const curriculum = await tx.curriculum.create({
        data: {
          organizationId, subjectId, name: input.name, code: input.code, version: input.version,
          description: input.description, ...scope,
          effectiveFrom: toDate(input.effectiveFrom), effectiveTo: toDate(input.effectiveTo),
          createdById: ctx.user.id,
        },
      })
      await audit(tx, ctx, {
        action: "curriculum.create", entityType: "subject", entityId: subjectId,
        summary: `Created curriculum ${curriculum.name} (version ${curriculum.version})`,
        metadata: { curriculumId: curriculum.id },
      })
      return curriculum
    })
  } catch (error) {
    if (isUniqueViolation(error)) fieldError("version", VERSION_TAKEN)
    throw error
  }
}

// Drafts: everything. Active/retired: only the description and dates.
export async function updateCurriculum(ctx: Ctx, id: string, raw: unknown) {
  const input = curriculumSchema.parse(raw)
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await findCurriculum(tx, ctx, id)
      const data =
        current.status === "DRAFT"
          ? {
              name: input.name, code: input.code, version: input.version, description: input.description,
              ...(await checkScope(tx, ctx, input)),
              effectiveFrom: toDate(input.effectiveFrom), effectiveTo: toDate(input.effectiveTo),
            }
          : { description: input.description, effectiveFrom: toDate(input.effectiveFrom), effectiveTo: toDate(input.effectiveTo) }
      const updated = await tx.curriculum.update({ where: { id }, data })
      await audit(tx, ctx, {
        action: "curriculum.update", entityType: "subject", entityId: current.subjectId,
        summary: `Updated curriculum ${updated.name} (version ${updated.version})`, metadata: { curriculumId: id },
      })
      return updated
    })
  } catch (error) {
    if (isUniqueViolation(error)) fieldError("version", VERSION_TAKEN)
    throw error
  }
}

// A new draft version, optionally with a copy of every unit and topic.
export async function createCurriculumVersion(ctx: Ctx, id: string, raw: unknown) {
  const input = newVersionSchema.parse(raw)
  const organizationId = ctx.organization.id
  try {
    return await prisma.$transaction(async (tx) => {
      const source = await findCurriculum(tx, ctx, id)
      if (source.subject.archivedAt) throw new ConflictError("Restore this subject first.")
      const copy = await tx.curriculum.create({
        data: {
          organizationId, subjectId: source.subjectId, educationLevelId: source.educationLevelId, programId: source.programId,
          name: source.name, code: source.code, version: input.version, description: source.description,
          previousVersionId: source.id, createdById: ctx.user.id,
        },
      })
      if (input.copyContent) {
        const units = await tx.curriculumUnit.findMany({
          where: { curriculumId: source.id, organizationId },
          include: { topics: true },
          orderBy: { sequence: "asc" },
        })
        for (const unit of units) {
          const created = await tx.curriculumUnit.create({
            data: {
              organizationId, curriculumId: copy.id, title: unit.title, description: unit.description,
              sequence: unit.sequence, component: unit.component, estimatedHours: unit.estimatedHours,
              learningObjectives: unit.learningObjectives,
            },
          })
          if (unit.topics.length) {
            await tx.curriculumTopic.createMany({
              data: unit.topics.map((t) => ({
                organizationId, unitId: created.id, title: t.title, description: t.description, sequence: t.sequence,
                estimatedHours: t.estimatedHours, learningObjectives: t.learningObjectives,
              })),
            })
          }
        }
      }
      await audit(tx, ctx, {
        action: "curriculum.version", entityType: "subject", entityId: source.subjectId,
        summary: `Created version ${copy.version} of ${copy.name} from version ${source.version}`,
        metadata: { curriculumId: copy.id, from: source.id },
      })
      return copy
    })
  } catch (error) {
    if (isUniqueViolation(error)) fieldError("version", VERSION_TAKEN)
    throw error
  }
}

// Activating a draft retires the subject's other active version(s) of the
// same curriculum name; offerings keep pointing at whichever they used.
export async function activateCurriculum(ctx: Ctx, id: string) {
  return prisma.$transaction(async (tx) => {
    const curriculum = await requireDraft(tx, ctx, id)
    if (curriculum.subject.archivedAt) throw new ConflictError("Restore this subject first.")
    const units = await tx.curriculumUnit.count({ where: { curriculumId: id } })
    if (units === 0) throw new ConflictError("Add at least one unit before activating this curriculum.")
    const retired = await tx.curriculum.updateMany({
      where: { organizationId: ctx.organization.id, subjectId: curriculum.subjectId, name: curriculum.name, status: "ACTIVE", id: { not: id } },
      data: { status: "RETIRED" },
    })
    await tx.curriculum.updateMany({
      where: { organizationId: ctx.organization.id, subjectId: curriculum.subjectId, name: curriculum.name, status: "RETIRED", effectiveTo: null, id: { not: id } },
      data: { effectiveTo: today() },
    })
    await tx.curriculum.update({
      where: { id },
      data: { status: "ACTIVE", effectiveFrom: curriculum.effectiveFrom ?? today() },
    })
    await audit(tx, ctx, {
      action: "curriculum.activate", entityType: "subject", entityId: curriculum.subjectId,
      summary: `Activated ${curriculum.name} version ${curriculum.version}${retired.count ? ` (retired ${retired.count} earlier version)` : ""}`,
      metadata: { curriculumId: id },
    })
  })
}

export async function retireCurriculum(ctx: Ctx, id: string) {
  return prisma.$transaction(async (tx) => {
    const curriculum = await findCurriculum(tx, ctx, id)
    if (curriculum.status !== "ACTIVE") throw new ConflictError("Only an active curriculum can be retired.")
    await tx.curriculum.update({ where: { id }, data: { status: "RETIRED", effectiveTo: curriculum.effectiveTo ?? today() } })
    await audit(tx, ctx, {
      action: "curriculum.retire", entityType: "subject", entityId: curriculum.subjectId,
      summary: `Retired ${curriculum.name} version ${curriculum.version}`, metadata: { curriculumId: id },
    })
  })
}

// Only unused drafts can be deleted; anything else is history.
export async function deleteCurriculum(ctx: Ctx, id: string) {
  const curriculum = await prisma.$transaction(async (tx) => {
    const c = await requireDraft(tx, ctx, id)
    const used = await tx.subjectOffering.count({ where: { curriculumId: id } })
    if (used) throw new ConflictError("Offerings use this curriculum.")
    await tx.curriculum.update({ where: { id: c.id }, data: { previousVersionId: null } })
    await tx.curriculum.updateMany({ where: { previousVersionId: id }, data: { previousVersionId: c.previousVersionId } })
    await tx.curriculum.delete({ where: { id } })
    await audit(tx, ctx, {
      action: "curriculum.delete", entityType: "subject", entityId: c.subjectId,
      summary: `Deleted draft curriculum ${c.name} version ${c.version}`,
    })
    return c
  })
  if (curriculum.documentPath) await removeFiles([curriculum.documentPath])
  return { subjectId: curriculum.subjectId }
}

// ------------------------------------------------------------ units/topics

async function nextSequence(tx: TransactionClient, where: { curriculumId: string } | { unitId: string }) {
  const max =
    "curriculumId" in where
      ? await tx.curriculumUnit.aggregate({ where, _max: { sequence: true } })
      : await tx.curriculumTopic.aggregate({ where, _max: { sequence: true } })
  return (max._max.sequence ?? 0) + 1
}

export async function saveUnit(ctx: Ctx, curriculumId: string, unitId: string | null, raw: unknown) {
  const input = unitSchema.parse(raw)
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    await requireDraft(tx, ctx, curriculumId)
    if (unitId) {
      const unit = await tx.curriculumUnit.findFirst({ where: { id: unitId, curriculumId, organizationId } })
      if (!unit) throw new NotFoundError("Unit not found.")
      return tx.curriculumUnit.update({ where: { id: unitId }, data: { ...input, sequence: input.sequence ?? unit.sequence } })
    }
    return tx.curriculumUnit.create({
      data: { ...input, organizationId, curriculumId, sequence: input.sequence ?? (await nextSequence(tx, { curriculumId })) },
    })
  })
}

export async function deleteUnit(ctx: Ctx, unitId: string) {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.curriculumUnit.findFirst({ where: { id: unitId, organizationId: ctx.organization.id } })
    if (!unit) throw new NotFoundError("Unit not found.")
    await requireDraft(tx, ctx, unit.curriculumId)
    await tx.curriculumUnit.delete({ where: { id: unitId } })
  })
}

export async function saveTopic(ctx: Ctx, unitId: string, topicId: string | null, raw: unknown) {
  const input = topicSchema.parse(raw)
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const unit = await tx.curriculumUnit.findFirst({ where: { id: unitId, organizationId } })
    if (!unit) throw new NotFoundError("Unit not found.")
    await requireDraft(tx, ctx, unit.curriculumId)
    if (topicId) {
      const topic = await tx.curriculumTopic.findFirst({ where: { id: topicId, unitId, organizationId } })
      if (!topic) throw new NotFoundError("Topic not found.")
      return tx.curriculumTopic.update({ where: { id: topicId }, data: { ...input, sequence: input.sequence ?? topic.sequence } })
    }
    return tx.curriculumTopic.create({
      data: { ...input, organizationId, unitId, sequence: input.sequence ?? (await nextSequence(tx, { unitId })) },
    })
  })
}

export async function deleteTopic(ctx: Ctx, topicId: string) {
  return prisma.$transaction(async (tx) => {
    const topic = await tx.curriculumTopic.findFirst({
      where: { id: topicId, organizationId: ctx.organization.id },
      include: { unit: { select: { curriculumId: true } } },
    })
    if (!topic) throw new NotFoundError("Topic not found.")
    await requireDraft(tx, ctx, topic.unit.curriculumId)
    await tx.curriculumTopic.delete({ where: { id: topicId } })
  })
}

// Sets sequence 1..n in the given order. `parent` says what is reordered.
export async function reorder(ctx: Ctx, parent: { curriculumId: string } | { unitId: string }, rawIds: unknown) {
  const ids = reorderSchema.parse(rawIds)
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    if ("curriculumId" in parent) {
      await requireDraft(tx, ctx, parent.curriculumId)
      const units = await tx.curriculumUnit.findMany({ where: { curriculumId: parent.curriculumId, organizationId }, select: { id: true } })
      if (units.length !== ids.length || !units.every((u) => ids.includes(u.id))) {
        throw new ConflictError("The units changed meanwhile. Refresh and try again.")
      }
      for (const [i, id] of ids.entries()) await tx.curriculumUnit.update({ where: { id }, data: { sequence: i + 1 } })
    } else {
      const unit = await tx.curriculumUnit.findFirst({ where: { id: parent.unitId, organizationId } })
      if (!unit) throw new NotFoundError("Unit not found.")
      await requireDraft(tx, ctx, unit.curriculumId)
      const topics = await tx.curriculumTopic.findMany({ where: { unitId: unit.id, organizationId }, select: { id: true } })
      if (topics.length !== ids.length || !topics.every((t) => ids.includes(t.id))) {
        throw new ConflictError("The topics changed meanwhile. Refresh and try again.")
      }
      for (const [i, id] of ids.entries()) await tx.curriculumTopic.update({ where: { id }, data: { sequence: i + 1 } })
    }
  })
}

// --------------------------------------------------- official syllabus file

// The official syllabus (PDF or scan) of a draft, or of any curriculum that
// has none yet. Stored privately under <organisation>/curricula/<id>/.
export async function uploadCurriculumDocument(ctx: Ctx, id: string, form: FormData) {
  const curriculum = await findCurriculum(prisma, ctx, id)
  if (curriculum.status !== "DRAFT" && curriculum.documentPath) {
    throw new ConflictError("The syllabus file of an active or retired curriculum can't be replaced. Create a new version.")
  }
  const file = form.get("file")
  if (!(file instanceof File) || file.size === 0) fieldError("file", "Choose a file to upload.")
  if (file.size > DOCUMENT_MAX_BYTES) fieldError("file", `The file must be ${Math.round(DOCUMENT_MAX_BYTES / 1024 / 1024)} MB or smaller.`)
  const body = await file.arrayBuffer()
  const mimeType = sniffMimeType(new Uint8Array(body.slice(0, 16)))
  if (!mimeType || !(DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) fieldError("file", "Upload a PDF or an image.")
  const path = `${ctx.organization.id}/curricula/${id}/${randomUUID()}.${EXTENSIONS[mimeType]}`
  await uploadFile(path, body, mimeType)
  try {
    await prisma.$transaction(async (tx) => {
      await tx.curriculum.update({
        where: { id },
        data: {
          documentPath: path,
          documentName: file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "syllabus",
          documentType: mimeType,
          documentSize: file.size,
        },
      })
      await audit(tx, ctx, {
        action: "curriculum.document", entityType: "subject", entityId: curriculum.subjectId,
        summary: `Uploaded the syllabus file of ${curriculum.name} version ${curriculum.version}`,
      })
    })
  } catch (error) {
    await removeFiles([path])
    throw error
  }
  if (curriculum.documentPath) await removeFiles([curriculum.documentPath])
}

export async function curriculumDocumentUrl(ctx: Ctx, id: string) {
  const curriculum = await findCurriculum(prisma, ctx, id)
  if (!curriculum.documentPath) throw new NotFoundError("This curriculum has no syllabus file.")
  return signedUrl(curriculum.documentPath, 60, curriculum.documentName ?? "syllabus")
}
