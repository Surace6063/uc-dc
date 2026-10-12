import type {
  AbsentTreatment,
  ComponentType,
  GpaMethod,
  GradingType,
  MarkStatus,
  RankBasis,
  RankScope,
  RankTieMode,
  ResultStatus,
  SubjectPassRule,
} from "@/lib/generated/prisma/enums"

// The one place examination results are calculated: marks → component and
// subject totals → pass/fail → grades and grade points → aggregate, GPA and
// ranks. Pure and deterministic, so every rule is unit-tested and the server
// (results, report cards, exports, analytics) and the marks-entry preview
// all agree.
//
// Exact arithmetic. Marks are integers in hundredths (37.25 → 3725),
// percentages integers in ten-thousandths of a percent (75% → 750000) and
// grade points integers in hundredths. Weighted parts are combined as exact
// BigInt fractions and rounded once, half-up, to the policy's decimal
// places, *before* a grade is looked up, so 74.995% never drifts across a
// boundary through floating-point error.

export const MARK_SCALE = 100
export const PCT_SCALE = 10_000 // units per 1 %
export const FULL_PERCENT = 100 * PCT_SCALE
// BigInt constants (the project targets ES2017, without BigInt literals).
const B0 = BigInt(0)
const B1 = BigInt(1)
const B2 = BigInt(2)
const B10 = BigInt(10)
const B100 = BigInt(100)

// ------------------------------------------------------------------ inputs

export type ScaleRule = {
  grade: string
  // Percent units; minimum inclusive, maximum exclusive (inclusive at 100 %).
  min: number
  max: number
  // Hundredths, or null.
  gradePoint: number | null
  isFailing: boolean
  description: string | null
}

export type ScaleRules = {
  id: string
  name: string
  version: number
  gradingType: GradingType
  rules: ScaleRule[]
}

export type PolicyRules = {
  id: string
  name: string
  subjectPassRule: SubjectPassRule
  componentPassRequired: boolean
  absentTreatment: AbsentTreatment
  optionalInAggregate: boolean
  gpaMethod: GpaMethod
  percentageDecimals: number
  gpaDecimals: number
  // Hundredths, or null for no grace marks.
  graceMarksPerSubject: number | null
  graceMaxSubjects: number
  rankingEnabled: boolean
  rankBasis: RankBasis
  rankScope: RankScope
  rankTieMode: RankTieMode
}

// The exact rules a result was calculated with; stored with approvals and
// publications so published results can always be reproduced.
export type RulesSnapshot = { policy: PolicyRules; scale: ScaleRules }

export type ComponentConfig = {
  id: string
  name: string
  type: ComponentType
  max: number
  pass: number | null
  // Weightage in hundredths of a percent (40 % → 4000), or null.
  weight: number | null
}

export type SubjectConfig = {
  id: string
  subjectId: string
  name: string
  code: string
  max: number
  pass: number | null
  credit: number | null
  isCompulsory: boolean
  components: ComponentConfig[]
}

export type MarkInput = { status: MarkStatus; marks: number | null }

// ------------------------------------------------------------------ outputs

export type ComponentResult = {
  componentId: string
  name: string
  type: ComponentType
  status: MarkStatus | "MISSING"
  marks: number | null
  max: number
  pass: number | null
  weight: number | null
  // Whether its own pass marks were met (null: none set, or exempt).
  passed: boolean | null
}

export type SubjectStatus = ResultStatus | "NOT_TAKEN"

export type SubjectResult = {
  examinationSubjectId: string
  subjectId: string
  name: string
  code: string
  isCompulsory: boolean
  credit: number | null
  status: SubjectStatus
  // Marks on the subject's scale (weighted parts converted), hundredths.
  obtained: number | null
  maximum: number | null
  // Pass marks scaled to the maximum actually assessed (exempt parts out).
  passMarks: number | null
  percentage: number | null
  grade: string | null
  gradePoint: number | null
  failingGrade: boolean
  grace: number
  // Counts towards the student's totals and GPA.
  included: boolean
  components: ComponentResult[]
  notes: string[]
}

