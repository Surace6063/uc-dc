import type {
  AdmissionType,
  CasteEthnicity,
  DisabilityType,
  EnrollmentStatus,
  EnrollmentType,
  Gender,
  GuardianRelationship,
  QualificationLevel,
  ScholarshipCategory,
  StudentStatus,
} from "@/lib/generated/prisma/enums"

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
}

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  WITHDRAWN: "Withdrawn",
  TRANSFERRED: "Transferred out",
  GRADUATED: "Graduated",
}

// UGC/EMIS background (EMIS sections 3.1, 6 and 7).
export const CASTE_ETHNICITY_LABELS: Record<CasteEthnicity, string> = {
  DALIT: "Dalit",
  ADIVASI_JANAJATI: "Adivasi Janajati",
  MADHESI: "Madhesi",
  MUSLIM: "Muslim",
  THARU: "Tharu",
  KHAS_ARYA: "Khas Arya",
  OTHER: "Other",
}

export const DISABILITY_LABELS: Record<DisabilityType, string> = {
  NONE: "No disability",
  PHYSICAL: "Physical",
  VISUAL: "Visual (low vision / blind)",
  HEARING: "Hearing (deaf / hard of hearing)",
  DEAF_BLIND: "Deaf-blind",
  SPEECH: "Speech",
  INTELLECTUAL: "Intellectual",
  PSYCHOSOCIAL: "Psychosocial",
  AUTISM: "Autism",
  HAEMOPHILIA: "Haemophilia",
  MULTIPLE: "Multiple",
  OTHER: "Other",
}

export const SCHOLARSHIP_LABELS: Record<ScholarshipCategory, string> = {
  NONE: "No scholarship",
  UGC: "UGC",
  UNIVERSITY: "University",
  COLLEGE: "College",
  MERIT: "Merit",
  NEED_BASED: "Need-based",
  DALIT: "Dalit",
  DISABILITY: "Disability",
  OTHER: "Other",
}

// Previous qualification on admission (the teachers module's levels).
export const PREVIOUS_QUALIFICATION_LABELS: Record<QualificationLevel, string> = {
  SECONDARY: "SEE / SLC",
  HIGHER_SECONDARY: "+2 / higher secondary",
  DIPLOMA: "Diploma / CTEVT",
  BACHELOR: "Bachelor's",
  MASTER: "Master's",
  MPHIL: "M.Phil.",
  DOCTORATE: "Doctorate",
  PROFESSIONAL: "Professional",
  OTHER: "Other",
}

// Yes / no / not recorded, for the equity flags.
export const YES_NO_LABELS = { yes: "Yes", no: "No" } as const
export const yesNo = (value: boolean | null | undefined) => (value === true ? "Yes" : value === false ? "No" : null)

export const ADMISSION_TYPE_LABELS: Record<AdmissionType, string> = {
  NEW: "New admission",
  TRANSFER: "Transfer in",
  READMISSION: "Readmission",
  LATERAL_ENTRY: "Lateral entry",
}

export const ENROLLMENT_TYPE_LABELS: Record<EnrollmentType, string> = {
  NEW_ADMISSION: "New admission",
  PROMOTION: "Promotion",
  REPEAT: "Repeat",
  TRANSFER: "Transfer",
  READMISSION: "Readmission",
  LATERAL_ENTRY: "Lateral entry",
}

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  PROMOTED: "Promoted",
  COMPLETED: "Completed",
  DETAINED: "Detained",
  TRANSFERRED: "Transferred",
  WITHDRAWN: "Withdrawn",
  CANCELLED: "Cancelled",
}

export const RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  FATHER: "Father",
  MOTHER: "Mother",
  GRANDFATHER: "Grandfather",
  GRANDMOTHER: "Grandmother",
  BROTHER: "Brother",
  SISTER: "Sister",
  UNCLE: "Uncle",
  AUNT: "Aunt",
  SPOUSE: "Spouse",
  LEGAL_GUARDIAN: "Legal guardian",
  OTHER: "Other",
}

// Valid lifecycle moves. Withdrawn/transferred students can be readmitted;
// graduation is final except for readmission into a new program.
export const STUDENT_STATUS_TRANSITIONS: Record<StudentStatus, readonly StudentStatus[]> = {
  ACTIVE: ["SUSPENDED", "WITHDRAWN", "TRANSFERRED", "GRADUATED"],
  SUSPENDED: ["ACTIVE", "WITHDRAWN", "TRANSFERRED"],
  WITHDRAWN: ["ACTIVE"],
  TRANSFERRED: ["ACTIVE"],
  GRADUATED: ["ACTIVE"],
}

// Open placements can close; closed placements are history and don't change
// (a mistaken closure is corrected by opening a new placement).
export const ENROLLMENT_STATUS_TRANSITIONS: Record<EnrollmentStatus, readonly EnrollmentStatus[]> = {
  ACTIVE: ["ON_HOLD", "PROMOTED", "COMPLETED", "DETAINED", "TRANSFERRED", "WITHDRAWN", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "WITHDRAWN", "TRANSFERRED", "CANCELLED"],
  PROMOTED: [],
  COMPLETED: [],
  DETAINED: [],
  TRANSFERRED: [],
  WITHDRAWN: [],
  CANCELLED: [],
}

// Outcomes offered when closing a placement through progression.
export const PROGRESSION_OUTCOMES_LABELS = {
  PROMOTED: "Promoted",
  DETAINED: "Detained (repeat)",
  COMPLETED: "Completed",
  TRANSFERRED: "Transferred",
} as const

export const OPEN_ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = ["ACTIVE", "ON_HOLD"]

export function canTransitionStudent(from: StudentStatus, to: StudentStatus) {
  return STUDENT_STATUS_TRANSITIONS[from].includes(to)
}

export function canTransitionEnrollment(from: EnrollmentStatus, to: EnrollmentStatus) {
  return ENROLLMENT_STATUS_TRANSITIONS[from].includes(to)
}

// When a student leaves, their open placements close with the matching status.
export const ENROLLMENT_STATUS_ON_EXIT: Partial<Record<StudentStatus, EnrollmentStatus>> = {
  WITHDRAWN: "WITHDRAWN",
  TRANSFERRED: "TRANSFERRED",
  GRADUATED: "COMPLETED",
}

export function fullName(s: { firstName: string; middleName?: string | null; lastName: string }) {
  return [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")
}

export function initials(s: { firstName: string; lastName: string }) {
  return `${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase()
}

// Document uploads (validated again on the server by content sniffing).
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024
export const DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
