"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { runAction } from "@/lib/authorization/action"
import { requireMembership, requirePermission } from "@/lib/authorization/context"
import { ForbiddenError } from "@/lib/authorization/errors"
import {
  activateCurriculum,
  createCurriculum,
  createCurriculumVersion,
  deleteCurriculum,
  deleteTopic,
  deleteUnit,
  reorder,
  retireCurriculum,
  saveTopic,
  saveUnit,
  updateCurriculum,
} from "@/services/subjects/curriculum-service"
import { commitSubjectImport, previewSubjectImport } from "@/services/subjects/import-export-service"
import {
  addOfferings,
  assignOfferingTeacher,
  copyOfferings,
  deleteElectiveGroup,
  removeOffering,
  saveElectiveGroup,
  updateOffering,
} from "@/services/subjects/offering-service"
import {
  addPrerequisite,
  deleteCategory,
  deleteSubject,
  removePrerequisite,
  saveCategory,
  saveSubject,
  setSubjectsArchived,
} from "@/services/subjects/subject-service"
import { endAssignment } from "@/services/teachers/assignment-service"

// Subjects & courses operations. Each re-checks its permission on the
// server; the organisation always comes from the session.
//   subjects.manage            subjects, categories, prerequisites, curricula
//   subjects.offerings.manage  which subjects each class studies per year
//   subjects.export            CSV import and export
//   teachers.assignments.*     subject teachers

const id = z.uuid()
const nullableId = z.uuid().nullable()

function refresh() {
  revalidatePath("/dashboard/subjects", "layout")
  revalidatePath("/dashboard/classes", "layout")
}

// --------------------------------------------------------------- subjects

export async function saveSubjectAction(subjectId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    const subject = await saveSubject(ctx, nullableId.parse(subjectId), values)
    refresh()
    return { id: subject.id }
  }, subjectId ? "Subject updated." : "Subject created.")
}

export async function setSubjectsArchivedAction(ids: unknown, archived: boolean) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    const result = await setSubjectsArchived(ctx, ids, z.boolean().parse(archived))
    refresh()
    return result
  })
}

export async function deleteSubjectAction(subjectId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    await deleteSubject(ctx, id.parse(subjectId))
    refresh()
  }, "Subject deleted.")
}

export async function saveCategoryAction(categoryId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    const category = await saveCategory(ctx, nullableId.parse(categoryId), values)
    refresh()
    return { id: category.id }
  }, "Category saved.")
}

export async function deleteCategoryAction(categoryId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    await deleteCategory(ctx, id.parse(categoryId))
    refresh()
  }, "Category deleted.")
}

export async function addPrerequisiteAction(subjectId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    await addPrerequisite(ctx, id.parse(subjectId), values)
    refresh()
  }, "Prerequisite added.")
}

export async function removePrerequisiteAction(prerequisiteId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    await removePrerequisite(ctx, id.parse(prerequisiteId))
    refresh()
  }, "Prerequisite removed.")
}

export async function previewSubjectImportAction(values: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage", "subjects.export")
    return previewSubjectImport(ctx, values)
  })
}

export async function commitSubjectImportAction(values: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage", "subjects.export")
    const result = await commitSubjectImport(ctx, values)
    if (result.created > 0) refresh()
    return result
  })
}

// -------------------------------------------------------------- curricula

export async function createCurriculumAction(subjectId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    const curriculum = await createCurriculum(ctx, id.parse(subjectId), values)
    refresh()
    return { id: curriculum.id }
  }, "Curriculum created.")
}

export async function updateCurriculumAction(curriculumId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    await updateCurriculum(ctx, id.parse(curriculumId), values)
    refresh()
  }, "Curriculum updated.")
}

export async function createCurriculumVersionAction(curriculumId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    const copy = await createCurriculumVersion(ctx, id.parse(curriculumId), values)
    refresh()
    return { id: copy.id }
  }, "New version created.")
}

export async function setCurriculumStatusAction(curriculumId: string, status: "ACTIVE" | "RETIRED") {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    const target = id.parse(curriculumId)
    if (z.enum(["ACTIVE", "RETIRED"]).parse(status) === "ACTIVE") await activateCurriculum(ctx, target)
    else await retireCurriculum(ctx, target)
    refresh()
  }, status === "ACTIVE" ? "Curriculum activated." : "Curriculum retired.")
}

export async function deleteCurriculumAction(curriculumId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    const result = await deleteCurriculum(ctx, id.parse(curriculumId))
    refresh()
    return result
  }, "Draft deleted.")
}

export async function saveUnitAction(curriculumId: string, unitId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    await saveUnit(ctx, id.parse(curriculumId), nullableId.parse(unitId), values)
    refresh()
  }, unitId ? "Unit updated." : "Unit added.")
}

export async function deleteUnitAction(unitId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    await deleteUnit(ctx, id.parse(unitId))
    refresh()
  }, "Unit deleted.")
}

export async function saveTopicAction(unitId: string, topicId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    await saveTopic(ctx, id.parse(unitId), nullableId.parse(topicId), values)
    refresh()
  }, topicId ? "Topic updated." : "Topic added.")
}

export async function deleteTopicAction(topicId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    await deleteTopic(ctx, id.parse(topicId))
    refresh()
  }, "Topic deleted.")
}

export async function reorderAction(parent: { curriculumId: string } | { unitId: string }, ids: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.manage")
    const target = z.union([z.object({ curriculumId: id }), z.object({ unitId: id })]).parse(parent)
    await reorder(ctx, target, ids)
    refresh()
  })
}

// -------------------------------------------------------------- offerings

export async function addOfferingsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.offerings.manage")
    const result = await addOfferings(ctx, values)
    refresh()
    return result
  })
}

export async function updateOfferingAction(offeringId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.offerings.manage")
    await updateOffering(ctx, id.parse(offeringId), values)
    refresh()
    revalidatePath("/dashboard/teachers", "layout")
  }, "Subject updated for this class.")
}

export async function removeOfferingAction(offeringId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.offerings.manage")
    const result = await removeOffering(ctx, id.parse(offeringId))
    refresh()
    revalidatePath("/dashboard/teachers", "layout")
    return result
  })
}

export async function copyOfferingsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.offerings.manage")
    const result = await copyOfferings(ctx, values)
    refresh()
    return result
  })
}

export async function saveElectiveGroupAction(groupId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.offerings.manage")
    await saveElectiveGroup(ctx, nullableId.parse(groupId), values)
    refresh()
  }, "Elective group saved.")
}

export async function deleteElectiveGroupAction(groupId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("subjects.offerings.manage")
    await deleteElectiveGroup(ctx, id.parse(groupId))
    refresh()
  }, "Elective group deleted.")
}

// --------------------------------------------------------------- teachers

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

export async function assignOfferingTeacherAction(values: unknown) {
  return runAction(async () => {
    const ctx = await assignmentContext()
    await assignOfferingTeacher(ctx, values)
    refresh()
    revalidatePath("/dashboard/teachers", "layout")
  }, "Teacher assigned.")
}

export async function endTeachingAction(assignmentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await assignmentContext()
    await endAssignment(ctx, id.parse(assignmentId), values)
    refresh()
    revalidatePath("/dashboard/teachers", "layout")
  }, "Assignment ended.")
}
