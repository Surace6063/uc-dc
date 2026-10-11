import "server-only"

import {
  JOB_CATEGORY_LABELS,
  QUALIFICATION_RANK,
  STAFF_EMPLOYMENT_STATUS_LABELS,
  STAFF_EMPLOYMENT_TYPE_LABELS,
  staffName,
} from "@/features/staff/constants"
import type { StaffFilters } from "@/features/staff/filters"
import { GENDER_LABELS } from "@/features/students/constants"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { csvLine } from "@/lib/csv"
import { provinceName } from "@/lib/nepal/locations"
import { prisma } from "@/lib/prisma"
import { buildStaffWhere, staffOrderBy } from "@/services/staff/staff-query"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

const BATCH = 500
export const STAFF_EXPORT_MAX_ROWS = 20_000

type Column = { key: string; header: string; requires?: "sensitive" | "employment" }

// No salary, bank, tax or identity numbers exist here (payroll belongs to
// finance), and private notes and reasons for leaving are never exported.
export const STAFF_EXPORT_COLUMNS: readonly Column[] = [
  { key: "employeeId", header: "Employee ID" },
  { key: "name", header: "Full name" },
  { key: "nameNepali", header: "Name (Nepali)" },
  { key: "gender", header: "Gender" },
  { key: "department", header: "Department" },
  { key: "designation", header: "Designation" },
  { key: "category", header: "Job category" },
  { key: "employmentType", header: "Employment type" },
  { key: "employmentStatus", header: "Employment status" },
  { key: "dateOfJoining", header: "Date of joining" },
  { key: "email", header: "Email" },
  { key: "phone", header: "Phone" },
  { key: "qualification", header: "Highest qualification" },
  { key: "responsibilities", header: "Current responsibilities" },
  { key: "contractStartDate", header: "Contract start date", requires: "employment" },
  { key: "contractEndDate", header: "Contract end date", requires: "employment" },
  { key: "onProbation", header: "On probation", requires: "employment" },
  { key: "lastWorkingDate", header: "Last working date", requires: "employment" },
  { key: "dateOfBirth", header: "Date of birth", requires: "sensitive" },
  { key: "district", header: "Permanent district", requires: "sensitive" },
  { key: "province", header: "Permanent province", requires: "sensitive" },
]

export function exportColumnsFor(ctx: Pick<AuthContext, "permissions">) {
  const sensitive = hasPermission(ctx, "staff.sensitive.view")
  const employment = hasPermission(ctx, "staff.employment.view")
  return STAFF_EXPORT_COLUMNS.filter((c) => !c.requires || (c.requires === "sensitive" ? sensitive : employment))
}

// Streams the staff matching the table's filters (optionally only the
// selected IDs) in batches, within the viewer's scope.
export async function exportStaffCsv(ctx: Ctx, filters: StaffFilters, options: { ids?: string[] }) {
  const where = await buildStaffWhere(ctx, filters, { ids: options.ids })
  const sensitive = hasPermission(ctx, "staff.sensitive.view")
  const employment = hasPermission(ctx, "staff.employment.view")
  const columns = exportColumnsFor(ctx)
  const orderBy = staffOrderBy(filters, employment)
  const encoder = new TextEncoder()
  let skip = 0

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // BOM so Excel opens UTF-8 (Nepali names) correctly.
      controller.enqueue(encoder.encode("﻿" + csvLine(columns.map((c) => c.header))))
    },
    async pull(controller) {
      try {
        const rows = await prisma.staff.findMany({
          where,
          orderBy,
          skip,
          take: BATCH,
          select: {
            employeeId: true, firstName: true, middleName: true, lastName: true, nameNepali: true, gender: true,
            employmentType: true, employmentStatus: true, dateOfJoining: true, email: true, phone: true,
            contractStartDate: employment, contractEndDate: employment, onProbation: employment, lastWorkingDate: employment,
            dateOfBirth: sensitive,
            addresses: sensitive ? { where: { type: "PERMANENT" }, take: 1 } : false,
            department: { select: { name: true } },
            designation: { select: { name: true, category: true } },
            qualifications: { where: { kind: "ACADEMIC" }, select: { level: true, title: true } },
            assignments: { where: { status: "ACTIVE" }, select: { title: true } },
          },
        })
        for (const s of rows) {
          const best = [...s.qualifications].sort((a, b) => QUALIFICATION_RANK[b.level ?? "OTHER"] - QUALIFICATION_RANK[a.level ?? "OTHER"])[0]
          const address = "addresses" in s && Array.isArray(s.addresses) ? s.addresses[0] : undefined
          const values: Record<string, unknown> = {
            employeeId: s.employeeId,
            name: staffName(s),
            nameNepali: s.nameNepali,
            gender: s.gender ? GENDER_LABELS[s.gender] : "",
            department: s.department?.name,
            designation: s.designation?.name,
            category: s.designation?.category ? JOB_CATEGORY_LABELS[s.designation.category] : "",
            employmentType: STAFF_EMPLOYMENT_TYPE_LABELS[s.employmentType],
            employmentStatus: STAFF_EMPLOYMENT_STATUS_LABELS[s.employmentStatus],
            dateOfJoining: s.dateOfJoining,
            email: s.email,
            phone: s.phone,
            qualification: best?.title,
            responsibilities: s.assignments.map((a) => a.title).join("; "),
            contractStartDate: "contractStartDate" in s ? s.contractStartDate : null,
            contractEndDate: "contractEndDate" in s ? s.contractEndDate : null,
            onProbation: "onProbation" in s ? (s.onProbation ? "Yes" : "No") : null,
            lastWorkingDate: "lastWorkingDate" in s ? s.lastWorkingDate : null,
            dateOfBirth: "dateOfBirth" in s ? s.dateOfBirth : null,
            district: address?.district,
            province: provinceName(address?.province),
          }
          controller.enqueue(encoder.encode(csvLine(columns.map((c) => values[c.key]))))
        }
        skip += rows.length
        if (rows.length < BATCH || skip >= STAFF_EXPORT_MAX_ROWS) controller.close()
      } catch (error) {
        console.error(error)
        controller.error(error)
      }
    },
  })
}
