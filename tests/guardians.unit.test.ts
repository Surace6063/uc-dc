// Pure-logic guardian tests (no database). Run with: npm test
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { invitationState, maskEmail } from "@/features/guardians/constants"
import { parseGuardianFilters } from "@/features/guardians/filters"
import { pickRecipients, type RecipientLink } from "@/features/guardians/notifications"
import {
  createGuardianSchema,
  guardianProfileSchema,
  linkStudentsSchema,
  portalPreferencesSchema,
} from "@/features/guardians/schemas"
import { DEFAULT_ROLES } from "@/lib/authorization/permissions"

const role = (slug: string) => DEFAULT_ROLES.find((r) => r.slug === slug)!.permissions as readonly string[]
const profile = (overrides: Record<string, unknown> = {}) => ({
  fullName: "Hari Shrestha",
  phone: "9841000000",
  permanentAddress: {},
  sameAsPermanent: true,
  temporaryAddress: {},
  ...overrides,
})
const link = (studentId: string, overrides: Record<string, unknown> = {}) => ({
  studentId,
  relationship: "FATHER",
  isPrimary: false,
  isEmergencyContact: true,
  canPickupStudent: false,
  receivesAcademicNotifications: true,
  receivesAttendanceNotifications: true,
  receivesBillingNotifications: false,
  receivesGeneralAnnouncements: true,
  canAccessStudentPortalData: false,
  ...overrides,
})
const S1 = "11111111-1111-4111-8111-111111111111"
const S2 = "22222222-2222-4222-8222-222222222222"

describe("guardian filters", () => {
  it("drops invalid values instead of passing them to the database", () => {
    const f = parseGuardianFilters({
      portal: "ACTIVE,HACKED", invitation: "maybe", children: "7", relationship: "COUSIN",
      sort: "password", pageSize: "13", student: "not-a-uuid", view: "everything",
    })
    assert.deepEqual(f.portal, ["ACTIVE"])
    assert.equal(f.invitation, undefined)
    assert.equal(f.children, undefined)
    assert.equal(f.relationship, undefined)
    assert.equal(f.sort, "name")
    assert.equal(f.pageSize, 25)
    assert.equal(f.student, undefined)
    assert.equal(f.view, "current")
  })

  it("keeps valid values", () => {
    const f = parseGuardianFilters(new URLSearchParams("portal=NONE,INVITED&invitation=expired&children=2%2B&relationship=LEGAL_GUARDIAN&sort=children&dir=desc"))
    assert.deepEqual(f.portal, ["NONE", "INVITED"])
    assert.equal(f.invitation, "expired")
    assert.equal(f.children, "2+")
    assert.equal(f.relationship, "LEGAL_GUARDIAN")
    assert.equal(f.sort, "children")
    assert.equal(f.dir, "desc")
  })
})

describe("guardian validation", () => {
  it("requires a name and phone but not an email or account", () => {
    assert.ok(guardianProfileSchema.safeParse(profile()).success)
    assert.ok(!guardianProfileSchema.safeParse(profile({ fullName: " " })).success)
    assert.ok(!guardianProfileSchema.safeParse(profile({ phone: "" })).success)
  })

  it("accepts Nepali and international phone formats", () => {
    for (const phone of ["9841000000", "+977 9841000000", "01-4000000", "+977-1-4000000", "+91 98100 00000"]) {
      assert.ok(guardianProfileSchema.safeParse(profile({ phone })).success, phone)
    }
    for (const phone of ["abc", "12", "+977 98410000001234567890"]) {
      assert.ok(!guardianProfileSchema.safeParse(profile({ phone })).success, phone)
    }
  })

  it("needs an email only when email is the preferred contact method", () => {
    assert.ok(!guardianProfileSchema.safeParse(profile({ preferredContactMethod: "EMAIL" })).success)
    assert.ok(guardianProfileSchema.safeParse(profile({ preferredContactMethod: "EMAIL", email: "hari@example.com" })).success)
    assert.ok(guardianProfileSchema.safeParse(profile({ preferredContactMethod: "VIBER" })).success)
  })

  it("rejects linking the same student twice in one request", () => {
    assert.ok(!createGuardianSchema.safeParse({ profile: profile(), links: [link(S1), link(S1)] }).success)
    assert.ok(createGuardianSchema.safeParse({ profile: profile(), links: [link(S1), link(S2, { relationship: "UNCLE" })] }).success)
    assert.ok(!linkStudentsSchema.safeParse({ links: [] }).success, "linking needs at least one student")
  })

  it("never collects citizenship or national ID numbers", () => {
    const keys = JSON.stringify(Object.keys(guardianProfileSchema.shape))
    assert.doesNotMatch(keys, /citizen|national_?id|nid|passport|pan/i)
  })

  it("doesn't let guardians change fee notices or portal access themselves", () => {
    const parsed = portalPreferencesSchema.parse({
      children: [{ studentId: S1, receivesAcademicNotifications: true, receivesAttendanceNotifications: false, receivesGeneralAnnouncements: true, receivesBillingNotifications: true, canAccessStudentPortalData: true }],
    })
    assert.deepEqual(Object.keys(parsed.children[0]).sort(), ["receivesAcademicNotifications", "receivesAttendanceNotifications", "receivesGeneralAnnouncements", "studentId"])
  })
})

