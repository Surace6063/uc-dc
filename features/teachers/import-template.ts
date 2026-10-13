import type { ImportColumn } from "@/components/shared/import-wizard"

// Teacher import template. Columns are matched by header name. Imports never
// create login accounts or teaching assignments; add those from the profile.
export const TEACHER_IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: "employee_id", description: "Leave blank to generate automatically (if enabled).", example: "" },
  { key: "first_name", required: true, description: "Given name.", example: "Bimala" },
  { key: "middle_name", description: "Optional.", example: "" },
  { key: "last_name", required: true, description: "Family name.", example: "Karki" },
  { key: "name_nepali", description: "Full name in Devanagari (optional).", example: "बिमला कार्की" },
  { key: "gender", description: "male, female or other.", example: "female" },
  { key: "date_of_birth", description: "AD date, YYYY-MM-DD.", example: "" },
  { key: "email", description: "Optional.", example: "bimala@example.com" },
  { key: "phone", description: "Optional.", example: "9841000000" },
  { key: "date_of_joining", required: true, description: "AD date, YYYY-MM-DD.", example: "2024-04-15" },
  { key: "employment_type", description: "full_time, part_time, contract, temporary, visiting or other. Default: full_time.", example: "full_time" },
  { key: "employment_status", description: "active, on_leave, … Default: active.", example: "active" },
  { key: "designation", description: "Name of an existing designation.", example: "Teacher" },
  { key: "academic_rank", description: "professor, associate professor, assistant professor, lecturer, teaching assistant or other. Optional.", example: "lecturer" },
  { key: "department", description: "Code or name of an existing faculty/department.", example: "" },
  { key: "full_time_elsewhere", description: "yes or no: holds a full-time job at another institution. Optional.", example: "no" },
  { key: "contract_end_date", description: "AD date, for contract staff.", example: "" },
  { key: "qualification_level", description: "bachelor, master, mphil, doctorate, diploma, … (one qualification per row).", example: "master" },
  { key: "qualification_title", description: "e.g. M.Ed. in Mathematics.", example: "M.Ed. Mathematics" },
  { key: "qualification_specialization", description: "Subject area.", example: "Mathematics" },
  { key: "qualification_institution", description: "College or campus.", example: "Tribhuvan University" },
  { key: "qualification_year", description: "Completion year (AD).", example: "2018" },
  { key: "permanent_province", description: "1–7 or name.", example: "Bagmati" },
  { key: "permanent_district", description: "District in that province.", example: "Lalitpur" },
  { key: "permanent_municipality", description: "Municipality or rural municipality.", example: "Lalitpur Metropolitan City" },
]

export const TEACHER_IMPORT_MAX_ROWS = 1000
export const TEACHER_IMPORT_BATCH_SIZE = 50
export const TEACHER_IMPORT_TEMPLATE_URL = "/api/teachers/import-template"
