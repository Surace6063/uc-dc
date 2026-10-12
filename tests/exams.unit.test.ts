// Pure-logic examination tests (no database). Run with: npm test
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assignRanks,
  calculateStudent,
  formatMarks,
  formatPercent,
  fractionToPercent,
  gradeFor,
  passRate,
  toHundredths,
  validateConfiguration,
  validateScaleRules,
  type ComponentConfig,
  type MarkInput,
  type PolicyRules,
  type RulesSnapshot,
  type ScaleRule,
  type SubjectConfig,
} from "@/features/exams/calculation"
import { canEnterMarks, teachesClass } from "@/features/exams/access"
import { markCellText, parseMarkCell } from "@/features/exams/constants"
import { parseExamFilters, parseResultFilters } from "@/features/exams/filters"
import { examinationSchema, examinationSubjectSchema, saveMarksSchema } from "@/features/exams/schemas"
import { DEFAULT_ROLES } from "@/lib/authorization/permissions"

// A demonstration scale only (letter grades with grade points); real
// institutions configure their own.
const band = (grade: string, min: number, max: number, gp: number | null, isFailing = false): ScaleRule => ({
  grade, min: min * 10_000, max: max * 10_000, gradePoint: gp === null ? null : Math.round(gp * 100), isFailing, description: null,
})
const demoRules = [
  band("A+", 90, 100, 4), band("A", 80, 90, 3.6), band("B+", 70, 80, 3.2), band("B", 60, 70, 2.8),
  band("C+", 50, 60, 2.4), band("C", 40, 50, 2), band("D", 35, 40, 1.6), band("NG", 0, 35, 0, true),
]
const policy: PolicyRules = {
  id: "p", name: "Policy", subjectPassRule: "MARKS", componentPassRequired: false, absentTreatment: "RESULT_ABSENT",
  optionalInAggregate: false, gpaMethod: "NONE", percentageDecimals: 2, gpaDecimals: 2, graceMarksPerSubject: null,
  graceMaxSubjects: 0, rankingEnabled: false, rankBasis: "PERCENTAGE", rankScope: "SECTION", rankTieMode: "SHARED",
}
const rules = (overrides: Partial<PolicyRules> = {}, scaleRules = demoRules): RulesSnapshot => ({
  policy: { ...policy, ...overrides },
  scale: { id: "s", name: "Demo", version: 1, gradingType: "GRADE_POINT", rules: scaleRules },
})

const h = (n: number) => Math.round(n * 100)
const comp = (id: string, max: number, extra: Partial<ComponentConfig> = {}): ComponentConfig => ({
  id, name: id, type: "THEORY", max: h(max), pass: null, weight: null, ...extra,
})
const subject = (id: string, components: ComponentConfig[], extra: Partial<SubjectConfig> = {}): SubjectConfig => ({
  id, subjectId: `sub-${id}`, name: id, code: id.toUpperCase(), max: components.reduce((s, c) => s + c.max, 0), pass: null,
  credit: null, isCompulsory: true, components, ...extra,
})
const scored = (marks: number): MarkInput => ({ status: "SCORED", marks: h(marks) })
const status = (s: MarkInput["status"]): MarkInput => ({ status: s, marks: null })
const input = (entries: Record<string, Record<string, MarkInput>>, held = false) => ({
  held,
  marks: new Map(Object.entries(entries).map(([s, m]) => [s, new Map(Object.entries(m))])),
})

describe("decimal handling", () => {
  it("converts decimals to hundredths without float drift", () => {
    assert.equal(toHundredths("37.25"), 3725)
    assert.equal(toHundredths(0.1 + 0.2), 30)
    assert.equal(toHundredths(null), null)
    assert.equal(formatMarks(3750), "37.5")
    assert.equal(formatMarks(3700), "37")
    assert.equal(formatMarks(3705), "37.05")
  })

  it("rounds half-up at the configured places", () => {
    // 2/3 = 66.666…%
    assert.equal(formatPercent(fractionToPercent(BigInt(2), BigInt(3), 2), 2), "66.67")
    assert.equal(formatPercent(fractionToPercent(BigInt(2), BigInt(3), 0), 0), "67")
    // 74.995 % rounds to 75.00 at two places, 74.99 never becomes 75.
    assert.equal(formatPercent(fractionToPercent(BigInt(74995), BigInt(100000), 2), 2), "75.00")
    assert.equal(formatPercent(fractionToPercent(BigInt(7499), BigInt(10000), 2), 2), "74.99")
  })
})

