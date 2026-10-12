import type { ImportColumn } from "@/components/shared/import-wizard"

// Marks import for one examination. Students are matched only by exact
// admission number; their class and section come from their enrollment,
// and the subject by its code within that class. Imported marks go into
// draft sheets for the teacher to check and submit; an existing mark is
// never overwritten (change it in the marks grid instead).
export const MARKS_IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: "admission_number", required: true, description: "The student's exact admission number.", example: "ADM-00012" },
  { key: "subject_code", required: true, description: "The subject's code (as on the examination).", example: "MATH8" },
  { key: "component", required: true, description: "Component name, e.g. Theory or Practical.", example: "Theory" },
  { key: "marks", required: true, description: "Marks (up to 2 decimals), or AB (absent), EX (exempt), INC (incomplete), WH (withheld).", example: "62.5" },
  { key: "student_name", description: "For your reference only; ignored when matching.", example: "Sita Sharma" },
]

export const MARKS_IMPORT_MAX_ROWS = 10_000
export const MARKS_IMPORT_BATCH_SIZE = 500

export const marksTemplateUrl = (examinationId: string, examinationSubjectId?: string) =>
  `/api/exams/${examinationId}/marks-template${examinationSubjectId ? `?subject=${examinationSubjectId}` : ""}`
