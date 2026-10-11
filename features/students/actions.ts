"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { BULK_PERMISSIONS, type BulkAction } from "@/features/students/permissions"
import { runAction } from "@/lib/authorization/action"
import { requirePermission } from "@/lib/authorization/context"
import { ForbiddenError } from "@/lib/authorization/errors"
import { deleteStudentDocument, removeStudentPhoto } from "@/services/students/document-service"
import {
  addEnrollment,
  changeEnrollmentStatus,
  correctEnrollment,
  progressEnrollment,
} from "@/services/students/enrollment-service"
import { commitImport, previewImport } from "@/services/students/import-service"
import {
  addGuardian,
  archiveStudent,
  bulkStudentAction,
  changeStudentStatus,
  createStudent,
  deleteStudent,
  findPossibleDuplicates,
  restoreStudent,
  searchGuardians,
  unlinkGuardian,
  updateGuardian,
  updateStudent,
} from "@/services/students/student-service"

// Student mutations. Each one checks its permission on the server, and every
// ID is resolved inside the caller's organisation by the service.

const id = z.uuid()
const reason = z.string().trim().max(300).nullish().transform((v) => v || null)

function refresh(studentId?: string) {
  revalidatePath("/dashboard/students")
  if (studentId) revalidatePath(`/dashboard/students/${studentId}`)
}

export async function createStudentAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.create")
    const raw = values as { enroll?: boolean }
    // Creating the initial placement is an enrollment; require that too.
    if (raw?.enroll) await requirePermission("students.enroll")
    const result = await createStudent(ctx, values)
    refresh()
    return result
  }, "Student admitted.")
}

export async function checkDuplicatesAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.view")
    return findPossibleDuplicates(ctx, values)
  })
}

export async function updateStudentAction(studentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.update")
    const result = await updateStudent(ctx, id.parse(studentId), values)
    refresh(studentId)
    return result
  }, "Student updated.")
}

export async function searchGuardiansAction(query: string) {
  return runAction(async () => {
    const ctx = await requirePermission("students.update")
    return searchGuardians(ctx, z.string().max(60).parse(query))
  })
}

export async function addGuardianAction(studentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.update")
    await addGuardian(ctx, id.parse(studentId), values)
    refresh(studentId)
  }, "Guardian added.")
}

export async function updateGuardianAction(studentId: string, guardianId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.update")
    await updateGuardian(ctx, id.parse(studentId), id.parse(guardianId), values)
    refresh(studentId)
  }, "Guardian updated.")
}

export async function unlinkGuardianAction(studentId: string, guardianId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("students.update")
    await unlinkGuardian(ctx, id.parse(studentId), id.parse(guardianId))
    refresh(studentId)
  }, "Guardian removed.")
}

export async function changeStudentStatusAction(studentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.update", "students.enroll")
    await changeStudentStatus(ctx, id.parse(studentId), values)
    refresh(studentId)
  }, "Status updated.")
}

export async function archiveStudentAction(studentId: string, why?: string) {
  return runAction(async () => {
    const ctx = await requirePermission("students.archive")
    await archiveStudent(ctx, id.parse(studentId), reason.parse(why))
    refresh(studentId)
  }, "Student archived.")
}

export async function restoreStudentAction(studentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("students.archive")
    await restoreStudent(ctx, id.parse(studentId))
    refresh(studentId)
  }, "Student restored.")
}

export async function deleteStudentAction(studentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("students.delete")
    await deleteStudent(ctx, id.parse(studentId))
    refresh()
  }, "Student permanently deleted.")
}

export async function bulkStudentsAction(values: unknown) {
  return runAction(async () => {
    const action = (values as { action?: string })?.action
    // Each bulk operation needs the same permissions as its single version.
    const required = action && action in BULK_PERMISSIONS ? BULK_PERMISSIONS[action as BulkAction] : null
    if (!required) throw new ForbiddenError()
    const ctx = await requirePermission(...required)
    const result = await bulkStudentAction(ctx, values)
    refresh()
    return result
  })
}

// ---------------------------------------------------------------- enrollment

export async function addEnrollmentAction(studentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.enroll")
    await addEnrollment(ctx, id.parse(studentId), values)
    refresh(studentId)
  }, "Student enrolled.")
}

export async function correctEnrollmentAction(studentId: string, enrollmentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.enroll")
    await correctEnrollment(ctx, id.parse(enrollmentId), values)
    refresh(studentId)
  }, "Enrollment corrected.")
}

export async function progressEnrollmentAction(studentId: string, enrollmentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.enroll")
    const result = await progressEnrollment(ctx, id.parse(enrollmentId), values)
    refresh(studentId)
    return result
  }, "Enrollment updated.")
}

export async function changeEnrollmentStatusAction(studentId: string, enrollmentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.enroll")
    await changeEnrollmentStatus(ctx, id.parse(enrollmentId), values)
    refresh(studentId)
  }, "Enrollment status updated.")
}

// ----------------------------------------------------------------- documents

export async function deleteDocumentAction(studentId: string, documentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("students.documents.manage")
    await deleteStudentDocument(ctx, id.parse(studentId), id.parse(documentId))
    refresh(studentId)
  }, "Document deleted.")
}

export async function removePhotoAction(studentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("students.update")
    await removeStudentPhoto(ctx, id.parse(studentId))
    refresh(studentId)
  }, "Photo removed.")
}

// ------------------------------------------------------------------- import

export async function previewImportAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.import")
    return previewImport(ctx, values)
  })
}

export async function commitImportAction(values: unknown) {
  return runAction(async () => {
    // Imported rows are admitted and (usually) enrolled.
    const ctx = await requirePermission("students.import", "students.create", "students.enroll")
    const result = await commitImport(ctx, values)
    if (result.created > 0) refresh()
    return result
  })
}
