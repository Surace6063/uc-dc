// Pure-logic tests (no database). Run with: npm test
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { BULK_PERMISSIONS } from "@/features/students/permissions"
import {
  canTransitionEnrollment,
  canTransitionStudent,
} from "@/features/students/constants"
import { parseStudentFilters } from "@/features/students/filters"
import { booleanToYesNo, createStudentSchema, yesNoToBoolean } from "@/features/students/schemas"
import { DEFAULT_ROLES } from "@/lib/authorization/permissions"
import { csvLine, parseCsv } from "@/lib/csv"
import { canonicalDistrict, parseProvince, PROVINCES } from "@/lib/nepal/locations"

describe("student list filters", () => {
  it("applies safe defaults and ignores invalid values", () => {
    const f = parseStudentFilters({ page: "-3", pageSize: "1000", sort: "drop table", level: "not-a-uuid", status: "ACTIVE,BOGUS" })
    assert.equal(f.page, 1)
    assert.equal(f.pageSize, 25)
    assert.equal(f.sort, "name")
    assert.equal(f.level, undefined)
    assert.deepEqual(f.status, ["ACTIVE"])
    assert.equal(f.view, "current")
  })

  it("accepts the allowed page sizes only", () => {
    for (const size of [10, 25, 50, 100]) {
      assert.equal(parseStudentFilters(new URLSearchParams({ pageSize: String(size) })).pageSize, size)
    }
    assert.equal(parseStudentFilters({ pageSize: "37" }).pageSize, 25)
  })

  it("accepts 'all' or a UUID for the academic year", () => {
    assert.equal(parseStudentFilters({ year: "all" }).year, "all")
    assert.equal(parseStudentFilters({ year: "x" }).year, undefined)
  })
})

describe("CSV", () => {
  it("round-trips quotes, commas and newlines", () => {
    const line = csvLine(["a,b", 'say "hi"', "two\nlines", null], { raw: true })
    assert.deepEqual(parseCsv(line), [["a,b", 'say "hi"', "two\nlines", ""]])
  })

  it("neutralises spreadsheet formulas in exports but keeps phone numbers", () => {
    assert.equal(csvLine(["=HYPERLINK(1)", "+977 9800000000", "-5"]), "'=HYPERLINK(1),+977 9800000000,-5\r\n")
  })

  it("strips a BOM and skips blank lines", () => {
    assert.deepEqual(parseCsv("﻿a,b\r\n\r\n1,2\r\n"), [["a", "b"], ["1", "2"]])
  })
})

describe("Nepal locations", () => {
  it("has 7 provinces and 77 districts", () => {
    assert.equal(PROVINCES.length, 7)
    assert.equal(PROVINCES.reduce((n, p) => n + p.districts.length, 0), 77)
  })

  it("parses provinces by number or name", () => {
    assert.equal(parseProvince("3"), 3)
    assert.equal(parseProvince("Bagmati Province"), 3)
    assert.equal(parseProvince("8"), null)
    assert.equal(canonicalDistrict(3, "kathmandu"), "Kathmandu")
    assert.equal(canonicalDistrict(1, "Kathmandu"), null)
  })
})

describe("lifecycle rules", () => {
  it("allows only defined student transitions", () => {
    assert.ok(canTransitionStudent("ACTIVE", "GRADUATED"))
    assert.ok(canTransitionStudent("WITHDRAWN", "ACTIVE"))
    assert.ok(!canTransitionStudent("GRADUATED", "SUSPENDED"))
  })

  it("never reopens closed enrollments", () => {
    assert.ok(canTransitionEnrollment("ACTIVE", "PROMOTED"))
    assert.ok(canTransitionEnrollment("ON_HOLD", "ACTIVE"))
    assert.ok(!canTransitionEnrollment("PROMOTED", "ACTIVE"))
    assert.ok(!canTransitionEnrollment("CANCELLED", "ACTIVE"))
  })
})

