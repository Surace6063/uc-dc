// Navigation foundation tests (no database). Run with: npm test
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  activeHref,
  NAV_CONFIGS,
  navDestinations,
  navKindFor,
  trailForPath,
  visibleNavGroups,
} from "@/components/navigation/nav-config"
import { DEFAULT_ROLES, type PermissionKey } from "@/lib/authorization/permissions"

const role = (slug: string) => DEFAULT_ROLES.find((r) => r.slug === slug)!.permissions as readonly PermissionKey[]
const pageExists = (href: string) => existsSync(join(process.cwd(), "app", ...href.split("/").filter(Boolean), "page.tsx"))

describe("navigation configurations", () => {
  it("only link to pages that exist", () => {
    for (const config of Object.values(NAV_CONFIGS)) {
      for (const group of config.groups) {
        for (const item of group.items) {
          assert.ok(pageExists(item.href), `${config.kind}: ${item.title} → ${item.href}`)
          for (const sub of item.items ?? []) assert.ok(pageExists(sub.href), `${config.kind}: ${sub.title} → ${sub.href}`)
        }
      }
    }
  })

  it("show every link while permission filtering is off, guardian links only to guardians", () => {
    const groups = visibleNavGroups(NAV_CONFIGS.management, [], { guardian: false })
    const titles = groups.flatMap((g) => g.items.map((i) => i.title))
    assert.ok(titles.includes("Roles & Permissions") && titles.includes("Fees & Finance"))
    assert.ok(!titles.includes("My Children"))
    assert.ok(visibleNavGroups(NAV_CONFIGS.management, [], { guardian: true }).some((g) => g.items.some((i) => i.title === "My Children")))
  })

  it("can still filter by permission when switched on", () => {
    const groups = visibleNavGroups(NAV_CONFIGS.management, role("teacher"), { filterByPermission: true })
    const titles = groups.flatMap((g) => g.items.map((i) => i.title))
    assert.ok(titles.includes("Attendance") && !titles.includes("Roles & Permissions"))
    const attendance = groups.flatMap((g) => g.items).find((i) => i.title === "Attendance")!
    assert.ok(attendance.items!.some((s) => s.title === "Take attendance"))
    assert.ok(!attendance.items!.some((s) => s.title === "Settings"), "teachers can't configure attendance")
  })

  it("highlights only the most specific link", () => {
    const groups = NAV_CONFIGS.management.groups
    assert.equal(activeHref("/dashboard", groups), "/dashboard")
    assert.equal(activeHref("/dashboard/attendance", groups), "/dashboard/attendance")
    assert.equal(activeHref("/dashboard/attendance/take", groups), "/dashboard/attendance/take")
    assert.equal(activeHref("/dashboard/students/2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b11/edit", groups), "/dashboard/students")
    assert.equal(activeHref("/dashboard/studentsx", groups), null)
  })

  it("lists sub-pages for search without repeating the parent's own page", () => {
    const d = navDestinations(NAV_CONFIGS.management.groups)
    assert.equal(d.filter((x) => x.href === "/dashboard/attendance").length, 1)
    assert.equal(d.find((x) => x.href === "/dashboard/attendance/take")?.parent, "Attendance")
  })
})

describe("breadcrumbs from the URL", () => {
  it("uses navigation titles and generic labels for IDs and actions", () => {
    assert.deepEqual(trailForPath("/dashboard/attendance/take").map((c) => c.label), ["Dashboard", "Attendance", "Take attendance"])
    assert.deepEqual(
      trailForPath("/dashboard/students/2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b11/edit").map((c) => c.label),
      ["Dashboard", "Students", "Details", "Edit"]
    )
    assert.deepEqual(trailForPath("/dashboard").map((c) => c.label), ["Dashboard"])
    assert.deepEqual(trailForPath("/platform"), [])
  })
})

