"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { runAction } from "@/lib/authorization/action"
import { hasPermission, requireMembership, requirePermission } from "@/lib/authorization/context"
import { PermissionDeniedError } from "@/lib/authorization/errors"
import type { PermissionKey } from "@/lib/authorization/permissions"
import {
  addExamSubjects,
  deleteExamination,
  removeExamSubject,
  saveExamination,
  saveExamSubject,
  scheduleExamination,
  setExaminationArchived,
  unscheduleExamination,
} from "@/services/exams/examination-service"
import { commitMarksImport, previewMarksImport } from "@/services/exams/import-export-service"
import { saveMarks } from "@/services/exams/marks-service"
import {
  activateGradingScale,
  createSampleSetup,
  deleteAssessmentType,
  newGradingScaleVersion,
  saveAssessmentType,
  saveGradingScale,
  saveResultPolicy,
  setGradingScaleState,
  setResultPolicyState,
} from "@/services/exams/settings-service"
import {
  approveExamination,
  approveSheets,
  openRevision,
  placeHold,
  publishResults,
  releaseHold,
  returnSheets,
  revokeApproval,
  verifySheets,
} from "@/services/exams/workflow-service"

// Examination operations. Each checks its permission here and again in the
// service, and the services check record-level scope (a teacher's own
// subjects and sections); the organisation always comes from the session.
//   exams.create / exams.update      examinations, subjects, components
//   exams.configure                  grading scales, policies, assessment types
//   exams.grade / exams.marks.manage enter marks (own subjects / any)
//   exams.review                     verify and return marks
//   exams.approve                    approve marks and results, revisions
//   exams.publish                    publish results, result holds

const id = z.uuid()

async function requireAny(...keys: PermissionKey[]) {
  const ctx = await requireMembership()
  if (!keys.some((key) => hasPermission(ctx, key))) throw new PermissionDeniedError(keys[0])
  return ctx
}

function refresh() {
  revalidatePath("/dashboard/exams", "layout")
  revalidatePath("/dashboard/results", "layout")
}

// ---------------------------------------------------------------- settings

export async function saveAssessmentTypeAction(typeId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.configure")
    await saveAssessmentType(ctx, typeId === null ? null : id.parse(typeId), values)
    refresh()
  }, "Assessment type saved.")
}

export async function deleteAssessmentTypeAction(typeId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.configure")
    await deleteAssessmentType(ctx, id.parse(typeId))
    refresh()
  }, "Assessment type deleted.")
}

export async function saveGradingScaleAction(scaleId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.configure")
    const result = await saveGradingScale(ctx, scaleId === null ? null : id.parse(scaleId), values)
    refresh()
    return result
  }, "Grading scale saved as a draft.")
}

export async function gradingScaleStateAction(scaleId: string, change: "activate" | "version" | "retire" | "default" | "delete") {
  return runAction(async () => {
    const ctx = await requirePermission("exams.configure")
    const scale = id.parse(scaleId)
    if (change === "activate") await activateGradingScale(ctx, scale)
    else if (change === "version") await newGradingScaleVersion(ctx, scale)
    else await setGradingScaleState(ctx, scale, z.enum(["retire", "default", "delete"]).parse(change))
    refresh()
  })
}

export async function saveResultPolicyAction(policyId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.configure")
    await saveResultPolicy(ctx, policyId === null ? null : id.parse(policyId), values)
    refresh()
  }, "Result policy saved.")
}

export async function resultPolicyStateAction(policyId: string, change: "default" | "delete") {
  return runAction(async () => {
    const ctx = await requirePermission("exams.configure")
    await setResultPolicyState(ctx, id.parse(policyId), z.enum(["default", "delete"]).parse(change))
    refresh()
  })
}

export async function createSampleSetupAction() {
  return runAction(async () => {
    const ctx = await requirePermission("exams.configure")
    const result = await createSampleSetup(ctx)
    refresh()
    return result
  })
}

// ------------------------------------------------------------ examinations

export async function saveExaminationAction(examId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission(examId ? "exams.update" : "exams.create")
    const exam = await saveExamination(ctx, examId === null ? null : id.parse(examId), values)
    refresh()
    return { id: exam.id }
  }, examId ? "Examination updated." : "Examination created.")
}

export async function deleteExaminationAction(examId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.update")
    await deleteExamination(ctx, id.parse(examId))
    refresh()
  }, "Examination deleted.")
}

export async function addExamSubjectsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.update")
    const result = await addExamSubjects(ctx, values)
    refresh()
    return result
  })
}

export async function saveExamSubjectAction(subjectId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.update")
    const result = await saveExamSubject(ctx, id.parse(subjectId), values)
    refresh()
    return result
  }, "Subject saved.")
}

export async function removeExamSubjectAction(subjectId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.update")
    await removeExamSubject(ctx, id.parse(subjectId))
    refresh()
  }, "Subject removed.")
}

export async function examTransitionAction(kind: "schedule" | "unschedule" | "archive" | "restore", values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.update")
    const step = z.enum(["schedule", "unschedule", "archive", "restore"]).parse(kind)
    const result =
      step === "schedule"
        ? await scheduleExamination(ctx, values)
        : step === "unschedule"
          ? await unscheduleExamination(ctx, values)
          : await setExaminationArchived(ctx, values, step === "archive")
    refresh()
    return result ?? null
  })
}

// ------------------------------------------------------------------- marks

export async function saveMarksAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requireAny("exams.grade", "exams.marks.manage")
    const result = await saveMarks(ctx, values)
    refresh()
    return result
  })
}

export async function previewMarksImportAction(examinationId: string, request: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requireAny("exams.grade", "exams.marks.manage")
    return previewMarksImport(ctx, { ...request, examinationId })
  })
}

export async function commitMarksImportAction(examinationId: string, request: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requireAny("exams.grade", "exams.marks.manage")
    const result = await commitMarksImport(ctx, { ...request, examinationId })
    refresh()
    return result
  })
}

// ---------------------------------------------------------------- workflow

export async function reviewSheetsAction(kind: "verify" | "approve" | "return", values: unknown) {
  return runAction(async () => {
    const step = z.enum(["verify", "approve", "return"]).parse(kind)
    const ctx =
      step === "verify"
        ? await requirePermission("exams.review")
        : step === "approve"
          ? await requirePermission("exams.approve")
          : await requireAny("exams.review", "exams.approve")
    const result = step === "verify" ? await verifySheets(ctx, values) : step === "approve" ? await approveSheets(ctx, values) : await returnSheets(ctx, values)
    refresh()
    return result
  })
}

export async function approveExaminationAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.approve")
    const result = await approveExamination(ctx, values)
    refresh()
    return { warnings: result.warnings }
  }, "Results approved.")
}

export async function revokeApprovalAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.approve")
    await revokeApproval(ctx, values)
    refresh()
  }, "Approval revoked.")
}

export async function publishResultsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.publish")
    const result = await publishResults(ctx, values)
    refresh()
    return { version: result.version, students: result.students, notices: result.notices }
  })
}

export async function openRevisionAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("exams.approve")
    await openRevision(ctx, values)
    refresh()
  }, "Correction opened. The published results stay visible until a revised version is published.")
}

export async function placeHoldAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requireAny("exams.approve", "exams.publish")
    await placeHold(ctx, values)
    refresh()
  }, "Result withheld.")
}

export async function releaseHoldAction(holdId: string) {
  return runAction(async () => {
    const ctx = await requireAny("exams.approve", "exams.publish")
    await releaseHold(ctx, id.parse(holdId))
    refresh()
  }, "Hold released.")
}
