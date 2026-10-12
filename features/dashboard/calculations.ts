import { standing, summarize, addCounts, type CalculationPolicy, type StatusCounts } from "@/features/attendance/calculation"
import { QUALIFICATION_RANK } from "@/features/teachers/constants"
import type { QualificationLevel } from "@/lib/generated/prisma/enums"

// Pure shaping and arithmetic behind the dashboard charts. Database queries
// (services/dashboard) return grouped counts; these turn them into chart
// rows, so each rule lives in one tested place.

// ------------------------------------------------------------ trends

// One row per academic year, oldest first. A year with no records gets null
// (a gap in the line, "No records" in the tooltip) rather than a made-up 0:
// an empty year usually means data wasn't entered, not that nobody enrolled.
export function fillTrend<V extends Record<string, number | null>>(
  years: { id: string; name: string }[],
  values: Map<string, V>,
  empty: { [K in keyof V]: null }
): ({ year: string; hasData: boolean } & { [K in keyof V]: V[K] | null })[] {
  return years.map((y) => ({ year: y.name, hasData: values.has(y.id), ...(values.get(y.id) ?? empty) }))
}

// ------------------------------------------------------------ shares

// Each category's share of the total, to one decimal. Shares are rounded
// independently, so they may add up to 99.9 or 100.1.
export function shares<K extends string>(counts: Record<K, number>): { key: K; count: number; share: number }[] {
  const total = (Object.values(counts) as number[]).reduce((n, c) => n + c, 0)
  return (Object.keys(counts) as K[])
    .filter((k) => counts[k] > 0)
    .map((k) => ({ key: k, count: counts[k], share: Math.round((counts[k] / total) * 1000) / 10 }))
}

// Gender Parity Index (female ÷ male), as reported to UGC. Null without male
// students, where the index is undefined.
export const genderParityIndex = (female: number, male: number) => (male > 0 ? Math.round((female / male) * 100) / 100 : null)

// ------------------------------------------------------------ inclusion

// Caste/ethnicity groups in report order; null = not recorded.
const CASTE_ORDER = ["DALIT", "ADIVASI_JANAJATI", "MADHESI", "MUSLIM", "THARU", "KHAS_ARYA", "OTHER"] as const
export type CasteKey = (typeof CASTE_ORDER)[number] | "UNRECORDED"

// Students per caste/ethnicity group, split by gender (UGC annex), with
// every recorded group listed and "not recorded" last when present.
export function casteByGender(rows: { caste: string | null; gender: "female" | "male" | "other" | "unrecorded"; count: number }[]) {
  const by = new Map<CasteKey, { female: number; male: number; other: number; unrecorded: number }>()
  for (const r of rows) {
    const key = (r.caste && (CASTE_ORDER as readonly string[]).includes(r.caste) ? r.caste : "UNRECORDED") as CasteKey
    const g = by.get(key) ?? { female: 0, male: 0, other: 0, unrecorded: 0 }
    g[r.gender] += r.count
    by.set(key, g)
  }
  return ([...CASTE_ORDER, "UNRECORDED"] as CasteKey[])
    .filter((k) => by.has(k))
    .map((k) => {
      const g = by.get(k)!
      return { key: k, ...g, total: g.female + g.male + g.other + g.unrecorded }
    })
}

export type EquityCounts = {
  econ_yes: number
  econ_recorded: number
  first_yes: number
  first_recorded: number
  remote_yes: number
  remote_recorded: number
  scholarship_yes: number
  scholarship_recorded: number
  disability_yes: number
  disability_recorded: number
}

// Equity groups (EMIS 6.3–6.4): how many students are in each, out of how
// many have it recorded. A share is only given against recorded students,
// so unrecorded data never reads as "no".
export function summarizeEquity(rows: (EquityCounts & { count: number })[]) {
  const sum = (k: keyof EquityCounts) => rows.reduce((n, r) => n + r[k], 0)
  const group = (key: string, label: string, yes: keyof EquityCounts, recorded: keyof EquityCounts) => {
    const r = sum(recorded)
    return { key, label, students: sum(yes), recorded: r, share: r === 0 ? null : Math.round((sum(yes) / r) * 1000) / 10 }
  }
  return {
    students: rows.reduce((n, r) => n + r.count, 0),
    groups: [
      group("scholarship", "Scholarship recipients", "scholarship_yes", "scholarship_recorded"),
      group("econ", "Economically disadvantaged", "econ_yes", "econ_recorded"),
      group("first", "First-generation learners", "first_yes", "first_recorded"),
      group("remote", "From rural / remote areas", "remote_yes", "remote_recorded"),
      group("disability", "Students with a disability", "disability_yes", "disability_recorded"),
    ],
  }
}

// ------------------------------------------------------------ results

export type Outcome = "passed" | "failed" | "absent"

// A student's decided outcome from their latest result status. Absent is
// decided but not passed; any other status isn't counted (see DECIDED).
export const outcomeOf = (status: string): Outcome | null => (status === "PASS" ? "passed" : status === "FAIL" ? "failed" : status === "ABSENT" ? "absent" : null)

export type OutcomeCounts = Record<Outcome, number>
export const emptyOutcomes = (): OutcomeCounts => ({ passed: 0, failed: 0, absent: 0 })

// Pass rate of a set of decided outcomes: passed ÷ (passed + failed + absent).
export function passRate(o: OutcomeCounts) {
  const decided = o.passed + o.failed + o.absent
  return decided === 0 ? null : Math.round((o.passed / decided) * 1000) / 10
}

// GPA in half-point bands from 0.0 up to the top of a 4.0 scale; 4.0 itself
// falls in the last band (3.5–4.0), as on the results analytics page. Every
// band is listed, empty ones as 0, so the shape of the distribution shows.
const GPA_BAND_STARTS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] as const

