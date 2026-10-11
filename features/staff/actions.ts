"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { employeeIdSettingsSchema } from "@/features/staff/schemas"
import { runAction } from "@/lib/authorization/action"
import { requirePermission } from "@/lib/authorization/context"
import { ForbiddenError } from "@/lib/authorization/errors"
import { saveStaffSettings } from "@/services/academics/structure-service"
import * as config from "@/services/staff/config-service"
import { deleteStaffDocument, removeStaffPhoto } from "@/services/staff/document-service"
import { commitStaffImport, previewStaffImport } from "@/services/staff/import-service"
import {
  addStaffAssignment,
  archiveStaff,
  bulkStaffAction,
  changeStaffEmployment,
  checkStaffEmployeeId,
  createStaff,
  deleteStaff,
  deleteStaffQualification,
  endStaffAssignment,
  linkStaffUser,
  restoreStaff,
  saveStaffQualification,
  updateStaff,
  updateStaffAssignment,
  verifyStaffRecord,
} from "@/services/staff/staff-service"

// Staff mutations. Each checks its permission on the server; services
// resolve every ID inside the caller's organisation.

const id = z.uuid()
const optionalRecordId = z.uuid().nullable()

function refresh(staffId?: string) {
  revalidatePath("/dashboard/staff")
  if (staffId) revalidatePath(`/dashboard/staff/${staffId}`)
}

export async function createStaffAction(values: unknown) {
  return runAction(async () => {
    // Responsibilities and account links need their own permissions
    // (checked in the service when present).
    const ctx = await requirePermission("staff.create")
    const result = await createStaff(ctx, values)
    refresh()
    return result
  }, "Staff member added.")
}

export async function checkStaffEmployeeIdAction(employeeId: string, excludeId?: string) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.create")
    return checkStaffEmployeeId(ctx, z.string().trim().min(1).max(30).parse(employeeId), excludeId ? id.parse(excludeId) : undefined)
  })
}

export async function updateStaffAction(staffId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.update")
    const result = await updateStaff(ctx, id.parse(staffId), values)
    refresh(staffId)
    return result
  }, "Staff member updated.")
}

export async function changeStaffEmploymentAction(staffId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.employment.manage")
    const result = await changeStaffEmployment(ctx, id.parse(staffId), values)
    refresh(staffId)
    return result
  }, "Employment updated.")
}

export async function linkStaffUserAction(staffId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.update", "members.view")
    await linkStaffUser(ctx, id.parse(staffId), values)
    refresh(staffId)
  }, "Account link updated.")
}

export async function saveStaffQualificationAction(staffId: string, qualificationId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.update")
    await saveStaffQualification(ctx, id.parse(staffId), optionalRecordId.parse(qualificationId), values)
    refresh(staffId)
  }, "Saved.")
}

export async function deleteStaffQualificationAction(staffId: string, qualificationId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.update")
    await deleteStaffQualification(ctx, id.parse(staffId), id.parse(qualificationId))
    refresh(staffId)
  }, "Removed.")
}

export async function verifyStaffRecordAction(staffId: string, kind: "qualification" | "document", recordId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.verify")
    await verifyStaffRecord(ctx, id.parse(staffId), z.enum(["qualification", "document"]).parse(kind), id.parse(recordId), values)
    refresh(staffId)
  }, "Verification updated.")
}

export async function addStaffAssignmentAction(staffId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.assignments.manage")
    await addStaffAssignment(ctx, id.parse(staffId), values)
    refresh(staffId)
  }, "Responsibility added.")
}

export async function updateStaffAssignmentAction(staffId: string, assignmentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.assignments.manage")
    await updateStaffAssignment(ctx, id.parse(staffId), id.parse(assignmentId), values)
    refresh(staffId)
  }, "Responsibility updated.")
}

export async function endStaffAssignmentAction(staffId: string, assignmentId: string, values: unknown, cancel = false) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.assignments.manage")
    await endStaffAssignment(ctx, id.parse(staffId), id.parse(assignmentId), values, z.boolean().parse(cancel))
    refresh(staffId)
  }, cancel ? "Responsibility cancelled." : "Responsibility ended.")
}