describe("choosing a navigation", () => {
  it("gives each default role a sensible configuration", () => {
    const kind = (slug: string, profile: { student?: boolean; teacher?: boolean } = {}) =>
      navKindFor({ permissions: role(slug), studentProfile: !!profile.student, teacherProfile: !!profile.teacher })
    assert.equal(kind("teacher", { teacher: true }), "teacher")
    assert.equal(kind("student", { student: true }), "student")
    assert.equal(kind("accountant"), "finance")
    for (const slug of ["owner", "admin", "principal"]) assert.equal(kind(slug), "management")
    // Administrators who also teach keep the management navigation.
    assert.equal(kind("principal", { teacher: true }), "management")
    // A teacher role without a linked profile has no portal to show yet.
    assert.equal(kind("teacher"), "management")
  })
})

describe("teacher navigation", () => {
  it("has the requested groups and pages, in order", () => {
    const groups = NAV_CONFIGS.teacher.groups.map((g) => [g.label, g.items.filter((i) => !i.guardianOnly).map((i) => i.title)])
    assert.deepEqual(groups, [
      ["Overview", ["Dashboard"]],
      ["Teaching", ["My Classes", "My Subjects", "Class Timetable", "Lesson Plans", "Teaching Materials"]],
      ["Attendance", ["Take Attendance", "Attendance History"]],
      ["Assessment", ["Assignments", "Examinations", "Marks Entry", "Results"]],
      ["Communication", ["Notices", "Messages"]],
      ["Account", ["My Profile", "My Attendance", "Settings"]],
    ])
  })
})

describe("student navigation", () => {
  it("has the requested groups and pages, in order", () => {
    const groups = NAV_CONFIGS.student.groups.map((g) => [g.label, g.items.map((i) => i.title)])
    assert.deepEqual(groups, [
      ["Overview", ["Dashboard"]],
      ["Academics", ["My Classes", "My Subjects", "Class Timetable", "Lesson Materials", "Assignments"]],
      ["Examinations", ["Examination Schedule", "My Marks", "My Results"]],
      ["Attendance", ["My Attendance"]],
      ["Finance", ["My Fees", "Payment History"]],
      ["Communication", ["Notices", "Messages"]],
      ["Account", ["My Profile", "My Documents", "Settings"]],
    ])
  })
})

describe("finance navigation", () => {
  it("has the requested groups and pages, in order", () => {
    const groups = NAV_CONFIGS.finance.groups.map((g) => [g.label, g.items.map((i) => i.title)])
    assert.deepEqual(groups, [
      ["Overview", ["Dashboard"]],
      ["Student Finance", ["Fee Structure", "Student Fee Assignments", "Fee Collection", "Outstanding Fees", "Payment History", "Discounts and Scholarships"]],
      ["Accounting", ["Expenses", "Income", "Financial Transactions", "Financial Categories"]],
      ["Reports", ["Fee Collection Report", "Outstanding Balance Report", "Daily Collection Report", "Monthly Financial Report"]],
      ["Account", ["My Profile", "Settings"]],
    ])
  })
})

describe("breadcrumbs for grouped routes", () => {
  it("never links to folders that aren't pages", () => {
    const id = "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b10"
    assert.deepEqual(trailForPath(`/dashboard/student/assignments/${id}`).map((c) => c.label), ["Dashboard", "Assignments", "Details"])
    assert.deepEqual(trailForPath("/dashboard/finance/reports/daily").map((c) => c.label), ["Dashboard", "Fees & Finance", "Daily Collection Report"])
    assert.deepEqual(trailForPath("/dashboard/teaching/exams").map((c) => c.label), ["Dashboard", "Examinations"])
    for (const path of ["/dashboard/student/fees", `/dashboard/teaching/classes/${id}`, "/dashboard/finance/reports/monthly"]) {
      for (const c of trailForPath(path)) if (c.href && !/[0-9a-f-]{16,}/.test(c.href)) assert.ok(pageExists(c.href), `${path}: ${c.href}`)
    }
  })
})
