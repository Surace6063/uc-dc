import "server-only"

import { cache } from "react"

import { localDate, localTime, minutesOf, weekday } from "@/features/attendance/constants"
import { prisma } from "@/lib/prisma"
import { myRegistersToday } from "@/services/attendance/report-service"
import { myClasses } from "@/services/teaching/class-service"
import { myExamSchedule, myPendingSheets } from "@/services/teaching/exam-service"
import { recentNotices } from "@/services/teaching/notice-service"
import { myTeacher, resolveYear, type Ctx } from "@/services/teaching/scope-service"
import { mySchedule, type TimetableSlotRow } from "@/services/teaching/timetable-service"

// The teacher dashboard: every figure comes from the teacher's own records
// (teaching assignments, timetable, registers, marks sheets, assignments).
// Sections load independently, so one failing query doesn't hide the rest.

export const teacherSummary = cache(async (ctx: Ctx) => {
  const teacher = await myTeacher(ctx)
  const yearId = await resolveYear(ctx, undefined)
  const year = yearId ? await prisma.academicYear.findUnique({ where: { id: yearId }, select: { id: true, name: true } }) : null
  return { teacher, year }
})

// Today's periods and the next ones this week, from the timetable.
export const teacherSchedule = cache(async (ctx: Ctx, yearId: string | null) => {
  const slots = await mySchedule(ctx, yearId)
  const today = localDate()
  const day = weekday(today)
  const now = localTime(new Date())
  const todays = slots.filter((s) => s.dayOfWeek === day)
  // Minutes until each period next starts; one in progress counts as now.
  const nowMinutes = minutesOf(now)
  const untilStart = (s: TimetableSlotRow) => {
    if (s.dayOfWeek === day && minutesOf(s.startTime) <= nowMinutes && nowMinutes < minutesOf(s.endTime)) return 0
    const diff = ((s.dayOfWeek - day + 7) % 7) * 1440 + minutesOf(s.startTime) - nowMinutes
    return diff < 0 ? diff + 7 * 1440 : diff
  }
  const upcoming = [...slots].sort((a, b) => untilStart(a) - untilStart(b)).slice(0, 6)
  return { hasTimetable: slots.length > 0, today: todays, upcoming, day, now }
})

// Registers still to be taken or submitted today. With a timetable, period
// registers count only for subjects scheduled today.
export const pendingRegisters = cache(async (ctx: Ctx, yearId: string | null) => {
  const [{ items, date }, { today: todaySlots, hasTimetable }] = await Promise.all([myRegistersToday(ctx), teacherSchedule(ctx, yearId)])
  const offeringIds = items.map((i) => i.offeringId).filter((id): id is string => !!id)
  const offerings = offeringIds.length
    ? await prisma.subjectOffering.findMany({ where: { id: { in: offeringIds }, organizationId: ctx.organization.id }, select: { id: true, subjectId: true } })
    : []
  const subjectOf = new Map(offerings.map((o) => [o.id, o.subjectId]))
  const pending = items.filter((i) => {
    if (i.type === "DAILY") return i.status === null || i.status === "DRAFT"
    if (i.status !== null) return false
    if (!hasTimetable) return true
    const subjectId = i.offeringId ? subjectOf.get(i.offeringId) : undefined
    return todaySlots.some(
      (s) => s.classId === i.classId && s.subjectId === subjectId && (s.sectionId === null || i.sectionId === null || s.sectionId === i.sectionId)
    )
  })
  return { date, items: pending, total: items.length }
})

export const teacherCounts = cache(async (ctx: Ctx, yearId: string | null) => {
  const teacher = await myTeacher(ctx)
  const [classes, papers, awaitingReview, sheets] = await Promise.all([
    myClasses(ctx, yearId),
    myExamSchedule(ctx, yearId, "upcoming"),
    teacher ? prisma.assignmentSubmission.count({ where: { organizationId: ctx.organization.id, status: "SUBMITTED", assignment: { teacherId: teacher.id } } }) : 0,
    myPendingSheets(ctx),
  ])
  return {
    classes: classes.length,
    subjects: new Set(classes.flatMap((c) => c.subjects.map((s) => s.id))).size,
    students: classes.reduce((n, c) => n + c.students, 0),
    upcomingExams: new Set(papers.map((p) => p.examination.id)).size,
    upcomingPapers: papers,
    awaitingReview,
    pendingSheets: sheets,
  }
})

// Recent class assignments set by the teacher, with what awaits review.
export async function recentAssessmentTasks(ctx: Ctx) {
  const teacher = await myTeacher(ctx)
  if (!teacher) return []
  const rows = await prisma.classAssignment.findMany({
    where: { organizationId: ctx.organization.id, teacherId: teacher.id },
    orderBy: [{ updatedAt: "desc" }],
    take: 5,
    select: {
      id: true, title: true, dueAt: true, status: true,
      class: { select: { name: true } }, section: { select: { name: true } }, subject: { select: { name: true } },
      _count: { select: { submissions: { where: { status: "SUBMITTED" } } } },
    },
  })
  return rows.map(({ _count, ...r }) => ({ ...r, awaitingReview: _count.submissions }))
}

export { recentNotices }
