import "server-only"

import { createsPrerequisiteCycle } from "@/features/subjects/constants"
import { categorySchema, idsSchema, prerequisiteSchema, subjectSchema } from "@/features/subjects/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/prisma-errors"
import { audit, listEntityActivity } from "@/services/audit/audit-service"

// Subjects and courses as reusable definitions, their organisation-defined
// categories and prerequisites. Every lookup includes organizationId, so
// another organisation's record behaves exactly like a missing one.
type Ctx = Pick<AuthContext, "organization" | "user">
type Db = TransactionClient | typeof prisma

function fieldError(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

export type BulkResult = { succeeded: number; failed: { id: string; name: string; reason: string }[] }

// --------------------------------------------------------------- categories

export async function listCategories(ctx: Pick<AuthContext, "organization">) {
  return prisma.subjectCategory.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, isActive: true, sortOrder: true, _count: { select: { subjects: true } } },
  })
}

export type SubjectCategoryRow = Awaited<ReturnType<typeof listCategories>>[number]

export async function saveCategory(ctx: Ctx, id: string | null, raw: unknown) {
  const input = categorySchema.parse(raw)
  const organizationId = ctx.organization.id
  try {
    return await prisma.$transaction(async (tx) => {
      const clash = await tx.subjectCategory.findFirst({
        where: { organizationId, name: { equals: input.name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) },
        select: { id: true },
      })
      if (clash) fieldError("name", "A category with this name already exists.")
      if (id) {
        const existing = await tx.subjectCategory.findFirst({ where: { id, organizationId } })
        if (!existing) throw new NotFoundError("Category not found.")
        const category = await tx.subjectCategory.update({ where: { id }, data: input })
        await audit(tx, ctx, { action: "subject_category.update", entityType: "subject_category", entityId: id, summary: `Updated subject category ${category.name}` })
        return category
      }
      const category = await tx.subjectCategory.create({ data: { ...input, organizationId } })
      await audit(tx, ctx, { action: "subject_category.create", entityType: "subject_category", entityId: category.id, summary: `Created subject category ${category.name}` })
      return category
    })
  } catch (error) {
    if (isUniqueViolation(error)) fieldError("name", "A category with this name already exists.")
    throw error
  }
}

export async function deleteCategory(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  const category = await prisma.subjectCategory.findFirst({ where: { id, organizationId } })
  if (!category) throw new NotFoundError("Category not found.")
  try {
    await prisma.$transaction(async (tx) => {
      await tx.subjectCategory.deleteMany({ where: { id, organizationId } })
      await audit(tx, ctx, { action: "subject_category.delete", entityType: "subject_category", entityId: id, summary: `Deleted subject category ${category.name}` })
    })
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new ConflictError("Subjects use this category. Deactivate it instead.")
    throw error
  }
}

// ----------------------------------------------------------------- subjects

// Level, program and category must be this organisation's, and a program
// must belong to the chosen level (the level is taken from the program when
// only a program is given).
async function resolvePlacement(db: Db, ctx: Ctx, input: ReturnType<typeof subjectSchema.parse>) {
  const organizationId = ctx.organization.id
  let educationLevelId = input.educationLevelId
  if (input.programId) {
    const program = await db.program.findFirst({ where: { id: input.programId, organizationId } })
    if (!program) fieldError("programId", "Choose a valid program.")
    if (educationLevelId && program.educationLevelId !== educationLevelId) {
      fieldError("programId", "This program belongs to a different education level.")
    }
    educationLevelId = program.educationLevelId
  }
  if (educationLevelId) {
    const level = await db.educationLevel.findFirst({ where: { id: educationLevelId, organizationId } })
    if (!level) fieldError("educationLevelId", "Choose a valid education level.")
  }
  if (input.categoryId) {
    const category = await db.subjectCategory.findFirst({ where: { id: input.categoryId, organizationId } })
    if (!category) fieldError("categoryId", "Choose a valid category.")
  }
  return { ...input, educationLevelId }
}

export async function saveSubject(ctx: Ctx, id: string | null, raw: unknown) {
  const parsed = subjectSchema.parse(raw)
  const organizationId = ctx.organization.id
  try {
    return await prisma.$transaction(async (tx) => {
      const input = await resolvePlacement(tx, ctx, parsed)
      if (id) {
        const existing = await tx.subject.findFirst({ where: { id, organizationId } })
        if (!existing) throw new NotFoundError("Subject not found.")
        if (existing.archivedAt && input.isActive) fieldError("isActive", "Restore this subject before activating it.")
        const subject = await tx.subject.update({ where: { id }, data: input })
        await audit(tx, ctx, {
          action: "subject.update", entityType: "subject", entityId: id, summary: `Updated subject ${subject.name} (${subject.code})`,
          metadata: { before: { code: existing.code, name: existing.name, creditHours: existing.creditHours, requirement: existing.requirement } },
        })
        return subject
      }
      const subject = await tx.subject.create({ data: { ...input, organizationId } })
      await audit(tx, ctx, {
        action: "subject.create", entityType: "subject", entityId: subject.id, summary: `Created subject ${subject.name} (${subject.code})`,
      })
      return subject
    })
  } catch (error) {
    if (isUniqueViolation(error, "code")) fieldError("code", "Another subject already uses this code.")
    throw error
  }
}

