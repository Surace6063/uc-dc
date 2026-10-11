import type {
  ContactMethod,
  GuardianPortalStatus,
  StudentStatus,
} from "@/lib/generated/prisma/enums"

export { GENDER_LABELS, RELATIONSHIP_LABELS } from "@/features/students/constants"

export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  PHONE: "Phone call",
  SMS: "SMS",
  VIBER: "Viber",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  IN_PERSON: "In person",
}

export const PORTAL_STATUS_LABELS: Record<GuardianPortalStatus, string> = {
  NONE: "No access",
  INVITED: "Invited",
  ACTIVE: "Active",
  DISABLED: "Disabled",
}

// Invitation state as shown to people: "expired" is a pending invitation
// past its expiry time, not a stored status.
export const INVITATION_STATES = ["none", "pending", "expired", "accepted", "revoked"] as const
export type InvitationState = (typeof INVITATION_STATES)[number]

export const INVITATION_STATE_LABELS: Record<InvitationState, string> = {
  none: "Not invited",
  pending: "Pending",
  expired: "Expired",
  accepted: "Accepted",
  revoked: "Revoked",
}

export function invitationState(
  invitation: { status: "PENDING" | "ACCEPTED" | "REVOKED"; expiresAt: Date | string } | null | undefined,
  now = Date.now()
): InvitationState {
  if (!invitation) return "none"
  if (invitation.status === "ACCEPTED") return "accepted"
  if (invitation.status === "REVOKED") return "revoked"
  return new Date(invitation.expiresAt).getTime() > now ? "pending" : "expired"
}

export const INVITATION_TTL_DAYS = 7

// Students whose guardians may use the portal. Transferred-out and withdrawn
// students are no longer the school's to report on; graduates keep access so
// families can still see final results.
export const PORTAL_STUDENT_STATUSES: readonly StudentStatus[] = ["ACTIVE", "SUSPENDED", "GRADUATED"]

// Per-child settings on a guardian link, in the order forms show them.
export const LINK_FLAGS = [
  { key: "isPrimary", label: "Primary contact", description: "First person the school contacts. One per student." },
  { key: "isEmergencyContact", label: "Emergency contact", description: "Called in an emergency." },
  { key: "canPickupStudent", label: "Can pick up", description: "Allowed to collect the student from school." },
  { key: "canAccessStudentPortalData", label: "Parent portal access", description: "Can see this student's information in the parent portal." },
  { key: "receivesAcademicNotifications", label: "Academic notices", description: "Homework, exams and results." },
  { key: "receivesAttendanceNotifications", label: "Attendance alerts", description: "Absences and late arrivals." },
  { key: "receivesBillingNotifications", label: "Fee notices", description: "Fee reminders; also shows fee details in the portal." },
  { key: "receivesGeneralAnnouncements", label: "General announcements", description: "School-wide notices and events." },
] as const

export type LinkFlag = (typeof LINK_FLAGS)[number]["key"]

// Common languages for notices; free text is still accepted.
export const LANGUAGE_SUGGESTIONS = [
  "Nepali", "English", "Maithili", "Bhojpuri", "Tharu", "Tamang", "Nepal Bhasa (Newari)", "Magar", "Bajjika",
  "Doteli", "Urdu", "Avadhi", "Limbu", "Gurung", "Rai", "Sherpa", "Hindi",
] as const

export function guardianInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?"
}

// "ra****@gmail.com": enough to recognise an address without revealing it.
export function maskEmail(email: string) {
  const [local, domain] = email.split("@")
  if (!domain) return "****"
  return `${local.slice(0, 2)}${"*".repeat(Math.max(2, local.length - 2))}@${domain}`
}
