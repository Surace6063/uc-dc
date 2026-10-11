// Pure-logic classes & sections tests (no database). Run with: npm test
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { sectionSchema } from "@/features/academics/schemas"
import { occupancy, orderForRollNumbers } from "@/features/classes/constants"
import { parseClassFilters } from "@/features/classes/filters"
import {
  bulkSectionsSchema,
  classFormSchema,
  enrollStudentsSchema,
  promotionSchema,
  moveStudentsSchema,
  parseSectionNames,
  renumberRollsSchema,
} from "@/features/classes/schemas"
import { DEFAULT_ROLES } from "@/lib/authorization/permissions"
import { suggestLocalClassName, toDevanagariDigits } from "@/lib/education/presets"

const uuid = (n: number) => `2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b${String(n).padStart(2, "0")}`

const student = (
  id: string,
  firstName: string,
  lastName: string,
  gender: string | null,
  admissionNumber: string,
  rollNumber: string | null = null
) => ({ id, firstName, middleName: null, lastName, gender, admissionNumber, rollNumber })

const roster = [
  student("1", "Sita", "Thapa", "FEMALE", "ADM-00004", "3"),
  student("2", "Aarav", "Shrestha", "MALE", "ADM-00002", "10"),
  student("3", "Bimala", "Adhikari", "FEMALE", "ADM-00003", null),
  student("4", "Aarav", "Gurung", "MALE", "ADM-00001", "2"),
]
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

describe("roll number ordering", () => {
  it("orders by first name, then surname", () => {
    assert.deepEqual(ids(orderForRollNumbers(roster, "FIRST_NAME")), ["4", "2", "3", "1"])
  })

  it("orders by surname", () => {
    assert.deepEqual(ids(orderForRollNumbers(roster, "LAST_NAME")), ["3", "4", "2", "1"])
  })

  it("puts girls first, each group by first name", () => {
    assert.deepEqual(ids(orderForRollNumbers(roster, "GIRLS_FIRST")), ["3", "1", "4", "2"])
  })

  it("orders by admission number", () => {
    assert.deepEqual(ids(orderForRollNumbers(roster, "ADMISSION_NUMBER")), ["4", "2", "3", "1"])
  })

  it("keeps the current order numerically and puts unnumbered students last", () => {
    assert.deepEqual(ids(orderForRollNumbers(roster, "CURRENT")), ["4", "1", "2", "3"])
  })

  it("does not modify its input", () => {
    const copy = [...roster]
    orderForRollNumbers(roster, "FIRST_NAME")
    assert.deepEqual(roster, copy)
  })
})

describe("Nepali class names", () => {
  it("converts digits to Devanagari", () => {
    assert.equal(toDevanagariDigits("2082/83"), "२०८२/८३")
  })

  it("suggests कक्षा names for grades and ECD classes", () => {
    assert.equal(suggestLocalClassName("Grade 5"), "कक्षा ५")
    assert.equal(suggestLocalClassName("class 10"), "कक्षा १०")
    assert.equal(suggestLocalClassName("U.K.G."), "यू.के.जी.")
    assert.equal(suggestLocalClassName("Semester 1"), null)
  })
})

describe("section validation", () => {
  it("parses comma-separated section names, dropping blanks and duplicates", () => {
    assert.deepEqual(parseSectionNames(" A, B ,, A,क "), ["A", "B", "क"])
  })

  it("requires at least one section name", () => {
    assert.ok(!bulkSectionsSchema.safeParse({ educationLevelId: uuid(1), names: " , " }).success)
    const ok = bulkSectionsSchema.parse({ educationLevelId: uuid(1), names: "क, ख", shift: "", medium: "NEPALI" })
    assert.equal(ok.shift, null)
    assert.equal(ok.medium, "NEPALI")
  })

  it("accepts shift, medium and room on a section and rejects unknown shifts", () => {
    const base = { classId: uuid(1), name: "A", isActive: true }
    assert.equal(sectionSchema.parse({ ...base, shift: "MORNING", room: " 101 " }).room, "101")
    assert.ok(!sectionSchema.safeParse({ ...base, shift: "NIGHT" }).success)
  })

  it("accepts a whole class, one section or unsectioned students as renumbering scope", () => {
    const base = { academicYearId: uuid(1), classId: uuid(2), order: "FIRST_NAME" }
    assert.equal(renumberRollsSchema.parse(base).sectionId, null)
    assert.equal(renumberRollsSchema.parse({ ...base, sectionId: "none" }).sectionId, "none")
    assert.ok(!renumberRollsSchema.safeParse({ ...base, sectionId: "A" }).success)
    assert.ok(!renumberRollsSchema.safeParse({ ...base, order: "RANDOM" }).success)
  })

  it("requires students to move", () => {
    const base = { academicYearId: uuid(1), classId: uuid(2), targetSectionId: uuid(3) }
    assert.ok(!moveStudentsSchema.safeParse({ ...base, enrollmentIds: [] }).success)
    assert.equal(moveStudentsSchema.parse({ ...base, enrollmentIds: [uuid(4)], targetSectionId: "" }).targetSectionId, null)
  })

  it("computes occupancy only when a capacity is set", () => {
    assert.equal(occupancy(30, 40), 75)
    assert.equal(occupancy(30, null), null)
  })
})

