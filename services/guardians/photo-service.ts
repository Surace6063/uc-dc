import "server-only"

import { randomUUID } from "node:crypto"

import { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from "@/features/students/constants"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { prisma } from "@/lib/prisma"
import { EXTENSIONS, removeFiles, signedUrl, sniffMimeType, uploadFile } from "@/lib/supabase/storage"
import { audit } from "@/services/audit/audit-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

// Guardian photos share the private bucket, under <organisation>/guardians/<id>/...
// and are served only as short-lived signed URLs after an access check.

async function findGuardian(ctx: Ctx, guardianId: string) {
  const guardian = await prisma.guardian.findFirst({
    where: { id: guardianId, organizationId: ctx.organization.id },
    select: { id: true, archivedAt: true, profileImagePath: true, userId: true },
  })
  if (!guardian) throw new NotFoundError("Guardian not found.")
  return guardian
}

export async function uploadGuardianPhoto(ctx: Ctx, guardianId: string, form: FormData) {
  const guardian = await findGuardian(ctx, guardianId)
  if (guardian.archivedAt) throw new ConflictError("Restore this guardian before editing.")
  const file = form.get("file")
  if (!(file instanceof File) || file.size === 0) throw new ValidationError({ file: ["Choose a photo to upload."] })
  if (file.size > PHOTO_MAX_BYTES) throw new ValidationError({ file: ["The photo must be 2 MB or smaller."] })
  const body = await file.arrayBuffer()
  // The type comes from the file's content, not its name.
  const mimeType = sniffMimeType(new Uint8Array(body.slice(0, 16)))
  if (!mimeType || !(PHOTO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new ValidationError({ file: ["Use a JPEG, PNG or WebP image."] })
  }
  const path = `${ctx.organization.id}/guardians/${guardianId}/photo/${randomUUID()}.${EXTENSIONS[mimeType]}`
  await uploadFile(path, body, mimeType)
  try {
    await prisma.$transaction(async (tx) => {
      await tx.guardian.updateMany({ where: { id: guardianId, organizationId: ctx.organization.id }, data: { profileImagePath: path } })
      await audit(tx, ctx, { action: "guardian.photo", entityType: "guardian", entityId: guardianId, summary: "Updated profile photo" })
    })
  } catch (error) {
    await removeFiles([path])
    throw error
  }
  if (guardian.profileImagePath) await removeFiles([guardian.profileImagePath])
}

export async function removeGuardianPhoto(ctx: Ctx, guardianId: string) {
  const guardian = await findGuardian(ctx, guardianId)
  if (!guardian.profileImagePath) return
  await prisma.$transaction(async (tx) => {
    await tx.guardian.updateMany({ where: { id: guardianId, organizationId: ctx.organization.id }, data: { profileImagePath: null } })
    await audit(tx, ctx, { action: "guardian.photo", entityType: "guardian", entityId: guardianId, summary: "Removed profile photo" })
  })
  await removeFiles([guardian.profileImagePath])
}

// Staff with parents.view, or the guardian themselves.
export async function guardianPhotoUrl(ctx: Ctx, guardianId: string) {
  const guardian = await findGuardian(ctx, guardianId)
  if (!hasPermission(ctx, "parents.view") && guardian.userId !== ctx.user.id) throw new NotFoundError("Guardian not found.")
  if (!guardian.profileImagePath) throw new NotFoundError("No photo.")
  return signedUrl(guardian.profileImagePath, 300)
}
