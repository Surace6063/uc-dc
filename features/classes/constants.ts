import type {
  InstructionMedium,
  SectionShift,
} from "@/lib/generated/prisma/enums"

export const SHIFT_LABELS: Record<SectionShift, string> = {
  MORNING: "Morning",
  DAY: "Day",
  EVENING: "Evening",
}

export const MEDIUM_LABELS: Record<InstructionMedium, string> = {
  ENGLISH: "English",
  NEPALI: "Nepali",
  BILINGUAL: "Bilingual",
  MOTHER_TONGUE: "Mother tongue",
  OTHER: "Other",
}

export const shiftOptions = Object.entries(SHIFT_LABELS).map(
  ([value, label]) => ({ value, label })
)
export const mediumOptions = Object.entries(MEDIUM_LABELS).map(
  ([value, label]) => ({ value, label })
)

// Section naming styles in common use: Latin letters, Nepali letters (क, ख,
// ग … as many community schools write them) or shift names.
export const SECTION_NAME_PRESETS = [
  { label: "A, B, C", names: ["A", "B", "C"] },
  { label: "क, ख, ग", names: ["क", "ख", "ग"] },
  { label: "Morning, Day", names: ["Morning", "Day"] },
] as const

// How roll numbers are re-assigned within a class or section.
export const ROLL_ORDERS = {
  FIRST_NAME: "Alphabetical by first name",
  LAST_NAME: "Alphabetical by surname",
  GIRLS_FIRST: "Girls first, then boys (each by first name)",
  ADMISSION_NUMBER: "Admission number",
  CURRENT: "Keep current order, close gaps",
} as const

export type RollOrder = keyof typeof ROLL_ORDERS

export const rollOrderOptions = Object.entries(ROLL_ORDERS).map(
  ([value, label]) => ({ value, label })
)

type RollCandidate = {
  id: string
  rollNumber: string | null
  admissionNumber: string
  firstName: string
  middleName: string | null
  lastName: string
  gender: string | null
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true })

const byFirstName = (a: RollCandidate, b: RollCandidate) =>
  collator.compare(
    `${a.firstName} ${a.middleName ?? ""} ${a.lastName}`,
    `${b.firstName} ${b.middleName ?? ""} ${b.lastName}`
  )

const genderRank = (gender: string | null) =>
  gender === "FEMALE" ? 0 : gender === "MALE" ? 1 : 2

// Orders students for roll numbering. Pure, so it is unit-tested; ties fall
// back to the admission number so the result is always deterministic.
export function orderForRollNumbers<T extends RollCandidate>(
  rows: readonly T[],
  order: RollOrder
): T[] {
  const tiebreak = (a: T, b: T) =>
    collator.compare(a.admissionNumber, b.admissionNumber)
  const compare: Record<RollOrder, (a: T, b: T) => number> = {
    FIRST_NAME: byFirstName,
    LAST_NAME: (a, b) =>
      collator.compare(a.lastName, b.lastName) || byFirstName(a, b),
    GIRLS_FIRST: (a, b) =>
      genderRank(a.gender) - genderRank(b.gender) || byFirstName(a, b),
    ADMISSION_NUMBER: () => 0,
    CURRENT: (a, b) => {
      // Numbered students keep their relative order ("2" before "10");
      // unnumbered go last.
      if (!a.rollNumber || !b.rollNumber) {
        return Number(!a.rollNumber) - Number(!b.rollNumber)
      }
      return collator.compare(a.rollNumber, b.rollNumber)
    },
  }
  return [...rows].sort((a, b) => compare[order](a, b) || tiebreak(a, b))
}

// "62% full" style occupancy; null when the section has no capacity set.
export function occupancy(enrolled: number, capacity: number | null) {
  if (!capacity) return null
  return Math.round((enrolled / capacity) * 100)
}
