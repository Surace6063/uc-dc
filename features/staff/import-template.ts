import type { ImportColumn } from "@/components/shared/import-wizard"

// Staff import template. Columns are matched by header name. Imports never
// create login accounts, grant permissions or assign responsibilities.
export const STAFF_IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: "employee_id", description: "Leave blank to generate automatically (if enabled).", example: "" },
  { key: "first_name", required: true, description: "Given name.", example: "Sita" },
  { key: "middle_name", description: "Optional.", example: "" },
  { key: "last_name", required: true, description: "Family name.", example: "Thapa" },
  { key: "name_nepali", description: "Full name in Devanagari (optional).", example: "सीता थापा" },
  { key: "gender", description: "male, female or other.", example: "female" },
  { key: "date_of_birth", description: "AD date, YYYY-MM-DD.", example: "" },
  { key: "email", description: "Optional.", example: "sita@example.com" },
  { key: "phone", description: "Optional.", example: "9851000000" },
  { key: "date_of_joining", required: true, description: "AD date, YYYY-MM-DD.", example: "2024-04-15" },
  { key: "employment_type", description: "full_time, part_time, contract, temporary, casual or other. Default: full_time.", example: "full_time" },
  { key: "employment_status", description: "active, on_leave, … Default: active.", example: "active" },
  { key: "department", description: "Code or name of an existing staff department.", example: "FIN" },
  { key: "designation", description: "Name of an existing designation.", example: "Accountant" },
  { key: "contract_start_date", description: "AD date, for contract staff.", example: "" },
  { key: "contract_end_date", description: "AD date, for contract staff.", example: "" },
  { key: "qualification_level", description: "secondary, higher_secondary, diploma, bachelor, master, … (one per row).", example: "bachelor" },
  { key: "qualification_title", description: "e.g. BBS, Bachelor in Library Science.", example: "BBS" },
  { key: "qualification_specialization", description: "Subject area.", example: "Accounting" },
  { key: "qualification_institution", description: "College or campus.", example: "Shanker Dev Campus" },
  { key: "qualification_year", description: "Completion year (AD).", example: "2019" },
  { key: "permanent_province", description: "1–7 or name.", example: "Bagmati" },
  { key: "permanent_district", description: "District in that province.", example: "Kathmandu" },
  { key: "permanent_municipality", description: "Municipality or rural municipality.", example: "Kathmandu Metropolitan City" },
]

export const STAFF_IMPORT_MAX_ROWS = 1000
export const STAFF_IMPORT_BATCH_SIZE = 50
export const STAFF_IMPORT_TEMPLATE_URL = "/api/staff/import-template"
