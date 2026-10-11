import type {
  DesignationScope,
  JobCategory,
  StaffDocumentCategory,
  StaffEmploymentStatus,
  StaffEmploymentType,
  StaffQualificationKind,
} from "@/lib/generated/prisma/enums"

export { QUALIFICATION_LEVEL_LABELS, QUALIFICATION_RANK, VERIFICATION_LABELS, ASSIGNMENT_STATUS_LABELS } from "@/features/teachers/constants"

export const STAFF_EMPLOYMENT_TYPE_LABELS: Record<StaffEmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  TEMPORARY: "Temporary",
  CASUAL: "Casual",
  OTHER: "Other",
}

export const STAFF_EMPLOYMENT_STATUS_LABELS: Record<StaffEmploymentStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  SUSPENDED: "Suspended",
  RESIGNED: "Resigned",
  TERMINATED: "Terminated",
  RETIRED: "Retired",
  CONTRACT_EXPIRED: "Contract expired",
}

// Statuses in which someone has left; their active responsibilities end.
export const STAFF_LEFT_STATUSES: readonly StaffEmploymentStatus[] = ["RESIGNED", "TERMINATED", "RETIRED", "CONTRACT_EXPIRED"]

// Types that usually have a fixed term, so the contract dates are shown.
export const FIXED_TERM_TYPES: readonly StaffEmploymentType[] = ["CONTRACT", "TEMPORARY", "CASUAL"]

export const QUALIFICATION_KIND_LABELS: Record<StaffQualificationKind, string> = {
  ACADEMIC: "Academic qualification",
  CERTIFICATION: "Professional certification",
  TRAINING: "Training",
}

export const STAFF_DOCUMENT_CATEGORY_LABELS: Record<StaffDocumentCategory, string> = {
  CV: "CV / résumé",
  ACADEMIC_CERTIFICATE: "Academic certificate",
  PROFESSIONAL_CERTIFICATE: "Professional certificate",
  TRAINING_CERTIFICATE: "Training certificate",
  APPOINTMENT_LETTER: "Appointment letter",
  CONTRACT: "Employment contract",
  EXPERIENCE_LETTER: "Experience letter",
  IDENTITY: "Identity document",
  OTHER: "Other",
}

export const JOB_CATEGORY_LABELS: Record<JobCategory, string> = {
  ADMINISTRATION: "Administration",
  FINANCE: "Finance and accounts",
  FRONT_OFFICE: "Front office / reception",
  LIBRARY: "Library",
  LABORATORY: "Laboratory",
  IT: "Information technology",
  STUDENT_SERVICES: "Student services",
  EXAMINATION: "Examination",
  TRANSPORT: "Transport",
  HOSTEL: "Hostel",
  HEALTH: "Health and first aid",
  SECURITY: "Security",
  FACILITIES: "Facilities and maintenance",
  TEACHING: "Teaching",
  OTHER: "Other",
}

export const DESIGNATION_SCOPE_LABELS: Record<DesignationScope, string> = {
  ALL: "Teachers and staff",
  TEACHING: "Teachers only",
  NON_TEACHING: "Staff only",
}

// Starting points an organisation can add in one click and then edit. Not a
// fixed list: departments and designations are always configurable.
export const SUGGESTED_DEPARTMENTS: readonly { name: string; code: string }[] = [
  { name: "Administration", code: "ADMIN" },
  { name: "Human Resources", code: "HR" },
  { name: "Finance and Accounts", code: "FIN" },
  { name: "Library", code: "LIB" },
  { name: "Laboratory", code: "LAB" },
  { name: "Information Technology", code: "IT" },
  { name: "Reception", code: "RECEP" },
  { name: "Student Affairs", code: "STU" },
  { name: "Examination Office", code: "EXAM" },
  { name: "Transport", code: "TRANS" },
  { name: "Hostel", code: "HOSTEL" },
  { name: "Facilities and Maintenance", code: "FAC" },
  { name: "Security", code: "SEC" },
  { name: "Health and First Aid", code: "HEALTH" },
]

export const SUGGESTED_DESIGNATIONS: readonly { name: string; category: JobCategory; department?: string }[] = [
  { name: "Administrative Officer", category: "ADMINISTRATION", department: "ADMIN" },
  { name: "Office Assistant", category: "ADMINISTRATION", department: "ADMIN" },
  { name: "HR Officer", category: "ADMINISTRATION", department: "HR" },
  { name: "Accountant", category: "FINANCE", department: "FIN" },
  { name: "Receptionist", category: "FRONT_OFFICE", department: "RECEP" },
  { name: "Librarian", category: "LIBRARY", department: "LIB" },
  { name: "Assistant Librarian", category: "LIBRARY", department: "LIB" },
  { name: "Lab Assistant", category: "LABORATORY", department: "LAB" },
  { name: "IT Support Officer", category: "IT", department: "IT" },
  { name: "Transport Coordinator", category: "TRANSPORT", department: "TRANS" },
  { name: "Driver", category: "TRANSPORT", department: "TRANS" },
  { name: "Hostel Warden", category: "HOSTEL", department: "HOSTEL" },
  { name: "Nurse", category: "HEALTH", department: "HEALTH" },
  { name: "Security Guard", category: "SECURITY", department: "SEC" },
  { name: "Cleaner", category: "FACILITIES", department: "FAC" },
  { name: "Maintenance Staff", category: "FACILITIES", department: "FAC" },
]

export function staffName(s: { firstName: string; middleName?: string | null; lastName: string }) {
  return [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")
}

// Contracts ending within this many days count as "expiring soon".
export const CONTRACT_ALERT_DAYS = 60