// Archiving hides a subject from new offerings and lists while every past
// offering, curriculum and assignment stays intact. A subject still offered
// in a running or planned year must be discontinued there first.
export async function setSubjectsArchived(ctx: Ctx, rawIds: unknown, archived: boolean): Promise<BulkResult> {
  const ids = idsSchema.parse(rawIds)
  const organizationId = ctx.organization.id
  const subjects = await prisma.subject.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true, name: true, code: true, archivedAt: true },
  })
  const result: BulkResult = { succeeded: 0, failed: [] }
  for (const id of ids) {
    const s = subjects.find((x) => x.id === id)
    if (!s) {
      result.failed.push({ id, name: "Unknown subject", reason: "Not found." })
      continue
    }
    if (archived === (s.archivedAt !== null)) {
      result.failed.push({ id, name: s.name, reason: archived ? "Already archived." : "Not archived." })
      continue
    }
    if (archived) {
      const running = await prisma.subjectOffering.findFirst({
        where: { organizationId, subjectId: id, status: "ACTIVE", academicYear: { status: { in: ["ACTIVE", "PLANNED"] } } },
        select: { academicYear: { select: { name: true } }, class: { select: { name: true } } },
      })
      if (running) {
        result.failed.push({
          id, name: s.name,
          reason: `Still offered in ${running.class.name}, ${running.academicYear.name}. Discontinue that offering first.`,
        })
        continue
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.subject.update({
        where: { id },
        data: archived ? { archivedAt: new Date(), isActive: false } : { archivedAt: null, isActive: true },
      })
      await audit(tx, ctx, {
        action: archived ? "subject.archive" : "subject.restore", entityType: "subject", entityId: id,
        summary: `${archived ? "Archived" : "Restored"} subject ${s.name} (${s.code})`,
      })
    })
    result.succeeded++
  }
  return result
}

// Only for subjects created by mistake: anything referenced by offerings,
// curricula, assignments or other subjects' prerequisites must be archived.
export async function deleteSubject(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  const subject = await prisma.subject.findFirst({ where: { id, organizationId } })
  if (!subject) throw new NotFoundError("Subject not found.")
  try {
    await prisma.$transaction(async (tx) => {
      await tx.subject.deleteMany({ where: { id, organizationId } })
      await audit(tx, ctx, { action: "subject.delete", entityType: "subject", entityId: id, summary: `Deleted subject ${subject.name} (${subject.code})` })
    })
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new ConflictError("This subject has offerings, curricula, teaching assignments or is a prerequisite. Archive it instead.")
    }
    throw error
  }
}

// ------------------------------------------------------------ prerequisites

export async function addPrerequisite(ctx: Ctx, subjectId: string, raw: unknown) {
  const input = prerequisiteSchema.parse(raw)
  const organizationId = ctx.organization.id
  if (input.prerequisiteId === subjectId) fieldError("prerequisiteId", "A subject can't be its own prerequisite.")
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialise prerequisite changes per organisation so two concurrent
      // additions can't form a cycle together.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`prereq:${organizationId}`}, 0))`
      const [subject, prerequisite] = await Promise.all([
        tx.subject.findFirst({ where: { id: subjectId, organizationId }, select: { id: true, name: true } }),
        tx.subject.findFirst({ where: { id: input.prerequisiteId, organizationId }, select: { id: true, name: true } }),
      ])
      if (!subject) throw new NotFoundError("Subject not found.")
      if (!prerequisite) fieldError("prerequisiteId", "Choose a valid subject.")
      const edges = await tx.subjectPrerequisite.findMany({
        where: { organizationId },
        select: { subjectId: true, prerequisiteId: true },
      })
      if (createsPrerequisiteCycle(edges, subjectId, prerequisite.id)) {
        fieldError("prerequisiteId", `${prerequisite.name} already depends on ${subject.name}; this would create a cycle.`)
      }
      const row = await tx.subjectPrerequisite.create({
        data: { organizationId, subjectId, prerequisiteId: prerequisite.id, kind: input.kind, minimumGrade: input.minimumGrade, note: input.note },
      })
      await audit(tx, ctx, {
        action: "subject.prerequisite_add", entityType: "subject", entityId: subjectId,
        summary: `Added ${prerequisite.name} as a ${input.kind.toLowerCase()} prerequisite`,
      })
      return row
    })
  } catch (error) {
    if (isUniqueViolation(error)) fieldError("prerequisiteId", "This prerequisite is already set.")
    throw error
  }
}

