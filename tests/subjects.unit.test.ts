// Pure-logic subject & course tests (no database). Run with: npm test
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createsPrerequisiteCycle,
  formatCredits,
  nextVersionLabel,
  subjectFitsClass,
} from "@/features/subjects/constants"
import { parseSubjectFilters } from "@/features/subjects/filters"
import {
  curriculumSchema,
  electiveGroupSchema,
  offeringSchema,
  subjectSchema,
} from "@/features/subjects/schemas"
import { DEFAULT_ROLES } from "@/lib/authorization/permissions"

const uuid = (n: number) => `3a1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b${String(n).padStart(2, "0")}`

describe("prerequisite cycles", () => {
  const edges = [
    { subjectId: "C", prerequisiteId: "B" }, // C needs B
    { subjectId: "B", prerequisiteId: "A" }, // B needs A
  ]

  it("refuses self-references", () => {
    assert.ok(createsPrerequisiteCycle(edges, "A", "A"))
  })

  it("refuses direct and indirect cycles", () => {
    assert.ok(createsPrerequisiteCycle(edges, "A", "B"))
    assert.ok(createsPrerequisiteCycle(edges, "A", "C"))
  })

  it("allows chains and shared prerequisites", () => {
    assert.ok(!createsPrerequisiteCycle(edges, "D", "C"))
    assert.ok(!createsPrerequisiteCycle(edges, "C", "A"))
  })
})

describe("subject helpers", () => {
  it("fits subjects to classes by level and program only when tied to them", () => {
    const cls = { educationLevelId: "L1", programId: "P1" }
    assert.ok(subjectFitsClass({ educationLevelId: null, programId: null }, cls))
    assert.ok(subjectFitsClass({ educationLevelId: "L1", programId: null }, cls))
    assert.ok(!subjectFitsClass({ educationLevelId: "L2", programId: null }, cls))
    assert.ok(!subjectFitsClass({ educationLevelId: "L1", programId: "P2" }, cls))
  })

  it("formats credits and suggests next versions", () => {
    assert.equal(formatCredits(4), "4 cr")
    assert.equal(formatCredits(3.75), "3.75 cr")
    assert.equal(formatCredits(2.5), "2.5 cr")
    assert.equal(formatCredits(null), null)
    assert.equal(nextVersionLabel("2078"), "2079")
    assert.equal(nextVersionLabel("v2"), "v3")
    assert.equal(nextVersionLabel("revised"), "revised (2)")
  })
})

describe("subject validation", () => {
  const base = { name: "Mathematics", code: "mth8" }

  it("needs only a name and code; upper-cases the code", () => {
    const s = subjectSchema.parse(base)
    assert.equal(s.code, "MTH8")
    assert.equal(s.requirement, "COMPULSORY")
    assert.equal(s.creditHours, null)
    assert.equal(s.educationLevelId, null)
  })

  it("accepts decimal credit hours with at most two decimals", () => {
    assert.equal(subjectSchema.parse({ ...base, creditHours: "3.75" }).creditHours, 3.75)
    assert.ok(!subjectSchema.safeParse({ ...base, creditHours: "3.755" }).success)
    assert.ok(!subjectSchema.safeParse({ ...base, creditHours: "-1" }).success)
  })

  it("rejects unsafe codes", () => {
    assert.ok(!subjectSchema.safeParse({ ...base, code: "MTH 8" }).success)
  })

  it("keeps compulsory subjects out of elective groups", () => {
    const o = { requirement: "COMPULSORY", electiveGroupId: uuid(1) }
    assert.ok(!offeringSchema.safeParse(o).success)
    assert.ok(offeringSchema.safeParse({ ...o, requirement: "ELECTIVE" }).success)
  })

  it("checks elective group choices and curriculum dates", () => {
    const g = { academicYearId: uuid(1), classId: uuid(2), name: "Optional I" }
    assert.ok(electiveGroupSchema.safeParse({ ...g, minChoices: 1, maxChoices: 2 }).success)
    assert.ok(!electiveGroupSchema.safeParse({ ...g, minChoices: 3, maxChoices: 2 }).success)
    const c = { name: "CDC Maths", version: "2078" }
    assert.ok(curriculumSchema.safeParse({ ...c, effectiveFrom: "2025-04-14", effectiveTo: "2026-04-13" }).success)
    assert.ok(!curriculumSchema.safeParse({ ...c, effectiveFrom: "2025-04-14", effectiveTo: "2024-04-13" }).success)
  })
})

describe("subject list filters", () => {
  it("drops invalid values", () => {
    const f = parseSubjectFilters({ sort: "salary", requirement: "MANDATORY", offered: "maybe", status: "gone", level: "x" })
    assert.equal(f.sort, "name")
    assert.equal(f.requirement, undefined)
    assert.equal(f.offered, undefined)
    assert.equal(f.status, "current")
    assert.equal(f.level, undefined)
  })
})

describe("subject permissions in default roles", () => {
  const role = (slug: string) => DEFAULT_ROLES.find((r) => r.slug === slug)!.permissions as readonly string[]

  it("lets academic leaders manage subjects and offerings", () => {
    for (const key of ["subjects.manage", "subjects.offerings.manage", "subjects.export"]) {
      assert.ok(role("principal").includes(key), key)
      assert.ok(role("admin").includes(key), key)
    }
  })

  it("lets teachers view but not manage; parents see nothing here", () => {
    assert.ok(role("teacher").includes("subjects.view"))
    assert.ok(!role("teacher").includes("subjects.manage"))
    assert.ok(!role("teacher").includes("subjects.offerings.manage"))
    assert.ok(!role("parent").includes("subjects.view"))
  })
})