export function gpaBand(gpa: number) {
  return Math.min(Math.max(Math.floor(gpa * 2) / 2, 0), 3.5)
}

export function gpaBands(counts: { low: number; students: number }[]) {
  const by = new Map<number, number>()
  for (const c of counts) by.set(gpaBand(c.low), (by.get(gpaBand(c.low)) ?? 0) + c.students)
  return GPA_BAND_STARTS.map((low) => ({ band: `${low.toFixed(1)}–${(low + 0.5).toFixed(1)}`, students: by.get(low) ?? 0 }))
}

// ------------------------------------------------------------ attendance

export type AttendanceGroup = {
  key: string
  label: string
  name: string
  percentage: number | null
  students: number
  below: number
  approaching: number
}

// Attendance by group (program, or class/semester), from status counts per
// student and class. A group's percentage pools every record in it; a
// student's standing uses their own records in that group, so each student
// counts once per group and shortages follow the attendance policy.
export function attendanceGroups(
  rows: { studentId: string; classId: string; counts: StatusCounts }[],
  groupOf: (classId: string) => { key: string; label: string; name: string; order: number } | null,
  policy: CalculationPolicy
): AttendanceGroup[] {
  const groups = new Map<string, { label: string; name: string; order: number; counts: StatusCounts; students: Map<string, StatusCounts> }>()
  for (const r of rows) {
    const g = groupOf(r.classId)
    if (!g) continue
    const entry = groups.get(g.key) ?? { label: g.label, name: g.name, order: g.order, counts: {}, students: new Map() }
    const student = entry.students.get(r.studentId) ?? {}
    for (const [status, n] of Object.entries(r.counts) as [keyof StatusCounts, number][]) {
      addCounts(entry.counts, status, n)
      addCounts(student, status, n)
    }
    entry.students.set(r.studentId, student)
    groups.set(g.key, entry)
  }
  return [...groups.entries()]
    .sort(([, a], [, b]) => a.order - b.order || a.name.localeCompare(b.name))
    .map(([key, g]) => {
      let below = 0
      let approaching = 0
      for (const counts of g.students.values()) {
        const s = standing(summarize(counts, policy).percentage, policy)
        if (s === "below") below++
        if (s === "approaching") approaching++
      }
      return { key, label: g.label, name: g.name, percentage: summarize(g.counts, policy).percentage, students: g.students.size, below, approaching }
    })
}

// Students short of (or near) the minimum across all their records, each
// counted once even if they appear in several groups (e.g. moved class
// during the year). Used for the shortage alert.
export function attendanceShortages(rows: { studentId: string; counts: StatusCounts }[], policy: CalculationPolicy) {
  const perStudent = new Map<string, StatusCounts>()
  for (const r of rows) {
    const counts = perStudent.get(r.studentId) ?? {}
    for (const [status, n] of Object.entries(r.counts) as [keyof StatusCounts, number][]) addCounts(counts, status, n)
    perStudent.set(r.studentId, counts)
  }
  let below = 0
  let approaching = 0
  for (const counts of perStudent.values()) {
    const s = standing(summarize(counts, policy).percentage, policy)
    if (s === "below") below++
    if (s === "approaching") approaching++
  }
  return { students: perStudent.size, below, approaching }
}

// ------------------------------------------------------------ faculty

// Students per teacher, to one decimal; null with no teachers (never a
// division by zero or an "infinite" ratio).
export const studentTeacherRatio = (students: number, teachers: number) => (teachers <= 0 ? null : Math.round((students / teachers) * 10) / 10)

export type QualificationKey = QualificationLevel | "NONE"

// Each teacher once, by their highest qualification (QUALIFICATION_RANK;
// ties between equally ranked levels go to the first level listed in
// QUALIFICATION_ORDER). `teachers` is everyone in scope, so those without
// any recorded qualification form the "NONE" group.
const QUALIFICATION_ORDER: QualificationLevel[] = ["DOCTORATE", "MPHIL", "MASTER", "BACHELOR", "DIPLOMA", "PROFESSIONAL", "HIGHER_SECONDARY", "SECONDARY", "OTHER"]

export function highestQualifications(teachers: number, rows: { teacherId: string; level: QualificationLevel; verificationStatus: string }[]) {
  const best = new Map<string, { level: QualificationLevel; verified: boolean }>()
  const better = (a: QualificationLevel, b: QualificationLevel) =>
    QUALIFICATION_RANK[a] > QUALIFICATION_RANK[b] || (QUALIFICATION_RANK[a] === QUALIFICATION_RANK[b] && QUALIFICATION_ORDER.indexOf(a) < QUALIFICATION_ORDER.indexOf(b))
  for (const r of rows) {
    const verified = r.verificationStatus === "VERIFIED"
    const current = best.get(r.teacherId)
    if (!current || better(r.level, current.level)) best.set(r.teacherId, { level: r.level, verified })
    else if (current.level === r.level && verified) current.verified = true
  }
  const counts = new Map<QualificationKey, number>()
  let verified = 0
  for (const b of best.values()) {
    counts.set(b.level, (counts.get(b.level) ?? 0) + 1)
    if (b.verified) verified++
  }
  const none = Math.max(0, teachers - best.size)
  if (none) counts.set("NONE", none)
  const order: QualificationKey[] = [...QUALIFICATION_ORDER, "NONE"]
  return {
    teachers,
    recorded: best.size,
    verified,
    // Master's or higher, the usual benchmark for college faculty.
    mastersOrHigher: [...best.values()].filter((b) => QUALIFICATION_RANK[b.level] >= QUALIFICATION_RANK.MASTER).length,
    levels: order.filter((k) => counts.has(k)).map((k) => ({ key: k, teachers: counts.get(k)! })),
  }
}
