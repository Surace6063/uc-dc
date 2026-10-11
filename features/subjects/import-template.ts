import type { ImportColumn } from "@/components/shared/import-wizard"

// Subjects import. A row whose code already exists updates that subject;
// levels and programs are matched by their exact codes and categories by
// exact name, never guessed.
export const SUBJECT_IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: "code", required: true, description: "Unique subject code (e.g. NEB or university code).", example: "MTH8" },
  { key: "name", required: true, description: "Subject or course name.", example: "Mathematics" },
  { key: "local_name", description: "Name in Nepali (optional).", example: "गणित" },
  { key: "category", description: "Name of an existing subject category.", example: "Mathematics" },
  { key: "requirement", description: "compulsory, elective, optional or additional. Default: compulsory.", example: "compulsory" },
  { key: "education_level", description: "Code of an existing education level (blank = any level).", example: "BASIC" },
  { key: "program", description: "Program code, for program-specific courses.", example: "" },
  { key: "credit_hours", description: "Optional; decimals allowed (e.g. 3.75).", example: "5" },
  { key: "theory_hours", description: "Optional total theory hours.", example: "" },
  { key: "practical_hours", description: "Optional total practical hours.", example: "" },
  { key: "weekly_periods", description: "Optional default periods per week.", example: "6" },
  { key: "medium", description: "english, nepali, bilingual, mother_tongue or other.", example: "english" },
  { key: "description", description: "Optional.", example: "" },
]

export const SUBJECT_IMPORT_MAX_ROWS = 1000
export const SUBJECT_IMPORT_BATCH_SIZE = 100
export const SUBJECT_IMPORT_TEMPLATE_URL = "/api/subjects/import-template"
