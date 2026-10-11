"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { runAction } from "@/lib/authorization/action"
import { requireMembership, requirePermission } from "@/lib/authorization/context"
import { ForbiddenError, UnauthenticatedError } from "@/lib/authorization/errors"
import { requireAuth } from "@/lib/auth/session"
import { writeCurrentOrganizationId } from "@/lib/organizations/current-organization"
import { getSiteUrl } from "@/lib/utils/site-url"
import {
  archiveGuardian,
  bulkGuardianAction,
  createGuardian,
  deleteGuardian,
  findGuardianDuplicates,
  linkStudents,
  restoreGuardian,
  searchStudentsForLinking,
  unlinkStudent,
  updateGuardian,
  updateStudentLink,
} from "@/services/guardians/guardian-service"
import { commitGuardianImport, previewGuardianImport } from "@/services/guardians/import-service"
import {
  acceptGuardianInvitation,
  inviteGuardian,
  revokeInvitation,
  setPortalAccess,
  unlinkGuardianAccount,
} from "@/services/guardians/invitation-service"
import { removeGuardianPhoto } from "@/services/guardians/photo-service"
import { updatePortalPreferences } from "@/services/guardians/portal-service"

// Guardian mutations. Each checks its permission on the server; services
// resolve every ID inside the caller's organisation.

const id = z.uuid()

function refresh(guardianId?: string) {
  revalidatePath("/dashboard/parents")
  if (guardianId) revalidatePath(`/dashboard/parents/${guardianId}`)
}

export async function createGuardianAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.create")
    // Linking students in the same step reads student records.
    const links = (values as { links?: unknown[] })?.links
    if (Array.isArray(links) && links.length) await requirePermission("parents.update", "students.view")
    const result = await createGuardian(ctx, values)
    refresh()
    return result
  }, "Guardian added.")
}

export async function findGuardianDuplicatesAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.view")
    return findGuardianDuplicates(ctx, values)
  })
}

export async function updateGuardianAction(guardianId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.update")
    const result = await updateGuardian(ctx, id.parse(guardianId), values)
    refresh(guardianId)
    return result
  }, "Guardian updated.")
}

export async function searchStudentsForLinkingAction(query: string, guardianId?: string) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.update", "students.view")
    return searchStudentsForLinking(ctx, z.string().max(100).parse(query), guardianId ? id.parse(guardianId) : undefined)
  })
}

export async function linkStudentsAction(guardianId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.update", "students.view")
    const result = await linkStudents(ctx, id.parse(guardianId), values)
    refresh(guardianId)
    return result
  }, "Students linked.")
}

export async function updateStudentLinkAction(guardianId: string, studentId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.update", "students.view")
    await updateStudentLink(ctx, id.parse(guardianId), id.parse(studentId), values)
    refresh(guardianId)
    revalidatePath(`/dashboard/students/${studentId}`)
  }, "Link updated.")
}

export async function unlinkStudentAction(guardianId: string, studentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.update", "students.view")
    await unlinkStudent(ctx, id.parse(guardianId), id.parse(studentId))
    refresh(guardianId)
    revalidatePath(`/dashboard/students/${studentId}`)
  }, "Link removed. The guardian and the student are kept.")
}

export async function archiveGuardianAction(guardianId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.archive")
    await archiveGuardian(ctx, id.parse(guardianId))
    refresh(guardianId)
  }, "Guardian archived.")
}

export async function restoreGuardianAction(guardianId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.archive")
    await restoreGuardian(ctx, id.parse(guardianId))
    refresh(guardianId)
  }, "Guardian restored.")
}

export async function deleteGuardianAction(guardianId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.delete")
    await deleteGuardian(ctx, id.parse(guardianId))
    refresh()
  }, "Guardian permanently deleted.")
}

// Archive/restore only: there is deliberately no bulk delete.
export async function bulkGuardianActionAction(values: unknown) {
  return runAction(async () => {
    const action = (values as { action?: string })?.action
    if (action !== "archive" && action !== "restore") throw new ForbiddenError()
    const ctx = await requirePermission("parents.archive")
    const result = await bulkGuardianAction(ctx, values)
    refresh()
    return result
  })
}

export async function removeGuardianPhotoAction(guardianId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.update")
    await removeGuardianPhoto(ctx, id.parse(guardianId))
    refresh(guardianId)
  }, "Photo removed.")
}

// --------------------------------------------------------- portal accounts

// Returns the invitation link once; only its hash is stored.
export async function inviteGuardianAction(guardianId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.portal.manage")
    const { token, email, expiresAt } = await inviteGuardian(ctx, id.parse(guardianId), values)
    refresh(guardianId)
    return { url: `${await getSiteUrl()}/invitations/guardian/${token}`, email, expiresAt: expiresAt.toISOString() }
  }, "Invitation created.")
}

export async function revokeInvitationAction(guardianId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.portal.manage")
    await revokeInvitation(ctx, id.parse(guardianId))
    refresh(guardianId)
  }, "Invitation revoked.")
}

export async function setPortalAccessAction(guardianId: string, values: unknown) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.portal.manage")
    await setPortalAccess(ctx, id.parse(guardianId), values)
    refresh(guardianId)
  }, "Portal access updated.")
}

export async function unlinkGuardianAccountAction(guardianId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.portal.manage")
    await unlinkGuardianAccount(ctx, id.parse(guardianId))
    refresh(guardianId)
  }, "Account unlinked. The person's login and membership were not deleted.")
}

// Called by the invited guardian, who may not be a member of any
// organisation yet, so it needs only a signed-in user.
export async function acceptGuardianInvitationAction(token: string) {
  const result = await runAction(async () => {
    const user = await requireAuth().catch(() => {
      throw new UnauthenticatedError("Sign in to accept this invitation.")
    })
    const { organizationId } = await acceptGuardianInvitation(user, z.string().max(200).parse(token))
    await writeCurrentOrganizationId(organizationId)
  })
  if (result.ok) redirect("/dashboard/family")
  return result
}

// ------------------------------------------------------------ parent portal

export async function updatePortalPreferencesAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requireMembership()
    await updatePortalPreferences(ctx, values)
    revalidatePath("/dashboard/family")
  }, "Preferences saved.")
}

// ------------------------------------------------------------------ import

export async function previewGuardianImportAction(values: { csv: string; firstLine: number }) {
  return runAction(async () => {
    // Matching admission numbers reads student records.
    const ctx = await requirePermission("parents.import", "students.view")
    return previewGuardianImport(ctx, values)
  })
}

export async function commitGuardianImportAction(values: { csv: string; firstLine: number }) {
  return runAction(async () => {
    const ctx = await requirePermission("parents.import", "parents.create", "parents.update", "students.view")
    const result = await commitGuardianImport(ctx, values)
    if (result.created > 0) refresh()
    return result
  })
}
