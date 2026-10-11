// Pure-logic teacher tests (no database). Run with: npm test
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { assignmentSummary } from "@/features/teachers/constants"
import { parseTeacherFilters } from "@/features/teachers/filters"
import { assignmentSchema, createTeacherSchema, employmentSchema } from "@/features/teachers/schemas"
import { DEFAULT_ROLES } from "@/lib/authorization/permissions"

const role = (slug: string) => DEFAULT_ROLES.find((r) => r.slug === slug)!.permissions as readonly string[]

describe("teacher filters", () => {
  it("drops invalid values instead of passing them to the database", () => {
    const f = parseTeacherFilters({ status: "ACTIVE,HACKED", sort: "salary", department: "x", assigned: "maybe", pageSize: "7" })
    assert.deepEqual(f.status, ["ACTIVE"])
    assert.equal(f.sort, "name")
    assert.equal(f.department, undefined)
    assert.equal(f.assigned, undefined)
    assert.equal(f.pageSize, 25)
  })
})

describe("teacher validation", () => {
  const base = { academicYearId: "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b11", role: "SUBJECT_TEACHER", startDate: "2026-04-20" }

  it("requires something to teach beyond the year", () => {
    assert.ok(!assignmentSchema.safeParse(base).success)
    assert.ok(assignmentSchema.safeParse({ ...base, subjectId: "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b12" }).success)
  })

  it("requires a class for a section and for a class teacher", () => {
    const subjectId = "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b12"
    assert.ok(!assignmentSchema.safeParse({ ...base, subjectId, sectionId: "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b13" }).success)
    assert.ok(!assignmentSchema.safeParse({ ...base, subjectId, role: "CLASS_TEACHER" }).success)
  })

  it("checks contract and probation dates", () => {
    const e = { dateOfJoining: "2024-01-01", employmentType: "CONTRACT", employmentStatus: "ACTIVE", onProbation: false }
    assert.ok(!employmentSchema.safeParse({ ...e, contractStartDate: "2025-01-01", contractEndDate: "2024-12-31" }).success)
    assert.ok(!employmentSchema.safeParse({ ...e, probationEndDate: "2024-06-01" }).success)
    assert.ok(employmentSchema.safeParse({ ...e, onProbation: true, probationEndDate: "2024-06-01" }).success)
  })

  it("never requires citizenship or national ID numbers", () => {
    const keys = JSON.stringify(Object.keys(createTeacherSchema.shape)) + JSON.stringify(Object.keys(createTeacherSchema.shape.personal.shape))
    assert.ok(!/citizenship|nationalId|national_id|nid/i.test(keys))
  })

  it("summarises assignments", () => {
    assert.equal(assignmentSummary({ class: { name: "Grade 8" }, section: { name: "A" }, subject: { name: "Mathematics" } }), "Grade 8 Sec A · Mathematics")
    assert.equal(assignmentSummary({ program: { code: "BCA" }, subject: { name: "DBMS" } }), "BCA · DBMS")
  })
})

describe("teacher roles (least privilege)", () => {
  it("keeps sensitive and employment data to the right roles", () => {
    assert.ok(!role("teacher").includes("teachers.sensitive.view"))
    assert.ok(!role("teacher").includes("teachers.employment.view"))
    assert.ok(role("accountant").includes("teachers.employment.view"))
    assert.ok(!role("accountant").includes("teachers.sensitive.view"))
    assert.ok(!role("accountant").includes("teachers.documents.view"))
    assert.ok(role("hr").includes("teachers.employment.manage"))
    assert.ok(!role("hr").includes("teachers.delete"))
    assert.ok(!role("hr").includes("teachers.assignments.manage"))
    assert.ok(role("principal").includes("teachers.assignments.manage"))
    assert.ok(role("department_head").includes("teachers.assignments.manage_department"))
    assert.ok(!role("department_head").includes("teachers.assignments.manage"))
  })
})
