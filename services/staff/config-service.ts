import "server-only"

import { z } from "zod"

import { SUGGESTED_DEPARTMENTS, SUGGESTED_DESIGNATIONS } from "@/features/staff/constants"
import {
  departmentSchema,
  reorderSchema,
  staffDesignationSchema,
  staffDocumentTypeSchema,
} from "@/features/staff/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { Prisma, Staff } from "@/lib/generated/prisma/client"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/prisma-errors"
import { toDate } from "@/lib/validation"
import { getStaffSettings } from "@/services/academics/structure-service"
import { audit } from "@/services/audit/audit-service"

// Staff configuration: departments, designations (shared with teachers),
// staff document types. Every lookup includes the caller's organisation.
type Ctx = Pick<AuthContext, "organization" | "user">

function fieldError(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

async function owned<T>(promise: Promise<T | null>, label: string): Promise<T> {
  const record = await promise
  if (!record) throw new NotFoundError(`${label} not found.`)
  return record
}

// Staff who still work here and are visible (not archived, not left).
const CURRENT_STAFF: Prisma.StaffWhereInput = { archivedAt: null, employmentStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }

export async function getStaffConfiguration(ctx: Pick<AuthContext, "organization">) {
  const organizationId = ctx.organization.id
  const [departments, designations, documentTypes] = await Promise.all([
    prisma.department.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, code: true, description: true, isActive: true, sortOrder: true,
        _count: { select: { staff: { where: CURRENT_STAFF }, designations: true } },
      },
    }),
    prisma.designation.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, scope: true, category: true, departmentId: true, isActive: true, sortOrder: true,
        _count: { select: { staff: true, teachers: true } },
      },
    }),
    prisma.documentRequirement.findMany({
      where: { organizationId, audience: "STAFF" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, description: true, isRequired: true, isActive: true, sortOrder: true,
        _count: { select: { staffDocuments: true } },
      },
    }),
  ])
  return { departments, designations, documentTypes }
}

export type StaffConfiguration = Awaited<ReturnType<typeof getStaffConfiguration>>

// What staff forms and filters need: small reference lists, no counts.
// Designations limited to teachers are left out.
export async function getStaffFormOptions(ctx: Pick<AuthContext, "organization">) {
  const organizationId = ctx.organization.id
  const [departments, designations, documentTypes, settings] = await Promise.all([
    prisma.department.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true, isActive: true },
    }),
    prisma.designation.findMany({
      where: { organizationId, scope: { not: "TEACHING" } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, departmentId: true, isActive: true },
    }),
    prisma.documentRequirement.findMany({
      where: { organizationId, audience: "STAFF" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, isRequired: true, isActive: true },
    }),
    getStaffSettings(prisma, organizationId),
  ])
  return { departments, designations, documentTypes, employeeIdMode: settings.employeeIdMode }
}

export type StaffFormOptions = Awaited<ReturnType<typeof getStaffFormOptions>>

// ------------------------------------------------------------- departments

export async function saveDepartment(ctx: Ctx, id: string | null, raw: unknown) {
  const input = departmentSchema.parse(raw)
  const organizationId = ctx.organization.id
  try {
    return await prisma.$transaction(async (tx) => {
      if (id) {
        const existing = await owned(tx.department.findFirst({ where: { id, organizationId } }), "Department")
        // Deactivating needs current staff moved elsewhere first.
        if (existing.isActive && !input.isActive) {
          const active = await tx.staff.count({ where: { organizationId, departmentId: id, ...CURRENT_STAFF } })
          if (active > 0) {
            fieldError("isActive", `${active} current staff member(s) are in this department. Move them to another department first.`)
          }
        }
        const department = await tx.department.update({ where: { id }, data: input })
        await audit(tx, ctx, { action: "department.update", entityType: "department", entityId: id, summary: `Updated department ${department.name}` })
        return department
      }
      const department = await tx.department.create({ data: { ...input, organizationId } })
      await audit(tx, ctx, { action: "department.create", entityType: "department", entityId: department.id, summary: `Created department ${department.name}` })
      return department
    })
  } catch (error) {
    if (isUniqueViolation(error, "code")) fieldError("code", "Another department uses this code.")
    if (isUniqueViolation(error, "name")) fieldError("name", "A department with this name already exists.")
    throw error
  }
}

// Only departments nobody has ever been placed in can be deleted; otherwise
// deactivate (history keeps the department's name either way).
export async function deleteDepartment(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  const department = await owned(prisma.department.findFirst({ where: { id, organizationId } }), "Department")
  const [staff, assignments, designations] = await Promise.all([
    prisma.staff.count({ where: { organizationId, departmentId: id } }),
    prisma.staffAssignment.count({ where: { organizationId, departmentId: id } }),
    prisma.designation.count({ where: { organizationId, departmentId: id } }),
  ])
  if (staff || assignments) throw new ConflictError("Staff records use this department. Deactivate it instead.")
  try {
    await prisma.$transaction(async (tx) => {
      // Designations simply lose their usual department.
      if (designations) await tx.designation.updateMany({ where: { organizationId, departmentId: id }, data: { departmentId: null } })
      await tx.department.deleteMany({ where: { id, organizationId } })
      await audit(tx, ctx, { action: "department.delete", entityType: "department", entityId: id, summary: `Deleted department ${department.name}` })
    })
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new ConflictError("Records use this department. Deactivate it instead.")
    throw error
  }
}

