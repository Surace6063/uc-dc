import "server-only"

import {
  toHundredths,
  toPercentUnits,
  type PolicyRules,
  type RulesSnapshot,
  type ScaleRules,
  type SubjectConfig,
} from "@/features/exams/calculation"
import type { Prisma } from "@/lib/generated/prisma/client"
import { NotFoundError } from "@/lib/authorization/errors"
import { prisma, type TransactionClient } from "@/lib/prisma"

// Turns stored configuration into the calculation engine's inputs. Every
// result, preview, export and report goes through here and then through
// features/exams/calculation.ts, so there is one set of formulas.
type Db = TransactionClient | typeof prisma

export const scaleInclude = { rules: { orderBy: [{ minimumPercentage: "desc" as const }] } } satisfies Prisma.GradingScaleInclude

type ScaleRow = Prisma.GradingScaleGetPayload<{ include: typeof scaleInclude }>
type PolicyRow = Prisma.ResultPolicyGetPayload<object>

export function toScaleRules(scale: ScaleRow): ScaleRules {
  return {
    id: scale.id,
    name: scale.name,
    version: scale.version,
    gradingType: scale.gradingType,
    rules: scale.rules.map((r) => ({
      grade: r.grade,
      min: toPercentUnits(r.minimumPercentage),
      max: toPercentUnits(r.maximumPercentage),
      gradePoint: toHundredths(r.gradePoint),
      isFailing: r.isFailing,
      description: r.description,
    })),
  }
}

export function toPolicyRules(policy: PolicyRow): PolicyRules {
  return {
    id: policy.id,
    name: policy.name,
    subjectPassRule: policy.subjectPassRule,
    componentPassRequired: policy.componentPassRequired,
    absentTreatment: policy.absentTreatment,
    optionalInAggregate: policy.optionalInAggregate,
    gpaMethod: policy.gpaMethod,
    percentageDecimals: policy.percentageDecimals,
    gpaDecimals: policy.gpaDecimals,
    graceMarksPerSubject: toHundredths(policy.graceMarksPerSubject),
    graceMaxSubjects: policy.graceMaxSubjects,
    rankingEnabled: policy.rankingEnabled,
    rankBasis: policy.rankBasis,
    rankScope: policy.rankScope,
    rankTieMode: policy.rankTieMode,
  }
}

// The examination's current policy and scale (before approval).
export async function currentRules(db: Db, organizationId: string, exam: { gradingScaleId: string; resultPolicyId: string }): Promise<RulesSnapshot> {
  const [scale, policy] = await Promise.all([
    db.gradingScale.findFirst({ where: { id: exam.gradingScaleId, organizationId }, include: scaleInclude }),
    db.resultPolicy.findFirst({ where: { id: exam.resultPolicyId, organizationId } }),
  ])
  if (!scale || !policy) throw new NotFoundError("The examination's grading scale or result policy no longer exists.")
  return { policy: toPolicyRules(policy), scale: toScaleRules(scale) }
}

// The rules an examination is calculated with: the snapshot taken at first
// approval, or (until then) the current policy and scale.
export async function examRules(
  db: Db,
  organizationId: string,
  exam: { gradingScaleId: string; resultPolicyId: string; rulesSnapshot: Prisma.JsonValue | null }
): Promise<{ rules: RulesSnapshot; snapshotted: boolean }> {
  if (exam.rulesSnapshot) return { rules: exam.rulesSnapshot as unknown as RulesSnapshot, snapshotted: true }
  return { rules: await currentRules(db, organizationId, exam), snapshotted: false }
}

export const subjectInclude = {
  components: { orderBy: [{ sequence: "asc" as const }, { createdAt: "asc" as const }] },
  subjectOffering: {
    select: {
      id: true, subjectId: true, code: true,
      subject: { select: { id: true, name: true, code: true, localName: true } },
      sections: { select: { sectionId: true } },
    },
  },
  class: { select: { id: true, name: true, sequence: true } },
} satisfies Prisma.ExaminationSubjectInclude

export type SubjectRow = Prisma.ExaminationSubjectGetPayload<{ include: typeof subjectInclude }>

export async function loadSubjects(db: Db, organizationId: string, examinationId: string) {
  return db.examinationSubject.findMany({
    where: { organizationId, examinationId },
    include: subjectInclude,
    orderBy: [{ class: { sequence: "asc" } }, { sequence: "asc" }, { subjectOffering: { subject: { name: "asc" } } }],
  })
}

export function toSubjectConfig(s: SubjectRow): SubjectConfig {
  return {
    id: s.id,
    subjectId: s.subjectOffering.subjectId,
    name: s.subjectOffering.subject.name,
    code: s.subjectOffering.code ?? s.subjectOffering.subject.code,
    max: toHundredths(s.maximumMarks),
    pass: toHundredths(s.passMarks),
    credit: toHundredths(s.creditHours),
    isCompulsory: s.isCompulsory,
    components: s.components.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.componentType,
      max: toHundredths(c.maximumMarks),
      pass: toHundredths(c.passMarks),
      weight: toHundredths(c.weightage),
    })),
  }
}

// Sections that take an examination subject: those its offering is limited
// to, or (no limit) every section.
export function subjectTakenBy(s: Pick<SubjectRow, "classId" | "subjectOffering">, classId: string, sectionId: string | null) {
  if (s.classId !== classId) return false
  const limited = s.subjectOffering.sections.map((x) => x.sectionId)
  return limited.length === 0 || (sectionId !== null && limited.includes(sectionId))
}
