"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { runAction } from "@/lib/authorization/action"
import { requireMembership, requirePermission } from "@/lib/authorization/context"
import {
  deleteClassAssignment,
  recordSubmission,
  reviewSubmission,
  saveClassAssignment,
  setClassAssignmentStatus,
} from "@/services/teaching/class-assignment-service"
import { deleteLessonPlan, saveLessonPlan } from "@/services/teaching/lesson-plan-service"
import { deleteMaterial } from "@/services/teaching/material-service"
import { deleteNotice, saveNotice } from "@/services/teaching/notice-service"
import { deleteSlot, saveSlot } from "@/services/teaching/timetable-service"

// Teaching workspace operations. Each checks its permission here and the
// record-level rules (own records, classes one teaches) in the service.

const id = z.uuid()
const nullableId = z.uuid().nullable()

// ------------------------------------------------------------ timetable

export async function saveTimetableSlotAction(slotId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("classes.view")
    const slot = await saveSlot(ctx, nullableId.parse(slotId), values)
    revalidatePath("/dashboard/timetable")
    revalidatePath("/dashboard")
    return { id: slot.id }
  }, slotId ? "Period updated." : "Period added.")
}

export async function deleteTimetableSlotAction(slotId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("classes.view")
    await deleteSlot(ctx, id.parse(slotId))
    revalidatePath("/dashboard/timetable")
    revalidatePath("/dashboard")
  }, "Period removed.")
}

// ------------------------------------------------------------ lesson plans

export async function saveLessonPlanAction(planId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("courses.view")
    const plan = await saveLessonPlan(ctx, nullableId.parse(planId), values)
    revalidatePath("/dashboard/lesson-plans")
    return { id: plan.id }
  }, planId ? "Lesson plan saved." : "Lesson plan created.")
}

export async function deleteLessonPlanAction(planId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("courses.view")
    await deleteLessonPlan(ctx, id.parse(planId))
    revalidatePath("/dashboard/lesson-plans")
  }, "Lesson plan deleted.")
}

// ------------------------------------------------------------ materials

export async function deleteMaterialAction(materialId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("courses.view")
    await deleteMaterial(ctx, id.parse(materialId))
    revalidatePath("/dashboard/materials")
  }, "Material deleted.")
}

// ------------------------------------------------------------ class assignments

function refreshAssignments(assignmentId?: string) {
  revalidatePath("/dashboard/assignments")
  if (assignmentId) revalidatePath(`/dashboard/assignments/${assignmentId}`)
  revalidatePath("/dashboard")
}

export async function saveClassAssignmentAction(assignmentId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("assignments.view")
    const saved = await saveClassAssignment(ctx, nullableId.parse(assignmentId), values)
    refreshAssignments(saved.id)
    return { id: saved.id }
  }, assignmentId ? "Assignment saved." : "Assignment created.")
}

export async function setClassAssignmentStatusAction(assignmentId: string, status: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("assignments.view")
    await setClassAssignmentStatus(ctx, id.parse(assignmentId), z.enum(["PUBLISHED", "CLOSED"]).parse(status))
    refreshAssignments(assignmentId)
  }, "Assignment updated.")
}

export async function deleteClassAssignmentAction(assignmentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("assignments.view")
    await deleteClassAssignment(ctx, id.parse(assignmentId))
    refreshAssignments()
  }, "Assignment deleted.")
}

export async function recordSubmissionAction(assignmentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("assignments.view")
    await recordSubmission(ctx, id.parse(assignmentId), values)
    refreshAssignments(assignmentId)
  }, "Submission recorded.")
}

export async function reviewSubmissionAction(assignmentId: string, submissionId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("assignments.view")
    await reviewSubmission(ctx, id.parse(assignmentId), id.parse(submissionId), values)
    refreshAssignments(assignmentId)
  }, "Review saved.")
}

// ------------------------------------------------------------ notices

export async function saveNoticeAction(noticeId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requireMembership()
    const notice = await saveNotice(ctx, nullableId.parse(noticeId), values)
    revalidatePath("/dashboard/notices")
    revalidatePath("/dashboard")
    return { id: notice.id }
  }, noticeId ? "Notice updated." : "Notice posted.")
}

export async function deleteNoticeAction(noticeId: string) {
  return runAction(async () => {
    const ctx = await requireMembership()
    await deleteNotice(ctx, id.parse(noticeId))
    revalidatePath("/dashboard/notices")
    revalidatePath("/dashboard")
  }, "Notice deleted.")
}