describe("grading scales", () => {
  it("accepts contiguous bands covering 0–100", () => {
    assert.deepEqual(validateScaleRules(demoRules, "GRADE_POINT"), [])
  })

  it("refuses overlaps, gaps, duplicates and missing grade points", () => {
    assert.match(validateScaleRules([band("A", 50, 100, 4), band("B", 40, 60, 3), band("C", 0, 40, 2)], "LETTER").join(), /overlap/)
    assert.match(validateScaleRules([band("A", 60, 100, 4), band("C", 0, 50, 2)], "LETTER").join(), /No grade covers 50.00% to 60.00%/)
    assert.match(validateScaleRules([band("A", 50, 100, 4)], "LETTER").join(), /No grade covers 0% to 50.00%/)
    assert.match(validateScaleRules([band("A", 50, 90, 4), band("C", 0, 50, 2)], "LETTER").join(), /90.00% to 100%/)
    assert.match(validateScaleRules([band("A", 50, 100, 4), band("a", 0, 50, 2)], "LETTER").join(), /more than once/)
    assert.match(validateScaleRules([band("A", 50, 100, null), band("B", 0, 50, 2)], "GRADE_POINT").join(), /grade point is required/)
    assert.deepEqual(validateScaleRules([band("A", 50, 100, null), band("B", 0, 50, null)], "LETTER"), [])
    assert.match(validateScaleRules([], "LETTER").join(), /at least one/)
  })

  it("uses inclusive minimums and exclusive maximums, with 100 % in the top band", () => {
    const scale = { rules: demoRules }
    assert.equal(gradeFor(90 * 10_000, scale)?.grade, "A+")
    assert.equal(gradeFor(89.9999 * 10_000, scale)?.grade, "A")
    assert.equal(gradeFor(100 * 10_000, scale)?.grade, "A+")
    assert.equal(gradeFor(35 * 10_000, scale)?.grade, "D")
    assert.equal(gradeFor(34.99 * 10_000, scale)?.grade, "NG")
    assert.equal(gradeFor(0, scale)?.grade, "NG")
  })
})

describe("examination configuration", () => {
  it("requires components that add up to full marks, or weightages adding to 100", () => {
    const ok = subject("maths", [comp("th", 75), comp("pr", 25)])
    assert.deepEqual(validateConfiguration([ok], rules()).errors, [])
    assert.match(validateConfiguration([{ ...ok, max: h(90) }], rules()).errors.join(), /add up to 100 marks but full marks are 90/)
    const weighted = subject("sci", [comp("th", 50, { weight: h(60) }), comp("pr", 20, { weight: h(30) })], { max: h(100) })
    assert.match(validateConfiguration([weighted], rules()).errors.join(), /weightages add up to 90%/)
    const mixed = subject("eng", [comp("th", 50, { weight: h(60) }), comp("pr", 50)], { max: h(100) })
    assert.match(validateConfiguration([mixed], rules()).errors.join(), /every component a weightage, or none/)
    assert.match(validateConfiguration([subject("x", [])], rules()).errors.join(), /at least one component/)
    assert.match(validateConfiguration([], rules()).errors.join(), /at least one subject/)
  })

  it("needs credits and grade points for credit-weighted GPA", () => {
    const s = subject("maths", [comp("th", 100)])
    assert.match(validateConfiguration([s], rules({ gpaMethod: "CREDIT_WEIGHTED" })).errors.join(), /needs credit hours/)
    assert.deepEqual(validateConfiguration([{ ...s, credit: h(3) }], rules({ gpaMethod: "CREDIT_WEIGHTED" })).errors, [])
    const letters = demoRules.map((r) => ({ ...r, gradePoint: null }))
    assert.match(validateConfiguration([{ ...s, credit: h(3) }], rules({ gpaMethod: "SIMPLE_AVERAGE" }, letters)).errors.join(), /GPA needs grade points/)
  })

  it("warns when a subject can't be failed", () => {
    assert.match(validateConfiguration([subject("art", [comp("th", 100)])], rules()).warnings.join(), /no pass marks/)
  })
})

