"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { runAction } from "@/lib/authorization/action"
import { requireMembership, requirePermission } from "@/lib/authorization/context"
import { ForbiddenError } from "@/lib/authorization/errors"
import {
  bulkCreateSections,
  saveClass,
  saveClassSection,
  searchEnrollableStudents,
  setClassesArchived,
  setSectionArchived,
} from "@/services/classes/class-service"
import { commitClassImport, previewClassImport } from "@/services/classes/import-service"
import {
  enrollStudents,
  moveStudents,
  previewPromotion,
  promoteStudents,
  renumberRolls,
} from "@/services/classes/placement-service"
import { addSubjectTeacher, setClassTeacher } from "@/services/classes/teaching-service"
import { endAssignment } from "@/services/teachers/assignment-service"

// Classes & sections operations. Each re-checks its permission on the
// server; the organisation always comes from the session, never the input.
//   classes.manage            classes and sections themselves
//   students.enroll           placing students (enroll, move, roll numbers, promote)
//   teachers.assignments.*    class and subject teachers

const id = z.uuid()

function refresh() {
  revalidatePath("/dashboard/classes", "layout")
  revalidatePath("/dashboard/academics")
  revalidatePath("/dashboard/students", "layout")
}

// ------------------------------------------------------------- structure

export async function saveClassAction(classId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("classes.manage")
    const result = await saveClass(ctx, classId === null ? null : id.parse(classId), values)
    refresh()
    return result
  }, classId ? "Class updated." : "Class created.")
}

export async function setClassesArchivedAction(classIds: unknown, archived: boolean) {
  return runAction(async () => {
    const ctx = await requirePermission("classes.manage")
    const result = await setClassesArchived(ctx, classIds, z.boolean().parse(archived))
    refresh()
    revalidatePath("/dashboard/teachers", "layout")
    return result
  })
}

export async function saveSectionAction(sectionId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("classes.manage")
    const result = await saveClassSection(ctx, sectionId === null ? null : id.parse(sectionId), values)
    refresh()
    return result
  }, sectionId ? "Section updated." : "Section added.")
}

export async function setSectionArchivedAction(sectionId: string, archived: boolean) {
  return runAction(async () => {
    const ctx = await requirePermission("classes.manage")
    await setSectionArchived(ctx, id.parse(sectionId), z.boolean().parse(archived))
    refresh()
    revalidatePath("/dashboard/teachers", "layout")
  }, archived ? "Section archived." : "Section restored.")
}

export async function bulkCreateSectionsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("classes.manage")
    const result = await bulkCreateSections(ctx, values)
    refresh()
    return result
  })
}

export async function previewClassImportAction(values: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requirePermission("classes.manage")
    return previewClassImport(ctx, values)
  })
}

export async function commitClassImportAction(values: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requirePermission("classes.manage")
    const result = await commitClassImport(ctx, values)
    if (result.created > 0) refresh()
    return result
  })
}

// -------------------------------------------------------------- students

export async function searchEnrollableStudentsAction(yearId: string, query: string) {
  return runAction(async () => {
    const ctx = await requirePermission("students.view", "students.enroll")
    return searchEnrollableStudents(ctx, id.parse(yearId), z.string().max(100).parse(query))
  })
}

export async function enrollStudentsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.enroll")
    const result = await enrollStudents(ctx, values)
    refresh()
    return result
  })
}

export async function renumberRollsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.enroll")
    const result = await renumberRolls(ctx, values)
    refresh()
    return result
  })
}

export async function moveStudentsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.enroll")
    const result = await moveStudents(ctx, values)
    refresh()
    return result
  })
}

export async function previewPromotionAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.view", "students.enroll")
    return previewPromotion(ctx, values)
  })
}

export async function promoteStudentsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("students.view", "students.enroll")
    const result = await promoteStudents(ctx, values)
    refresh()
    return result
  })
}

// -------------------------------------------------------------- teachers

// Department heads may manage teachers in their own department; the
// teacher service checks the department of each teacher involved.
async function assignmentContext() {
  const ctx = await requireMembership()
  if (
    !ctx.permissions.includes("teachers.assignments.manage") &&
    !ctx.permissions.includes("teachers.assignments.manage_department")
  ) {
    throw new ForbiddenError()
  }
  return ctx
}

export async function setClassTeacherAction(values: unknown) {
  return runAction(async () => {
    const ctx = await assignmentContext()
    await setClassTeacher(ctx, values)
    refresh()
    revalidatePath("/dashboard/teachers", "layout")
  }, "Class teacher assigned.")
}

export async function addSubjectTeacherAction(values: unknown) {
  return runAction(async () => {
    const ctx = await assignmentContext()
    await addSubjectTeacher(ctx, values)
    refresh()
    revalidatePath("/dashboard/teachers", "layout")
  }, "Subject teacher assigned.")
}

// Ends a class or subject teacher's assignment (kept in their history).
export async function endTeachingAssignmentAction(assignmentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await assignmentContext()
    await endAssignment(ctx, id.parse(assignmentId), values)
    refresh()
    revalidatePath("/dashboard/teachers", "layout")
  }, "Assignment ended.")
}
