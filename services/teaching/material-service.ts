import "server-only"

import { randomUUID } from "node:crypto"

import { MATERIAL_MAX_BYTES, MATERIAL_MIME_TYPES } from "@/features/teaching/constants"
import type { MaterialFilters } from "@/features/teaching/filters"
import { materialSchema } from "@/features/teaching/schemas"
import { hasPermission } from "@/lib/authorization/context"
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { EXTENSIONS, removeFiles, signedUrl, sniffMimeType, uploadFile } from "@/lib/supabase/storage"
import { audit } from "@/services/audit/audit-service"
import { studentMayOpenMaterial } from "@/services/student-portal/learning-service"
import { assertTeaches, checkPlace, myTeacher, overseesTeaching, readScope, requireTeacher, resolveYear, type Ctx } from "@/services/teaching/scope-service"

// Teaching materials: files (private storage, served through short-lived
// signed URLs after an access check) or links, shared with a class.
//   courses.view     see materials (one's own; academic heads everyone's)
//   courses.create   add materials
//   courses.update   delete one's own materials

const listSelect = {
  id: true, title: true, description: true, kind: true, url: true, fileName: true, mimeType: true, sizeBytes: true,
  sharedWithStudents: true, createdAt: true, teacherId: true, academicYearId: true, classId: true, sectionId: true, subjectId: true,
  class: { select: { name: true } },
  section: { select: { name: true } },
  subject: { select: { name: true, code: true } },
  teacher: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TeachingMaterialSelect

export type MaterialRow = Prisma.TeachingMaterialGetPayload<{ select: typeof listSelect }>

export async function listMaterials(ctx: Ctx, filters: MaterialFilters) {
  const scope = await readScope(ctx)
  const yearId = await resolveYear(ctx, filters.year)
  if (!scope) return { rows: [], total: 0, yearId }
  const where: Prisma.TeachingMaterialWhereInput = {
    organizationId: ctx.organization.id,
    ...scope,
    ...(yearId && { academicYearId: yearId }),
    ...(filters.class && { classId: filters.class }),
    ...(filters.section && { sectionId: filters.section }),
    ...(filters.subject && { subjectId: filters.subject }),
    ...(filters.kind && { kind: filters.kind }),
    ...(filters.q && {
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { description: { contains: filters.q, mode: "insensitive" } },
        { fileName: { contains: filters.q, mode: "insensitive" } },
      ],
    }),
  }
  const orderBy: Prisma.TeachingMaterialOrderByWithRelationInput[] = filters.sort === "title" ? [{ title: filters.dir }] : [{ createdAt: filters.dir }]
  const [total, rows] = await Promise.all([
    prisma.teachingMaterial.count({ where }),
    prisma.teachingMaterial.findMany({ where, orderBy, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, select: listSelect }),
  ])
  return { rows, total, yearId }
}

