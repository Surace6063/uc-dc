import "server-only"

import { standing, summarize } from "@/features/attendance/calculation"
import { ATTENDANCE_STATUS_LABELS, formatDay, localDate } from "@/features/attendance/constants"
import type { GuardianNotificationChannel } from "@/features/guardians/notifications"
import { fullName } from "@/features/students/constants"
import type { AuthContext } from "@/lib/authorization/context"
import { prisma } from "@/lib/prisma"
import { countStudentStatuses } from "@/services/attendance/calculation-service"
import { getPolicy } from "@/services/attendance/policy-service"
import { audit } from "@/services/audit/audit-service"
import { deliverGuardianNotice, resolveGuardianRecipients } from "@/services/guardians/notification-service"

// Attendance notices to guardians, through the guardian notification
// boundary: who hears about what follows each guardian link's preferences
// ("attendance" category). No delivery channel (SMS, email, app) is
// registered yet, so results report people as unreached instead of claiming
// anything was sent. Register channels here once a provider exists.
type Ctx = Pick<AuthContext, "organization" | "user">

const CHANNELS: readonly GuardianNotificationChannel[] = []

export type NoticeOutcome = { students: number; recipients: number; sent: number; unreached: number }

// After a register is first submitted: tell guardians of absent (and, if the
// policy says so, late) students. Runs once per register.
export async function noticeAbsences(ctx: Ctx, sessionId: string): Promise<NoticeOutcome | null> {
  const policy = await getPolicy(ctx)
  if (!policy.notifyGuardiansOnAbsence && !policy.notifyGuardiansOnLate) return null
  const claimed = await prisma.attendanceSession.updateMany({
    where: { id: sessionId, organizationId: ctx.organization.id, notifiedAt: null, status: { in: ["SUBMITTED", "LOCKED"] } },
    data: { notifiedAt: new Date() },
  })
  if (claimed.count === 0) return null

  const statuses = [...(policy.notifyGuardiansOnAbsence ? (["ABSENT"] as const) : []), ...(policy.notifyGuardiansOnLate ? (["LATE"] as const) : [])]
  const records = await prisma.studentAttendance.findMany({
    where: { sessionId, organizationId: ctx.organization.id, status: { in: [...statuses] } },
    select: {
      studentId: true, status: true, date: true,
      student: { select: { firstName: true, middleName: true, lastName: true } },
      session: { select: { class: { select: { name: true } }, subjectOffering: { select: { subject: { select: { name: true } } } } } },
    },
  })
  if (records.length === 0) return { students: 0, recipients: 0, sent: 0, unreached: 0 }

  const byStudent = new Map(records.map((r) => [r.studentId, r]))
  const recipients = await resolveGuardianRecipients(ctx, { studentIds: [...byStudent.keys()], category: "attendance" })
  let sent = 0
  let unreached = 0
  for (const recipient of recipients) {
    // Each guardian hears only about their own children.
    const lines = recipient.studentIds
      .map((id) => byStudent.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => `${fullName(r.student)} was marked ${ATTENDANCE_STATUS_LABELS[r.status].toLowerCase()} on ${formatDay(r.date)}${r.session.subjectOffering ? ` (${r.session.subjectOffering.subject.name})` : ""}.`)
    const result = await deliverGuardianNotice([recipient], { category: "attendance", title: "Attendance notice", body: lines.join("\n") }, CHANNELS)
    sent += result.sent
    unreached += result.unreached.length
  }
  await audit(prisma, ctx, {
    action: "attendance.notice.absence",
    entityType: "attendance_session",
    entityId: sessionId,
    summary: `Prepared attendance notices for ${recipients.length} guardian${recipients.length === 1 ? "" : "s"} (${sent} sent, ${unreached} not reached: no delivery channel configured)`,
  })
  return { students: byStudent.size, recipients: recipients.length, sent, unreached }
}

// Raises shortage alerts for the current academic year: one per student, kind
// and month, so running it again the same month adds nothing new.
export async function raiseShortageAlerts(ctx: Ctx) {
  const policy = await getPolicy(ctx)
  const year = await prisma.academicYear.findFirst({
    where: { organizationId: ctx.organization.id, isCurrent: true },
    select: { id: true, name: true },
  })
  if (!year) return { year: null, raised: 0, alreadyRaised: 0, recipients: 0, sent: 0, unreached: 0 }
  const month = localDate().slice(0, 7)
  const counts = await countStudentStatuses(ctx, { academicYearId: year.id }, ["studentId"])
  const candidates = [...counts.values()]
    .map((c) => {
      const summary = summarize(c.counts, policy)
      return { studentId: c.key.studentId as string, percentage: summary.percentage, standing: standing(summary.percentage, policy) }
    })
    .filter((c) => c.standing === "below" || c.standing === "approaching")

  const kindOf = (s: string) => (s === "below" ? ("BELOW_THRESHOLD" as const) : ("APPROACHING_THRESHOLD" as const))
  const existing = await prisma.attendanceAlert.findMany({
    where: { organizationId: ctx.organization.id, academicYearId: year.id, period: month, scope: "OVERALL" },
    select: { studentId: true, kind: true },
  })
  const seen = new Set(existing.map((e) => `${e.studentId}:${e.kind}`))
  const fresh = candidates.filter((c) => !seen.has(`${c.studentId}:${kindOf(c.standing)}`))
  if (fresh.length) {
    await prisma.attendanceAlert.createMany({
      data: fresh.map((c) => ({
        organizationId: ctx.organization.id,
        studentId: c.studentId,
        academicYearId: year.id,
        scope: "OVERALL",
        kind: kindOf(c.standing),
        period: month,
        percentage: c.percentage ?? 0,
        createdById: ctx.user.id,
      })),
      skipDuplicates: true,
    })
  }

  const students = await prisma.student.findMany({
    where: { organizationId: ctx.organization.id, id: { in: fresh.map((f) => f.studentId) } },
    select: { id: true, firstName: true, middleName: true, lastName: true },
  })
  const nameOf = new Map(students.map((s) => [s.id, fullName(s)]))
  const freshBy = new Map(fresh.map((f) => [f.studentId, f]))
  const recipients = await resolveGuardianRecipients(ctx, { studentIds: [...freshBy.keys()], category: "attendance" })
  let sent = 0
  let unreached = 0
  for (const recipient of recipients) {
    const lines = recipient.studentIds
      .map((id) => freshBy.get(id))
      .filter((f): f is NonNullable<typeof f> => !!f)
      .map((f) => `${nameOf.get(f.studentId)}'s attendance in ${year.name} is ${f.percentage?.toFixed(1)}% (minimum ${policy.minimumPercentage}%).`)
    const result = await deliverGuardianNotice([recipient], { category: "attendance", title: "Attendance shortage", body: lines.join("\n") }, CHANNELS)
    sent += result.sent
    unreached += result.unreached.length
  }
  await audit(prisma, ctx, {
    action: "attendance.alert.raise",
    entityType: "attendance_alert",
    summary: `Raised ${fresh.length} attendance shortage alert${fresh.length === 1 ? "" : "s"} for ${month} (${recipients.length} guardians; ${sent} sent, ${unreached} not reached)`,
  })
  return { year: year.name, raised: fresh.length, alreadyRaised: candidates.length - fresh.length, recipients: recipients.length, sent, unreached }
}
