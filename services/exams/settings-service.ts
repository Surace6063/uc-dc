import "server-only"

import { toPercentUnits, validateScaleRules } from "@/features/exams/calculation"
import { assessmentTypeSchema, gradingScaleSchema, resultPolicySchema } from "@/features/exams/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { AssessmentCategory } from "@/lib/generated/prisma/enums"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"
import { requireAnyPermission } from "@/services/exams/access-service"

// Organisation-level examination settings: assessment types, grading scales
// and result policies. Grading scales are versioned: only drafts change;
// editing an active scale means drafting a new version, so examinations and
// published results keep the bands they were graded with.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

// ------------------------------------------------------------ listing

export async function getExamSettings(ctx: Pick<AuthContext, "organization">) {
  const organizationId = ctx.organization.id
  const [types, scales, policies, levels] = await Promise.all([
    prisma.assessmentType.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { examinations: true } } },
    }),
    prisma.gradingScale.findMany({
      where: { organizationId },
      orderBy: [{ name: "asc" }, { version: "desc" }],
      include: {
        rules: { orderBy: { minimumPercentage: "desc" } },
        _count: { select: { examinations: true, policies: true } },
      },
    }),
    prisma.resultPolicy.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: {
        gradingScale: { select: { name: true, version: true } },
        educationLevel: { select: { name: true } },
        _count: { select: { examinations: true } },
      },
    }),
    prisma.educationLevel.findMany({ where: { organizationId, isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ])
  return {
    types: types.map((t) => ({ ...t, used: t._count.examinations })),
    scales: scales.map((s) => ({
      id: s.id, name: s.name, code: s.code, description: s.description, gradingType: s.gradingType, status: s.status,
      isDefault: s.isDefault, version: s.version, previousVersionId: s.previousVersionId,
      effectiveFrom: s.effectiveFrom?.toISOString().slice(0, 10) ?? null, effectiveTo: s.effectiveTo?.toISOString().slice(0, 10) ?? null,
      used: s._count.examinations + s._count.policies,
      rules: s.rules.map((r) => ({
        grade: r.grade, minimumPercentage: r.minimumPercentage.toString(), maximumPercentage: r.maximumPercentage.toString(),
        gradePoint: r.gradePoint?.toString() ?? null, description: r.description, isFailing: r.isFailing,
      })),
    })),
    policies: policies.map(({ _count, gradingScale, educationLevel, graceMarksPerSubject, ...p }) => ({
      ...p,
      graceMarksPerSubject: graceMarksPerSubject?.toString() ?? null,
      gradingScaleName: gradingScale ? `${gradingScale.name} v${gradingScale.version}` : null,
      educationLevelName: educationLevel?.name ?? null,
      used: _count.examinations,
    })),
    levels,
  }
}

export type ExamSettings = Awaited<ReturnType<typeof getExamSettings>>

// ---------------------------------------------------------- assessment types

