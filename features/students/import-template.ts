// The student import template. Columns are matched by header name (case and
// spacing don't matter), so their order is free and optional ones can be left
// out. Shared by the template download and the import page's documentation.

import type { ImportColumn } from "@/components/shared/import-wizard"

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: "admission_number", description: "Leave blank to generate automatically (if enabled).", example: "" },
  { key: "first_name", required: true, description: "Given name.", example: "Aarav" },
  { key: "middle_name", description: "Optional.", example: "" },
  { key: "last_name", required: true, description: "Family name.", example: "Shrestha" },
  { key: "date_of_birth", description: "AD date, YYYY-MM-DD.", example: "2012-04-18" },
  { key: "gender", description: "male, female or other.", example: "male" },
  { key: "nationality", description: "Optional.", example: "Nepali" },
  { key: "email", description: "Optional.", example: "" },
  { key: "phone", description: "Optional.", example: "" },
  { key: "admission_date", required: true, description: "AD date, YYYY-MM-DD.", example: "2026-04-14" },
  { key: "admission_type", description: "new, transfer, readmission or lateral_entry. Default: new.", example: "new" },
  { key: "academic_year", description: "Name of an existing academic year. Needed to enroll.", example: "2083" },
  { key: "education_level", description: "Code or name of an existing level. Needed to enroll.", example: "BASIC" },
  { key: "program", description: "Code or name; only for levels that use programs.", example: "" },
  { key: "class", description: "Name of an existing class in that level/program.", example: "Grade 6" },
  { key: "section", description: "Name of an existing section of that class.", example: "A" },
  { key: "roll_number", description: "Leave blank to assign automatically (if enabled).", example: "" },
  { key: "guardian_name", description: "Primary guardian.", example: "Hari Shrestha" },
  { key: "guardian_relationship", description: "father, mother, legal_guardian, ... Default: other.", example: "father" },
  { key: "guardian_phone", description: "Matches an existing guardian with the same name and phone (siblings).", example: "9800000000" },
  { key: "guardian_email", description: "Optional.", example: "" },
  { key: "permanent_province", description: "1–7 or name, e.g. Bagmati.", example: "Bagmati" },
  { key: "permanent_district", description: "District in that province.", example: "Kathmandu" },
  { key: "permanent_municipality", description: "Municipality or rural municipality.", example: "Kathmandu Metropolitan City" },
  { key: "permanent_ward", description: "Ward number.", example: "10" },
  { key: "permanent_tole", description: "Tole or locality.", example: "Baneshwor" },
]

export const IMPORT_MAX_ROWS = 2000
export const IMPORT_BATCH_SIZE = 50

// A file download served by a route handler (plain <a>, not a page <Link>).
export const IMPORT_TEMPLATE_URL = "/api/students/import-template"