describe("subject results", () => {
  const maths = subject("maths", [comp("th", 75, { pass: h(27) }), comp("pr", 25, { pass: h(10) })], { pass: h(35) })

  it("adds raw component marks and grades the percentage", () => {
    const r = calculateStudent([maths], input({ maths: { th: scored(60), pr: scored(20.5) } }), rules())
    const s = r.subjects[0]
    assert.equal(s.obtained, h(80.5))
    assert.equal(s.maximum, h(100))
    assert.equal(formatPercent(s.percentage), "80.50")
    assert.equal(s.grade, "A")
    assert.equal(s.gradePoint, 360)
    assert.equal(s.status, "PASS")
    assert.equal(r.status, "PASS")
  })

  it("grades exactly on boundaries after rounding", () => {
    // 89.995 / 100 rounds to 90.00 at two places → A+, but to 89.99… never at 2 places from 89.994.
    const r1 = calculateStudent([subject("s", [comp("th", 200)])], input({ s: { th: scored(179.99) } }), rules())
    assert.equal(formatPercent(r1.subjects[0].percentage), "90.00") // 89.995 → 90.00
    assert.equal(r1.subjects[0].grade, "A+")
    const r2 = calculateStudent([subject("s", [comp("th", 200)])], input({ s: { th: scored(179.98) } }), rules())
    assert.equal(formatPercent(r2.subjects[0].percentage), "89.99")
    assert.equal(r2.subjects[0].grade, "A")
    // With whole-number rounding, 89.5 % rounds up to 90.
    const r3 = calculateStudent([subject("s", [comp("th", 100)])], input({ s: { th: scored(89.5) } }), rules({ percentageDecimals: 0 }))
    assert.equal(r3.subjects[0].grade, "A+")
  })

  it("fails below subject pass marks, and on components only when the policy says so", () => {
    const failing = calculateStudent([maths], input({ maths: { th: scored(25), pr: scored(9) } }), rules())
    assert.equal(failing.subjects[0].status, "FAIL")
    assert.equal(failing.status, "FAIL")
    // 26 + 24 = 50 passes overall, but theory 26 < 27.
    const comps = input({ maths: { th: scored(26), pr: scored(24) } })
    assert.equal(calculateStudent([maths], comps, rules()).subjects[0].status, "PASS")
    const strict = calculateStudent([maths], comps, rules({ componentPassRequired: true }))
    assert.equal(strict.subjects[0].status, "FAIL")
    assert.match(strict.subjects[0].notes.join(), /Below pass marks in th/)
    assert.equal(strict.subjects[0].components[0].passed, false)
  })

  it("can pass by grade instead of marks", () => {
    const s = subject("s", [comp("th", 100)], { pass: h(40) })
    const m = input({ s: { th: scored(36) } }) // D: not failing, but below 40 marks
    assert.equal(calculateStudent([s], m, rules({ subjectPassRule: "MARKS" })).status, "FAIL")
    assert.equal(calculateStudent([s], m, rules({ subjectPassRule: "GRADE" })).status, "PASS")
    assert.equal(calculateStudent([s], m, rules({ subjectPassRule: "MARKS_AND_GRADE" })).status, "FAIL")
    const ng = input({ s: { th: scored(30) } })
    assert.equal(calculateStudent([{ ...s, pass: null }], ng, rules({ subjectPassRule: "GRADE" })).status, "FAIL")
  })

  it("applies component weightage exactly", () => {
    // Theory 40/50 × 70 % + practical 15/20 × 30 % = 56 + 22.5 = 78.5 % of 100.
    const s = subject("sci", [comp("th", 50, { weight: h(70) }), comp("pr", 20, { weight: h(30) })], { max: h(100), pass: h(40) })
    const r = calculateStudent([s], input({ sci: { th: scored(40), pr: scored(15) } }), rules())
    assert.equal(r.subjects[0].obtained, h(78.5))
    assert.equal(r.subjects[0].maximum, h(100))
    assert.equal(formatPercent(r.subjects[0].percentage), "78.50")
    // Thirds: 1/3 × 50 % + 2/3 × 50 % = 50 % exactly.
    const t = subject("t", [comp("a", 3, { weight: h(50) }), comp("b", 3, { weight: h(50) })], { max: h(100) })
    assert.equal(formatPercent(calculateStudent([t], input({ t: { a: scored(1), b: scored(2) } }), rules()).subjects[0].percentage), "50.00")
  })
})