export async function saveAssessmentType(ctx: Ctx, id: string | null, raw: unknown) {
  requireAnyPermission(ctx, "exams.configure")
  const input = assessmentTypeSchema.parse(raw)
  const organizationId = ctx.organization.id
  try {
    return await prisma.$transaction(async (tx) => {
      if (id && !(await tx.assessmentType.findFirst({ where: { id, organizationId }, select: { id: true } }))) {
        throw new NotFoundError("Assessment type not found.")
      }
      const row = id
        ? await tx.assessmentType.update({ where: { id }, data: input })
        : await tx.assessmentType.create({ data: { ...input, organizationId } })
      await audit(tx, ctx, {
        action: id ? "exam.assessment_type.update" : "exam.assessment_type.create",
        entityType: "assessment_type", entityId: row.id, summary: `${id ? "Updated" : "Added"} assessment type ${row.name}`,
      })
      return row
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new ValidationError({ name: ["An assessment type with this name already exists."] })
    throw error
  }
}

export async function deleteAssessmentType(ctx: Ctx, id: string) {
  requireAnyPermission(ctx, "exams.configure")
  return prisma.$transaction(async (tx) => {
    const row = await tx.assessmentType.findFirst({ where: { id, organizationId: ctx.organization.id }, include: { _count: { select: { examinations: true } } } })
    if (!row) throw new NotFoundError("Assessment type not found.")
    if (row._count.examinations > 0) throw new ConflictError(`${row.name} is used by ${row._count.examinations} examination(s). Make it inactive instead.`)
    await tx.assessmentType.delete({ where: { id } })
    await audit(tx, ctx, { action: "exam.assessment_type.delete", entityType: "assessment_type", entityId: id, summary: `Deleted assessment type ${row.name}` })
  })
}

// ------------------------------------------------------------- grading scales

function checkRules(input: ReturnType<typeof gradingScaleSchema.parse>) {
  const errors = validateScaleRules(
    input.rules.map((r) => ({
      grade: r.grade,
      min: toPercentUnits(r.minimumPercentage),
      max: toPercentUnits(r.maximumPercentage),
      gradePoint: r.gradePoint === null ? null : Math.round(r.gradePoint * 100),
      isFailing: r.isFailing,
      description: r.description,
    })),
    input.gradingType
  )
  if (errors.length) throw new ValidationError({ rules: errors }, errors[0])
}

const ruleRows = (input: ReturnType<typeof gradingScaleSchema.parse>, organizationId: string, gradingScaleId: string) =>
  [...input.rules]
    .sort((a, b) => b.minimumPercentage - a.minimumPercentage)
    .map((r, i) => ({
      organizationId,
      gradingScaleId,
      grade: r.grade,
      minimumPercentage: r.minimumPercentage,
      maximumPercentage: r.maximumPercentage,
      gradePoint: r.gradePoint,
      description: r.description,
      isFailing: r.isFailing,
      sequence: i,
    }))

// Creates a draft scale, or replaces a draft's details and bands.
export async function saveGradingScale(ctx: Ctx, id: string | null, raw: unknown) {
  requireAnyPermission(ctx, "exams.configure")
  const input = gradingScaleSchema.parse(raw)
  checkRules(input)
  const organizationId = ctx.organization.id
  const data = {
    name: input.name, code: input.code, description: input.description, gradingType: input.gradingType,
    effectiveFrom: toDate(input.effectiveFrom), effectiveTo: toDate(input.effectiveTo),
  }
  try {
    return await prisma.$transaction(async (tx) => {
      let scaleId = id
      if (id) {
        const current = await tx.gradingScale.findFirst({ where: { id, organizationId } })
        if (!current) throw new NotFoundError("Grading scale not found.")
        if (current.status !== "DRAFT") throw new ConflictError("Only draft scales can be edited. Draft a new version to change an active scale.")
        if (current.version > 1 && input.name !== current.name) throw new ValidationError({ name: ["A new version keeps the name of the scale it revises."] })
        await tx.gradingScale.update({ where: { id }, data })
        await tx.gradingScaleRule.deleteMany({ where: { gradingScaleId: id } })
      } else {
        scaleId = (await tx.gradingScale.create({ data: { ...data, organizationId, createdById: ctx.user.id } })).id
      }
      await tx.gradingScaleRule.createMany({ data: ruleRows(input, organizationId, scaleId!) })
      await audit(tx, ctx, {
        action: id ? "exam.grading_scale.update" : "exam.grading_scale.create",
        entityType: "grading_scale", entityId: scaleId, summary: `${id ? "Updated" : "Created"} draft grading scale ${input.name}`,
        metadata: { rules: input.rules.map((r) => `${r.grade} ${r.minimumPercentage}–${r.maximumPercentage}${r.gradePoint !== null ? ` (${r.gradePoint})` : ""}`) },
      })
      return { id: scaleId! }
    })
  } catch (error) {
    if (isUniqueViolation(error, "grading_scale_rules")) throw new ValidationError({ rules: ["Each grade can appear only once."] })
    if (isUniqueViolation(error)) throw new ValidationError({ name: ["A grading scale with this name already exists."] })
    throw error
  }
}

async function loadScale(tx: TransactionClient, ctx: Ctx, id: string) {
  const scale = await tx.gradingScale.findFirst({ where: { id, organizationId: ctx.organization.id }, include: { rules: true } })
  if (!scale) throw new NotFoundError("Grading scale not found.")
  return scale
}

// Activates a verified draft. A new version replaces the version it revises:
// that one is retired, and the default flag and policies move to the new one.
// Examinations keep the scale they were set up with (and approved ones their
// snapshot), so nothing already graded changes.
export async function activateGradingScale(ctx: Ctx, id: string) {
  requireAnyPermission(ctx, "exams.configure")
  return prisma.$transaction(async (tx) => {
    const scale = await loadScale(tx, ctx, id)
    if (scale.status !== "DRAFT") throw new ConflictError("Only draft scales can be activated.")
    const errors = validateScaleRules(
      scale.rules.map((r) => ({
        grade: r.grade, min: toPercentUnits(r.minimumPercentage), max: toPercentUnits(r.maximumPercentage),
        gradePoint: r.gradePoint === null ? null : Math.round(Number(r.gradePoint) * 100), isFailing: r.isFailing, description: r.description,
      })),
      scale.gradingType
    )
    if (errors.length) throw new ValidationError({ rules: errors }, errors[0])
    const previous = scale.previousVersionId ? await tx.gradingScale.findFirst({ where: { id: scale.previousVersionId, organizationId: ctx.organization.id } }) : null
    if (previous && previous.status === "ACTIVE") {
      await tx.gradingScale.update({ where: { id: previous.id }, data: { status: "RETIRED", isDefault: false } })
      await tx.resultPolicy.updateMany({ where: { organizationId: ctx.organization.id, gradingScaleId: previous.id }, data: { gradingScaleId: scale.id } })
    }
    await tx.gradingScale.update({ where: { id }, data: { status: "ACTIVE", ...(previous?.isDefault && { isDefault: true }) } })
    await audit(tx, ctx, {
      action: "exam.grading_scale.activate", entityType: "grading_scale", entityId: id,
      summary: `Activated grading scale ${scale.name} v${scale.version}${previous ? ` (replacing v${previous.version})` : ""}`,
    })
  })
}

export async function newGradingScaleVersion(ctx: Ctx, id: string) {
  requireAnyPermission(ctx, "exams.configure")
  return prisma.$transaction(async (tx) => {
    const scale = await loadScale(tx, ctx, id)
    if (scale.status === "DRAFT") throw new ConflictError("This scale is still a draft; edit it directly.")
    const pending = await tx.gradingScale.findFirst({ where: { organizationId: ctx.organization.id, name: scale.name, status: "DRAFT" }, select: { id: true } })
    if (pending) throw new ConflictError("A draft version of this scale already exists.")
    const latest = await tx.gradingScale.aggregate({ where: { organizationId: ctx.organization.id, name: scale.name }, _max: { version: true } })
    const copy = await tx.gradingScale.create({
      data: {
        organizationId: ctx.organization.id, name: scale.name, code: scale.code, description: scale.description, gradingType: scale.gradingType,
        version: (latest._max.version ?? scale.version) + 1, previousVersionId: scale.id, createdById: ctx.user.id,
      },
    })
    await tx.gradingScaleRule.createMany({
      data: scale.rules.map((r) => ({
        organizationId: r.organizationId, gradingScaleId: copy.id, grade: r.grade, minimumPercentage: r.minimumPercentage,
        maximumPercentage: r.maximumPercentage, gradePoint: r.gradePoint, description: r.description, isFailing: r.isFailing, sequence: r.sequence,
      })),
    })
    await audit(tx, ctx, { action: "exam.grading_scale.version", entityType: "grading_scale", entityId: copy.id, summary: `Drafted version ${copy.version} of grading scale ${scale.name}` })
    return { id: copy.id }
  })
}

export async function setGradingScaleState(ctx: Ctx, id: string, change: "retire" | "default" | "delete") {
  requireAnyPermission(ctx, "exams.configure")
  return prisma.$transaction(async (tx) => {
    const scale = await loadScale(tx, ctx, id)
    const organizationId = ctx.organization.id
    if (change === "default") {
      if (scale.status !== "ACTIVE") throw new ConflictError("Only an active scale can be the default.")
      await tx.gradingScale.updateMany({ where: { organizationId, isDefault: true }, data: { isDefault: false } })
      await tx.gradingScale.update({ where: { id }, data: { isDefault: true } })
    } else if (change === "retire") {
      if (scale.status !== "ACTIVE") throw new ConflictError("Only active scales can be retired.")
      await tx.gradingScale.update({ where: { id }, data: { status: "RETIRED", isDefault: false } })
    } else {
      if (scale.status !== "DRAFT") throw new ConflictError("Only draft scales can be deleted; retire an active one instead.")
      const used = (await tx.examination.count({ where: { gradingScaleId: id } })) + (await tx.resultPolicy.count({ where: { gradingScaleId: id } }))
      if (used > 0) throw new ConflictError("This draft is referenced by an examination or a result policy.")
      await tx.gradingScale.delete({ where: { id } })
    }
    await audit(tx, ctx, {
      action: `exam.grading_scale.${change}`, entityType: "grading_scale", entityId: change === "delete" ? null : id,
      summary: `${change === "default" ? "Made default" : change === "retire" ? "Retired" : "Deleted"} grading scale ${scale.name} v${scale.version}`,
    })
  })
}

// ------------------------------------------------------------- result policies

export async function saveResultPolicy(ctx: Ctx, id: string | null, raw: unknown) {
  requireAnyPermission(ctx, "exams.configure")
  const input = resultPolicySchema.parse(raw)
  const organizationId = ctx.organization.id
  if (input.rankingEnabled && input.rankBasis === "GPA" && input.gpaMethod === "NONE") {
    throw new ValidationError({ rankBasis: ["Ranking by GPA needs a GPA method."] })
  }
  if ((input.graceMarksPerSubject ?? 0) > 0 && input.graceMaxSubjects === 0) {
    throw new ValidationError({ graceMaxSubjects: ["Set how many subjects grace marks may be given in."] })
  }
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.gradingScaleId) {
        const scale = await tx.gradingScale.findFirst({ where: { id: input.gradingScaleId, organizationId }, select: { status: true } })
        if (!scale) throw new ValidationError({ gradingScaleId: ["Choose a grading scale."] })
        if (scale.status === "RETIRED") throw new ValidationError({ gradingScaleId: ["This grading scale is retired."] })
      }
      if (input.educationLevelId && !(await tx.educationLevel.findFirst({ where: { id: input.educationLevelId, organizationId }, select: { id: true } }))) {
        throw new ValidationError({ educationLevelId: ["Choose a valid level."] })
      }
      if (id && !(await tx.resultPolicy.findFirst({ where: { id, organizationId }, select: { id: true } }))) throw new NotFoundError("Result policy not found.")
      const row = id
        ? await tx.resultPolicy.update({ where: { id }, data: input })
        : await tx.resultPolicy.create({ data: { ...input, organizationId, isDefault: (await tx.resultPolicy.count({ where: { organizationId } })) === 0 } })
      await audit(tx, ctx, {
        action: id ? "exam.result_policy.update" : "exam.result_policy.create",
        entityType: "result_policy", entityId: row.id, summary: `${id ? "Updated" : "Created"} result policy ${row.name}`,
        metadata: input as unknown as Record<string, string>,
      })
      return row
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new ValidationError({ name: ["A result policy with this name already exists."] })
    throw error
  }
}