export async function reorderDepartments(ctx: Ctx, raw: unknown) {
  const { ids } = reorderSchema.parse(raw)
  const organizationId = ctx.organization.id
  await prisma.$transaction(async (tx) => {
    const found = await tx.department.count({ where: { organizationId, id: { in: ids } } })
    if (found !== new Set(ids).size) throw new NotFoundError("Department not found.")
    for (const [index, id] of ids.entries()) {
      await tx.department.updateMany({ where: { id, organizationId }, data: { sortOrder: (index + 1) * 10 } })
    }
    await audit(tx, ctx, { action: "department.reorder", entityType: "department", summary: "Reordered departments" })
  })
}

const reassignSchema = z.object({
  toDepartmentId: z.uuid("Choose the department to move staff to."),
  effectiveDate: z.iso.date("Enter the date of the move."),
})

// Moves every current staff member from one department to another, as an
// employment change for each (so their history shows the move).
export async function reassignDepartmentStaff(ctx: Ctx, fromId: string, raw: unknown) {
  const input = reassignSchema.parse(raw)
  const organizationId = ctx.organization.id
  if (input.toDepartmentId === fromId) fieldError("toDepartmentId", "Choose a different department.")
  return prisma.$transaction(async (tx) => {
    const from = await owned(tx.department.findFirst({ where: { id: fromId, organizationId } }), "Department")
    const to = await tx.department.findFirst({ where: { id: input.toDepartmentId, organizationId, isActive: true } })
    if (!to) fieldError("toDepartmentId", "Choose an active department.")
    const staff = await tx.staff.findMany({
      where: { organizationId, departmentId: fromId, ...CURRENT_STAFF },
      include: { designation: { select: { name: true } } },
    })
    for (const s of staff) {
      await tx.staff.update({ where: { id: s.id }, data: { departmentId: to.id } })
      await recordHistory(tx, organizationId, s, to.name, toDate(input.effectiveDate), `Moved from ${from.name}`, ctx.user.id)
    }
    await audit(tx, ctx, {
      action: "department.reassign", entityType: "department", entityId: fromId,
      summary: `Moved ${staff.length} staff member(s) from ${from.name} to ${to.name}`,
      metadata: { to: to.id, staffIds: staff.map((s) => s.id) },
    })
    return { moved: staff.length }
  })
}

async function recordHistory(
  tx: TransactionClient,
  organizationId: string,
  s: Staff & { designation: { name: string } | null },
  departmentName: string,
  effectiveDate: Date,
  note: string,
  changedById: string
) {
  await tx.staffEmploymentRecord.create({
    data: {
      organizationId, staffId: s.id, effectiveDate,
      employmentType: s.employmentType, employmentStatus: s.employmentStatus,
      designationName: s.designation?.name ?? null, departmentName,
      contractStartDate: s.contractStartDate, contractEndDate: s.contractEndDate, onProbation: s.onProbation,
      note, changedById,
    },
  })
}

// ------------------------------------------------------------- designations

export async function saveStaffDesignation(ctx: Ctx, id: string | null, raw: unknown) {
  const input = staffDesignationSchema.parse(raw)
  const organizationId = ctx.organization.id
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.departmentId) {
        const department = await tx.department.findFirst({ where: { id: input.departmentId, organizationId } })
        if (!department) fieldError("departmentId", "Choose a valid department.")
      }
      if (id) {
        const existing = await owned(tx.designation.findFirst({ where: { id, organizationId } }), "Designation")
        // A scope change must not strand people who already hold the title.
        if (existing.scope !== input.scope) {
          const [teachers, staff] = await Promise.all([
            tx.teacher.count({ where: { organizationId, designationId: id } }),
            tx.staff.count({ where: { organizationId, designationId: id } }),
          ])
          if (input.scope === "NON_TEACHING" && teachers) fieldError("scope", `${teachers} teacher(s) hold this designation.`)
          if (input.scope === "TEACHING" && staff) fieldError("scope", `${staff} staff member(s) hold this designation.`)
        }
        const designation = await tx.designation.update({ where: { id }, data: input })
        await audit(tx, ctx, { action: "designation.update", entityType: "designation", entityId: id, summary: `Updated designation ${designation.name}` })
        return designation
      }
      const designation = await tx.designation.create({ data: { ...input, organizationId } })
      await audit(tx, ctx, { action: "designation.create", entityType: "designation", entityId: designation.id, summary: `Created designation ${designation.name}` })
      return designation
    })
  } catch (error) {
    if (isUniqueViolation(error, "name")) fieldError("name", "This designation already exists.")
    throw error
  }
}

