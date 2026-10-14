import "server-only"

import { cache } from "react"

import { myStudentAttendance } from "@/services/attendance/portal-service"
import { myResults } from "@/services/exams/portal-service"
import { myExamPapers } from "@/services/student-portal/exam-service"
import { myAssignments } from "@/services/student-portal/learning-service"
import type { Ctx } from "@/services/student-portal/me-service"
import { myDocuments } from "@/services/student-portal/record-service"

// The student dashboard. Shared loaders are cached per request, so cards and
// sections reuse one query each while still loading independently.

export const studentAttendance = cache(async (ctx: Ctx) => myStudentAttendance(ctx))
export const studentResults = cache(async (ctx: Ctx) => myResults(ctx))
export const studentPapers = cache(async (ctx: Ctx) => myExamPapers(ctx, "upcoming"))
export const studentAssignments = cache(async (ctx: Ctx) => myAssignments(ctx, {}))
export const studentDocuments = cache(async (ctx: Ctx) => myDocuments(ctx))

// The newest published result across all years (published only).
export async function latestResult(ctx: Ctx) {
  const results = await studentResults(ctx)
  return results?.years[0]?.items[0] ?? null
}