export async function setResultPolicyState(ctx: Ctx, id: string, change: "default" | "delete") {
  requireAnyPermission(ctx, "exams.configure")
  return prisma.$transaction(async (tx) => {
    const organizationId = ctx.organization.id
    const policy = await tx.resultPolicy.findFirst({ where: { id, organizationId }, include: { _count: { select: { examinations: true } } } })
    if (!policy) throw new NotFoundError("Result policy not found.")
    if (change === "default") {
      if (!policy.isActive) throw new ConflictError("Only an active policy can be the default.")
      await tx.resultPolicy.updateMany({ where: { organizationId, isDefault: true }, data: { isDefault: false } })
      await tx.resultPolicy.update({ where: { id }, data: { isDefault: true } })
    } else {
      if (policy._count.examinations > 0) throw new ConflictError(`${policy.name} is used by ${policy._count.examinations} examination(s). Make it inactive instead.`)
      await tx.resultPolicy.delete({ where: { id } })
    }
    await audit(tx, ctx, {
      action: `exam.result_policy.${change}`, entityType: "result_policy", entityId: change === "delete" ? null : id,
      summary: `${change === "default" ? "Made default" : "Deleted"} result policy ${policy.name}`,
    })
  })
}

// ------------------------------------------------------------ sample setup

const SAMPLE_TYPES: { name: string; category: AssessmentCategory }[] = [
  { name: "Unit Test", category: "UNIT_TEST" },
  { name: "First Terminal Examination", category: "TERMINAL" },
  { name: "Second Terminal Examination", category: "TERMINAL" },
  { name: "Final Examination", category: "FINAL" },
  { name: "Internal Assessment", category: "INTERNAL" },
]

