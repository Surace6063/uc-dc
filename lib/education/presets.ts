import type { GroupingKind } from "@/lib/generated/prisma/enums"

// Optional Nepal-relevant starting points for an organisation's education
// structure. Applying a preset only creates ordinary, editable records: the
// organisation can rename, reorder, disable or delete them afterwards, and
// nothing in the application depends on these keys.

export type EducationPreset = {
  key: string
  name: string
  code: string
  description: string
  groupingKind: GroupingKind
  usesPrograms: boolean
  // Classes created with the level (levels without programs only).
  classes: readonly string[]
  // Suggested programs (levels with programs only); created on request.
  programs: readonly { name: string; code: string; duration?: number }[]
}

const grades = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `Grade ${from + i}`)

export const EDUCATION_PRESETS: readonly EducationPreset[] = [
  {
    key: "ecd",
    name: "ECD / ECE",
    code: "ECD",
    description: "Early childhood development and pre-primary.",
    groupingKind: "LEVEL",
    usesPrograms: false,
    classes: ["Nursery", "LKG", "UKG"],
    programs: [],
  },
  {
    key: "basic",
    name: "Basic Education",
    code: "BASIC",
    description: "Grades 1–8.",
    groupingKind: "GRADE",
    usesPrograms: false,
    classes: grades(1, 8),
    programs: [],
  },
  {
    key: "secondary",
    name: "Secondary Education",
    code: "SEC",
    description: "Grades 9–10 (SEE).",
    groupingKind: "GRADE",
    usesPrograms: false,
    classes: grades(9, 10),
    programs: [],
  },
  {
    key: "higher_secondary",
    name: "Higher Secondary (+2)",
    code: "HSEB",
    description: "Grades 11–12 with streams such as Science, Management and Humanities.",
    groupingKind: "GRADE",
    usesPrograms: true,
    classes: [],
    programs: [
      { name: "Science", code: "SCI", duration: 2 },
      { name: "Management", code: "MGMT", duration: 2 },
      { name: "Humanities", code: "HUM", duration: 2 },
      { name: "Education", code: "EDU", duration: 2 },
      { name: "Law", code: "LAW", duration: 2 },
    ],
  },
  {
    key: "tvet",
    name: "Technical and Vocational Education",
    code: "TVET",
    description: "CTEVT pre-diploma and vocational programs.",
    groupingKind: "YEAR",
    usesPrograms: true,
    classes: [],
    programs: [],
  },
  {
    key: "diploma",
    name: "Diploma Programs",
    code: "DIP",
    description: "Diploma programs, e.g. Diploma in Computer Engineering.",
    groupingKind: "YEAR",
    usesPrograms: true,
    classes: [],
    programs: [{ name: "Diploma in Computer Engineering", code: "DCOM", duration: 3 }],
  },
  {
    key: "bachelor",
    name: "Bachelor's Programs",
    code: "BACH",
    description: "Undergraduate programs, annual or semester based.",
    groupingKind: "SEMESTER",
    usesPrograms: true,
    classes: [],
    programs: [
      { name: "BBS", code: "BBS", duration: 4 },
      { name: "BCA", code: "BCA", duration: 8 },
      { name: "BBA", code: "BBA", duration: 8 },
      { name: "BIT", code: "BIT", duration: 8 },
    ],
  },
  {
    key: "master",
    name: "Master's Programs",
    code: "MAST",
    description: "Postgraduate programs.",
    groupingKind: "SEMESTER",
    usesPrograms: true,
    classes: [],
    programs: [],
  },
]

export function findPreset(key: string) {
  return EDUCATION_PRESETS.find((p) => p.key === key) ?? null
}

export const GROUPING_LABELS: Record<GroupingKind, string> = {
  GRADE: "Grade",
  SEMESTER: "Semester",
  YEAR: "Year",
  LEVEL: "Level",
  COHORT: "Cohort",
  OTHER: "Other",
}

// "Semester 1".."Semester 8" for a program of the given duration. BBS-style
// annual programs use "Year"; Grade-based programs (+2) start at Grade 11.
export function generatedClassNames(kind: GroupingKind, duration: number, startAt = 1) {
  const label = kind === "OTHER" || kind === "COHORT" ? "Stage" : GROUPING_LABELS[kind]
  return Array.from({ length: duration }, (_, i) => `${label} ${startAt + i}`)
}
