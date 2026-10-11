import "server-only"

import { MEDIUM_LABELS, SHIFT_LABELS } from "@/features/classes/constants"
import type { ClassFilters } from "@/features/classes/filters"
import { fullName, GENDER_LABELS } from "@/features/students/constants"
import { teacherName } from "@/features/teachers/constants"
import type { AuthContext } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { csvLine } from "@/lib/csv"
import { getClassDetail } from "@/services/classes/class-service"
import { listClasses, listSections } from "@/services/classes/class-query"

// CSV exports of the classes list, the sections list and a class roster.
// They reuse the list queries, so an export always matches what the caller
// sees with the same filters, in their own organisation only.
type Ctx = Pick<AuthContext, "organization" | "user">

const MAX_ROWS = 5000
const status = (r: { isActive: boolean; archivedAt: Date | null }) =>
  r.archivedAt ? "Archived" : r.isActive ? "Active" : "Inactive"

async function allPages<T>(fetch: (page: number) => Promise<{ rows: T[]; total: number }>) {
  const rows: T[] = []
  for (let page = 1; rows.length < MAX_ROWS; page++) {
    const result = await fetch(page)
    rows.push(...result.rows)
    if (rows.length >= result.total || result.rows.length === 0) break
  }
  return rows
}

export async function exportClassesCsv(ctx: Ctx, filters: ClassFilters, yearId: string | null) {
  const rows = await allPages((page) => listClasses(ctx, { ...filters, page, pageSize: 100 }, yearId))
  return [
    csvLine(["Class", "Nepali name", "Code", "Education level", "Program", "Order", "Sections", "Enrolled", "Capacity", "Class teachers", "Status"]),
    ...rows.map((r) =>
      csvLine([
        r.name, r.localName, r.code, r.educationLevel.name, r.program?.code, r.sequence, r.sectionCount, r.enrolled,
        r.capacity, r.classTeachers.map(teacherName).join("; "), status(r),
      ])
    ),
  ].join("")
}

export async function exportSectionsCsv(ctx: Ctx, filters: ClassFilters, yearId: string | null) {
  const rows = await allPages((page) => listSections(ctx, { ...filters, page, pageSize: 100 }, yearId))
  return [
    csvLine(["Class", "Section", "Code", "Education level", "Program", "Shift", "Medium", "Room", "Class teacher", "Girls", "Boys", "Enrolled", "Capacity", "Status"]),
    ...rows.map((r) =>
      csvLine([
        r.class.name, r.name, r.code, r.class.educationLevel.name, r.class.program?.code,
        r.shift ? SHIFT_LABELS[r.shift] : "", r.medium ? MEDIUM_LABELS[r.medium] : "", r.room,
        r.classTeacher ? teacherName(r.classTeacher) : "", r.girls, r.boys, r.enrolled, r.capacity, status(r),
      ])
    ),
  ].join("")
}

// sectionId: a section, "none" (students without a section) or null (all).
export async function exportRosterCsv(ctx: Ctx, classId: string, yearId: string, sectionId: string | null) {
  const detail = await getClassDetail(ctx, classId, yearId, { includeStudents: true })
  if (!detail) throw new NotFoundError("Class not found.")
  const sections = new Map(detail.academicClass.sections.map((s) => [s.id, s.name]))
  const rows = detail.enrollments
    .filter((e) => !sectionId || (sectionId === "none" ? e.sectionId === null : e.sectionId === sectionId))
    .sort(
      (a, b) =>
        (sections.get(a.sectionId ?? "") ?? "").localeCompare(sections.get(b.sectionId ?? "") ?? "") ||
        (Number(a.rollNumber) || Infinity) - (Number(b.rollNumber) || Infinity) ||
        fullName(a.student).localeCompare(fullName(b.student))
    )
  return {
    name: `${detail.academicClass.name}${sectionId && sectionId !== "none" ? `-${sections.get(sectionId) ?? ""}` : ""}`,
    count: rows.length,
    csv: [
      csvLine(["Roll", "Name", "Admission number", "Gender", "Section", "Enrollment status", "Enrolled on", "Phone"]),
      ...rows.map((e) =>
        csvLine([
          e.rollNumber, fullName(e.student), e.student.admissionNumber,
          e.student.gender ? GENDER_LABELS[e.student.gender] : "", sections.get(e.sectionId ?? "") ?? "",
          e.status === "ON_HOLD" ? "On hold" : "Active", e.enrollmentDate, e.student.phone,
        ])
      ),
    ].join(""),
  }
}