export type StudentCalculation = {
  status: ResultStatus
  totalObtained: number | null
  totalMaximum: number | null
  percentage: number | null
  grade: string | null
  gradePoint: number | null
  // Ten-thousandths (3.6 → 36000), rounded to the policy's places.
  gpa: number | null
  subjects: SubjectResult[]
  graceApplied: boolean
  notes: string[]
}

// -------------------------------------------------------------- arithmetic

// Decimal input ("37.25", 37.25, Prisma.Decimal) → hundredths.
export function toHundredths(value: { toString(): string } | number | string): number
export function toHundredths(value: { toString(): string } | number | string | null | undefined): number | null
export function toHundredths(value: { toString(): string } | number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null
  const n = Number(typeof value === "number" ? value : value.toString())
  if (!Number.isFinite(n)) return null
  return Math.round(n * MARK_SCALE)
}

// Percent (0–100, up to 4 decimals) → percent units.
export const toPercentUnits = (value: { toString(): string } | number | string) =>
  Math.round(Number(typeof value === "number" ? value : value.toString()) * PCT_SCALE)

// Half-up division of non-negative integers.
function roundDiv(num: bigint, den: bigint) {
  return (B2 * num + den) / (B2 * den)
}

const pow10 = (n: number) => B10 ** BigInt(n)

// An exact fraction num/den (den > 0) → percent units rounded half-up to
// `decimals` places.
export function fractionToPercent(num: bigint, den: bigint, decimals: number) {
  const places = Math.max(0, Math.min(4, decimals))
  const rounded = roundDiv(num * B100 * pow10(places), den)
  return Number(rounded * pow10(4 - places))
}

// ------------------------------------------------------------- formatting

export function formatMarks(h: number | null | undefined) {
  if (h === null || h === undefined) return "—"
  const sign = h < 0 ? "-" : ""
  const abs = Math.abs(h)
  const whole = Math.floor(abs / MARK_SCALE)
  const frac = abs % MARK_SCALE
  if (frac === 0) return `${sign}${whole}`
  return `${sign}${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`
}

// Percent units → "75.25" with exactly `decimals` places.
export function formatPercent(units: number | null | undefined, decimals = 2) {
  if (units === null || units === undefined) return "—"
  const places = Math.max(0, Math.min(4, decimals))
  const scaled = Math.round(units / 10 ** (4 - places))
  const whole = Math.floor(scaled / 10 ** places)
  const frac = scaled % 10 ** places
  return places === 0 ? String(whole) : `${whole}.${String(frac).padStart(places, "0")}`
}

export const formatGradePoint = (h: number | null | undefined) =>
  h === null || h === undefined ? "—" : (h / MARK_SCALE).toFixed(2)

export const formatGpa = (units: number | null | undefined, decimals = 2) => formatPercent(units, decimals)

// ---------------------------------------------------------------- grading

// The band a percentage falls in: min ≤ p < max, or p = 100 in a band
// ending at 100. Null if the scale has a gap there (validation forbids it).
export function gradeFor(percent: number, scale: Pick<ScaleRules, "rules">): ScaleRule | null {
  return scale.rules.find((r) => percent >= r.min && (percent < r.max || (r.max === FULL_PERCENT && percent === FULL_PERCENT))) ?? null
}