describe("class list filters", () => {
  it("applies safe defaults and drops invalid values", () => {
    const f = parseClassFilters({ view: "teachers", page: "-1", pageSize: "7", sort: "drop", level: "x", status: "deleted", mine: "yes" })
    assert.equal(f.view, "classes")
    assert.equal(f.page, 1)
    assert.equal(f.pageSize, 25)
    assert.equal(f.classSort, "order")
    assert.equal(f.sectionSort, "class")
    assert.equal(f.level, undefined)
    assert.equal(f.status, "current")
    assert.equal(f.mine, undefined)
  })

  it("keeps valid sorting per view", () => {
    assert.equal(parseClassFilters({ sort: "code" }).classSort, "code")
    assert.equal(parseClassFilters({ view: "sections", sort: "capacity" }).sectionSort, "capacity")
  })
})

describe("class form and operations validation", () => {
  const base = {
    educationLevelId: uuid(1), programId: "", name: "Grade 8", kind: "GRADE", sequence: "8", isActive: true,
  }

  it("upper-cases codes and rejects unsafe ones", () => {
    assert.equal(classFormSchema.parse({ ...base, code: "g8" }).code, "G8")
    assert.equal(classFormSchema.parse({ ...base, code: "" }).code, null)
    assert.ok(!classFormSchema.safeParse({ ...base, code: "G 8" }).success)
  })

  it("limits the sections created with a class", () => {
    assert.ok(classFormSchema.safeParse({ ...base, sections: "A, B, क" }).success)
    assert.ok(!classFormSchema.safeParse({ ...base, sections: Array.from({ length: 21 }, (_, i) => `S${i}`).join(",") }).success)
  })

  it("requires a destination for promotion, except on completion", () => {
    const p = { fromYearId: uuid(1), classId: uuid(2), enrollmentIds: [uuid(3)], endedOn: "2026-03-30" }
    assert.ok(!promotionSchema.safeParse({ ...p, outcome: "PROMOTED" }).success)
    assert.ok(!promotionSchema.safeParse({ ...p, outcome: "PROMOTED", toYearId: uuid(4) }).success)
    assert.ok(promotionSchema.safeParse({ ...p, outcome: "PROMOTED", toYearId: uuid(4), toClassId: uuid(5) }).success)
    assert.ok(promotionSchema.safeParse({ ...p, outcome: "DETAINED", toYearId: uuid(4) }).success)
    assert.ok(promotionSchema.safeParse({ ...p, outcome: "COMPLETED" }).success)
    assert.ok(!promotionSchema.safeParse({ ...p, outcome: "DETAINED", toYearId: uuid(4), sectionMode: "pick" }).success)
  })

  it("only offers enrollment types that fit existing students", () => {
    const e = { academicYearId: uuid(1), classId: uuid(2), studentIds: [uuid(3)] }
    assert.ok(enrollStudentsSchema.safeParse({ ...e, enrollmentType: "TRANSFER" }).success)
    assert.ok(!enrollStudentsSchema.safeParse({ ...e, enrollmentType: "PROMOTION" }).success)
  })
})

describe("class permissions in default roles", () => {
  const role = (slug: string) => DEFAULT_ROLES.find((r) => r.slug === slug)!.permissions as readonly string[]

  it("lets academic leaders manage classes and admissions staff only export", () => {
    assert.ok(role("principal").includes("classes.manage"))
    assert.ok(role("registrar").includes("classes.export"))
    assert.ok(!role("registrar").includes("classes.manage"))
  })

  it("keeps teachers, parents and students out of class management", () => {
    for (const slug of ["teacher", "parent", "student", "accountant", "staff"]) {
      assert.ok(!role(slug).includes("classes.manage"), slug)
      assert.ok(!role(slug).includes("classes.export"), slug)
    }
    assert.ok(!role("parent").includes("classes.view"))
  })
})
