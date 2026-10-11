// Pure-logic staff tests (no database). Run with: npm test
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseStaffFilters } from "@/features/staff/filters"
import {
  createStaffSchema,
  staffEmploymentSchema,
  staffQualificationSchema,
} from "@/features/staff/schemas"
import { DEFAULT_ROLES, PERMISSION_KEYS } from "@/lib/authorization/permissions"

const role = (slug: string) => DEFAULT_ROLES.find((r) => r.slug === slug)!.permissions as readonly string[]

describe("staff filters", () => {
  it("drops invalid values instead of passing them to the database", () => {
    const f = parseStaffFilters({
      status: "ACTIVE,HACKED", type: "CASUAL,VISITING", sort: "salary", department: "x", account: "maybe",
      pageSize: "7", province: "9", contractEndFrom: "not-a-date",
    })
    assert.deepEqual(f.status, ["ACTIVE"])
    assert.deepEqual(f.type, ["CASUAL"])
    assert.equal(f.sort, "name")
    assert.equal(f.department, undefined)
    assert.equal(f.account, undefined)
    assert.equal(f.pageSize, 25)
    assert.equal(f.province, undefined)
    assert.equal(f.contractEndFrom, undefined)
  })
})

describe("staff validation", () => {
  const e = { dateOfJoining: "2024-01-01", employmentType: "CONTRACT", employmentStatus: "ACTIVE", onProbation: false }

  it("checks contract dates", () => {
    assert.ok(!staffEmploymentSchema.safeParse({ ...e, contractStartDate: "2025-01-01", contractEndDate: "2024-12-31" }).success)
    assert.ok(!staffEmploymentSchema.safeParse({ ...e, contractEndDate: "2023-12-31" }).success, "can't end before joining")
    assert.ok(staffEmploymentSchema.safeParse({ ...e, contractStartDate: "2024-01-01", contractEndDate: "2025-12-31" }).success)
  })

  it("checks probation and leaving dates", () => {
    assert.ok(!staffEmploymentSchema.safeParse({ ...e, probationEndDate: "2024-06-01" }).success)
    assert.ok(!staffEmploymentSchema.safeParse({ ...e, onProbation: true, probationStartDate: "2024-06-01", probationEndDate: "2024-03-01" }).success)
    assert.ok(staffEmploymentSchema.safeParse({ ...e, onProbation: true, probationStartDate: "2024-01-01", probationEndDate: "2024-06-01" }).success)
    assert.ok(!staffEmploymentSchema.safeParse({ ...e, lastWorkingDate: "2023-01-01" }).success)
    assert.ok(!staffEmploymentSchema.safeParse({ ...e, terminationDate: "2025-01-01" }).success, "only for terminated")
    assert.ok(staffEmploymentSchema.safeParse({ ...e, employmentStatus: "TERMINATED", terminationDate: "2025-01-01" }).success)
  })

  it("requires a level for academic qualifications only", () => {
    assert.ok(!staffQualificationSchema.safeParse({ kind: "ACADEMIC", title: "BBS" }).success)
    assert.ok(staffQualificationSchema.safeParse({ kind: "ACADEMIC", level: "BACHELOR", title: "BBS" }).success)
    assert.ok(staffQualificationSchema.safeParse({ kind: "CERTIFICATION", title: "CCNA", level: "" }).success)
  })

  it("never asks for citizenship numbers, salary or bank details", () => {
    const keys = JSON.stringify([
      ...Object.keys(createStaffSchema.shape),
      ...Object.keys(createStaffSchema.shape.personal.shape),
      ...Object.keys(createStaffSchema.shape.contact.shape),
    ])
    assert.ok(!/citizenship|nationalId|national_id|nid|salary|bank|pan|tax/i.test(keys))
  })
})

describe("staff roles (least privilege)", () => {
  it("registers every staff permission", () => {
    for (const key of ["staff.view", "staff.view_department", "staff.configure", "staff.employment.view", "staff.sensitive.view"]) {
      assert.ok((PERMISSION_KEYS as readonly string[]).includes(key), key)
    }
  })

  it("keeps sensitive, employment and destructive access to the right roles", () => {
    assert.ok(role("hr").includes("staff.employment.manage"))
    assert.ok(role("hr").includes("staff.sensitive.view"))
    assert.ok(!role("hr").includes("staff.delete"), "HR archives; only admins delete")
    assert.ok(role("accountant").includes("staff.employment.view"))
    assert.ok(!role("accountant").includes("staff.sensitive.view"))
    assert.ok(!role("accountant").includes("staff.documents.view"))
    assert.ok(role("department_head").includes("staff.view_department"))
    assert.ok(!role("department_head").includes("staff.view"))
    assert.ok(!role("teacher").some((p) => p.startsWith("staff.")))
  })

  it("gives the staff role no directory access (a job title is not a permission)", () => {
    assert.ok(!role("staff").some((p) => p.startsWith("staff.")))
  })
})