// A scale's bands must be valid, non-overlapping and cover 0–100 exactly,
// so every percentage has exactly one grade.
export function validateScaleRules(rules: ScaleRule[], gradingType: GradingType): string[] {
  const errors: string[] = []
  if (rules.length === 0) return ["Add at least one grade band."]
  const grades = new Set<string>()
  for (const r of rules) {
    const label = r.grade || "(blank)"
    if (!r.grade.trim()) errors.push("Every band needs a grade.")
    if (grades.has(r.grade.trim().toUpperCase())) errors.push(`Grade ${label} appears more than once.`)
    grades.add(r.grade.trim().toUpperCase())
    if (r.min < 0 || r.max > FULL_PERCENT) errors.push(`Grade ${label}: percentages must be between 0 and 100.`)
    if (r.min >= r.max) errors.push(`Grade ${label}: the minimum must be below the maximum.`)
    if (gradingType === "GRADE_POINT" && r.gradePoint === null) errors.push(`Grade ${label}: a grade point is required for this grading type.`)
    if (r.gradePoint !== null && r.gradePoint < 0) errors.push(`Grade ${label}: grade points can't be negative.`)
  }
  if (errors.length) return [...new Set(errors)]
  const sorted = [...rules].sort((a, b) => a.min - b.min)
  if (sorted[0].min !== 0) errors.push(`No grade covers ${formatPercent(0, 0)}% to ${formatPercent(sorted[0].min)}%.`)
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    if (cur.min < prev.max) errors.push(`Grades ${prev.grade} and ${cur.grade} overlap.`)
    else if (cur.min > prev.max) errors.push(`No grade covers ${formatPercent(prev.max)}% to ${formatPercent(cur.min)}%.`)
  }
  if (sorted[sorted.length - 1].max !== FULL_PERCENT) errors.push(`No grade covers ${formatPercent(sorted[sorted.length - 1].max)}% to 100%.`)
  return errors
}

// ----------------------------------------------------------- configuration

export type ConfigIssues = { errors: string[]; warnings: string[] }

// Whether an examination's subjects and components can be calculated with
// these rules. Errors block scheduling, approval and publication.
export function validateConfiguration(subjects: SubjectConfig[], rules: RulesSnapshot): ConfigIssues {
  const errors: string[] = []
  const warnings: string[] = []
  const { policy, scale } = rules
  errors.push(...validateScaleRules(scale.rules, scale.gradingType).map((e) => `Grading scale ${scale.name}: ${e}`))
  if (subjects.length === 0) errors.push("Add at least one subject.")
  const needsPoints = policy.gpaMethod !== "NONE"
  if (needsPoints && scale.rules.some((r) => r.gradePoint === null)) {
    errors.push(`GPA needs grade points, but some grades of ${scale.name} have none.`)
  }
  for (const s of subjects) {
    const label = `${s.name}${s.code ? ` (${s.code})` : ""}`
    if (s.components.length === 0) {
      errors.push(`${label}: add at least one component (e.g. Theory).`)
      continue
    }
    if (s.max <= 0) errors.push(`${label}: full marks must be above zero.`)
    if (s.pass !== null && s.pass > s.max) errors.push(`${label}: pass marks exceed full marks.`)
    const names = new Set<string>()
    for (const c of s.components) {
      if (names.has(c.name.toLowerCase())) errors.push(`${label}: component ${c.name} appears twice.`)
      names.add(c.name.toLowerCase())
      if (c.max <= 0) errors.push(`${label} · ${c.name}: full marks must be above zero.`)
      if (c.pass !== null && c.pass > c.max) errors.push(`${label} · ${c.name}: pass marks exceed full marks.`)
    }
    const weighted = s.components.filter((c) => c.weight !== null)
    if (weighted.length > 0 && weighted.length < s.components.length) {
      errors.push(`${label}: give every component a weightage, or none.`)
    } else if (weighted.length > 0) {
      const total = weighted.reduce((sum, c) => sum + (c.weight ?? 0), 0)
      if (total !== 100 * MARK_SCALE) errors.push(`${label}: component weightages add up to ${formatMarks(total)}%, not 100%.`)
    } else {
      const total = s.components.reduce((sum, c) => sum + c.max, 0)
      if (total !== s.max) errors.push(`${label}: components add up to ${formatMarks(total)} marks but full marks are ${formatMarks(s.max)}.`)
    }
    if (policy.gpaMethod === "CREDIT_WEIGHTED" && s.credit === null && (s.isCompulsory || policy.optionalInAggregate)) {
      errors.push(`${label}: credit-weighted GPA needs credit hours for this subject.`)
    }
    const hasMarksRule = policy.subjectPassRule !== "GRADE"
    if (hasMarksRule && s.pass === null && !(policy.componentPassRequired && s.components.some((c) => c.pass !== null))) {
      warnings.push(`${label}: no pass marks are set, so it can't be failed on marks.`)
    }
  }
  if (policy.subjectPassRule !== "MARKS" && !scale.rules.some((r) => r.isFailing)) {
    warnings.push(`The policy passes subjects by grade, but ${scale.name} has no failing grade.`)
  }
  return { errors, warnings }
}

