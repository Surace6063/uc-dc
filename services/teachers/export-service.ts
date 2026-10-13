import "server-only"

import {
  ACADEMIC_RANK_LABELS,
  assignmentSummary,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  QUALIFICATION_RANK,
  teacherName,
} from "@/features/teachers/constants"
import type { TeacherFilters } from "@/features/teachers/filters"
import { GENDER_LABELS, yesNo } from "@/features/students/constants"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { csvLine } from "@/lib/csv"
import { provinceName } from "@/lib/nepal/locations"
import { prisma } from "@/lib/prisma"
import { resolveYearScope } from "@/services/students/student-query"
import {
  assignmentWhere,
  buildTeacherWhere,
  teacherOrderBy,
} from "@/services/teachers/teacher-query"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

const BATCH = 500
export const TEACHER_EXPORT_MAX_ROWS = 20_000

type Column = { key: string; header: string; requires?: "sensitive" | "employment" }

// No salary or payroll data exists here (it belongs to the finance module).
export const TEACHER_EXPORT_COLUMNS: readonly Column[] = [
  { key: "employeeId", header: "Employee ID" },
  { key: "name", header: "Full name" },
  { key: "nameNepali", header: "Name (Nepali)" },
  { key: "gender", header: "Gender" },
  { key: "designation", header: "Designation" },
  { key: "academicRank", header: "Academic rank" },
  { key: "department", header: "Department" },
  { key: "employmentType", header: "Employment type" },
  { key: "employmentStatus", header: "Employment status" },
  { key: "dateOfJoining", header: "Date of joining" },
  { key: "email", header: "Email" },
  { key: "phone", header: "Phone" },
  { key: "qualification", header: "Highest qualification" },
  { key: "assignments", header: "Current assignments" },
  { key: "contractEndDate", header: "Contract end date", requires: "employment" },
  { key: "onProbation", header: "On probation", requires: "employment" },
  { key: "fullTimeElsewhere", header: "Full-time job elsewhere", requires: "employment" },
  { key: "dateOfBirth", header: "Date of birth", requires: "sensitive" },
  { key: "district", header: "Permanent district", requires: "sensitive" },
  { key: "province", header: "Permanent province", requires: "sensitive" },
]

// Streams the teachers matching the table's filters (optionally only the
// selected IDs), in batches. Restricted columns are dropped unless allowed.
export async function exportTeachersCsv(ctx: Ctx, filters: TeacherFilters, options: { ids?: string[] }) {
  const yearId = await resolveYearScope(ctx, filters.year)
  const where = await buildTeacherWhere(ctx, filters, yearId, { ids: options.ids })
  const active = assignmentWhere(ctx, { ...filters, level: undefined, program: undefined, class: undefined, section: undefined, subject: undefined, batch: undefined }, yearId)
  const sensitive = hasPermission(ctx, "teachers.sensitive.view")
  const employment = hasPermission(ctx, "teachers.employment.view")
  const columns = TEACHER_EXPORT_COLUMNS.filter(
    (c) => !c.requires || (c.requires === "sensitive" ? sensitive : employment)
  )
  const orderBy = teacherOrderBy(filters)
  const encoder = new TextEncoder()
  let skip = 0

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("﻿" + csvLine(columns.map((c) => c.header))))
    },
    async pull(controller) {
      try {
        const rows = await prisma.teacher.findMany({
          where,
          orderBy,
          skip,
          take: BATCH,
          select: {
            employeeId: true, firstName: true, middleName: true, lastName: true, nameNepali: true, gender: true,
            employmentType: true, employmentStatus: true, dateOfJoining: true, email: true, phone: true,
            academicRank: true, contractEndDate: employment, onProbation: employment, fullTimeElsewhere: employment, dateOfBirth: sensitive,
            addresses: sensitive ? { where: { type: "PERMANENT" }, take: 1 } : false,
            designation: { select: { name: true } },
            department: { select: { name: true } },
            qualifications: { select: { level: true, title: true } },
            assignments: {
              where: active,
              select: {
                class: { select: { name: true } }, section: { select: { name: true } },
                program: { select: { code: true } }, subject: { select: { name: true } },
                educationLevel: { select: { name: true } },
              },
            },
          },
        })
        for (const t of rows) {
          const best = [...t.qualifications].sort((a, b) => QUALIFICATION_RANK[b.level] - QUALIFICATION_RANK[a.level])[0]
          const address = "addresses" in t && Array.isArray(t.addresses) ? t.addresses[0] : undefined
          const values: Record<string, unknown> = {
            employeeId: t.employeeId,
            name: teacherName(t),
            nameNepali: t.nameNepali,
            gender: t.gender ? GENDER_LABELS[t.gender] : "",
            designation: t.designation?.name,
            academicRank: t.academicRank ? ACADEMIC_RANK_LABELS[t.academicRank] : "",
            department: t.department?.name,
            employmentType: EMPLOYMENT_TYPE_LABELS[t.employmentType],
            employmentStatus: EMPLOYMENT_STATUS_LABELS[t.employmentStatus],
            dateOfJoining: t.dateOfJoining,
            email: t.email,
            phone: t.phone,
            qualification: best?.title,
            assignments: t.assignments.map(assignmentSummary).join("; "),
            contractEndDate: "contractEndDate" in t ? t.contractEndDate : null,
            onProbation: "onProbation" in t ? (t.onProbation ? "Yes" : "No") : null,
            fullTimeElsewhere: "fullTimeElsewhere" in t ? yesNo(t.fullTimeElsewhere) : null,
            dateOfBirth: "dateOfBirth" in t ? t.dateOfBirth : null,
            district: address?.district,
            province: provinceName(address?.province),
          }
          controller.enqueue(encoder.encode(csvLine(columns.map((c) => values[c.key]))))
        }
        skip += rows.length
        if (rows.length < BATCH || skip >= TEACHER_EXPORT_MAX_ROWS) controller.close()
      } catch (error) {
        console.error(error)
        controller.error(error)
      }
    },
  })
}
