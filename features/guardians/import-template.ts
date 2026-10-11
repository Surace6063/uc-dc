import type { ImportColumn } from "@/components/shared/import-wizard"

// Guardian import template. One row per guardian–student link: a guardian of
// two children takes two rows with the same name and phone (or guardian ID).
// Students are matched by admission number only, never by name. Imports never
// create login accounts or send invitations.
export const GUARDIAN_IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: "guardian_code", description: "An existing guardian ID links that guardian (their details aren't changed). Blank: matched by name + phone, otherwise created.", example: "" },
  { key: "full_name", required: true, description: "Guardian's full name.", example: "Hari Bahadur Shrestha" },
  { key: "phone", required: true, description: "Mobile or landline, e.g. 9841000000 or +977-1-4000000.", example: "9841000000" },
  { key: "alternate_phone", description: "Optional.", example: "" },
  { key: "email", description: "Optional; needed later for a portal account.", example: "hari@example.com" },
  { key: "gender", description: "male, female or other.", example: "male" },
  { key: "occupation", description: "Optional.", example: "Business" },
  { key: "workplace", description: "Optional.", example: "" },
  { key: "preferred_contact_method", description: "phone, sms, viber, whatsapp, email or in_person.", example: "viber" },
  { key: "preferred_language", description: "e.g. Nepali, English, Maithili.", example: "Nepali" },
  { key: "permanent_province", description: "1–7 or name.", example: "Bagmati" },
  { key: "permanent_district", description: "District in that province.", example: "Kathmandu" },
  { key: "permanent_municipality", description: "Municipality or rural municipality.", example: "Kathmandu Metropolitan City" },
  { key: "permanent_ward", description: "Ward number.", example: "4" },
  { key: "permanent_tole", description: "Tole / locality.", example: "Baneshwor" },
  { key: "student_admission_number", description: "Admission number of the student to link (optional).", example: "ADM-00001" },
  { key: "relationship", description: "father, mother, grandfather, grandmother, brother, sister, uncle, aunt, spouse, legal_guardian or other. Required with a student.", example: "father" },
  { key: "is_primary", description: "yes/no. Primary contact for that student.", example: "yes" },
  { key: "is_emergency_contact", description: "yes/no. Default: yes.", example: "yes" },
  { key: "can_pickup", description: "yes/no. Default: no.", example: "yes" },
  { key: "portal_access", description: "yes/no: may see this student in the parent portal. Default: no.", example: "no" },
  { key: "fee_notices", description: "yes/no: receives fee notices. Default: no.", example: "no" },
]

export const GUARDIAN_IMPORT_MAX_ROWS = 2000
export const GUARDIAN_IMPORT_BATCH_SIZE = 50
export const GUARDIAN_IMPORT_TEMPLATE_URL = "/api/parents/import-template"
