import type { TeachingAssignment } from "@/features/attendance/access"

// Which marks sheets a teacher may fill in, from their active teaching
// assignments. Pure, so the rule is unit-tested; services load assignments
// and the sheet's scope from the database and enforce it on every write.
//
//   A sheet (examination subject × section) is a teacher's when they are
//   assigned to that subject in that class and year, for every section
//   (no section on the assignment) or for that section. A whole-class
//   sheet (no section) needs a whole-class assignment.

export type MarksTarget = {
  academicYearId: string
  classId: string
  sectionId: string | null
  subjectId: string
}

export function assignmentCoversMarks(a: TeachingAssignment, t: MarksTarget) {
  if (a.academicYearId !== t.academicYearId || a.classId !== t.classId) return false
  if (a.subjectId === null || a.subjectId !== t.subjectId) return false
  return a.sectionId === null || a.sectionId === t.sectionId
}

export function canEnterMarks(assignments: TeachingAssignment[], target: MarksTarget) {
  return assignments.some((a) => assignmentCoversMarks(a, target))
}

// Classes (and sections) whose results a teacher may see: any assignment
// to the class in that year, as class teacher or subject teacher.
export function teachesClass(assignments: TeachingAssignment[], t: { academicYearId: string; classId: string; sectionId: string | null }) {
  return assignments.some(
    (a) => a.academicYearId === t.academicYearId && a.classId === t.classId && (a.sectionId === null || a.sectionId === t.sectionId)
  )
}
