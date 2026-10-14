import type { TeachingAssignment } from "@/features/attendance/access"

// Which classes and subjects a teacher may plan, share and set work for,
// from their active teaching assignments. Pure, so the rule is unit-tested;
// services load the assignments and enforce it on every read and write.
//
//   Section: an assignment for the whole class covers every section; one for
//     a section covers only that section. Work for the whole class needs a
//     whole-class assignment.
//   Subject: lesson plans, materials and assignments need an assignment for
//     that subject. Things without a subject (a class notice, a timetable
//     period) need any assignment for the class.

export type TeachingTarget = {
  academicYearId: string
  classId: string
  sectionId: string | null
  subjectId: string | null
}

export function teaches(assignments: readonly TeachingAssignment[], target: TeachingTarget) {
  return assignments.some(
    (a) =>
      a.academicYearId === target.academicYearId &&
      a.classId === target.classId &&
      (a.sectionId === null || a.sectionId === target.sectionId) &&
      (target.subjectId === null || a.subjectId === target.subjectId)
  )
}

// Distinct class/section pairs a teacher is assigned to, for pickers.
export function taughtPlaces(assignments: readonly TeachingAssignment[]) {
  const seen = new Map<string, { academicYearId: string; classId: string; sectionId: string | null }>()
  for (const a of assignments) {
    if (!a.classId) continue
    const key = `${a.academicYearId}:${a.classId}:${a.sectionId ?? ""}`
    if (!seen.has(key)) seen.set(key, { academicYearId: a.academicYearId, classId: a.classId, sectionId: a.sectionId })
  }
  return [...seen.values()]
}