// ------------------------------------------------------------------ subject

type Exact = { num: bigint; den: bigint }

type Evaluated = SubjectResult & {
  // Exact obtained marks (hundredths) and the scaled pass mark, for grace.
  exact: Exact | null
  marksPass: boolean | null
  componentsPass: boolean
}

function evaluateSubject(config: SubjectConfig, marks: Map<string, MarkInput>, rules: RulesSnapshot, grace = 0): Evaluated {
  const { policy, scale } = rules
  const components: ComponentResult[] = config.components.map((c) => {
    const m = marks.get(c.id)
    return {
      componentId: c.id,
      name: c.name,
      type: c.type,
      status: m?.status ?? "MISSING",
      marks: m?.status === "SCORED" ? m.marks : null,
      max: c.max,
      pass: c.pass,
      weight: c.weight,
      passed: null,
    }
  })
  const base: Evaluated = {
    examinationSubjectId: config.id,
    subjectId: config.subjectId,
    name: config.name,
    code: config.code,
    isCompulsory: config.isCompulsory,
    credit: config.credit,
    status: "PENDING",
    obtained: null,
    maximum: null,
    passMarks: null,
    percentage: null,
    grade: null,
    gradePoint: null,
    failingGrade: false,
    grace: 0,
    included: false,
    components,
    notes: [],
    exact: null,
    marksPass: null,
    componentsPass: true,
  }

  const missing = components.filter((c) => c.status === "MISSING")
  // An optional subject with nothing entered isn't taken by this student.
  if (!config.isCompulsory && missing.length === components.length) return { ...base, status: "NOT_TAKEN" }
  if (components.some((c) => c.status === "WITHHELD")) return { ...base, status: "WITHHELD", notes: ["Marks withheld."] }
  if (missing.length) return { ...base, status: "PENDING", notes: [`Marks not entered: ${missing.map((c) => c.name).join(", ")}.`] }
  if (components.some((c) => c.status === "INCOMPLETE")) {
    return { ...base, status: "INCOMPLETE", notes: [`Incomplete: ${components.filter((c) => c.status === "INCOMPLETE").map((c) => c.name).join(", ")}.`] }
  }

  const active = components.filter((c) => c.status !== "EXEMPT")
  if (active.length === 0) return { ...base, status: "EXEMPT", notes: ["Exempt from this subject."] }
  const anyAbsent = active.some((c) => c.status === "ABSENT")
  const allAbsent = active.every((c) => c.status === "ABSENT")
  const scored = (c: ComponentResult) => (c.status === "SCORED" ? (c.marks ?? 0) : 0)

  // Exact obtained marks on the subject's scale, and the maximum assessed.
  let exact: Exact
  let maximum: number
  if (config.components.every((c) => c.weight !== null)) {
    // Σ (obtained/max × weight) / Σ weight, scaled to the subject's full marks.
    let num = B0
    let den = B1
    let weights = B0
    for (const c of active) {
      const w = BigInt(c.weight!)
      weights += w
      // num/den + (o × w)/max
      num = num * BigInt(c.max) + BigInt(scored(c)) * w * den
      den = den * BigInt(c.max)
    }
    exact = { num: num * BigInt(config.max), den: den * weights }
    maximum = config.max
  } else {
    exact = { num: BigInt(active.reduce((sum, c) => sum + scored(c), 0)), den: B1 }
    maximum = active.reduce((sum, c) => sum + c.max, 0)
  }
  if (grace > 0) exact = { num: exact.num + BigInt(grace) * exact.den, den: exact.den }

  const obtained = Number(roundDiv(exact.num, exact.den))
  const percentage = fractionToPercent(exact.num, exact.den * BigInt(maximum), policy.percentageDecimals)
  // Pass marks scale with exempt parts: pass × assessed / full.
  const passExact = config.pass === null ? null : { num: BigInt(config.pass) * BigInt(maximum), den: BigInt(config.max) }
  const marksPass = passExact === null ? null : exact.num * passExact.den >= passExact.num * exact.den

  for (const c of active) {
    if (c.pass !== null) c.passed = c.status === "SCORED" ? (c.marks ?? 0) >= c.pass : c.pass === 0
  }
  const componentsPass = !policy.componentPassRequired || active.every((c) => c.passed !== false)

  const band = allAbsent && policy.absentTreatment === "RESULT_ABSENT" ? null : gradeFor(percentage, scale)
  const failingGrade = band?.isFailing ?? false
  const byMarks = (marksPass ?? true) && componentsPass
  const byGrade = !failingGrade
  const passed =
    policy.subjectPassRule === "MARKS" ? byMarks : policy.subjectPassRule === "GRADE" ? byGrade : byMarks && byGrade

  const notes: string[] = []
  if (!componentsPass) notes.push(`Below pass marks in ${active.filter((c) => c.passed === false).map((c) => c.name).join(", ")}.`)
  if (active.length < components.length) notes.push(`Exempt from ${components.filter((c) => c.status === "EXEMPT").map((c) => c.name).join(", ")}.`)
  if (anyAbsent) notes.push(`Absent in ${active.filter((c) => c.status === "ABSENT").map((c) => c.name).join(", ")}.`)
  if (grace > 0) notes.push(`Includes ${formatMarks(grace)} grace mark${grace === MARK_SCALE ? "" : "s"}.`)

  const status: SubjectStatus = anyAbsent && policy.absentTreatment === "RESULT_ABSENT" ? "ABSENT" : passed ? "PASS" : "FAIL"
  return {
    ...base,
    status,
    obtained,
    maximum,
    passMarks: passExact === null ? null : Number(roundDiv(passExact.num, passExact.den)),
    percentage,
    grade: band?.grade ?? null,
    gradePoint: band?.gradePoint ?? null,
    failingGrade,
    grace,
    notes,
    exact,
    marksPass,
    componentsPass,
  }
}

