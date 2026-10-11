import type { AttendanceSessionType, TeachingRole } from "@/lib/generated/prisma/enums"

// Which registers a teacher may take, from their active teaching assignments.
// Pure, so the rule is unit-tested; services load the assignments and the
// register's scope from the database and enforce it on every write.
//
//   Daily register: the class (or co-) teacher of that class and section. A
//     whole-class register needs a whole-class assignment.
//   Period register: a teacher assigned to that subject in that class, for
//     all sections or the register's section.

export type TeachingAssignment = {
  academicYearId: string
  classId: string | null
  sectionId: string | null
  subjectId: string | null
  role: TeachingRole
}

export type RegisterTarget = {
  academicYearId: string
  classId: string
  sectionId: string | null
  sessionType: AttendanceSessionType
  // The offering's subject, for period registers.
  subjectId: string | null
}

function sectionCovered(assignment: TeachingAssignment, sectionId: string | null) {
  return assignment.sectionId === null || assignment.sectionId === sectionId
}

export function assignmentCovers(assignment: TeachingAssignment, target: RegisterTarget) {
  if (assignment.academicYearId !== target.academicYearId || assignment.classId !== target.classId) return false
  if (!sectionCovered(assignment, target.sectionId)) return false
  if (target.sessionType === "DAILY") return assignment.role === "CLASS_TEACHER" || assignment.role === "CO_TEACHER"
  return assignment.subjectId !== null && assignment.subjectId === target.subjectId
}

export function canTakeRegister(assignments: TeachingAssignment[], target: RegisterTarget) {
  return assignments.some((a) => assignmentCovers(a, target))
}