describe("invitations", () => {
  const now = Date.parse("2026-10-11T00:00:00Z")
  it("derives expiry from the timestamp rather than storing it", () => {
    assert.equal(invitationState(null, now), "none")
    assert.equal(invitationState({ status: "PENDING", expiresAt: "2026-10-12T00:00:00Z" }, now), "pending")
    assert.equal(invitationState({ status: "PENDING", expiresAt: "2026-10-10T00:00:00Z" }, now), "expired")
    assert.equal(invitationState({ status: "ACCEPTED", expiresAt: "2026-10-10T00:00:00Z" }, now), "accepted")
    assert.equal(invitationState({ status: "REVOKED", expiresAt: "2026-10-12T00:00:00Z" }, now), "revoked")
  })

  it("masks email addresses", () => {
    assert.equal(maskEmail("ramesh@example.com"), "ra****@example.com")
    assert.equal(maskEmail("ab@example.com"), "ab**@example.com")
  })
})

describe("notification recipients", () => {
  const guardian = (name: string, extra: Partial<RecipientLink["guardian"]> = {}) => ({
    fullName: name, phone: "9800000000", email: null, preferredContactMethod: null, preferredLanguage: null,
    archivedAt: null, userId: null, portalStatus: "NONE", ...extra,
  })
  const prefs = { receivesAcademicNotifications: true, receivesAttendanceNotifications: true, receivesBillingNotifications: false, receivesGeneralAnnouncements: true }
  const links: RecipientLink[] = [
    { studentId: "s1", guardianId: "mother", ...prefs, guardian: guardian("Sita", { userId: "u1", portalStatus: "ACTIVE" }) },
    { studentId: "s2", guardianId: "mother", ...prefs, guardian: guardian("Sita", { userId: "u1", portalStatus: "ACTIVE" }) },
    { studentId: "s1", guardianId: "father", ...prefs, receivesAttendanceNotifications: false, guardian: guardian("Ram") },
    { studentId: "s2", guardianId: "old", ...prefs, guardian: guardian("Archived", { archivedAt: new Date() }) },
  ]

  it("sends one notice per guardian even with several children", () => {
    const recipients = pickRecipients(links, "general")
    assert.equal(recipients.length, 2)
    const mother = recipients.find((r) => r.guardianId === "mother")!
    assert.deepEqual(mother.studentIds, ["s1", "s2"])
    assert.equal(mother.hasPortal, true)
  })

  it("respects each link's preferences and skips archived guardians", () => {
    assert.deepEqual(pickRecipients(links, "attendance").map((r) => r.guardianId), ["mother"])
    assert.deepEqual(pickRecipients(links, "financial"), [])
  })
})

describe("guardian permissions", () => {
  it("gives parents no guardian-management permissions", () => {
    assert.ok(!role("parent").some((p) => p.startsWith("parents.")))
    assert.ok(!role("parent").includes("students.view"))
  })

  it("lets admission staff manage guardians but not portal access or deletion", () => {
    const registrar = role("registrar")
    for (const p of ["parents.view", "parents.create", "parents.update", "parents.import"]) assert.ok(registrar.includes(p), p)
    assert.ok(!registrar.includes("parents.portal.manage"))
    assert.ok(!registrar.includes("parents.delete"))
  })

  it("keeps teachers to guardian contacts on the student profile", () => {
    assert.ok(!role("teacher").some((p) => p.startsWith("parents.")))
  })

  it("gives organisation admins full guardian management", () => {
    for (const p of ["parents.create", "parents.portal.manage", "parents.delete", "parents.export"]) assert.ok(role("admin").includes(p), p)
  })
})
