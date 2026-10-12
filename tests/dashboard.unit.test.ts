import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  attendanceGroups,
  attendanceShortages,
  casteByGender,
  fillTrend,
  genderParityIndex,
  gpaBand,
  gpaBands,
  highestQualifications,
  outcomeOf,
  passRate,
  shares,
  studentTeacherRatio,
  summarizeEquity,
} from "@/features/dashboard/calculations"
import { parseDashboardFilters } from "@/features/dashboard/filters"
import { countChange, formatNpr, pointsChange } from "@/features/dashboard/format"
import { describeScope, resolveScope, withExamination, type ScopeOptions } from "@/features/dashboard/scope"

describe("dashboard comparisons", () => {
  const last = (previous: number) => ({ previous, yearName: "2024/25" })

  it("shows a relative change only against a real previous figure", () => {
    assert.deepEqual(countChange(120, last(100)), { text: "+20.0%", trend: "up", label: "vs 2024/25" })
    assert.deepEqual(countChange(90, last(120)), { text: "−25.0%", trend: "down", label: "vs 2024/25" })
    assert.equal(countChange(100, last(100))?.trend, "flat")
    assert.equal(countChange(10, null), null)
    assert.equal(countChange(10, last(0)), null)
  })

  it("compares rates in percentage points", () => {
    assert.deepEqual(pointsChange(82.5, last(80)), { text: "+2.5 pts", trend: "up", label: "vs 2024/25" })
    assert.equal(pointsChange(null, last(80)), null)
    assert.equal(pointsChange(80, null), null)
  })
})

describe("NPR formatting", () => {
  it("uses South Asian digit grouping without decimals", () => {
    assert.equal(formatNpr(1234567), "NPR 12,34,567")
    assert.equal(formatNpr(0), "NPR 0")
  })
})

describe("dashboard chart calculations", () => {
  const years = [
    { id: "a", name: "2022/23" },
    { id: "b", name: "2023/24" },
    { id: "c", name: "2024/25" },
  ]

  it("leaves years without records as gaps, never zeros", () => {
    const rows = fillTrend(years, new Map([["a", { students: 10 }], ["c", { students: 0 }]]), { students: null })
    assert.deepEqual(rows, [
      { year: "2022/23", hasData: true, students: 10 },
      { year: "2023/24", hasData: false, students: null },
      { year: "2024/25", hasData: true, students: 0 },
    ])
  })

  it("gives shares of recorded categories only", () => {
    assert.deepEqual(shares({ female: 2, male: 1, other: 0, unrecorded: 1 }), [
      { key: "female", count: 2, share: 50 },
      { key: "male", count: 1, share: 25 },
      { key: "unrecorded", count: 1, share: 25 },
    ])
    assert.deepEqual(shares({ female: 1, male: 2 }).map((s) => s.share), [33.3, 66.7])
    assert.deepEqual(shares({ female: 0 }), [])
  })

  it("computes the Gender Parity Index only with male students", () => {
    assert.equal(genderParityIndex(3, 2), 1.5)
    assert.equal(genderParityIndex(2, 3), 0.67)
    assert.equal(genderParityIndex(5, 0), null)
  })

  it("counts absent as decided but not passed", () => {
    assert.equal(outcomeOf("PASS"), "passed")
    assert.equal(outcomeOf("ABSENT"), "absent")
    assert.equal(outcomeOf("WITHHELD"), null)
    assert.equal(passRate({ passed: 2, failed: 1, absent: 1 }), 50)
    assert.equal(passRate({ passed: 0, failed: 0, absent: 0 }), null)
  })

  it("puts GPA into half-point bands with 4.0 in the top band, listing empty bands", () => {
    assert.equal(gpaBand(0), 0)
    assert.equal(gpaBand(2.49), 2)
    assert.equal(gpaBand(2.5), 2.5)
    assert.equal(gpaBand(4), 3.5)
    const bands = gpaBands([{ low: 3, students: 2 }, { low: 4, students: 1 }, { low: 3.5, students: 1 }])
    assert.equal(bands.length, 8)
    assert.deepEqual(bands.slice(-2), [{ band: "3.0–3.5", students: 2 }, { band: "3.5–4.0", students: 2 }])
    assert.equal(bands[0].students, 0)
  })

  it("pools attendance per group and counts each student's shortage once", () => {
    const policy = { lateCountsAsPresent: true, excusedTreatment: "EXCLUDE", minimumPercentage: 75, warningMarginPercentage: 5 } as const
    const group = (classId: string) => (classId === "x" ? null : { key: classId === "c3" ? "p2" : "p1", label: classId === "c3" ? "BCA" : "BBS", name: "", order: classId === "c3" ? 2 : 1 })
    const rows = attendanceGroups(
      [
        // Ram: 7/10 in one class + 2/2 in another = 9/12 = 75%: at the
        // minimum, so not short, but within the 5-point margin (near).
        { studentId: "ram", classId: "c1", counts: { PRESENT: 7, ABSENT: 3 } },
        { studentId: "ram", classId: "c2", counts: { PRESENT: 2 } },
        // Sita 7/10 = 70% → below; Gita 15/19 ≈ 78.9% → approaching.
        { studentId: "sita", classId: "c1", counts: { PRESENT: 6, LATE: 1, ABSENT: 3 } },
        { studentId: "gita", classId: "c1", counts: { PRESENT: 15, ABSENT: 4 } },
        { studentId: "hari", classId: "c3", counts: { PRESENT: 10 } },
        { studentId: "ghost", classId: "x", counts: { ABSENT: 10 } },
      ],
      group,
      policy
    )
    assert.deepEqual(rows.map((r) => [r.key, r.label, r.students, r.below, r.approaching]), [["p1", "BBS", 3, 1, 2], ["p2", "BCA", 1, 0, 0]])
    // Pooled: 31 attended of 41 records.
    assert.equal(rows[0].percentage, 75.6)
    assert.equal(rows[1].percentage, 100)
  })
})

