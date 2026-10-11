import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { INVITATION_TTL_DAYS, invitationState, maskEmail } from "@/features/guardians/constants"
import { inviteGuardianSchema, portalAccessSchema } from "@/features/guardians/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError } from "@/lib/authorization/errors"
import { prisma } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { audit } from "@/services/audit/audit-service"
import { findGuardian } from "@/services/guardians/guardian-service"
import type { AppUser } from "@/services/users/user-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

// Guardian portal accounts reuse Supabase Auth and the existing User and
// OrganizationMember models; nothing here stores a password. An invitation
// is a one-time link: only its SHA-256 hash is stored, so a database leak
// doesn't leak usable links, and accepting it requires being signed in with
// the invited (Supabase-verified) email address.

export const PARENT_ROLE_SLUG = "parent"

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

const INVALID = "This invitation link is no longer valid. Ask the school for a new one."

// Creates (or replaces) the guardian's invitation and returns the raw token
// once, for the caller to turn into a link. Any earlier open invitation is
// revoked, so only the newest link works.
export async function inviteGuardian(ctx: Ctx, guardianId: string, raw: unknown) {
  const { email } = inviteGuardianSchema.parse(raw)
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 864e5)
  return prisma
    .$transaction(async (tx) => {
      const guardian = await findGuardian(tx, ctx, guardianId)
      if (guardian.archivedAt) throw new ConflictError("Restore this guardian before inviting them.")
      if (guardian.userId) throw new ConflictError("This guardian already has a linked account.")
      // Portal access is per student and never implied by the profile.
      const permitted = await tx.studentGuardian.count({
        where: { guardianId, organizationId: ctx.organization.id, canAccessStudentPortalData: true },
      })
      if (permitted === 0) {
        throw new ConflictError("Allow parent portal access for at least one linked student before inviting.")
      }
      const revoked = await tx.guardianInvitation.updateMany({
        where: { guardianId, organizationId: ctx.organization.id, status: "PENDING" },
        data: { status: "REVOKED", revokedAt: new Date(), revokedById: ctx.user.id },
      })
      await tx.guardianInvitation.create({
        data: {
          organizationId: ctx.organization.id,
          guardianId,
          email,
          tokenHash: hashToken(token),
          expiresAt,
          invitedById: ctx.user.id,
        },
      })
      await tx.guardian.update({ where: { id: guardianId }, data: { portalStatus: "INVITED" } })
      await audit(tx, ctx, {
        action: revoked.count ? "guardian.invite_resend" : "guardian.invite",
        entityType: "guardian", entityId: guardianId,
        summary: `${revoked.count ? "Re-sent" : "Created"} a parent portal invitation for ${email}`,
        metadata: { email, expiresAt: expiresAt.toISOString() },
      })
      return { token, email, expiresAt }
    })
    .catch((error) => {
      // Two people inviting at once: the other one won.
      if (isUniqueViolation(error, "guardian_invitations_one_pending_key")) {
        throw new ConflictError("Someone else just invited this guardian. Refresh to see the current invitation.")
      }
      throw error
    })
}

export async function revokeInvitation(ctx: Ctx, guardianId: string) {
  return prisma.$transaction(async (tx) => {
    const guardian = await findGuardian(tx, ctx, guardianId)
    const { count } = await tx.guardianInvitation.updateMany({
      where: { guardianId, organizationId: ctx.organization.id, status: "PENDING" },
      data: { status: "REVOKED", revokedAt: new Date(), revokedById: ctx.user.id },
    })
    if (count === 0) throw new ConflictError("There's no open invitation to revoke.")
    if (!guardian.userId) await tx.guardian.update({ where: { id: guardianId }, data: { portalStatus: "NONE" } })
    await audit(tx, ctx, {
      action: "guardian.invite_revoke", entityType: "guardian", entityId: guardianId,
      summary: "Revoked the parent portal invitation",
    })
  })
}

// Temporarily turns portal access off (or back on) for a linked account. The
// account and its organisation membership are left alone.
export async function setPortalAccess(ctx: Ctx, guardianId: string, raw: unknown) {
  const { enabled } = portalAccessSchema.parse(raw)
  return prisma.$transaction(async (tx) => {
    const guardian = await findGuardian(tx, ctx, guardianId)
    if (!guardian.userId) throw new ConflictError("This guardian has no linked account yet. Send an invitation instead.")
    if (enabled && guardian.archivedAt) throw new ConflictError("Restore this guardian before enabling portal access.")
    await tx.guardian.update({ where: { id: guardianId }, data: { portalStatus: enabled ? "ACTIVE" : "DISABLED" } })
    await audit(tx, ctx, {
      action: enabled ? "guardian.portal_enable" : "guardian.portal_disable",
      entityType: "guardian", entityId: guardianId,
      summary: enabled ? "Enabled parent portal access" : "Disabled parent portal access",
      metadata: { userId: guardian.userId },
    })
  })
}