export async function archiveStaffAction(staffId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.archive")
    await archiveStaff(ctx, id.parse(staffId))
    refresh(staffId)
  }, "Staff member archived.")
}

export async function restoreStaffAction(staffId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.archive")
    await restoreStaff(ctx, id.parse(staffId))
    refresh(staffId)
  }, "Staff member restored.")
}

export async function deleteStaffAction(staffId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.delete")
    await deleteStaff(ctx, id.parse(staffId))
    refresh()
  }, "Staff member permanently deleted.")
}

// Archive/restore only: there is deliberately no bulk delete.
export async function bulkStaffActionAction(values: unknown) {
  return runAction(async () => {
    const action = (values as { action?: string })?.action
    if (action !== "archive" && action !== "restore") throw new ForbiddenError()
    const ctx = await requirePermission("staff.archive")
    const result = await bulkStaffAction(ctx, values)
    refresh()
    return result
  })
}

export async function deleteStaffDocumentAction(staffId: string, documentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.documents.manage")
    await deleteStaffDocument(ctx, id.parse(staffId), id.parse(documentId))
    refresh(staffId)
  }, "Document deleted.")
}

export async function removeStaffPhotoAction(staffId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.update")
    await removeStaffPhoto(ctx, id.parse(staffId))
    refresh(staffId)
  }, "Photo removed.")
}

export async function previewStaffImportAction(values: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.import")
    return previewStaffImport(ctx, values)
  })
}

export async function commitStaffImportAction(values: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.import", "staff.create")
    const result = await commitStaffImport(ctx, values)
    if (result.created > 0) refresh()
    return result
  })
}

// ------------------------------------------------------------ configuration

function refreshConfig() {
  revalidatePath("/dashboard/staff", "layout")
  revalidatePath("/dashboard/teachers", "layout")
  revalidatePath("/dashboard/academics")
}

export type StaffConfigEntity = "department" | "designation" | "documentType"

const savers = {
  department: config.saveDepartment,
  designation: config.saveStaffDesignation,
  documentType: config.saveStaffDocumentType,
} as const
const deleters = {
  department: config.deleteDepartment,
  designation: config.deleteStaffDesignation,
  documentType: config.deleteStaffDocumentType,
} as const
const entity = z.enum(["department", "designation", "documentType"])

export async function saveStaffConfigAction(kind: StaffConfigEntity, recordId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.configure")
    const record = await savers[entity.parse(kind)](ctx, optionalRecordId.parse(recordId), values)
    refreshConfig()
    return { id: record.id }
  }, "Saved.")
}

export async function deleteStaffConfigAction(kind: StaffConfigEntity, recordId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.configure")
    await deleters[entity.parse(kind)](ctx, id.parse(recordId))
    refreshConfig()
  }, "Deleted.")
}

export async function reorderStaffConfigAction(kind: "department" | "designation", ids: string[]) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.configure")
    if (z.enum(["department", "designation"]).parse(kind) === "department") await config.reorderDepartments(ctx, { ids })
    else await config.reorderDesignations(ctx, { ids })
    refreshConfig()
  }, "Order saved.")
}

export async function reassignDepartmentAction(fromId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.configure", "staff.employment.manage")
    const result = await config.reassignDepartmentStaff(ctx, id.parse(fromId), values)
    refreshConfig()
    return result
  })
}

export async function addSuggestedStaffStructureAction() {
  return runAction(async () => {
    const ctx = await requirePermission("staff.configure")
    const result = await config.addSuggestedStaffStructure(ctx)
    refreshConfig()
    return result
  })
}

// The employee ID sequence is shared with teachers.
export async function saveEmployeeIdSettingsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("staff.configure")
    await saveStaffSettings(ctx, employeeIdSettingsSchema.parse(values))
    refreshConfig()
  }, "Settings saved.")
}
