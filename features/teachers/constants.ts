import type {
  AssignmentStatus,
  QualificationLevel,
  TeacherDocumentCategory,
  TeacherEmploymentStatus,
  TeacherEmploymentType,
  TeachingRole,
  VerificationStatus,
} from "@/lib/generated/prisma/enums"

export const EMPLOYMENT_TYPE_LABELS: Record<TeacherEmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  TEMPORARY: "Temporary",
  VISITING: "Visiting",
  OTHER: "Other",
}

export const EMPLOYMENT_STATUS_LABELS: Record<TeacherEmploymentStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  SUSPENDED: "Suspended",
  RESIGNED: "Resigned",
  TERMINATED: "Terminated",
  RETIRED: "Retired",
  CONTRACT_EXPIRED: "Contract expired",
}

// Statuses in which a teacher has left; their active assignments are ended.
export const LEFT_STATUSES: readonly TeacherEmploymentStatus[] = ["RESIGNED", "TERMINATED", "RETIRED", "CONTRACT_EXPIRED"]

// Statuses that can take on new teaching assignments.
export const ASSIGNABLE_STATUSES: readonly TeacherEmploymentStatus[] = ["ACTIVE", "ON_LEAVE"]

export const QUALIFICATION_LEVEL_LABELS: Record<QualificationLevel, string> = {
  SECONDARY: "Secondary (SEE/SLC)",
  HIGHER_SECONDARY: "Higher secondary (+2)",
  DIPLOMA: "Diploma / CTEVT",
  BACHELOR: "Bachelor's",
  MASTER: "Master's",
  MPHIL: "M.Phil.",
  DOCTORATE: "Doctorate (PhD)",
  PROFESSIONAL: "Professional / teaching licence",
  OTHER: "Other",
}

// Higher number = higher qualification (for "highest qualification").
export const QUALIFICATION_RANK: Record<QualificationLevel, number> = {
  OTHER: 0,
  SECONDARY: 1,
  HIGHER_SECONDARY: 2,
  DIPLOMA: 3,
  PROFESSIONAL: 3,
  BACHELOR: 4,
  MASTER: 5,
  MPHIL: 6,
  DOCTORATE: 7,
}

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
}

export const DOCUMENT_CATEGORY_LABELS: Record<TeacherDocumentCategory, string> = {
  CV: "CV / résumé",
  ACADEMIC_CERTIFICATE: "Academic certificate",
  TRAINING_CERTIFICATE: "Training certificate",
  APPOINTMENT_LETTER: "Appointment letter",
  CONTRACT: "Contract",
  EXPERIENCE_LETTER: "Experience letter",
  IDENTITY: "Identity document",
  OTHER: "Other",
}

export const TEACHING_ROLE_LABELS: Record<TeachingRole, string> = {
  SUBJECT_TEACHER: "Subject teacher",
  CLASS_TEACHER: "Class teacher",
  CO_TEACHER: "Co-teacher",
  OTHER: "Other",
}

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  ACTIVE: "Active",
  ENDED: "Ended",
  CANCELLED: "Cancelled",
}

export function teacherName(t: { firstName: string; middleName?: string | null; lastName: string }) {
  return [t.firstName, t.middleName, t.lastName].filter(Boolean).join(" ")
}

// "Grade 8 · A · Mathematics" style summary of an assignment.
export function assignmentSummary(a: {
  class?: { name: string } | null
  section?: { name: string } | null
  program?: { code: string } | null
  subject?: { name: string } | null
  educationLevel?: { name: string } | null
}) {
  const where = [a.class?.name ?? a.program?.code ?? a.educationLevel?.name, a.section && `Sec ${a.section.name}`]
    .filter(Boolean)
    .join(" ")
  return [where, a.class && a.program ? a.program.code : null, a.subject?.name].filter(Boolean).join(" · ")
}