// Drops the working values (BigInt fractions aren't JSON-serialisable).
function publicSubject(e: Evaluated): SubjectResult {
  return {
    examinationSubjectId: e.examinationSubjectId, subjectId: e.subjectId, name: e.name, code: e.code, isCompulsory: e.isCompulsory,
    credit: e.credit, status: e.status, obtained: e.obtained, maximum: e.maximum, passMarks: e.passMarks, percentage: e.percentage,
    grade: e.grade, gradePoint: e.gradePoint, failingGrade: e.failingGrade, grace: e.grace, included: e.included,
    components: e.components, notes: e.notes,
  }
}

// Marks needed to reach the (scaled) pass mark, rounded up to a hundredth.
function shortfall(config: SubjectConfig, s: Evaluated) {
  if (config.pass === null || !s.exact || s.maximum === null) return null
  const need = BigInt(config.pass) * BigInt(s.maximum) * s.exact.den - s.exact.num * BigInt(config.max)
  if (need <= B0) return 0
  const den = BigInt(config.max) * s.exact.den
  return Number((need + den - B1) / den)
}

// ------------------------------------------------------------------ student

export type StudentInput = {
  // examinationSubjectId → componentId → mark
  marks: Map<string, Map<string, MarkInput>>
  // An open result hold.
  held: boolean
}

