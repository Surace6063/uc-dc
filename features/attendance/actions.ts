"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { runAction } from "@/lib/authorization/action"
import { hasPermission, requireMembership, requirePermission } from "@/lib/authorization/context"
import { PermissionDeniedError } from "@/lib/authorization/errors"
import type { PermissionKey } from "@/lib/authorization/permissions"
import { noticeAbsences, raiseShortageAlerts } from "@/services/attendance/alert-service"
import { cancelCorrection, recordHistory, requestCorrections, reviewCorrections } from "@/services/attendance/correction-service"
import { saveEmployeeRegister, selfCheck } from "@/services/attendance/employee-service"
import { commitAttendanceImport, previewAttendanceImport } from "@/services/attendance/import-export-service"
import { deleteHoliday, saveHoliday, savePolicy } from "@/services/attendance/policy-service"
import { lockSessions, reopenSession, saveRegister } from "@/services/attendance/session-service"

// Attendance operations. Each re-checks its permission on the server, and the
// services re-check record-level scope (a teacher's own classes, a
// guardian's own children); the organisation always comes from the session.
//   attendance.create / .manage        take registers (own classes / any)
//   attendance.update / .approve       request / apply and review corrections
//   attendance.approve                 lock and reopen registers, raise alerts
//   attendance.configure               policy and holidays
//   attendance.staff.manage            teacher and staff attendance
//   attendance.export (+ .manage)      CSV import

const id = z.uuid()

async function requireAny(...keys: PermissionKey[]) {
  const ctx = await requireMembership()
  if (!keys.some((key) => hasPermission(ctx, key))) throw new PermissionDeniedError(keys[0])
  return ctx
}

function refresh() {
  revalidatePath("/dashboard/attendance", "layout")
}

// --------------------------------------------------------------- registers

export async function saveRegisterAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requireAny("attendance.create", "attendance.manage")
    const result = await saveRegister(ctx, values)
    // Guardian notices never hold up or undo the register itself.
    const notices = result.firstSubmission ? await noticeAbsences(ctx, result.sessionId).catch((error) => (console.error(error), null)) : null
    refresh()
    return { ...result, notices }
  })
}

export async function lockSessionsAction(ids: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("attendance.approve")
    const result = await lockSessions(ctx, ids)
    refresh()
    return result
  })
}

export async function reopenSessionAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("attendance.approve")
    await reopenSession(ctx, values)
    refresh()
  }, "Register reopened for corrections.")
}

// -------------------------------------------------------------- corrections

export async function requestCorrectionsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requireAny("attendance.update", "attendance.approve")
    const result = await requestCorrections(ctx, values)
    refresh()
    return result
  })
}

export async function reviewCorrectionsAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("attendance.approve")
    const result = await reviewCorrections(ctx, values)
    refresh()
    return result
  })
}

export async function cancelCorrectionAction(correctionId: string) {
  return runAction(async () => {
    const ctx = await requireAny("attendance.update", "attendance.approve")
    await cancelCorrection(ctx, id.parse(correctionId))
    refresh()
  }, "Request cancelled.")
}

export async function recordHistoryAction(recordId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("attendance.view")
    return recordHistory(ctx, id.parse(recordId))
  })
}

// ---------------------------------------------------------- policy & calendar

export async function savePolicyAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("attendance.configure")
    await savePolicy(ctx, values)
    refresh()
  }, "Attendance policy saved.")
}

export async function saveHolidayAction(holidayId: string | null, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("attendance.configure")
    await saveHoliday(ctx, holidayId ? id.parse(holidayId) : null, values)
    refresh()
  }, holidayId ? "Holiday updated." : "Holiday added.")
}

export async function deleteHolidayAction(holidayId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("attendance.configure")
    await deleteHoliday(ctx, id.parse(holidayId))
    refresh()
  }, "Holiday removed.")
}

// --------------------------------------------------------- teachers & staff

export async function saveEmployeeRegisterAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("attendance.staff.manage")
    const result = await saveEmployeeRegister(ctx, values)
    refresh()
    return result
  })
}

// Self check-in: any member whose account is linked to a teacher or staff
// profile, when the policy allows it. The time is the server's.
export async function selfCheckAction(direction: "in" | "out") {
  return runAction(async () => {
    const ctx = await requireMembership()
    const result = await selfCheck(ctx, z.enum(["in", "out"]).parse(direction))
    refresh()
    return result
  })
}

// ------------------------------------------------------------- alerts

export async function raiseShortageAlertsAction() {
  return runAction(async () => {
    const ctx = await requirePermission("attendance.approve")
    return raiseShortageAlerts(ctx)
  })
}

// ------------------------------------------------------------- import

export async function previewAttendanceImportAction(values: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requirePermission("attendance.manage", "attendance.export")
    return previewAttendanceImport(ctx, values)
  })
}

export async function commitAttendanceImportAction(values: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requirePermission("attendance.manage", "attendance.export")
    const result = await commitAttendanceImport(ctx, values)
    if (result.created > 0) refresh()
    return result
  })
}
