import { Pill, tone } from "@/components/shared/status-pill"
import { STAFF_EMPLOYMENT_STATUS_LABELS } from "@/features/staff/constants"
import type { StaffEmploymentStatus } from "@/lib/generated/prisma/enums"

export { AssignmentStatusBadge, VerificationBadge } from "@/features/teachers/components/status-badges"

const employmentTone: Record<StaffEmploymentStatus, string> = {
  ACTIVE: tone.green,
  ON_LEAVE: tone.blue,
  SUSPENDED: tone.amber,
  RESIGNED: tone.muted,
  TERMINATED: tone.red,
  RETIRED: tone.primary,
  CONTRACT_EXPIRED: tone.muted,
}

// Archived is shown instead of the employment status: it is a record state,
// not an employment outcome.
export function StaffStatusBadge({ status, archived }: { status: StaffEmploymentStatus; archived?: boolean }) {
  if (archived) return <Pill className={tone.muted}>Archived</Pill>
  return <Pill className={employmentTone[status]}>{STAFF_EMPLOYMENT_STATUS_LABELS[status]}</Pill>
}