describe("absent, missing, incomplete, exempt and withheld", () => {
  const s = subject("s", [comp("th", 75), comp("pr", 25)], { pass: h(35) })
  const other = subject("o", [comp("th", 100)], { pass: h(35) })

  it("never treats missing marks as zero", () => {
    const r = calculateStudent([s], input({ s: { th: scored(70) } }), rules())
    assert.equal(r.subjects[0].status, "PENDING")
    assert.equal(r.status, "PENDING")
    assert.equal(r.percentage, null)
    assert.equal(r.totalObtained, null)
  })

  it("follows the absence policy", () => {
    const m = input({ s: { th: scored(60), pr: status("ABSENT") } })
    const asAbsent = calculateStudent([s], m, rules({ absentTreatment: "RESULT_ABSENT" }))
    assert.equal(asAbsent.subjects[0].status, "ABSENT")
    assert.equal(asAbsent.status, "ABSENT")
    const asZero = calculateStudent([s], m, rules({ absentTreatment: "COUNT_AS_ZERO" }))
    assert.equal(asZero.subjects[0].status, "PASS")
    assert.equal(asZero.subjects[0].obtained, h(60))
    // Absent in one of two compulsory subjects is a fail overall, not "absent".
    const two = calculateStudent([s, other], input({ s: { th: status("ABSENT"), pr: status("ABSENT") }, o: { th: scored(80) } }), rules())
    assert.equal(two.subjects[0].status, "ABSENT")
    assert.equal(two.subjects[0].grade, null)
    assert.equal(two.status, "FAIL")
  })

  it("blocks a final result while anything is incomplete or withheld", () => {
    assert.equal(calculateStudent([s], input({ s: { th: scored(70), pr: status("INCOMPLETE") } }), rules()).status, "INCOMPLETE")
    assert.equal(calculateStudent([s], input({ s: { th: scored(70), pr: status("WITHHELD") } }), rules()).status, "WITHHELD")
    const held = calculateStudent([s], input({ s: { th: scored(70), pr: scored(20) } }, true), rules())
    assert.equal(held.status, "WITHHELD")
    assert.equal(held.percentage, null)
  })

  it("leaves exempt components out of the maximum and scales pass marks", () => {
    // Exempt from practical: 30 / 75 = 40 %, pass marks 35 × 75/100 = 26.25.
    const r = calculateStudent([s], input({ s: { th: scored(30), pr: status("EXEMPT") } }), rules())
    assert.equal(r.subjects[0].maximum, h(75))
    assert.equal(r.subjects[0].passMarks, h(26.25))
    assert.equal(formatPercent(r.subjects[0].percentage), "40.00")
    assert.equal(r.subjects[0].status, "PASS")
    const all = calculateStudent([s, other], input({ s: { th: status("EXEMPT"), pr: status("EXEMPT") }, o: { th: scored(50) } }), rules())
    assert.equal(all.subjects[0].status, "EXEMPT")
    assert.equal(all.subjects[0].included, false)
    assert.equal(all.totalMaximum, h(100))
    assert.equal(calculateStudent([s], input({ s: { th: status("EXEMPT"), pr: status("EXEMPT") } }), rules()).status, "EXEMPT")
  })

  it("applies optional subjects only to students who took them", () => {
    const opt = subject("opt", [comp("th", 100)], { isCompulsory: false, pass: h(35) })
    const notTaken = calculateStudent([other, opt], input({ o: { th: scored(50) } }), rules())
    assert.equal(notTaken.subjects[1].status, "NOT_TAKEN")
    assert.equal(notTaken.status, "PASS")
    // A failed optional subject never fails the student.
    const failedOpt = calculateStudent([other, opt], input({ o: { th: scored(50) }, opt: { th: scored(10) } }), rules())
    assert.equal(failedOpt.subjects[1].status, "FAIL")
    assert.equal(failedOpt.status, "PASS")
    assert.equal(failedOpt.totalMaximum, h(100))
    const counted = calculateStudent([other, opt], input({ o: { th: scored(50) }, opt: { th: scored(90) } }), rules({ optionalInAggregate: true }))
    assert.equal(counted.totalObtained, h(140))
    assert.equal(counted.totalMaximum, h(200))
  })
})

