import { Pill, tone } from "@/components/shared/status-pill"
import {
  INVITATION_STATE_LABELS,
  PORTAL_STATUS_LABELS,
  type InvitationState,
} from "@/features/guardians/constants"
import type { GuardianPortalStatus } from "@/lib/generated/prisma/enums"

const portalTone: Record<GuardianPortalStatus, string> = {
  NONE: tone.muted,
  INVITED: tone.blue,
  ACTIVE: tone.green,
  DISABLED: tone.amber,
}

export function PortalStatusBadge({ status }: { status: GuardianPortalStatus }) {
  return <Pill className={portalTone[status]}>{PORTAL_STATUS_LABELS[status]}</Pill>
}

const invitationTone: Record<InvitationState, string> = {
  none: tone.muted,
  pending: tone.blue,
  expired: tone.amber,
  accepted: tone.green,
  revoked: tone.muted,
}

export function InvitationBadge({ state }: { state: InvitationState }) {
  return <Pill className={invitationTone[state]}>{INVITATION_STATE_LABELS[state]}</Pill>
}

export function RecordBadge({ archived }: { archived: boolean }) {
  return archived ? <Pill className={tone.muted}>Archived</Pill> : <Pill className={tone.green}>Active</Pill>
}
