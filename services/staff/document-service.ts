import "server-only"

import { randomUUID } from "node:crypto"

import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_TYPES,
} from "@/features/students/constants"
import { STAFF_DOCUMENT_CATEGORY_LABELS } from "@/features/staff/constants"
import { staffDocumentMetaSchema } from "@/features/staff/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { prisma } from "@/lib/prisma"
import { EXTENSIONS, removeFiles, signedUrl, sniffMimeType, uploadFile } from "@/lib/supabase/storage"
import { audit } from "@/services/audit/audit-service"
import { staffAccess } from "@/services/staff/staff-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

// Size limit and a type taken from the file's content, not its name.
async function readUpload(file: unknown, allowed: readonly string[], maxBytes: number) {
  if (!(file instanceof File) || file.size === 0) throw new ValidationError({ file: ["Choose a file to upload."] })
  if (file.size > maxBytes) {
    throw new ValidationError({ file: [`The file must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`] })
  }
  const body = await file.arrayBuffer()
  const mimeType = sniffMimeType(new Uint8Array(body.slice(0, 16)))
  if (!mimeType || !allowed.includes(mimeType)) throw new ValidationError({ file: ["This file type isn't allowed."] })
  return { body, mimeType, name: file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file" }
}

async function findStaff(ctx: Ctx, staffId: string) {
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, organizationId: ctx.organization.id },
    select: { id: true, archivedAt: true, profileImagePath: true },
  })
  if (!staff) throw new NotFoundError("Staff member not found.")
  return staff
}

// Staff files share the private bucket, under <organisation>/staff/<staff>/...
const objectPath = (ctx: Ctx, staffId: string, kind: string, mimeType: string) =>
  `${ctx.organization.id}/staff/${staffId}/${kind}/${randomUUID()}.${EXTENSIONS[mimeType]}`

export async function listStaffDocuments(ctx: Ctx, staffId: string) {
  return prisma.staffDocument.findMany({
    where: { staffId, organizationId: ctx.organization.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, category: true, fileName: true, mimeType: true, sizeBytes: true,
      verificationStatus: true, createdAt: true, requirement: { select: { id: true, name: true } },
    },
  })
}

export async function uploadStaffDocument(ctx: Ctx, staffId: string, form: FormData) {
  const staff = await findStaff(ctx, staffId)
  if (staff.archivedAt) throw new ConflictError("Restore this staff member before uploading documents.")
  const meta = staffDocumentMetaSchema.parse({
    title: form.get("title"),
    category: form.get("category") || "OTHER",
    requirementId: form.get("requirementId") ?? "",
  })
  if (meta.requirementId) {
    const requirement = await prisma.documentRequirement.findFirst({
      where: { id: meta.requirementId, organizationId: ctx.organization.id, audience: "STAFF" },
      select: { id: true },
    })
    if (!requirement) throw new ValidationError({ requirementId: ["Choose a valid document type."] })
  }
  const file = await readUpload(form.get("file"), DOCUMENT_MIME_TYPES, DOCUMENT_MAX_BYTES)
  const path = objectPath(ctx, staffId, "documents", file.mimeType)
  await uploadFile(path, file.body, file.mimeType)
  try {
    return await prisma.$transaction(async (tx) => {
      const document = await tx.staffDocument.create({
        data: {
          organizationId: ctx.organization.id, staffId, category: meta.category, requirementId: meta.requirementId,
          title: meta.title, fileName: file.name, mimeType: file.mimeType, sizeBytes: file.body.byteLength,
          storagePath: path, uploadedById: ctx.user.id,
        },
        select: { id: true },
      })
      await audit(tx, ctx, {
        action: "staff_document.upload", entityType: "staff", entityId: staffId,
        summary: `Uploaded ${STAFF_DOCUMENT_CATEGORY_LABELS[meta.category].toLowerCase()} “${meta.title}”`,
        metadata: { documentId: document.id },
      })
      return document
    })
  } catch (error) {
    await removeFiles([path])
    throw error
  }
}

// Record first, file after commit.
export async function deleteStaffDocument(ctx: Ctx, staffId: string, documentId: string) {
  const path = await prisma.$transaction(async (tx) => {
    const document = await tx.staffDocument.findFirst({ where: { id: documentId, staffId, organizationId: ctx.organization.id } })
    if (!document) throw new NotFoundError("Document not found.")
    await tx.staffDocument.delete({ where: { id: document.id } })
    await audit(tx, ctx, {
      action: "staff_document.delete", entityType: "staff", entityId: staffId, summary: `Deleted document “${document.title}”`,
    })
    return document.storagePath
  })
  await removeFiles([path])
}

// Roles with staff.documents.view (within their scope), or the staff member.
export async function staffDocumentUrl(ctx: Ctx, staffId: string, documentId: string) {
  const access = await staffAccess(ctx, staffId)
  if (!access.documents) throw new NotFoundError("Document not found.")
  const document = await prisma.staffDocument.findFirst({
    where: { id: documentId, staffId, organizationId: ctx.organization.id },
    select: { storagePath: true, fileName: true },
  })
  if (!document) throw new NotFoundError("Document not found.")
  return signedUrl(document.storagePath, 60, document.fileName)
}

export async function uploadStaffPhoto(ctx: Ctx, staffId: string, form: FormData) {
  const staff = await findStaff(ctx, staffId)
  if (staff.archivedAt) throw new ConflictError("Restore this staff member before editing.")
  const file = await readUpload(form.get("file"), PHOTO_MIME_TYPES, PHOTO_MAX_BYTES)
  const path = objectPath(ctx, staffId, "photo", file.mimeType)
  await uploadFile(path, file.body, file.mimeType)
  try {
    await prisma.$transaction(async (tx) => {
      await tx.staff.updateMany({ where: { id: staffId, organizationId: ctx.organization.id }, data: { profileImagePath: path } })
      await audit(tx, ctx, { action: "staff.photo", entityType: "staff", entityId: staffId, summary: "Updated profile photo" })
    })
  } catch (error) {
    await removeFiles([path])
    throw error
  }
  if (staff.profileImagePath) await removeFiles([staff.profileImagePath])
}

export async function removeStaffPhoto(ctx: Ctx, staffId: string) {
  const staff = await findStaff(ctx, staffId)
  if (!staff.profileImagePath) return
  await prisma.$transaction(async (tx) => {
    await tx.staff.updateMany({ where: { id: staffId, organizationId: ctx.organization.id }, data: { profileImagePath: null } })
    await audit(tx, ctx, { action: "staff.photo", entityType: "staff", entityId: staffId, summary: "Removed profile photo" })
  })
  await removeFiles([staff.profileImagePath])
}

export async function staffPhotoUrl(ctx: Ctx, staffId: string) {
  await staffAccess(ctx, staffId)
  const staff = await findStaff(ctx, staffId)
  if (!staff.profileImagePath) throw new NotFoundError("No photo.")
  return signedUrl(staff.profileImagePath, 300)
}
