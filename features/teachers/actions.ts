"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { runAction } from "@/lib/authorization/action"
import { requireMembership, requirePermission } from "@/lib/authorization/context"
import { ForbiddenError } from "@/lib/authorization/errors"
import { removeTeacherPhoto, deleteTeacherDocument } from "@/services/teachers/document-service"
import {
  addAssignment,
  endAssignment,
  updateAssignment,
} from "@/services/teachers/assignment-service"
import { commitTeacherImport, previewTeacherImport } from "@/services/teachers/import-service"
import {
  archiveTeacher,
  bulkTeacherAction,
  changeEmployment,
  checkEmployeeId,
  createTeacher,
  deleteCertification,
  deleteQualification,
  deleteTeacher,
  linkUser,
  restoreTeacher,
  saveCertification,
  saveQualification,
  updateTeacher,
  verifyRecord,
} from "@/services/teachers/teacher-service"

// Teacher mutations. Each checks its permission on the server; services
// resolve every ID inside the caller's organisation.

const id = z.uuid()
const optionalRecordId = z.uuid().nullable()

function refresh(teacherId?: string) {
  revalidatePath("/dashboard/teachers")
  if (teacherId) revalidatePath(`/dashboard/teachers/${teacherId}`)
}

export async function createTeacherAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.create")
    // Employment details are part of creating a teacher; assignments need
    // their own permission (checked in the service when present).
    const result = await createTeacher(ctx, values)
    refresh()
    return result
  }, "Teacher added.")
}

export async function checkEmployeeIdAction(employeeId: string, excludeId?: string) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.view")
    return checkEmployeeId(ctx, z.string().trim().min(1).max(30).parse(employeeId), excludeId ? id.parse(excludeId) : undefined)
  })
}

export async function updateTeacherAction(teacherId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.update")
    const result = await updateTeacher(ctx, id.parse(teacherId), values)
    refresh(teacherId)
    return result
  }, "Teacher updated.")
}

export async function changeEmploymentAction(teacherId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.employment.manage")
    const result = await changeEmployment(ctx, id.parse(teacherId), values)
    refresh(teacherId)
    return result
  }, "Employment updated.")
}

export async function linkUserAction(teacherId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.update", "members.view")
    await linkUser(ctx, id.parse(teacherId), values)
    refresh(teacherId)
  }, "Account link updated.")
}

export async function saveQualificationAction(teacherId: string, qualificationId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.update")
    await saveQualification(ctx, id.parse(teacherId), optionalRecordId.parse(qualificationId), values)
    refresh(teacherId)
  }, "Qualification saved.")
}

export async function deleteQualificationAction(teacherId: string, qualificationId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.update")
    await deleteQualification(ctx, id.parse(teacherId), id.parse(qualificationId))
    refresh(teacherId)
  }, "Qualification removed.")
}

export async function saveCertificationAction(teacherId: string, certificationId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.update")
    await saveCertification(ctx, id.parse(teacherId), optionalRecordId.parse(certificationId), values)
    refresh(teacherId)
  }, "Certification saved.")
}

export async function deleteCertificationAction(teacherId: string, certificationId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.update")
    await deleteCertification(ctx, id.parse(teacherId), id.parse(certificationId))
    refresh(teacherId)
  }, "Certification removed.")
}

export async function verifyRecordAction(
  teacherId: string,
  kind: "qualification" | "certification" | "document",
  recordId: string,
  values: unknown
) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.verify")
    await verifyRecord(ctx, id.parse(teacherId), z.enum(["qualification", "certification", "document"]).parse(kind), id.parse(recordId), values)
    refresh(teacherId)
  }, "Verification updated.")
}

export async function archiveTeacherAction(teacherId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.archive")
    await archiveTeacher(ctx, id.parse(teacherId))
    refresh(teacherId)
  }, "Teacher archived.")
}

export async function restoreTeacherAction(teacherId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.archive")
    await restoreTeacher(ctx, id.parse(teacherId))
    refresh(teacherId)
  }, "Teacher restored.")
}

export async function deleteTeacherAction(teacherId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.delete")
    await deleteTeacher(ctx, id.parse(teacherId))
    refresh()
  }, "Teacher permanently deleted.")
}

export async function bulkTeachersAction(values: unknown) {
  return runAction(async () => {
    const action = (values as { action?: string })?.action
    if (action !== "archive" && action !== "restore") throw new ForbiddenError()
    const ctx = await requirePermission("teachers.archive")
    const result = await bulkTeacherAction(ctx, values)
    refresh()
    return result
  })
}

// --------------------------------------------------------------- assignments

// Either full assignment managers or department heads; the service checks
// which teachers a department head may manage.
async function assignmentContext() {
  const ctx = await requireMembership()
  if (!ctx.permissions.includes("teachers.assignments.manage") && !ctx.permissions.includes("teachers.assignments.manage_department")) {
    throw new ForbiddenError()
  }
  return ctx
}

export async function addAssignmentAction(teacherId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await assignmentContext()
    await addAssignment(ctx, id.parse(teacherId), values)
    refresh(teacherId)
  }, "Assignment added.")
}

export async function updateAssignmentAction(teacherId: string, assignmentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await assignmentContext()
    await updateAssignment(ctx, id.parse(assignmentId), values)
    refresh(teacherId)
  }, "Assignment updated.")
}

export async function endAssignmentAction(teacherId: string, assignmentId: string, values: unknown, cancel = false) {
  return runAction(async () => {
    const ctx = await assignmentContext()
    await endAssignment(ctx, id.parse(assignmentId), values, z.boolean().parse(cancel))
    refresh(teacherId)
  }, cancel ? "Assignment cancelled." : "Assignment ended.")
}

// ----------------------------------------------------------------- documents

export async function deleteTeacherDocumentAction(teacherId: string, documentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.documents.manage")
    await deleteTeacherDocument(ctx, id.parse(teacherId), id.parse(documentId))
    refresh(teacherId)
  }, "Document deleted.")
}

export async function removeTeacherPhotoAction(teacherId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.update")
    await removeTeacherPhoto(ctx, id.parse(teacherId))
    refresh(teacherId)
  }, "Photo removed.")
}

// ------------------------------------------------------------------- import

export async function previewTeacherImportAction(values: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.import")
    return previewTeacherImport(ctx, values)
  })
}

export async function commitTeacherImportAction(values: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requirePermission("teachers.import", "teachers.create")
    const result = await commitTeacherImport(ctx, values)
    if (result.created > 0) refresh()
    return result
  })
}
