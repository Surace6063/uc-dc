import type { ContactMethod } from "@/lib/generated/prisma/enums"

// Integration boundary for notices to guardians (attendance alerts, results,
// fee reminders, announcements). This module decides *who* is told, from each
// link's preferences; delivery (SMS, email, push, in-app) belongs to a future
// notifications module, which plugs in through GuardianNotificationChannel.
// Nothing here sends anything.

export type GuardianNotificationCategory = "academic" | "attendance" | "financial" | "general"

export const CATEGORY_PREFERENCE = {
  academic: "receivesAcademicNotifications",
  attendance: "receivesAttendanceNotifications",
  financial: "receivesBillingNotifications",
  general: "receivesGeneralAnnouncements",
} as const satisfies Record<GuardianNotificationCategory, string>

export type RecipientLink = {
  studentId: string
  guardianId: string
  receivesAcademicNotifications: boolean
  receivesAttendanceNotifications: boolean
  receivesBillingNotifications: boolean
  receivesGeneralAnnouncements: boolean
  guardian: {
    fullName: string
    phone: string | null
    email: string | null
    preferredContactMethod: ContactMethod | null
    preferredLanguage: string | null
    archivedAt: Date | null
    userId: string | null
    portalStatus: string
  }
}

export type GuardianRecipient = {
  guardianId: string
  fullName: string
  phone: string | null
  email: string | null
  preferredContactMethod: ContactMethod | null
  preferredLanguage: string | null
  // Signed-in portal users can also get an in-app notice.
  hasPortal: boolean
  // Every student this one notice is about, so a parent of siblings gets one
  // message rather than one per child.
  studentIds: string[]
}

// One recipient per guardian, never per link: siblings share guardians, and
// a notice to "all guardians of these students" must not reach the same
// person twice. Archived guardians and links that opted out are skipped.
export function pickRecipients(links: RecipientLink[], category: GuardianNotificationCategory): GuardianRecipient[] {
  const preference = CATEGORY_PREFERENCE[category]
  const byGuardian = new Map<string, GuardianRecipient>()
  for (const link of links) {
    if (!link[preference] || link.guardian.archivedAt) continue
    const existing = byGuardian.get(link.guardianId)
    if (existing) {
      if (!existing.studentIds.includes(link.studentId)) existing.studentIds.push(link.studentId)
      continue
    }
    byGuardian.set(link.guardianId, {
      guardianId: link.guardianId,
      fullName: link.guardian.fullName,
      phone: link.guardian.phone,
      email: link.guardian.email,
      preferredContactMethod: link.guardian.preferredContactMethod,
      preferredLanguage: link.guardian.preferredLanguage,
      hasPortal: link.guardian.userId !== null && link.guardian.portalStatus === "ACTIVE",
      studentIds: [link.studentId],
    })
  }
  return [...byGuardian.values()]
}

export type GuardianNotice = {
  category: GuardianNotificationCategory
  title: string
  body: string
}

// Implemented by the notifications module for each provider it supports
// (e.g. an SMS gateway, email, in-app). A channel decides for itself whether
// it can reach a recipient (has a phone number, an account, ...).
export interface GuardianNotificationChannel {
  readonly name: string
  canReach(recipient: GuardianRecipient): boolean
  send(recipient: GuardianRecipient, notice: GuardianNotice): Promise<void>
}