describe("faculty calculations", () => {
  it("never divides by zero teachers", () => {
    assert.equal(studentTeacherRatio(25, 2), 12.5)
    assert.equal(studentTeacherRatio(10, 3), 3.3)
    assert.equal(studentTeacherRatio(10, 0), null)
    assert.equal(studentTeacherRatio(0, 4), 0)
  })

  it("keeps each teacher's highest qualification and counts those with none", () => {
    const q = highestQualifications(4, [
      { teacherId: "a", level: "BACHELOR", verificationStatus: "VERIFIED" },
      { teacherId: "a", level: "MASTER", verificationStatus: "PENDING" },
      { teacherId: "b", level: "DOCTORATE", verificationStatus: "VERIFIED" },
      // Diploma and professional rank equally; the diploma wins.
      { teacherId: "c", level: "PROFESSIONAL", verificationStatus: "PENDING" },
      { teacherId: "c", level: "DIPLOMA", verificationStatus: "PENDING" },
    ])
    assert.deepEqual(q.levels, [
      { key: "DOCTORATE", teachers: 1 },
      { key: "MASTER", teachers: 1 },
      { key: "DIPLOMA", teachers: 1 },
      { key: "NONE", teachers: 1 },
    ])
    assert.equal(q.recorded, 3)
    // Only b's highest qualification is verified (a's verified one is lower).
    assert.equal(q.verified, 1)
    assert.equal(q.mastersOrHigher, 2)
  })
})

