import "server-only"

import { randomUUID } from "node:crypto"

import { z } from "zod"

import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_TYPES,
} from "@/features/students/constants"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { prisma } from "@/lib/prisma"
import {
  EXTENSIONS,
  removeFiles,
  signedUrl,
  sniffMimeType,
  uploadFile,
} from "@/lib/supabase/storage"
import { optionalId, requiredText } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"
import { assertCanViewStudent } from "@/services/students/student-service"

type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

const documentMetaSchema = z.object({
  title: requiredText("Enter a title for the document.", 120),
  requirementId: optionalId,
})

// Reads and checks an uploaded file: size limit, and a type determined from
// its content (not the browser-supplied name or type).
async function readUpload(file: unknown, allowed: readonly string[], maxBytes: number) {
  if (!(file instanceof File) || file.size === 0) {
    throw new ValidationError({ file: ["Choose a file to upload."] })
  }
  if (file.size > maxBytes) {
    throw new ValidationError({ file: [`The file must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`] })
  }
  const body = await file.arrayBuffer()
  const mimeType = sniffMimeType(new Uint8Array(body.slice(0, 16)))
  if (!mimeType || !allowed.includes(mimeType)) {
    throw new ValidationError({ file: ["This file type isn't allowed."] })
  }
  return { body, mimeType, name: file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file" }
}

async function findOwnedStudent(ctx: Ctx, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, organizationId: ctx.organization.id },
    select: { id: true, archivedAt: true, profileImagePath: true },
  })
  if (!student) throw new NotFoundError("Student not found.")
  return student
}

const objectPath = (ctx: Ctx, studentId: string, kind: string, mimeType: string) =>
  `${ctx.organization.id}/${studentId}/${kind}/${randomUUID()}.${EXTENSIONS[mimeType]}`

export async function listStudentDocuments(ctx: Ctx, studentId: string) {
  return prisma.studentDocument.findMany({
    where: { studentId, organizationId: ctx.organization.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true,
      requirement: { select: { id: true, name: true } },
    },
  })
}

// Upload first, then record; if recording fails the stored file is removed.
export async function uploadStudentDocument(ctx: Ctx, studentId: string, form: FormData) {
  const student = await findOwnedStudent(ctx, studentId)
  if (student.archivedAt) throw new ConflictError("Restore this student before uploading documents.")
  const meta = documentMetaSchema.parse({
    title: form.get("title"),
    requirementId: form.get("requirementId") ?? "",
  })
  if (meta.requirementId) {
    const requirement = await prisma.documentRequirement.findFirst({
      where: { id: meta.requirementId, organizationId: ctx.organization.id, audience: "STUDENT" },
      select: { id: true },
    })
    if (!requirement) throw new ValidationError({ requirementId: ["Choose a valid document type."] })
  }
  const file = await readUpload(form.get("file"), DOCUMENT_MIME_TYPES, DOCUMENT_MAX_BYTES)
  const path = objectPath(ctx, studentId, "documents", file.mimeType)
  await uploadFile(path, file.body, file.mimeType)

  try {
    return await prisma.$transaction(async (tx) => {
      const document = await tx.studentDocument.create({
        data: {
          organizationId: ctx.organization.id,
          studentId,
          requirementId: meta.requirementId,
          title: meta.title,
          fileName: file.name,
          mimeType: file.mimeType,
          sizeBytes: file.body.byteLength,
          storagePath: path,
          uploadedById: ctx.user.id,
        },
        select: { id: true },
      })
      await audit(tx, ctx, {
        action: "document.upload", entityType: "student", entityId: studentId,
        summary: `Uploaded document “${meta.title}”`, metadata: { documentId: document.id },
      })
      return document
    })
  } catch (error) {
    await removeFiles([path])
    throw error
  }
}

// Delete the record first; the file is removed only once that has committed.
export async function deleteStudentDocument(ctx: Ctx, studentId: string, documentId: string) {
  const path = await prisma.$transaction(async (tx) => {
    const document = await tx.studentDocument.findFirst({
      where: { id: documentId, studentId, organizationId: ctx.organization.id },
    })
    if (!document) throw new NotFoundError("Document not found.")
    await tx.studentDocument.delete({ where: { id: document.id } })
    await audit(tx, ctx, {
      action: "document.delete", entityType: "student", entityId: studentId,
      summary: `Deleted document “${document.title}”`,
    })
    return document.storagePath
  })
  await removeFiles([path])
}

// A short-lived link, issued only after checking access to this document.
export async function documentDownloadUrl(ctx: Ctx, studentId: string, documentId: string) {
  const document = await prisma.studentDocument.findFirst({
    where: { id: documentId, studentId, organizationId: ctx.organization.id },
    select: { storagePath: true, fileName: true },
  })
  if (!document) throw new NotFoundError("Document not found.")
  return signedUrl(document.storagePath, 60, document.fileName)
}

export async function uploadStudentPhoto(ctx: Ctx, studentId: string, form: FormData) {
  const student = await findOwnedStudent(ctx, studentId)
  if (student.archivedAt) throw new ConflictError("Restore this student before editing.")
  const file = await readUpload(form.get("file"), PHOTO_MIME_TYPES, PHOTO_MAX_BYTES)
  const path = objectPath(ctx, studentId, "photo", file.mimeType)
  await uploadFile(path, file.body, file.mimeType)
  try {
    await prisma.$transaction(async (tx) => {
      await tx.student.updateMany({
        where: { id: studentId, organizationId: ctx.organization.id },
        data: { profileImagePath: path },
      })
      await audit(tx, ctx, {
        action: "student.photo", entityType: "student", entityId: studentId, summary: "Updated profile photo",
      })
    })
  } catch (error) {
    await removeFiles([path])
    throw error
  }
  // The previous photo is removed only after the new one is recorded.
  if (student.profileImagePath) await removeFiles([student.profileImagePath])
}

export async function removeStudentPhoto(ctx: Ctx, studentId: string) {
  const student = await findOwnedStudent(ctx, studentId)
  if (!student.profileImagePath) return
  await prisma.$transaction(async (tx) => {
    await tx.student.updateMany({
      where: { id: studentId, organizationId: ctx.organization.id },
      data: { profileImagePath: null },
    })
    await audit(tx, ctx, {
      action: "student.photo", entityType: "student", entityId: studentId, summary: "Removed profile photo",
    })
  })
  await removeFiles([student.profileImagePath])
}

export async function photoUrl(ctx: Ctx, studentId: string) {
  await assertCanViewStudent(ctx, studentId)
  const student = await prisma.student.findFirst({
    where: { id: studentId, organizationId: ctx.organization.id },
    select: { profileImagePath: true },
  })
  if (!student?.profileImagePath) throw new NotFoundError("No photo.")
  return signedUrl(student.profileImagePath, 300)
}