// Detaches the login account from this guardian profile. The User record,
// its Supabase login and any organisation membership are never deleted here
// (the person may also be staff, or a guardian elsewhere); remove the
// membership from Users & Access if they should lose all access.
export async function unlinkGuardianAccount(ctx: Ctx, guardianId: string) {
  return prisma.$transaction(async (tx) => {
    const guardian = await findGuardian(tx, ctx, guardianId)
    if (!guardian.userId) throw new ConflictError("No account is linked to this guardian.")
    await tx.guardian.update({ where: { id: guardianId }, data: { userId: null, portalStatus: "NONE" } })
    await audit(tx, ctx, {
      action: "guardian.unlink_account", entityType: "guardian", entityId: guardianId,
      summary: "Unlinked the parent portal account",
      metadata: { previousUserId: guardian.userId },
    })
  })
}

// ---------------------------------------------------------------- accepting

export type InvitationView =
  | { state: "invalid" }
  | {
      state: "pending" | "expired" | "accepted" | "revoked"
      organizationName: string
      guardianName: string
      maskedEmail: string
      email: string
      expiresAt: Date
    }

// For the public invitation page. Looked up only by the token's hash; an
// unknown token reveals nothing about any organisation.
export async function findInvitation(token: string): Promise<InvitationView> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { state: "invalid" }
  const invitation = await prisma.guardianInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      status: true, expiresAt: true, email: true,
      organization: { select: { name: true } },
      guardian: { select: { fullName: true, archivedAt: true } },
    },
  })
  if (!invitation) return { state: "invalid" }
  const state = invitation.guardian.archivedAt ? "revoked" : invitationState(invitation)
  if (state === "none") return { state: "invalid" }
  return {
    state,
    organizationName: invitation.organization.name,
    guardianName: invitation.guardian.fullName,
    maskedEmail: maskEmail(invitation.email),
    email: invitation.email,
    expiresAt: invitation.expiresAt,
  }
}

// Links the signed-in user to the guardian profile, makes them a member of
// the organisation (with the Parent role, unless they're already a member)
// and returns the organisation to switch to. Every condition is re-checked
// inside the transaction; the invitation is claimed with a conditional
// update, so a link can be used once even if clicked twice at the same time.
export async function acceptGuardianInvitation(user: Pick<AppUser, "id" | "email">, token: string) {
  const tokenHash = hashToken(token)
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.guardianInvitation.findUnique({
      where: { tokenHash },
      include: { guardian: true },
    })
    if (!invitation || invitationState(invitation) !== "pending" || invitation.guardian.archivedAt) {
      throw new ConflictError(INVALID)
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenError(`This invitation was sent to ${maskEmail(invitation.email)}. Sign in with that email address to accept it.`)
    }
    const { guardian, organizationId } = invitation
    if (guardian.userId && guardian.userId !== user.id) {
      throw new ConflictError("This guardian profile is already linked to another account. Ask the school for help.")
    }
    const other = await tx.guardian.findFirst({
      where: { organizationId, userId: user.id, id: { not: guardian.id } },
      select: { id: true },
    })
    if (other) {
      throw new ConflictError("Your account is already linked to another guardian profile at this school. Ask the school to combine them.")
    }

    const claimed = await tx.guardianInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING", expiresAt: { gt: new Date() } },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedUserId: user.id },
    })
    if (claimed.count === 0) throw new ConflictError(INVALID)
    await tx.guardian.update({ where: { id: guardian.id }, data: { userId: user.id, portalStatus: "ACTIVE" } })

    const membership = await tx.organizationMember.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
      select: { id: true },
    })
    if (!membership) {
      const role = await tx.role.findUnique({
        where: { organizationId_slug: { organizationId, slug: PARENT_ROLE_SLUG } },
        select: { id: true },
      })
      if (!role) throw new ConflictError("The school hasn't set up a Parent role. Ask the school for help.")
      await tx.organizationMember.create({ data: { userId: user.id, organizationId, roleId: role.id } })
    }

    await audit(tx, { organization: { id: organizationId }, user: { id: user.id } }, {
      action: "guardian.invite_accept", entityType: "guardian", entityId: guardian.id,
      summary: `Accepted the parent portal invitation (${user.email})`,
      metadata: { invitationId: invitation.id, newMember: !membership },
    })
    return { organizationId }
  }).catch((error) => {
    // The (organisation, user) unique index: linked elsewhere in a race.
    if (isUniqueViolation(error, "user_id")) {
      throw new ConflictError("Your account is already linked to another guardian profile at this school.")
    }
    throw error
  })
}
