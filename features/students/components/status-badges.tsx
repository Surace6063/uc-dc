import { Pill, tone } from "@/components/shared/status-pill"
import {
  ENROLLMENT_STATUS_LABELS,
  STUDENT_STATUS_LABELS,
} from "@/features/students/constants"
import type { EnrollmentStatus, StudentStatus } from "@/lib/generated/prisma/enums"

const studentTone: Record<StudentStatus, string> = {
  ACTIVE: tone.green,
  SUSPENDED: tone.amber,
  WITHDRAWN: tone.muted,
  TRANSFERRED: tone.blue,
  GRADUATED: tone.primary,
}

const enrollmentTone: Record<EnrollmentStatus, string> = {
  ACTIVE: tone.green,
  ON_HOLD: tone.amber,
  PROMOTED: tone.primary,
  COMPLETED: tone.primary,
  DETAINED: tone.amber,
  TRANSFERRED: tone.blue,
  WITHDRAWN: tone.muted,
  CANCELLED: tone.red,
}

export function StudentStatusBadge({ status, archived }: { status: StudentStatus; archived?: boolean }) {
  if (archived) return <Pill className={tone.muted}>Archived</Pill>
  return <Pill className={studentTone[status]}>{STUDENT_STATUS_LABELS[status]}</Pill>
}

export function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  return <Pill className={enrollmentTone[status]}>{ENROLLMENT_STATUS_LABELS[status]}</Pill>
}