export function calculateStudent(subjects: SubjectConfig[], input: StudentInput, rules: RulesSnapshot): StudentCalculation {
  const { policy, scale } = rules
  const marksFor = (id: string) => input.marks.get(id) ?? new Map<string, MarkInput>()
  let evaluated = subjects.map((s) => evaluateSubject(s, marksFor(s.id), rules))
  const notes: string[] = []

  // Grace marks: only when they turn every failing compulsory subject into
  // a pass, within the per-subject and number-of-subjects limits.
  let graceApplied = false
  const graceMax = policy.graceMarksPerSubject ?? 0
  if (graceMax > 0 && policy.graceMaxSubjects > 0 && policy.subjectPassRule !== "GRADE" && !input.held) {
    const failing = evaluated
      .map((s, i) => ({ s, i, config: subjects[i] }))
      .filter(({ s }) => s.isCompulsory && s.status === "FAIL")
    const needs = failing.map(({ s, config }) => (s.componentsPass && s.marksPass === false ? shortfall(config, s) : null))
    if (failing.length > 0 && failing.length <= policy.graceMaxSubjects && needs.every((n): n is number => n !== null && n > 0 && n <= graceMax)) {
      const trial = [...evaluated]
      failing.forEach(({ i, config }, k) => (trial[i] = evaluateSubject(config, marksFor(config.id), rules, needs[k])))
      if (failing.every(({ i }) => trial[i].status === "PASS")) {
        evaluated = trial
        graceApplied = true
        notes.push(`Grace marks applied in ${failing.length} subject${failing.length === 1 ? "" : "s"}.`)
      }
    }
  }

  const results: SubjectResult[] = evaluated.map((e) => ({
    ...publicSubject(e),
    included: e.status !== "NOT_TAKEN" && e.status !== "EXEMPT" && (e.isCompulsory || policy.optionalInAggregate),
  }))
  const applicable = results.filter((s) => s.status !== "NOT_TAKEN")
  const empty = { totalObtained: null, totalMaximum: null, percentage: null, grade: null, gradePoint: null, gpa: null }
  const finish = (status: ResultStatus, extra: Partial<StudentCalculation> = {}): StudentCalculation => ({
    status,
    ...empty,
    subjects: results,
    graceApplied,
    notes,
    ...extra,
  })

  if (input.held) return finish("WITHHELD", { notes: [...notes, "Result withheld by the institution."] })
  if (applicable.some((s) => s.status === "WITHHELD")) return finish("WITHHELD")
  if (applicable.length === 0) return finish("PENDING", { notes: ["No subjects apply to this student."] })
  if (applicable.some((s) => s.status === "PENDING")) return finish("PENDING")
  if (applicable.some((s) => s.status === "INCOMPLETE")) return finish("INCOMPLETE")

  const included = results.filter((s) => s.included)
  if (included.length === 0) return finish("EXEMPT")

  const compulsory = applicable.filter((s) => s.isCompulsory && s.status !== "EXEMPT")
  const status: ResultStatus =
    compulsory.length > 0 && compulsory.every((s) => s.status === "ABSENT")
      ? "ABSENT"
      : compulsory.some((s) => s.status === "FAIL" || s.status === "ABSENT")
        ? "FAIL"
        : "PASS"

  // Totals add up the subject marks as shown (two decimals), so a report
  // card's total always equals the sum of its rows.
  const totalObtained = included.reduce((sum, s) => sum + (s.obtained ?? 0), 0)
  const totalMaximum = included.reduce((sum, s) => sum + (s.maximum ?? 0), 0)
  const percentage = totalMaximum > 0 ? fractionToPercent(BigInt(totalObtained), BigInt(totalMaximum), policy.percentageDecimals) : null
  const band = percentage === null ? null : gradeFor(percentage, scale)

  let gpa: number | null = null
  if (policy.gpaMethod !== "NONE") {
    const noPoint = included.filter((s) => s.gradePoint === null)
    const noCredit = policy.gpaMethod === "CREDIT_WEIGHTED" ? included.filter((s) => s.credit === null || s.credit <= 0) : []
    if (noPoint.length) notes.push(`GPA not calculated: no grade point for ${noPoint.map((s) => s.name).join(", ")}.`)
    else if (noCredit.length) notes.push(`GPA not calculated: no credit hours for ${noCredit.map((s) => s.name).join(", ")}.`)
    else {
      // Σ(gp × credit) / Σ credit, or the plain mean of grade points.
      const weightOf = (s: SubjectResult) => BigInt(policy.gpaMethod === "CREDIT_WEIGHTED" ? s.credit! : MARK_SCALE)
      const num = included.reduce((sum, s) => sum + BigInt(s.gradePoint!) * weightOf(s), B0)
      const den = included.reduce((sum, s) => sum + weightOf(s), B0) * BigInt(MARK_SCALE)
      // fractionToPercent multiplies by 100; GPA wants the plain value.
      gpa = fractionToPercent(num, den * B100, policy.gpaDecimals)
    }
  }

  return finish(status, {
    totalObtained,
    totalMaximum,
    percentage,
    grade: band?.grade ?? null,
    gradePoint: band?.gradePoint ?? null,
    gpa,
  })
}

