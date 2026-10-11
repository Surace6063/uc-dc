import "server-only"

import { ENROLLMENT_STATUS_LABELS, GENDER_LABELS, RELATIONSHIP_LABELS, STUDENT_STATUS_LABELS, ADMISSION_TYPE_LABELS, fullName } from "@/features/students/constants"
import type { StudentFilters } from "@/features/students/filters"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { csvLine } from "@/lib/csv"
import { provinceName } from "@/lib/nepal/locations"
import { prisma } from "@/lib/prisma"
import {
  buildStudentWhere,
  enrollmentWhere,
  resolveYearScope,
  studentOrderBy,
} from "@/services/students/student-query"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

const BATCH = 500
export const EXPORT_MAX_ROWS = 20_000

type Column = { key: string; header: string; sensitive?: boolean }

// Exportable columns. Sensitive ones are dropped unless the role may see them.
export const EXPORT_COLUMNS: readonly Column[] = [
  { key: "admissionNumber", header: "Admission number" },
  { key: "name", header: "Full name" },
  { key: "gender", header: "Gender" },
  { key: "dateOfBirth", header: "Date of birth" },
  { key: "status", header: "Student status" },
  { key: "admissionDate", header: "Admission date" },
  { key: "admissionType", header: "Admission type" },
  { key: "academicYear", header: "Academic year" },
  { key: "level", header: "Education level" },
  { key: "program", header: "Program" },
  { key: "class", header: "Class" },
  { key: "section", header: "Section" },
  { key: "rollNumber", header: "Roll number" },
  { key: "enrollmentStatus", header: "Enrollment status" },
  { key: "email", header: "Email" },
  { key: "phone", header: "Phone" },
  { key: "guardian", header: "Primary guardian" },
  { key: "guardianRelationship", header: "Guardian relationship" },
  { key: "guardianPhone", header: "Guardian phone" },
  { key: "province", header: "Province" },
  { key: "district", header: "District" },
  { key: "municipality", header: "Municipality" },
  { key: "medicalNotes", header: "Medical notes", sensitive: true },
]

// Streams a CSV of the students matching the same filters as the table
// (optionally limited to selected IDs), in batches so large organisations
// never load every student into memory at once.
export async function exportStudentsCsv(
  ctx: Ctx,
  filters: StudentFilters,
  options: { ids?: string[]; columns?: string[] }
) {
  const yearId = await resolveYearScope(ctx, filters.year)
  const where = await buildStudentWhere(ctx, filters, yearId, { ids: options.ids })
  const placement = enrollmentWhere(ctx, filters, yearId)
  const sensitive = hasPermission(ctx, "students.sensitive.view")
  const columns = EXPORT_COLUMNS.filter(
    (c) => (!c.sensitive || sensitive) && (!options.columns?.length || options.columns.includes(c.key))
  )
  const orderBy = studentOrderBy(filters)
  const encoder = new TextEncoder()

  let skip = 0
  return new ReadableStream<Uint8Array>({
    start(controller) {
      // BOM so Excel opens UTF-8 (Nepali names) correctly.
      controller.enqueue(encoder.encode("﻿" + csvLine(columns.map((c) => c.header))))
    },
    async pull(controller) {
      try {
        const rows = await prisma.student.findMany({
          where,
          orderBy,
          skip,
          take: BATCH,
          select: {
            admissionNumber: true, firstName: true, middleName: true, lastName: true,
            gender: true, dateOfBirth: true, status: true, admissionDate: true, admissionType: true,
            email: true, phone: true, medicalNotes: sensitive,
            addresses: { where: { type: "PERMANENT" }, take: 1 },
            guardians: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              take: 1,
              select: { relationship: true, guardian: { select: { fullName: true, phone: true } } },
            },
            enrollments: {
              where: placement ?? undefined,
              orderBy: [{ enrollmentDate: "desc" }, { createdAt: "desc" }],
              take: 1,
              select: {
                status: true, rollNumber: true,
                academicYear: { select: { name: true } },
                educationLevel: { select: { name: true } },
                program: { select: { name: true } },
                class: { select: { name: true } },
                section: { select: { name: true } },
              },
            },
          },
        })
        for (const s of rows) {
          const e = s.enrollments[0]
          const g = s.guardians[0]
          const a = s.addresses[0]
          const values: Record<string, unknown> = {
            admissionNumber: s.admissionNumber,
            name: fullName(s),
            gender: s.gender ? GENDER_LABELS[s.gender] : "",
            dateOfBirth: s.dateOfBirth,
            status: STUDENT_STATUS_LABELS[s.status],
            admissionDate: s.admissionDate,
            admissionType: ADMISSION_TYPE_LABELS[s.admissionType],
            academicYear: e?.academicYear.name,
            level: e?.educationLevel.name,
            program: e?.program?.name,
            class: e?.class.name,
            section: e?.section?.name,
            rollNumber: e?.rollNumber,
            enrollmentStatus: e ? ENROLLMENT_STATUS_LABELS[e.status] : "",
            email: s.email,
            phone: s.phone,
            guardian: g?.guardian.fullName,
            guardianRelationship: g ? RELATIONSHIP_LABELS[g.relationship] : "",
            guardianPhone: g?.guardian.phone,
            province: provinceName(a?.province),
            district: a?.district,
            municipality: a?.municipality,
            medicalNotes: "medicalNotes" in s ? s.medicalNotes : "",
          }
          controller.enqueue(encoder.encode(csvLine(columns.map((c) => values[c.key]))))
        }
        skip += rows.length
        if (rows.length < BATCH || skip >= EXPORT_MAX_ROWS) controller.close()
      } catch (error) {
        console.error(error)
        controller.error(error)
      }
    },
  })
}