describe("totals, GPA and grace marks", () => {
  const eng = subject("eng", [comp("th", 100)], { pass: h(35), credit: h(4) })
  const sci = subject("sci", [comp("th", 75), comp("pr", 25)], { pass: h(35), credit: h(5) })
  const nep = subject("nep", [comp("th", 100)], { pass: h(35), credit: h(3) })

  it("adds totals and grades the aggregate percentage", () => {
    const r = calculateStudent([eng, sci], input({ eng: { th: scored(72.5) }, sci: { th: scored(60), pr: scored(21) } }), rules())
    assert.equal(r.totalObtained, h(153.5))
    assert.equal(r.totalMaximum, h(200))
    assert.equal(formatPercent(r.percentage), "76.75")
    assert.equal(r.grade, "B+")
  })

  it("computes credit-weighted and simple-average GPA", () => {
    // eng 92 → 4.0 × 4, sci 81 → 3.6 × 5, nep 45 → 2.0 × 3: (16 + 18 + 6) / 12 = 3.333…
    const m = input({ eng: { th: scored(92) }, sci: { th: scored(60), pr: scored(21) }, nep: { th: scored(45) } })
    const credit = calculateStudent([eng, sci, nep], m, rules({ gpaMethod: "CREDIT_WEIGHTED" }))
    assert.equal(formatPercent(credit.gpa, 2), "3.33")
    // (4 + 3.6 + 2) / 3 = 3.2
    const simple = calculateStudent([eng, sci, nep], m, rules({ gpaMethod: "SIMPLE_AVERAGE", gpaDecimals: 3 }))
    assert.equal(formatPercent(simple.gpa, 3), "3.200")
    assert.equal(calculateStudent([eng], input({ eng: { th: scored(92) } }), rules()).gpa, null)
  })

  it("doesn't invent a GPA when a credit or grade point is missing", () => {
    const r = calculateStudent([{ ...eng, credit: null }], input({ eng: { th: scored(92) } }), rules({ gpaMethod: "CREDIT_WEIGHTED" }))
    assert.equal(r.gpa, null)
    assert.match(r.notes.join(), /no credit hours/)
    const absent = calculateStudent([eng, nep], input({ eng: { th: status("ABSENT") }, nep: { th: scored(50) } }), rules({ gpaMethod: "SIMPLE_AVERAGE" }))
    assert.equal(absent.gpa, null)
    assert.match(absent.notes.join(), /no grade point/)
  })

  it("applies grace marks only when they turn every failure into a pass", () => {
    const grace = { graceMarksPerSubject: h(3), graceMaxSubjects: 2 }
    const m = input({ eng: { th: scored(33) }, nep: { th: scored(34) } })
    const r = calculateStudent([eng, nep], m, rules(grace))
    assert.equal(r.status, "PASS")
    assert.equal(r.graceApplied, true)
    assert.equal(r.subjects[0].grace, h(2))
    assert.equal(r.subjects[0].obtained, h(35))
    assert.equal(r.subjects[1].grace, h(1))
    // Too far below for one subject: no grace for any.
    const far = calculateStudent([eng, nep], input({ eng: { th: scored(30) }, nep: { th: scored(34) } }), rules(grace))
    assert.equal(far.status, "FAIL")
    assert.equal(far.graceApplied, false)
    assert.equal(far.subjects[1].grace, 0)
    // More failing subjects than allowed.
    const many = calculateStudent([eng, nep], m, rules({ ...grace, graceMaxSubjects: 1 }))
    assert.equal(many.status, "FAIL")
    // Off by default.
    assert.equal(calculateStudent([eng, nep], m, rules()).status, "FAIL")
  })
})