// ------------------------------------------------------------------ ranking

export type Rankable = { key: string; classId: string; sectionId: string | null; calculation: Pick<StudentCalculation, "status" | "totalObtained" | "percentage" | "gpa"> }

// Ranks among passed results only, per class or section. Ties share a rank:
// 1, 1, 3 (SHARED) or 1, 1, 2 (DENSE). Results without the ranked value
// (e.g. no GPA) are left unranked.
export function assignRanks(rows: Rankable[], policy: Pick<PolicyRules, "rankingEnabled" | "rankBasis" | "rankScope" | "rankTieMode">) {
  const ranks = new Map<string, number>()
  if (!policy.rankingEnabled) return ranks
  const valueOf = (r: Rankable) =>
    policy.rankBasis === "TOTAL" ? r.calculation.totalObtained : policy.rankBasis === "GPA" ? r.calculation.gpa : r.calculation.percentage
  const groups = new Map<string, { key: string; value: number }[]>()
  for (const r of rows) {
    const value = valueOf(r)
    if (r.calculation.status !== "PASS" || value === null) continue
    const group = policy.rankScope === "SECTION" ? `${r.classId}:${r.sectionId ?? ""}` : r.classId
    const list = groups.get(group) ?? []
    list.push({ key: r.key, value })
    groups.set(group, list)
  }
  for (const list of groups.values()) {
    list.sort((a, b) => b.value - a.value)
    let rank = 0
    let distinct = 0
    let previous: number | null = null
    list.forEach((item, i) => {
      if (item.value !== previous) {
        distinct++
        rank = policy.rankTieMode === "DENSE" ? distinct : i + 1
        previous = item.value
      }
      ranks.set(item.key, rank)
    })
  }
  return ranks
}

// -------------------------------------------------------------- summaries

export type StatusCounts = Partial<Record<ResultStatus, number>>

export function countStatuses(calculations: Pick<StudentCalculation, "status">[]): StatusCounts {
  const counts: StatusCounts = {}
  for (const c of calculations) counts[c.status] = (counts[c.status] ?? 0) + 1
  return counts
}

// Pass rate among students with a final result (pass, fail or absent).
export function passRate(counts: StatusCounts) {
  const decided = (counts.PASS ?? 0) + (counts.FAIL ?? 0) + (counts.ABSENT ?? 0)
  return decided === 0 ? null : fractionToPercent(BigInt(counts.PASS ?? 0), BigInt(decided), 1)
}