// Reads and checks an uploaded file: size limit, and a type determined from
// its content (not the browser-supplied name or type).
async function readUpload(file: unknown) {
  if (!(file instanceof File) || file.size === 0) throw new ValidationError({ file: ["Choose a file to upload."] })
  if (file.size > MATERIAL_MAX_BYTES) throw new ValidationError({ file: [`The file must be ${MATERIAL_MAX_BYTES / 1024 / 1024} MB or smaller.`] })
  const body = await file.arrayBuffer()
  const mimeType = sniffMimeType(new Uint8Array(body.slice(0, 16)))
  if (!mimeType || !(MATERIAL_MIME_TYPES as readonly string[]).includes(mimeType)) throw new ValidationError({ file: ["Upload a PDF or an image (JPG, PNG or WebP)."] })
  return { body, mimeType, name: file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file" }
}

// Upload first, then record; if recording fails the stored file is removed.
export async function addMaterial(ctx: Ctx, form: FormData) {
  if (!hasPermission(ctx, "courses.create")) throw new ForbiddenError("You don't have permission to add teaching materials.")
  const teacher = await requireTeacher(ctx)
  const field = (k: string) => {
    const v = form.get(k)
    return typeof v === "string" ? v : ""
  }
  const input = materialSchema.parse({
    academicYearId: field("academicYearId"), classId: field("classId"), sectionId: field("sectionId"), subjectId: field("subjectId"),
    title: field("title"), description: field("description"), kind: field("kind"), url: field("url"), sharedWithStudents: field("sharedWithStudents"),
  })
  const target = { academicYearId: input.academicYearId, classId: input.classId, sectionId: input.sectionId, subjectId: input.subjectId }
  await assertTeaches(ctx, target)
  await checkPlace(prisma, ctx, target)

  let file: { path: string; name: string; mimeType: string; size: number } | null = null
  if (input.kind === "FILE") {
    const upload = await readUpload(form.get("file"))
    const path = `${ctx.organization.id}/teaching/${teacher.id}/materials/${randomUUID()}.${EXTENSIONS[upload.mimeType]}`
    await uploadFile(path, upload.body, upload.mimeType)
    file = { path, name: upload.name, mimeType: upload.mimeType, size: upload.body.byteLength }
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const material = await tx.teachingMaterial.create({
        data: {
          ...target, organizationId: ctx.organization.id, teacherId: teacher.id,
          title: input.title, description: input.description, kind: input.kind, sharedWithStudents: input.sharedWithStudents,
          url: input.kind === "LINK" ? input.url : null,
          storagePath: file?.path ?? null, fileName: file?.name ?? null, mimeType: file?.mimeType ?? null, sizeBytes: file?.size ?? null,
        },
        select: { id: true },
      })
      await audit(tx, ctx, { action: "material.create", entityType: "teacher", entityId: teacher.id, summary: `Shared material “${input.title}”`, metadata: { materialId: material.id } })
      return material
    })
  } catch (error) {
    if (file) await removeFiles([file.path])
    throw error
  }
}

// Delete the record first; the file is removed only once that has committed.
export async function deleteMaterial(ctx: Ctx, materialId: string) {
  if (!hasPermission(ctx, "courses.update")) throw new ForbiddenError("You don't have permission to delete teaching materials.")
  const teacher = await requireTeacher(ctx)
  const material = await prisma.teachingMaterial.findFirst({ where: { id: materialId, organizationId: ctx.organization.id }, select: { id: true, teacherId: true, title: true, storagePath: true } })
  if (!material) throw new NotFoundError("Material not found.")
  if (material.teacherId !== teacher.id) throw new ForbiddenError("You can only delete materials you shared.")
  await prisma.$transaction(async (tx) => {
    await tx.teachingMaterial.delete({ where: { id: materialId } })
    await audit(tx, ctx, { action: "material.delete", entityType: "teacher", entityId: teacher.id, summary: `Deleted material “${material.title}”`, metadata: { materialId } })
  })
  if (material.storagePath) await removeFiles([material.storagePath])
}

// Where to send the browser for a material: a signed URL for files, the
// link itself for links. The teacher who shared it, academic heads and
// students of the class (when shared) may open it; anyone else gets "not found".
export async function materialTarget(ctx: Ctx, materialId: string) {
  const material = await prisma.teachingMaterial.findFirst({
    where: { id: materialId, organizationId: ctx.organization.id },
    select: { teacherId: true, kind: true, url: true, storagePath: true, fileName: true, sharedWithStudents: true, academicYearId: true, classId: true, sectionId: true },
  })
  if (!material) throw new NotFoundError("Material not found.")
  if (!overseesTeaching(ctx)) {
    const teacher = await myTeacher(ctx)
    // Students of the class may open materials shared with them.
    const allowed = (teacher && teacher.id === material.teacherId) || (await studentMayOpenMaterial(ctx, material))
    if (!allowed) throw new NotFoundError("Material not found.")
  }
  if (material.kind === "LINK" && material.url) return material.url
  if (!material.storagePath) throw new NotFoundError("Material not found.")
  return signedUrl(material.storagePath, 60, material.fileName ?? undefined)
}