// A starting point for organisations with nothing configured: common
// assessment types, a *draft* letter-grade scale and a policy using it. The
// scale is clearly labelled as a sample and stays a draft until an
// administrator checks it against their own rules and activates it; it is
// not an official or national grading policy.
export async function createSampleSetup(ctx: Ctx) {
  requireAnyPermission(ctx, "exams.configure")
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const created: string[] = []
    if ((await tx.assessmentType.count({ where: { organizationId } })) === 0) {
      await tx.assessmentType.createMany({ data: SAMPLE_TYPES.map((t, i) => ({ ...t, organizationId, sortOrder: i })) })
      created.push(`${SAMPLE_TYPES.length} assessment types`)
    }
    let scaleId: string | null = null
    if ((await tx.gradingScale.count({ where: { organizationId } })) === 0) {
      const scale = await tx.gradingScale.create({
        data: {
          organizationId, name: "Sample letter grading", gradingType: "GRADE_POINT", createdById: ctx.user.id,
          description: "Demonstration bands only. Replace them with your institution's approved grading rules before activating this scale.",
        },
      })
      const bands: [string, number, number, number, boolean][] = [
        ["A+", 90, 100, 4, false], ["A", 80, 90, 3.6, false], ["B+", 70, 80, 3.2, false], ["B", 60, 70, 2.8, false],
        ["C+", 50, 60, 2.4, false], ["C", 40, 50, 2, false], ["D", 35, 40, 1.6, false], ["NG", 0, 35, 0, true],
      ]
      await tx.gradingScaleRule.createMany({
        data: bands.map(([grade, min, max, gp, isFailing], i) => ({
          organizationId, gradingScaleId: scale.id, grade, minimumPercentage: min, maximumPercentage: max, gradePoint: gp, isFailing, sequence: i,
        })),
      })
      scaleId = scale.id
      created.push("a draft sample grading scale")
    }
    if ((await tx.resultPolicy.count({ where: { organizationId } })) === 0) {
      await tx.resultPolicy.create({
        data: {
          organizationId, name: "Standard result policy", isDefault: true, gradingScaleId: scaleId,
          description: "Review every rule before use: pass marks per subject, absent counted as not passed, no GPA, no ranking.",
        },
      })
      created.push("a result policy")
    }
    if (created.length) {
      await audit(tx, ctx, { action: "exam.settings.sample", entityType: "organization", entityId: organizationId, summary: `Created sample examination settings: ${created.join(", ")}` })
    }
    return { created }
  })
}