export async function deleteStaffDesignation(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  await owned(prisma.designation.findFirst({ where: { id, organizationId } }), "Designation")
  try {
    await prisma.$transaction(async (tx) => {
      await tx.designation.deleteMany({ where: { id, organizationId } })
      await audit(tx, ctx, { action: "designation.delete", entityType: "designation", entityId: id, summary: "Deleted a designation" })
    })
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new ConflictError("Teachers or staff have this designation. Deactivate it instead.")
    throw error
  }
}

export async function reorderDesignations(ctx: Ctx, raw: unknown) {
  const { ids } = reorderSchema.parse(raw)
  const organizationId = ctx.organization.id
  await prisma.$transaction(async (tx) => {
    const found = await tx.designation.count({ where: { organizationId, id: { in: ids } } })
    if (found !== new Set(ids).size) throw new NotFoundError("Designation not found.")
    for (const [index, id] of ids.entries()) {
      await tx.designation.updateMany({ where: { id, organizationId }, data: { sortOrder: (index + 1) * 10 } })
    }
    await audit(tx, ctx, { action: "designation.reorder", entityType: "designation", summary: "Reordered designations" })
  })
}

// Adds the suggested departments and staff designations that don't exist
// yet (by code or name). Existing records are never changed.
export async function addSuggestedStaffStructure(ctx: Ctx) {
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const [departments, designations] = await Promise.all([
      tx.department.findMany({ where: { organizationId }, select: { id: true, code: true, name: true } }),
      tx.designation.findMany({ where: { organizationId }, select: { name: true } }),
    ])
    const lower = (v: string) => v.toLowerCase()
    const newDepartments = SUGGESTED_DEPARTMENTS.filter(
      (d) => !departments.some((x) => lower(x.code) === lower(d.code) || lower(x.name) === lower(d.name))
    )
    const start = departments.length * 10
    if (newDepartments.length) {
      await tx.department.createMany({
        data: newDepartments.map((d, i) => ({ ...d, organizationId, sortOrder: start + (i + 1) * 10 })),
      })
    }
    const byCode = new Map(
      (await tx.department.findMany({ where: { organizationId }, select: { id: true, code: true } })).map((d) => [d.code, d.id])
    )
    const newDesignations = SUGGESTED_DESIGNATIONS.filter((d) => !designations.some((x) => lower(x.name) === lower(d.name)))
    if (newDesignations.length) {
      await tx.designation.createMany({
        data: newDesignations.map((d, i) => ({
          organizationId, name: d.name, scope: "NON_TEACHING" as const, category: d.category,
          departmentId: d.department ? (byCode.get(d.department) ?? null) : null,
          sortOrder: 1000 + (i + 1) * 10,
        })),
      })
    }
    await audit(tx, ctx, {
      action: "staff_structure.suggested", entityType: "department",
      summary: `Added ${newDepartments.length} suggested department(s) and ${newDesignations.length} designation(s)`,
    })
    return { departments: newDepartments.length, designations: newDesignations.length }
  })
}

// ------------------------------------------------------- staff document types

export async function saveStaffDocumentType(ctx: Ctx, id: string | null, raw: unknown) {
  const input = staffDocumentTypeSchema.parse(raw)
  const organizationId = ctx.organization.id
  try {
    return await prisma.$transaction(async (tx) => {
      if (id) {
        await owned(tx.documentRequirement.findFirst({ where: { id, organizationId, audience: "STAFF" } }), "Document type")
        const requirement = await tx.documentRequirement.update({ where: { id }, data: input })
        await audit(tx, ctx, { action: "document_requirement.update", entityType: "document_requirement", entityId: id, summary: `Updated staff document type ${requirement.name}` })
        return requirement
      }
      const requirement = await tx.documentRequirement.create({ data: { ...input, audience: "STAFF", organizationId } })
      await audit(tx, ctx, { action: "document_requirement.create", entityType: "document_requirement", entityId: requirement.id, summary: `Created staff document type ${requirement.name}` })
      return requirement
    })
  } catch (error) {
    if (isUniqueViolation(error, "name")) fieldError("name", "A staff document type with this name already exists.")
    throw error
  }
}

// Uploaded documents keep their files; only their link to the type clears.
export async function deleteStaffDocumentType(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  await owned(prisma.documentRequirement.findFirst({ where: { id, organizationId, audience: "STAFF" } }), "Document type")
  await prisma.$transaction(async (tx) => {
    await tx.documentRequirement.deleteMany({ where: { id, organizationId, audience: "STAFF" } })
    await audit(tx, ctx, { action: "document_requirement.delete", entityType: "document_requirement", entityId: id, summary: "Deleted a staff document type" })
  })
}
