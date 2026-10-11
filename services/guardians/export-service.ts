import "server-only"

import {
  CONTACT_METHOD_LABELS,
  GENDER_LABELS,
  INVITATION_STATE_LABELS,
  invitationState,
  PORTAL_STATUS_LABELS,
  RELATIONSHIP_LABELS,
} from "@/features/guardians/constants"
import type { GuardianFilters } from "@/features/guardians/filters"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { csvLine } from "@/lib/csv"
import { provinceName } from "@/lib/nepal/locations"
import { prisma } from "@/lib/prisma"
import { buildGuardianWhere, guardianOrderBy } from "@/services/guardians/guardian-query"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

const BATCH = 500
export const GUARDIAN_EXPORT_MAX_ROWS = 20_000

type Column = { key: string; header: string; requires?: "sensitive" | "students" }

// Linked students appear only for roles that may see students; date of birth
// and addresses only with parents.sensitive.view. Link notes, account
// details and invitation links are never exported.
export const GUARDIAN_EXPORT_COLUMNS: readonly Column[] = [
  { key: "guardianCode", header: "Guardian ID" },
  { key: "fullName", header: "Full name" },
  { key: "gender", header: "Gender" },
  { key: "phone", header: "Phone" },
  { key: "alternatePhone", header: "Alternate phone" },
  { key: "email", header: "Email" },
  { key: "preferredContactMethod", header: "Preferred contact" },
  { key: "preferredLanguage", header: "Preferred language" },
  { key: "occupation", header: "Occupation" },
  { key: "workplace", header: "Workplace" },
  { key: "portalStatus", header: "Portal access" },
  { key: "invitation", header: "Invitation" },
  { key: "childCount", header: "Linked students" },
  { key: "children", header: "Students (relationship)", requires: "students" },
  { key: "primaryFor", header: "Primary contact for", requires: "students" },
  { key: "status", header: "Record status" },
  { key: "createdAt", header: "Created" },
  { key: "dateOfBirth", header: "Date of birth", requires: "sensitive" },
  { key: "province", header: "Permanent province", requires: "sensitive" },
  { key: "district", header: "Permanent district", requires: "sensitive" },
  { key: "municipality", header: "Permanent municipality", requires: "sensitive" },
]

export function guardianExportColumnsFor(ctx: Pick<AuthContext, "permissions">) {
  const sensitive = hasPermission(ctx, "parents.sensitive.view")
  const students = hasPermission(ctx, "students.view")
  return GUARDIAN_EXPORT_COLUMNS.filter((c) => !c.requires || (c.requires === "sensitive" ? sensitive : students))
}

// Streams the guardians matching the table's filters (optionally only the
// selected IDs) in batches.
export async function exportGuardiansCsv(ctx: Ctx, filters: GuardianFilters, options: { ids?: string[] }) {
  const where = await buildGuardianWhere(ctx, filters, { ids: options.ids })
  const sensitive = hasPermission(ctx, "parents.sensitive.view")
  const canSeeStudents = hasPermission(ctx, "students.view")
  const columns = guardianExportColumnsFor(ctx)
  const orderBy = guardianOrderBy(filters)
  const encoder = new TextEncoder()
  let skip = 0

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // BOM so Excel opens UTF-8 (Nepali names) correctly.
      controller.enqueue(encoder.encode("﻿" + csvLine(columns.map((c) => c.header))))
    },
    async pull(controller) {
      try {
        const rows = await prisma.guardian.findMany({
          where,
          orderBy,
          skip,
          take: BATCH,
          select: {
            guardianCode: true, fullName: true, gender: true, phone: true, alternatePhone: true, email: true,
            preferredContactMethod: true, preferredLanguage: true, occupation: true, workplace: true,
            portalStatus: true, archivedAt: true, createdAt: true,
            dateOfBirth: sensitive,
            addresses: sensitive ? { where: { type: "PERMANENT" }, take: 1 } : false,
            invitations: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, expiresAt: true } },
            students: {
              take: canSeeStudents ? undefined : 0,
              select: {
                relationship: true, isPrimary: true,
                student: { select: { firstName: true, lastName: true, admissionNumber: true } },
              },
            },
            _count: { select: { students: true } },
          },
        })
        for (const g of rows) {
          const links = g.students
          const address = "addresses" in g && Array.isArray(g.addresses) ? g.addresses[0] : undefined
          const label = (l: (typeof links)[number]) => `${l.student.firstName} ${l.student.lastName} (${l.student.admissionNumber})`
          const values: Record<string, unknown> = {
            guardianCode: g.guardianCode,
            fullName: g.fullName,
            gender: g.gender ? GENDER_LABELS[g.gender] : "",
            phone: g.phone,
            alternatePhone: g.alternatePhone,
            email: g.email,
            preferredContactMethod: g.preferredContactMethod ? CONTACT_METHOD_LABELS[g.preferredContactMethod] : "",
            preferredLanguage: g.preferredLanguage,
            occupation: g.occupation,
            workplace: g.workplace,
            portalStatus: PORTAL_STATUS_LABELS[g.portalStatus],
            invitation: INVITATION_STATE_LABELS[invitationState(g.invitations[0])],
            childCount: g._count.students,
            children: links.map((l) => `${label(l)} – ${RELATIONSHIP_LABELS[l.relationship]}`).join("; "),
            primaryFor: links.filter((l) => l.isPrimary).map(label).join("; "),
            status: g.archivedAt ? "Archived" : "Active",
            createdAt: g.createdAt,
            dateOfBirth: "dateOfBirth" in g ? g.dateOfBirth : null,
            province: provinceName(address?.province),
            district: address?.district,
            municipality: address?.municipality,
          }
          controller.enqueue(encoder.encode(csvLine(columns.map((c) => values[c.key]))))
        }
        skip += rows.length
        if (rows.length < BATCH || skip >= GUARDIAN_EXPORT_MAX_ROWS) controller.close()
      } catch (error) {
        console.error(error)
        controller.error(error)
      }
    },
  })
}