describe("ranking", () => {
  const row = (key: string, pct: number | null, st: "PASS" | "FAIL" = "PASS", sectionId: string | null = "a") => ({
    key, classId: "c", sectionId, calculation: { status: st, totalObtained: pct === null ? null : pct * 100, percentage: pct === null ? null : pct * 10_000, gpa: null },
  })
  const enabled = { rankingEnabled: true, rankBasis: "PERCENTAGE" as const, rankScope: "SECTION" as const, rankTieMode: "SHARED" as const }

  it("is off unless enabled", () => {
    assert.equal(assignRanks([row("a", 90)], { ...enabled, rankingEnabled: false }).size, 0)
  })

  it("ranks passed results with shared or dense ties", () => {
    const rows = [row("a", 90), row("b", 95), row("c", 90), row("d", 80), row("e", 99, "FAIL")]
    const shared = assignRanks(rows, enabled)
    assert.deepEqual([shared.get("b"), shared.get("a"), shared.get("c"), shared.get("d")], [1, 2, 2, 4])
    assert.equal(shared.has("e"), false)
    const dense = assignRanks(rows, { ...enabled, rankTieMode: "DENSE" })
    assert.equal(dense.get("d"), 3)
  })

  it("ranks within sections or the whole class", () => {
    const rows = [row("a", 90, "PASS", "a"), row("b", 80, "PASS", "b")]
    assert.deepEqual([...assignRanks(rows, enabled).values()], [1, 1])
    const byClass = assignRanks(rows, { ...enabled, rankScope: "CLASS" })
    assert.equal(byClass.get("b"), 2)
  })

  it("reports pass rates over decided results", () => {
    assert.equal(formatPercent(passRate({ PASS: 2, FAIL: 1, PENDING: 5 }), 1), "66.7")
    assert.equal(passRate({ PENDING: 2 }), null)
  })
})

describe("who may enter marks", () => {
  const year = "y"
  const t = (sectionId: string | null, subjectId = "maths") => ({ academicYearId: year, classId: "c8", sectionId, subjectId })
  const a = (sectionId: string | null, subjectId: string | null = "maths", role: "SUBJECT_TEACHER" | "CLASS_TEACHER" = "SUBJECT_TEACHER") => ({ academicYearId: year, classId: "c8", sectionId, subjectId, role })

  it("needs an assignment to the subject in that class, section and year", () => {
    assert.equal(canEnterMarks([a(null)], t("A")), true)
    assert.equal(canEnterMarks([a("A")], t("A")), true)
    assert.equal(canEnterMarks([a("A")], t("B")), false)
    // A section teacher can't fill a whole-class sheet.
    assert.equal(canEnterMarks([a("A")], t(null)), false)
    assert.equal(canEnterMarks([a(null, "science")], t("A")), false)
    // Being class teacher alone doesn't grant marks entry.
    assert.equal(canEnterMarks([a("A", null, "CLASS_TEACHER")], t("A")), false)
    assert.equal(canEnterMarks([{ ...a(null), academicYearId: "other" }], t("A")), false)
  })

  it("lets class and subject teachers see their classes' results", () => {
    assert.equal(teachesClass([a("A", null, "CLASS_TEACHER")], { academicYearId: year, classId: "c8", sectionId: "A" }), true)
    assert.equal(teachesClass([a("A")], { academicYearId: year, classId: "c8", sectionId: "B" }), false)
  })
})

describe("mark cells", () => {
  it("reads marks, status codes and blanks", () => {
    assert.deepEqual(parseMarkCell("62.5", 7500), { kind: "mark", status: "SCORED", marks: 6250 })
    assert.deepEqual(parseMarkCell(" ab "), { kind: "mark", status: "ABSENT", marks: null })
    assert.deepEqual(parseMarkCell("EX"), { kind: "mark", status: "EXEMPT", marks: null })
    assert.deepEqual(parseMarkCell("inc"), { kind: "mark", status: "INCOMPLETE", marks: null })
    assert.deepEqual(parseMarkCell("WH"), { kind: "mark", status: "WITHHELD", marks: null })
    assert.deepEqual(parseMarkCell(""), { kind: "empty" })
  })

  it("refuses negatives, too many decimals, words and marks above full marks", () => {
    assert.match((parseMarkCell("-1") as { message: string }).message, /negative/)
    assert.equal(parseMarkCell("10.555").kind, "error")
    assert.equal(parseMarkCell("ten").kind, "error")
    assert.match((parseMarkCell("75.01", 7500) as { message: string }).message, /Above the full marks/)
    assert.equal(parseMarkCell("75", 7500).kind, "mark")
  })

  it("round-trips through the grid text", () => {
    assert.equal(markCellText({ status: "SCORED", marks: 6250 }), "62.5")
    assert.equal(markCellText({ status: "ABSENT", marks: null }), "AB")
    assert.equal(markCellText(null), "")
  })
})

