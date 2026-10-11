import type {
  CurriculumComponent,
  CurriculumStatus,
  OfferingStatus,
  PrerequisiteKind,
  SubjectRequirement,
} from "@/lib/generated/prisma/enums"

export const REQUIREMENT_LABELS: Record<SubjectRequirement, string> = {
  COMPULSORY: "Compulsory",
  ELECTIVE: "Elective",
  OPTIONAL: "Optional",
  ADDITIONAL: "Additional",
}

export const CURRICULUM_STATUS_LABELS: Record<CurriculumStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  RETIRED: "Retired",
}

export const COMPONENT_LABELS: Record<CurriculumComponent, string> = {
  THEORY: "Theory",
  PRACTICAL: "Practical",
  PROJECT: "Project",
  MIXED: "Theory + practical",
}

export const OFFERING_STATUS_LABELS: Record<OfferingStatus, string> = {
  ACTIVE: "Active",
  DISCONTINUED: "Discontinued",
}

export const PREREQUISITE_KIND_LABELS: Record<PrerequisiteKind, string> = {
  REQUIRED: "Required",
  RECOMMENDED: "Recommended",
}

const options = <K extends string>(labels: Record<K, string>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }))

export const requirementOptions = options(REQUIREMENT_LABELS)
export const componentOptions = options(COMPONENT_LABELS)
export const prerequisiteKindOptions = options(PREREQUISITE_KIND_LABELS)

// Starting categories an organisation can add with one click; nothing in the
// application depends on these names.
export const SUGGESTED_CATEGORIES = [
  "Language",
  "Mathematics",
  "Science",
  "Social studies",
  "Computer",
  "Vocational",
  "Health & physical education",
  "Arts",
] as const

// "3.75 cr" / "4 cr"; null-safe.
export function formatCredits(value: number | null | undefined) {
  if (value === null || value === undefined) return null
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, "")} cr`
}

// Suggests the next version label: "v2" → "v3", "2078" → "2079", else "… (2)".
export function nextVersionLabel(version: string) {
  const match = /^(.*?)(\d+)$/.exec(version.trim())
  if (match) return `${match[1]}${Number(match[2]) + 1}`
  return `${version.trim()} (2)`
}

// Would making `prerequisiteId` a prerequisite of `subjectId` create a
// cycle? True when `subjectId` is already (directly or indirectly) a
// prerequisite of `prerequisiteId`. Pure, so it is unit-tested.
export function createsPrerequisiteCycle(
  edges: readonly { subjectId: string; prerequisiteId: string }[],
  subjectId: string,
  prerequisiteId: string
) {
  if (subjectId === prerequisiteId) return true
  const requires = new Map<string, string[]>()
  for (const e of edges) requires.set(e.subjectId, [...(requires.get(e.subjectId) ?? []), e.prerequisiteId])
  const seen = new Set<string>()
  const stack = [prerequisiteId]
  while (stack.length) {
    const current = stack.pop()!
    if (current === subjectId) return true
    if (seen.has(current)) continue
    seen.add(current)
    stack.push(...(requires.get(current) ?? []))
  }
  return false
}

// Whether a subject can be taught in a class: a subject tied to a level or
// program only fits classes of that level or program.
export function subjectFitsClass(
  subject: { educationLevelId: string | null; programId: string | null },
  academicClass: { educationLevelId: string; programId: string | null }
) {
  if (subject.educationLevelId && subject.educationLevelId !== academicClass.educationLevelId) return false
  if (subject.programId && subject.programId !== academicClass.programId) return false
  return true
}
