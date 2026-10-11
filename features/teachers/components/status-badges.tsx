import { Pill, tone } from "@/components/shared/status-pill"
import {
  ASSIGNMENT_STATUS_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  VERIFICATION_LABELS,
} from "@/features/teachers/constants"
import type {
  AssignmentStatus,
  TeacherEmploymentStatus,
  VerificationStatus,
} from "@/lib/generated/prisma/enums"

const employmentTone: Record<TeacherEmploymentStatus, string> = {
  ACTIVE: tone.green,
  ON_LEAVE: tone.blue,
  SUSPENDED: tone.amber,
  RESIGNED: tone.muted,
  TERMINATED: tone.red,
  RETIRED: tone.primary,
  CONTRACT_EXPIRED: tone.muted,
}

export function EmploymentStatusBadge({ status, archived }: { status: TeacherEmploymentStatus; archived?: boolean }) {
  if (archived) return <Pill className={tone.muted}>Archived</Pill>
  return <Pill className={employmentTone[status]}>{EMPLOYMENT_STATUS_LABELS[status]}</Pill>
}

const verificationTone: Record<VerificationStatus, string> = {
  PENDING: tone.amber,
  VERIFIED: tone.green,
  REJECTED: tone.red,
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return <Pill className={verificationTone[status]}>{VERIFICATION_LABELS[status]}</Pill>
}

const assignmentTone: Record<AssignmentStatus, string> = {
  ACTIVE: tone.green,
  ENDED: tone.muted,
  CANCELLED: tone.red,
}

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  return <Pill className={assignmentTone[status]}>{ASSIGNMENT_STATUS_LABELS[status]}</Pill>
}