describe("examination schemas", () => {
  const base = {
    academicYearId: "3a1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b01", assessmentTypeId: "3a1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b02", name: "First Terminal",
    startDate: "2026-06-01", endDate: "2026-06-10", gradingScaleId: "3a1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b03", resultPolicyId: "3a1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b04",
  }
  it("checks date order", () => {
    assert.equal(examinationSchema.safeParse(base).success, true)
    assert.equal(examinationSchema.safeParse({ ...base, endDate: "2026-05-31" }).success, false)
    assert.equal(examinationSchema.safeParse({ ...base, resultPublicationDate: "2026-05-01" }).success, false)
  })

  it("validates subject marks and components", () => {
    const subject = { maximumMarks: "100", passMarks: "35", components: [{ name: "Theory", componentType: "THEORY", maximumMarks: "100" }] }
    assert.equal(examinationSubjectSchema.safeParse(subject).success, true)
    assert.equal(examinationSubjectSchema.safeParse({ ...subject, passMarks: "101" }).success, false)
    assert.equal(examinationSubjectSchema.safeParse({ ...subject, maximumMarks: "0" }).success, false)
    assert.equal(examinationSubjectSchema.safeParse({ ...subject, maximumMarks: "10.555" }).success, false)
    assert.equal(examinationSubjectSchema.safeParse({ ...subject, components: [] }).success, false)
    assert.equal(examinationSubjectSchema.safeParse({ ...subject, startTime: "10:00", endTime: "09:00" }).success, false)
  })

  it("rejects negative or malformed marks before they reach the database", () => {
    const entry = (marks: number | null, status: string | null = "SCORED") => ({
      scope: { examinationSubjectId: base.academicYearId, sectionId: "" },
      entries: [{ studentId: base.assessmentTypeId, marks: [{ componentId: base.gradingScaleId, status, marks }] }],
    })
    assert.equal(saveMarksSchema.safeParse(entry(40)).success, true)
    assert.equal(saveMarksSchema.safeParse(entry(-1)).success, false)
    assert.equal(saveMarksSchema.safeParse(entry(null, "ABSENT")).success, true)
    assert.equal(saveMarksSchema.safeParse(entry(null, "LATE")).success, false)
  })

  it("parses list filters defensively", () => {
    const f = parseExamFilters({ page: "-3", pageSize: "7", status: "NOPE", year: "not-a-uuid", sort: "name", dir: "asc" })
    assert.equal(f.page, 1)
    assert.equal(f.pageSize, 25)
    assert.equal(f.status, undefined)
    assert.equal(f.year, undefined)
    assert.equal(f.sort, "name")
    assert.equal(parseResultFilters({ view: "provisional" }).view, "provisional")
    assert.equal(parseResultFilters({ view: "draft" }).view, undefined)
  })
})

describe("examination roles", () => {
  const perms = (slug: string) => DEFAULT_ROLES.find((r) => r.slug === slug)!.permissions as readonly string[]
  it("separates preparing, approving and publishing results", () => {
    assert.ok(perms("exam_officer").includes("exams.publish"))
    assert.ok(!perms("exam_officer").includes("exams.approve"))
    assert.ok(perms("academic_coordinator").includes("exams.approve"))
    assert.ok(!perms("academic_coordinator").includes("exams.publish"))
  })
  it("lets teachers enter marks but not set up examinations", () => {
    assert.ok(perms("teacher").includes("exams.grade"))
    for (const key of ["exams.create", "exams.update", "exams.marks.manage", "exams.approve", "exams.publish", "results.view_all"]) {
      assert.ok(!perms("teacher").includes(key), key)
    }
  })
  it("gives students and parents only their own results (no staff access)", () => {
    for (const slug of ["student", "parent"]) {
      assert.ok(perms(slug).includes("results.view"))
      assert.ok(!perms(slug).some((p) => p.startsWith("exams.") && p !== "exams.view") && !perms(slug).includes("results.view_all"))
    }
  })
})