describe("dashboard scope", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`)
  // Valid UUIDs, as the URL schema requires.
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
  const [y1, y2, mgmt, sci, bbs, old, bca, bbs1, bba1, bca1] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id)
  const options: ScopeOptions = {
    years: [
      { id: y1, name: "2024/25", startDate: d("2024-07-01"), endDate: d("2025-06-30"), isCurrent: false },
      { id: y2, name: "2025/26", startDate: d("2025-07-01"), endDate: d("2026-06-30"), isCurrent: true },
    ],
    faculties: [{ id: mgmt, name: "Management" }, { id: sci, name: "Science" }],
    programs: [
      { id: bbs, name: "BBS", code: "BBS", facultyId: mgmt, isActive: true },
      { id: old, name: "Old BBA", code: "BBA", facultyId: mgmt, isActive: false },
      { id: bca, name: "BCA", code: "BCA", facultyId: sci, isActive: true },
    ],
    classes: [
      { id: bbs1, name: "BBS Y1", programId: bbs, facultyId: mgmt, archived: false },
      { id: bba1, name: "BBA Y1", programId: old, facultyId: mgmt, archived: true },
      { id: bca1, name: "BCA S1", programId: bca, facultyId: sci, archived: false },
    ],
  }
  const resolve = (f: Record<string, string>) => resolveScope(options, parseDashboardFilters(f))!

  it("defaults to the current year and drops unknown ids", () => {
    const r = resolve({ year: id(99), program: id(98), dept: id(97) })
    assert.equal(r.scope.year.id, y2)
    assert.deepEqual(r.scope.trendYears.map((y) => y.id), [y1, y2])
    assert.equal(r.scope.programIds, null)
    assert.deepEqual([r.filters.year, r.filters.program, r.filters.dept], [undefined, undefined, undefined])
    assert.equal(resolveScope({ ...options, years: [] }, parseDashboardFilters({})), null)
  })

  it("expands a faculty to all its programs and classes, history included", () => {
    const r = resolve({ faculty: mgmt })
    assert.deepEqual(r.scope.programIds, [bbs, old])
    assert.deepEqual(r.scope.classIds, [bbs1, bba1])
  })

  it("drops a program or class outside the chosen faculty or program", () => {
    const r = resolve({ faculty: mgmt, program: bca, class: bca1 })
    assert.deepEqual([r.filters.faculty, r.filters.program, r.filters.class], [mgmt, undefined, undefined])
    assert.deepEqual(r.scope.programIds, [bbs, old])
    const c = resolve({ program: bbs, class: bca1 })
    assert.equal(c.scope.classId, null)
    assert.deepEqual(c.scope.classIds, [bbs1])
  })

  it("narrows to one class and remembers its program", () => {
    const r = resolve({ class: bca1 })
    assert.deepEqual([r.scope.classId, r.scope.classProgramId, r.scope.programIds], [bca1, bca, null])
    assert.deepEqual(r.scope.classIds, [bca1])
  })

  it("reads a reversed date range the right way round, including the whole last day", () => {
    const r = resolve({ from: "2025-09-30", to: "2025-09-01" })
    assert.equal(r.filters.from, "2025-09-01")
    assert.equal(r.scope.to?.toISOString(), "2025-09-30T23:59:59.999Z")
  })

  it("keeps only an examination of the year", () => {
    const r = resolve({})
    assert.equal(withExamination(r, [{ id: "e1" }], "e1").scope.examinationId, "e1")
    assert.equal(withExamination(r, [{ id: "e1" }], "e2").scope.examinationId, null)
    assert.equal(withExamination(r, [{ id: "e1" }], "e2").filters.exam, undefined)
  })

  it("describes the reporting period", () => {
    const r = resolve({ program: bbs, from: "2025-09-01", to: "2025-09-30" })
    assert.deepEqual(describeScope(r.scope, r.filters, options, null), [
      { label: "Academic year", value: "2025/26 (1 Jul 2025 – 30 Jun 2026)" },
      { label: "Program", value: "BBS" },
      { label: "Examinations", value: "All published" },
      { label: "Admissions & activity", value: `${r.scope.from!.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} – ${r.scope.to!.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` },
    ])
  })
})

describe("attendance shortages", () => {
  it("counts a student in two classes once, from all their records", () => {
    const policy = { lateCountsAsPresent: true, excusedTreatment: "EXCLUDE", minimumPercentage: 75, warningMarginPercentage: 5 } as const
    const totals = attendanceShortages(
      [
        // Moved class mid-year: 3/5 then 2/5 = 50% overall → one shortage.
        { studentId: "ram", counts: { PRESENT: 3, ABSENT: 2 } },
        { studentId: "ram", counts: { PRESENT: 2, ABSENT: 3 } },
        { studentId: "sita", counts: { PRESENT: 10 } },
      ],
      policy
    )
    assert.deepEqual(totals, { students: 2, below: 1, approaching: 0 })
  })
})

describe("inclusion figures", () => {
  it("groups students by caste/ethnicity and gender, not recorded last", () => {
    const rows = casteByGender([
      { caste: null, gender: "female", count: 2 },
      { caste: "MADHESI", gender: "male", count: 3 },
      { caste: "DALIT", gender: "female", count: 1 },
      { caste: "DALIT", gender: "male", count: 1 },
      { caste: "SOMETHING_ELSE", gender: "other", count: 1 },
    ])
    assert.deepEqual(rows.map((r) => [r.key, r.female, r.male, r.other, r.total]), [
      ["DALIT", 1, 1, 0, 2],
      ["MADHESI", 0, 3, 0, 3],
      ["UNRECORDED", 2, 0, 1, 3],
    ])
  })

  it("gives equity shares against recorded students only", () => {
    const zero = { econ_yes: 0, econ_recorded: 0, first_yes: 0, first_recorded: 0, remote_yes: 0, remote_recorded: 0, scholarship_yes: 0, scholarship_recorded: 0, disability_yes: 0, disability_recorded: 0 }
    const e = summarizeEquity([
      { ...zero, count: 10, econ_yes: 2, econ_recorded: 4, scholarship_yes: 1, scholarship_recorded: 10 },
      { ...zero, count: 5, econ_yes: 1, econ_recorded: 2 },
    ])
    assert.equal(e.students, 15)
    const by = Object.fromEntries(e.groups.map((g) => [g.key, [g.students, g.recorded, g.share]]))
    assert.deepEqual(by.econ, [3, 6, 50])
    assert.deepEqual(by.scholarship, [1, 10, 10])
    // Nothing recorded: no share, rather than 0%.
    assert.deepEqual(by.disability, [0, 0, null])
  })
})