describe("admission form validation", () => {
  const base = {
    personal: { firstName: "Aarav", lastName: "Shrestha" },
    admission: { admissionDate: "2026-04-14", admissionType: "NEW" },
    permanentAddress: {},
    sameAsPermanent: true,
    temporaryAddress: {},
    guardians: [],
    enroll: false,
  }

  it("accepts a minimal admission", () => {
    assert.ok(createStudentSchema.safeParse(base).success)
  })

  it("rejects a district outside the chosen province", () => {
    const r = createStudentSchema.safeParse({ ...base, permanentAddress: { province: "1", district: "Kathmandu" } })
    assert.ok(!r.success)
    assert.deepEqual(r.error.issues[0].path, ["permanentAddress", "district"])
  })

  it("requires a placement when enrolling", () => {
    assert.ok(!createStudentSchema.safeParse({ ...base, enroll: true }).success)
  })

  it("accepts UGC background as optional, keeping blank as not recorded", () => {
    const r = createStudentSchema.parse({
      ...base,
      personal: { ...base.personal, casteEthnicity: "DALIT", disabilityType: "", economicallyDisadvantaged: "yes", firstGenerationLearner: "", remoteArea: "no" },
      admission: { ...base.admission, previousQualification: "HIGHER_SECONDARY", entranceScore: "72.25", scholarshipCategory: "" },
    })
    assert.deepEqual(
      [r.personal.casteEthnicity, r.personal.disabilityType, r.personal.economicallyDisadvantaged, r.personal.firstGenerationLearner, r.personal.remoteArea],
      ["DALIT", null, "yes", null, "no"]
    )
    assert.deepEqual([r.admission.entranceScore, r.admission.scholarshipCategory], [72.25, null])
    assert.deepEqual([yesNoToBoolean("yes"), yesNoToBoolean("no"), yesNoToBoolean(null)], [true, false, null])
    assert.deepEqual([booleanToYesNo(true), booleanToYesNo(false), booleanToYesNo(null)], ["yes", "no", ""])
  })

  it("rejects unknown background values and out-of-range entrance scores", () => {
    assert.ok(!createStudentSchema.safeParse({ ...base, personal: { ...base.personal, casteEthnicity: "BRAHMIN" } }).success)
    assert.ok(!createStudentSchema.safeParse({ ...base, personal: { ...base.personal, remoteArea: "maybe" } }).success)
    assert.ok(!createStudentSchema.safeParse({ ...base, admission: { ...base.admission, entranceScore: "1200" } }).success)
    assert.ok(!createStudentSchema.safeParse({ ...base, admission: { ...base.admission, entranceScore: "70.125" } }).success)
  })

  it("allows only one primary guardian", () => {
    const g = { fullName: "A", relationship: "FATHER", isPrimary: true, isEmergencyContact: false, receivesAcademicNotifications: true, receivesBillingNotifications: false }
    assert.ok(!createStudentSchema.safeParse({ ...base, guardians: [g, { ...g, fullName: "B" }] }).success)
  })
})

describe("permissions", () => {
  it("bulk actions need the same permissions as single actions", () => {
    assert.deepEqual(BULK_PERMISSIONS.archive, ["students.archive"])
    assert.deepEqual(BULK_PERMISSIONS.status, ["students.update", "students.enroll"])
  })

  it("keeps least privilege in default roles", () => {
    const role = (slug: string) => DEFAULT_ROLES.find((r) => r.slug === slug)!.permissions as readonly string[]
    assert.ok(!role("teacher").includes("students.sensitive.view"))
    assert.ok(!role("accountant").includes("students.documents.view"))
    assert.ok(!role("accountant").includes("students.sensitive.view"))
    assert.ok(!role("parent").includes("students.view"))
    assert.ok(!role("registrar").includes("students.delete"))
    assert.ok(role("registrar").includes("students.import"))
  })
})
