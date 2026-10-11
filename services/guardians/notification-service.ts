import "server-only"

import {
  pickRecipients,
  type GuardianNotice,
  type GuardianNotificationCategory,
  type GuardianNotificationChannel,
  type GuardianRecipient,
} from "@/features/guardians/notifications"
import type { AuthContext } from "@/lib/authorization/context"
import { prisma } from "@/lib/prisma"

type Ctx = Pick<AuthContext, "organization">

// Who should hear about something concerning these students, respecting each
// link's preferences, one entry per guardian. For the attendance, exams,
// LMS, finance and notifications modules to call; see features/guardians/
// notifications.ts for the delivery interface.
export async function resolveGuardianRecipients(
  ctx: Ctx,
  options: { studentIds: string[]; category: GuardianNotificationCategory }
): Promise<GuardianRecipient[]> {
  const studentIds = [...new Set(options.studentIds)].slice(0, 5000)
  if (studentIds.length === 0) return []
  const links = await prisma.studentGuardian.findMany({
    where: {
      organizationId: ctx.organization.id,
      studentId: { in: studentIds },
      // Withdrawn or archived students' families aren't sent routine notices.
      student: { archivedAt: null },
    },
    select: {
      studentId: true,
      guardianId: true,
      receivesAcademicNotifications: true,
      receivesAttendanceNotifications: true,
      receivesBillingNotifications: true,
      receivesGeneralAnnouncements: true,
      guardian: {
        select: {
          fullName: true, phone: true, email: true, preferredContactMethod: true, preferredLanguage: true,
          archivedAt: true, userId: true, portalStatus: true,
        },
      },
    },
  })
  return pickRecipients(links, options.category)
}

// Hands each recipient to the first registered channel that can reach them.
// No channels are registered yet (no SMS/email provider is configured), so
// this reports everyone as unreached rather than pretending to send.
export async function deliverGuardianNotice(
  recipients: GuardianRecipient[],
  notice: GuardianNotice,
  channels: readonly GuardianNotificationChannel[] = []
) {
  const unreached: GuardianRecipient[] = []
  let sent = 0
  for (const recipient of recipients) {
    const channel = channels.find((c) => c.canReach(recipient))
    if (!channel) {
      unreached.push(recipient)
      continue
    }
    await channel.send(recipient, notice)
    sent++
  }
  return { sent, unreached }
}
