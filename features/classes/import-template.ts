import type { ImportColumn } from "@/components/shared/import-wizard"

// Classes & sections import. Levels and programs are matched by their exact
// codes (never by guessing from names). A row whose class already exists
// adds any of its sections the class doesn't have yet.
export const CLASS_IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: "education_level", required: true, description: "Code of an existing education level.", example: "BASIC" },
  { key: "program", description: "Program code, for levels that use programs.", example: "" },
  { key: "class_name", required: true, description: "Name of the class, grade, year or semester.", example: "Grade 8" },
  { key: "class_code", description: "Optional short code, unique in your organisation.", example: "G8" },
  { key: "local_name", description: "Optional name in Nepali.", example: "कक्षा ८" },
  { key: "sequence", description: "Order within the level/program (used for promotion).", example: "8" },
  { key: "class_capacity", description: "Optional maximum students in the class.", example: "" },
  { key: "description", description: "Optional.", example: "" },
  { key: "sections", description: "Section names separated by | (e.g. A|B|C or क|ख).", example: "A|B" },
  { key: "section_capacity", description: "Capacity of each new section.", example: "40" },
  { key: "shift", description: "morning, day or evening (new sections).", example: "morning" },
  { key: "medium", description: "english, nepali, bilingual, mother_tongue or other (new sections).", example: "english" },
]

export const CLASS_IMPORT_MAX_ROWS = 500
export const CLASS_IMPORT_BATCH_SIZE = 50
export const CLASS_IMPORT_TEMPLATE_URL = "/api/classes/import-template"