export async function removePrerequisite(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  const row = await prisma.subjectPrerequisite.findFirst({
    where: { id, organizationId },
    include: { prerequisite: { select: { name: true } } },
  })
  if (!row) throw new NotFoundError("Prerequisite not found.")
  await prisma.$transaction(async (tx) => {
    await tx.subjectPrerequisite.delete({ where: { id } })
    await audit(tx, ctx, {
      action: "subject.prerequisite_remove", entityType: "subject", entityId: row.subjectId,
      summary: `Removed prerequisite ${row.prerequisite.name}`,
    })
  })
}

// ------------------------------------------------------------------ reading

// Everything the subject page shows. Offerings and assignments cover every
// year (history); the page groups them.
export async function getSubjectDetail(ctx: Pick<AuthContext, "organization">, id: string) {
  const organizationId = ctx.organization.id
  const subject = await prisma.subject.findFirst({
    where: { id, organizationId },
    include: {
      category: { select: { id: true, name: true } },
      educationLevel: { select: { id: true, name: true } },
      program: { select: { id: true, name: true, code: true } },
    },
  })
  if (!subject) return null

  const [curricula, offerings, assignments, prerequisites, requiredFor, activity] = await Promise.all([
    prisma.curriculum.findMany({
      where: { organizationId, subjectId: id },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      select: {
        id: true, name: true, code: true, version: true, status: true, effectiveFrom: true, effectiveTo: true,
        documentName: true, updatedAt: true,
        educationLevel: { select: { name: true } },
        program: { select: { code: true } },
        _count: { select: { units: true, offerings: true } },
        units: { select: { estimatedHours: true, _count: { select: { topics: true } } } },
      },
    }),
    prisma.subjectOffering.findMany({
      where: { organizationId, subjectId: id },
      orderBy: [{ academicYear: { startDate: "desc" } }, { class: { sequence: "asc" } }],
      select: {
        id: true, requirement: true, creditHours: true, weeklyPeriods: true, status: true, code: true,
        academicYear: { select: { id: true, name: true, isCurrent: true, status: true } },
        class: {
          select: {
            id: true, name: true,
            educationLevel: { select: { name: true } },
            program: { select: { code: true } },
          },
        },
        curriculum: { select: { id: true, name: true, version: true } },
        electiveGroup: { select: { name: true } },
        sections: { select: { section: { select: { id: true, name: true } } } },
      },
    }),
    prisma.teacherAssignment.findMany({
      where: { organizationId, subjectId: id },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      select: {
        id: true, role: true, status: true, startDate: true, endDate: true, weeklyPeriods: true, endReason: true,
        academicYear: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
        section: { select: { name: true } },
        teacher: { select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true } },
      },
    }),
    prisma.subjectPrerequisite.findMany({
      where: { organizationId, subjectId: id },
      select: { id: true, kind: true, minimumGrade: true, note: true, prerequisite: { select: { id: true, name: true, code: true } } },
    }),
    prisma.subjectPrerequisite.findMany({
      where: { organizationId, prerequisiteId: id },
      select: { id: true, kind: true, subject: { select: { id: true, name: true, code: true } } },
    }),
    listEntityActivity(ctx, "subject", id, 100),
  ])

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  return {
    subject: { ...subject, createdAt: subject.createdAt.toISOString(), updatedAt: subject.updatedAt.toISOString() },
    curricula: curricula.map(({ units, ...c }) => ({
      ...c,
      effectiveFrom: iso(c.effectiveFrom),
      effectiveTo: iso(c.effectiveTo),
      updatedAt: c.updatedAt.toISOString(),
      topics: units.reduce((n, u) => n + u._count.topics, 0),
      hours: units.reduce((n, u) => n + (u.estimatedHours ?? 0), 0),
    })),
    offerings,
    assignments: assignments.map((a) => ({ ...a, startDate: iso(a.startDate)!, endDate: iso(a.endDate) })),
    prerequisites,
    requiredFor,
    activity: activity.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  }
}

export type SubjectDetail = NonNullable<Awaited<ReturnType<typeof getSubjectDetail>>>

// Subjects for pickers (prerequisites, offerings): not archived.
export async function listSubjectOptions(ctx: Pick<AuthContext, "organization">) {
  return prisma.subject.findMany({
    where: { organizationId: ctx.organization.id, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, code: true, educationLevelId: true, programId: true, requirement: true,
      creditHours: true, weeklyPeriods: true, isActive: true,
      category: { select: { name: true } },
    },
  })
}

export type SubjectOption = Awaited<ReturnType<typeof listSubjectOptions>>[number]
