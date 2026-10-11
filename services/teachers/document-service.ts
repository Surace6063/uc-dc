import "server-only"

import { randomUUID } from "node:crypto"

import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_TYPES,
} from "@/features/students/constants"
import { DOCUMENT_CATEGORY_LABELS } from "@/features/teachers/constants"
import { documentMetaSchema } from "@/features/teachers/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { prisma } from "@/lib/prisma"
import { EXTENSIONS, removeFiles, signedUrl, sniffMimeType, uploadFile } from "@/lib/supabase/storage"
import { audit } from "@/services/audit/audit-service"
import { teacherAccess } from "@/services/teachers/teacher-service"

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

async function findTeacher(ctx: Ctx, teacherId: string) {
  const teacher = await prisma.teacher.findFirst({
    where: { id: teacherId, organizationId: ctx.organization.id },
    select: { id: true, archivedAt: true, profileImagePath: true },
  })
  if (!teacher) throw new NotFoundError("Teacher not found.")
  return teacher
}

// Teacher files live in the same private bucket as student files, under
// <organisation>/teachers/<teacher>/...
const objectPath = (ctx: Ctx, teacherId: string, kind: string, mimeType: string) =>
  `${ctx.organization.id}/teachers/${teacherId}/${kind}/${randomUUID()}.${EXTENSIONS[mimeType]}`

export async function listTeacherDocuments(ctx: Ctx, teacherId: string) {
  return prisma.teacherDocument.findMany({
    where: { teacherId, organizationId: ctx.organization.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, category: true, fileName: true, mimeType: true, sizeBytes: true,
      verificationStatus: true, createdAt: true, requirement: { select: { id: true, name: true } },
    },
  })
}

export async function uploadTeacherDocument(ctx: Ctx, teacherId: string, form: FormData) {
  const teacher = await findTeacher(ctx, teacherId)
  if (teacher.archivedAt) throw new ConflictError("Restore this teacher before uploading documents.")
  const meta = documentMetaSchema.parse({
    title: form.get("title"),
    category: form.get("category") || "OTHER",
    requirementId: form.get("requirementId") ?? "",
  })
  if (meta.requirementId) {
    const requirement = await prisma.documentRequirement.findFirst({
      where: { id: meta.requirementId, organizationId: ctx.organization.id, audience: "TEACHER" },
      select: { id: true },
    })
    if (!requirement) throw new ValidationError({ requirementId: ["Choose a valid document type."] })
  }
  const file = await readUpload(form.get("file"), DOCUMENT_MIME_TYPES, DOCUMENT_MAX_BYTES)
  const path = objectPath(ctx, teacherId, "documents", file.mimeType)
  await uploadFile(path, file.body, file.mimeType)
  try {
    return await prisma.$transaction(async (tx) => {
      const document = await tx.teacherDocument.create({
        data: {
          organizationId: ctx.organization.id, teacherId, category: meta.category, requirementId: meta.requirementId,
          title: meta.title, fileName: file.name, mimeType: file.mimeType, sizeBytes: file.body.byteLength,
          storagePath: path, uploadedById: ctx.user.id,
        },
        select: { id: true },
      })
      await audit(tx, ctx, {
        action: "teacher_document.upload", entityType: "teacher", entityId: teacherId,
        summary: `Uploaded ${DOCUMENT_CATEGORY_LABELS[meta.category].toLowerCase()} “${meta.title}”`,
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
export async function deleteTeacherDocument(ctx: Ctx, teacherId: string, documentId: string) {
  const path = await prisma.$transaction(async (tx) => {
    const document = await tx.teacherDocument.findFirst({ where: { id: documentId, teacherId, organizationId: ctx.organization.id } })
    if (!document) throw new NotFoundError("Document not found.")
    await tx.teacherDocument.delete({ where: { id: document.id } })
    await audit(tx, ctx, {
      action: "teacher_document.delete", entityType: "teacher", entityId: teacherId, summary: `Deleted document “${document.title}”`,
    })
    return document.storagePath
  })
  await removeFiles([path])
}

// Staff with teachers.documents.view, or the teacher themselves.
export async function teacherDocumentUrl(ctx: Ctx, teacherId: string, documentId: string) {
  const access = await teacherAccess(ctx, teacherId)
  if (!access.documents) throw new NotFoundError("Document not found.")
  const document = await prisma.teacherDocument.findFirst({
    where: { id: documentId, teacherId, organizationId: ctx.organization.id },
    select: { storagePath: true, fileName: true },
  })
  if (!document) throw new NotFoundError("Document not found.")
  return signedUrl(document.storagePath, 60, document.fileName)
}

export async function uploadTeacherPhoto(ctx: Ctx, teacherId: string, form: FormData) {
  const teacher = await findTeacher(ctx, teacherId)
  if (teacher.archivedAt) throw new ConflictError("Restore this teacher before editing.")
  const file = await readUpload(form.get("file"), PHOTO_MIME_TYPES, PHOTO_MAX_BYTES)
  const path = objectPath(ctx, teacherId, "photo", file.mimeType)
  await uploadFile(path, file.body, file.mimeType)
  try {
    await prisma.$transaction(async (tx) => {
      await tx.teacher.updateMany({ where: { id: teacherId, organizationId: ctx.organization.id }, data: { profileImagePath: path } })
      await audit(tx, ctx, { action: "teacher.photo", entityType: "teacher", entityId: teacherId, summary: "Updated profile photo" })
    })
  } catch (error) {
    await removeFiles([path])
    throw error
  }
  if (teacher.profileImagePath) await removeFiles([teacher.profileImagePath])
}

export async function removeTeacherPhoto(ctx: Ctx, teacherId: string) {
  const teacher = await findTeacher(ctx, teacherId)
  if (!teacher.profileImagePath) return
  await prisma.$transaction(async (tx) => {
    await tx.teacher.updateMany({ where: { id: teacherId, organizationId: ctx.organization.id }, data: { profileImagePath: null } })
    await audit(tx, ctx, { action: "teacher.photo", entityType: "teacher", entityId: teacherId, summary: "Removed profile photo" })
  })
  await removeFiles([teacher.profileImagePath])
}

export async function teacherPhotoUrl(ctx: Ctx, teacherId: string) {
  await teacherAccess(ctx, teacherId)
  const teacher = await findTeacher(ctx, teacherId)
  if (!teacher.profileImagePath) throw new NotFoundError("No photo.")
  return signedUrl(teacher.profileImagePath, 300)
}
