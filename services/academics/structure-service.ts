import "server-only"

import {
  academicClassSchema,
  academicYearSchema,
  applyPresetSchema,
  batchSchema,
  designationSchema,
  documentRequirementSchema,
  educationLevelSchema,
  facultySchema,
  generateClassesSchema,
  programSchema,
  sectionSchema,
  staffSettingsSchema,
  studentSettingsSchema,
  subjectSchema,
} from "@/features/academics/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { findPreset, generatedClassNames } from "@/lib/education/presets"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/prisma-errors"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"

// Every function takes the server-built context; the organisation is never
// read from input. Lookups by ID always include organizationId, so another
// organisation's record behaves exactly like a missing one.
type Ctx = Pick<AuthContext, "organization" | "user">
type Db = TransactionClient | typeof prisma

function fieldError(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

// Converts constraint errors from writes into friendly messages.
async function guardWrite<T>(
  fn: () => Promise<T>,
  messages: { unique?: [field: string, message: string]; inUse?: string }
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (messages.unique && isUniqueViolation(error)) fieldError(...messages.unique)
    if (messages.inUse && isForeignKeyViolation(error)) throw new ConflictError(messages.inUse)
    throw error
  }
}

// ------------------------------------------------------------------ reading

// The whole structure of one organisation. These tables are small (tens to a
// few hundred rows), so forms and filters receive them in one request and
// build dependent selectors client-side.
export async function getEducationStructure(ctx: Pick<AuthContext, "organization">) {
  const organizationId = ctx.organization.id
  const [
    levels, programs, classes, sections, years, faculties, batches, requirements, settings,
    subjects, designations, staffSettings,
  ] = await Promise.all([
      prisma.educationLevel.findMany({
        where: { organizationId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true, name: true, code: true, description: true, presetKey: true,
          groupingKind: true, usesPrograms: true, isActive: true, sortOrder: true,
          _count: { select: { enrollments: true, classes: true, programs: true } },
        },
      }),
      prisma.program.findMany({
        where: { organizationId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true, name: true, code: true, description: true, duration: true,
          educationLevelId: true, facultyId: true, isActive: true, sortOrder: true,
          _count: { select: { enrollments: true, classes: true } },
        },
      }),
      prisma.academicClass.findMany({
        where: { organizationId },
        orderBy: [{ sequence: "asc" }, { name: "asc" }],
        select: {
          id: true, name: true, kind: true, sequence: true, isActive: true,
          educationLevelId: true, programId: true,
          _count: { select: { enrollments: true, sections: true } },
        },
      }),
      prisma.section.findMany({
        where: { organizationId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true, name: true, classId: true, capacity: true, isActive: true, sortOrder: true,
          _count: { select: { enrollments: true } },
        },
      }),
      prisma.academicYear.findMany({
        where: { organizationId },
        orderBy: { startDate: "desc" },
        select: {
          id: true, name: true, startDate: true, endDate: true, status: true, isCurrent: true,
          _count: { select: { enrollments: true } },
        },
      }),
      prisma.faculty.findMany({
        where: { organizationId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true, name: true, code: true, description: true, isActive: true, sortOrder: true,
          _count: { select: { programs: true } },
        },
      }),
      prisma.batch.findMany({
        where: { organizationId },
        orderBy: [{ startYear: "desc" }, { name: "asc" }],
        select: {
          id: true, name: true, programId: true, startYear: true, isActive: true,
          _count: { select: { enrollments: true } },
        },
      }),
      prisma.documentRequirement.findMany({
        where: { organizationId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true, audience: true, name: true, description: true, educationLevelId: true,
          isRequired: true, isActive: true, sortOrder: true,
          _count: { select: { documents: true } },
        },
      }),
      getStudentSettings(prisma, organizationId),
      prisma.subject.findMany({
        where: { organizationId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true, name: true, code: true, educationLevelId: true, programId: true,
          creditHours: true, isActive: true, sortOrder: true,
          _count: { select: { assignments: true } },
        },
      }),
      prisma.designation.findMany({
        where: { organizationId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true, name: true, scope: true, category: true, departmentId: true, isActive: true, sortOrder: true,
          _count: { select: { teachers: true, staff: true } },
        },
      }),
      getStaffSettings(prisma, organizationId),
    ])

  return {
    levels,
    programs,
    classes,
    sections,
    years: years.map((y) => ({
      ...y,
      startDate: y.startDate.toISOString().slice(0, 10),
      endDate: y.endDate.toISOString().slice(0, 10),
    })),
    faculties,
    batches,
    requirements,
    settings,
    subjects,
    designations,
    staffSettings,
  }
}

export type EducationStructure = Awaited<ReturnType<typeof getEducationStructure>>

export async function getStudentSettings(db: Db, organizationId: string) {
  const settings = await db.studentSettings.findUnique({ where: { organizationId } })
  return {
    admissionNumberMode: settings?.admissionNumberMode ?? "AUTOMATIC",
    admissionNumberPrefix: settings?.admissionNumberPrefix ?? "ADM-",
    admissionNumberPadding: settings?.admissionNumberPadding ?? 5,
    nextAdmissionSequence: settings?.nextAdmissionSequence ?? 1,
    rollNumberMode: settings?.rollNumberMode ?? "AUTOMATIC",
  } as const
}

export async function getStaffSettings(db: Db, organizationId: string) {
  const settings = await db.staffSettings.findUnique({ where: { organizationId } })
  return {
    employeeIdMode: settings?.employeeIdMode ?? "AUTOMATIC",
    employeeIdPrefix: settings?.employeeIdPrefix ?? "EMP-",
    employeeIdPadding: settings?.employeeIdPadding ?? 4,
    nextEmployeeSequence: settings?.nextEmployeeSequence ?? 1,
  } as const
}

export async function getCurrentAcademicYear(ctx: Pick<AuthContext, "organization">) {
  return prisma.academicYear.findFirst({
    where: { organizationId: ctx.organization.id, isCurrent: true },
    select: { id: true, name: true, startDate: true, endDate: true },
  })
}

// ------------------------------------------------------------ ownership checks

async function requireLevel(db: Db, ctx: Ctx, id: string, field = "educationLevelId") {
  const level = await db.educationLevel.findFirst({
    where: { id, organizationId: ctx.organization.id },
  })
  if (!level) fieldError(field, "Choose a valid education level.")
  return level
}

async function requireProgram(db: Db, ctx: Ctx, id: string, field = "programId") {
  const program = await db.program.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!program) fieldError(field, "Choose a valid program.")
  return program
}

async function requireFaculty(db: Db, ctx: Ctx, id: string) {
  const faculty = await db.faculty.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!faculty) fieldError("facultyId", "Choose a valid faculty or department.")
  return faculty
}

async function requireClass(db: Db, ctx: Ctx, id: string, field = "classId") {
  const academicClass = await db.academicClass.findFirst({
    where: { id, organizationId: ctx.organization.id },
  })
  if (!academicClass) fieldError(field, "Choose a valid class.")
  return academicClass
}

// A class's program must exist exactly when its level uses programs, and
// must belong to that level.
async function checkClassPlacement(
  db: Db,
  ctx: Ctx,
  educationLevelId: string,
  programId: string | null
) {
  const level = await requireLevel(db, ctx, educationLevelId)
  if (level.usesPrograms && !programId) fieldError("programId", "This level uses programs; choose one.")
  if (!level.usesPrograms && programId) fieldError("programId", "This level doesn't use programs.")
  if (programId) {
    const program = await requireProgram(db, ctx, programId)
    if (program.educationLevelId !== level.id) {
      fieldError("programId", "That program belongs to a different education level.")
    }
  }
  return level
}

async function findOwned<T>(promise: Promise<T | null>, label: string): Promise<T> {
  const record = await promise
  if (!record) throw new NotFoundError(`${label} not found.`)
  return record
}

// -------------------------------------------------------------- education levels

export async function saveEducationLevel(ctx: Ctx, id: string | null, raw: unknown) {
  const input = educationLevelSchema.parse(raw)
  const organizationId = ctx.organization.id

  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        if (id) {
          const existing = await findOwned(
            tx.educationLevel.findFirst({ where: { id, organizationId } }),
            "Education level"
          )
          // Turning programs on/off would orphan existing classes' placement.
          if (existing.usesPrograms !== input.usesPrograms) {
            const classes = await tx.academicClass.count({ where: { educationLevelId: id, organizationId } })
            if (classes > 0) {
              fieldError(
                "usesPrograms",
                "This level already has classes. Remove them before changing whether it uses programs."
              )
            }
          }
          const level = await tx.educationLevel.update({ where: { id: existing.id }, data: input })
          await audit(tx, ctx, {
            action: "education_level.update", entityType: "education_level", entityId: id,
            summary: `Updated education level ${level.name}`,
          })
          return level
        }
        const level = await tx.educationLevel.create({ data: { ...input, organizationId } })
        await audit(tx, ctx, {
          action: "education_level.create", entityType: "education_level", entityId: level.id,
          summary: `Created education level ${level.name}`,
        })
        return level
      }),
    { unique: ["code", "Another education level already uses this code."] }
  )
}

export async function applyEducationPreset(ctx: Ctx, raw: unknown) {
  const input = applyPresetSchema.parse(raw)
  const preset = findPreset(input.presetKey)
  if (!preset) fieldError("presetKey", "Unknown preset.")
  const organizationId = ctx.organization.id

  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        const count = await tx.educationLevel.count({ where: { organizationId } })
        const level = await tx.educationLevel.create({
          data: {
            organizationId,
            name: preset.name,
            code: preset.code,
            presetKey: preset.key,
            description: preset.description,
            groupingKind: preset.groupingKind,
            usesPrograms: preset.usesPrograms,
            sortOrder: count * 10,
          },
        })
        if (input.createClasses && !preset.usesPrograms) {
          await tx.academicClass.createMany({
            data: preset.classes.map((name, i) => ({
              organizationId,
              educationLevelId: level.id,
              name,
              kind: preset.groupingKind,
              sequence: i + 1,
            })),
          })
        }
        if (input.createPrograms && preset.usesPrograms && preset.programs.length > 0) {
          const taken = new Set(
            (
              await tx.program.findMany({
                where: { organizationId, code: { in: preset.programs.map((p) => p.code) } },
                select: { code: true },
              })
            ).map((p) => p.code)
          )
          await tx.program.createMany({
            data: preset.programs
              .filter((p) => !taken.has(p.code))
              .map((p, i) => ({
                organizationId,
                educationLevelId: level.id,
                name: p.name,
                code: p.code,
                duration: p.duration ?? null,
                sortOrder: i * 10,
              })),
          })
        }
        await audit(tx, ctx, {
          action: "education_level.create", entityType: "education_level", entityId: level.id,
          summary: `Added education level ${level.name} from preset`,
        })
        return level
      }),
    { unique: ["presetKey", "A level with this preset's code already exists. Rename or recode it first."] }
  )
}

export async function deleteEducationLevel(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  await findOwned(prisma.educationLevel.findFirst({ where: { id, organizationId } }), "Education level")
  await guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.educationLevel.deleteMany({ where: { id, organizationId } })
        await audit(tx, ctx, {
          action: "education_level.delete", entityType: "education_level", entityId: id,
          summary: "Deleted an education level",
        })
      }),
    { inUse: "This level still has programs, classes, documents or enrollments. Deactivate it instead." }
  )
}

// ----------------------------------------------------------------- programs

export async function saveProgram(ctx: Ctx, id: string | null, raw: unknown) {
  const input = programSchema.parse(raw)
  const organizationId = ctx.organization.id

  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        const level = await requireLevel(tx, ctx, input.educationLevelId)
        if (!level.usesPrograms) {
          fieldError("educationLevelId", "Turn on “Uses programs” for this level first.")
        }
        if (input.facultyId) await requireFaculty(tx, ctx, input.facultyId)

        if (id) {
          const existing = await findOwned(tx.program.findFirst({ where: { id, organizationId } }), "Program")
          if (existing.educationLevelId !== input.educationLevelId) {
            const used = await tx.academicClass.count({ where: { programId: id, organizationId } })
            if (used > 0) fieldError("educationLevelId", "Move or remove this program's classes first.")
          }
          const program = await tx.program.update({ where: { id: existing.id }, data: input })
          await audit(tx, ctx, {
            action: "program.update", entityType: "program", entityId: id,
            summary: `Updated program ${program.name}`,
          })
          return program
        }
        const program = await tx.program.create({ data: { ...input, organizationId } })
        await audit(tx, ctx, {
          action: "program.create", entityType: "program", entityId: program.id,
          summary: `Created program ${program.name}`,
        })
        return program
      }),
    { unique: ["code", "Another program already uses this code."] }
  )
}

export async function deleteProgram(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  await findOwned(prisma.program.findFirst({ where: { id, organizationId } }), "Program")
  await guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.program.deleteMany({ where: { id, organizationId } })
        await audit(tx, ctx, {
          action: "program.delete", entityType: "program", entityId: id, summary: "Deleted a program",
        })
      }),
    { inUse: "This program still has classes, batches or enrollments. Deactivate it instead." }
  )
}

// ------------------------------------------------------------------ classes

export async function saveAcademicClass(ctx: Ctx, id: string | null, raw: unknown) {
  const input = academicClassSchema.parse(raw)
  const organizationId = ctx.organization.id

  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        await checkClassPlacement(tx, ctx, input.educationLevelId, input.programId)
        if (id) {
          const existing = await findOwned(
            tx.academicClass.findFirst({ where: { id, organizationId } }),
            "Class"
          )
          const moved =
            existing.educationLevelId !== input.educationLevelId || existing.programId !== input.programId
          // Enrollments copy the class's level/program, so a used class can't move.
          if (moved && (await tx.enrollment.count({ where: { classId: id, organizationId } })) > 0) {
            fieldError("educationLevelId", "Students are enrolled in this class; it can't be moved.")
          }
          const updated = await tx.academicClass.update({ where: { id: existing.id }, data: input })
          await audit(tx, ctx, {
            action: "class.update", entityType: "class", entityId: id, summary: `Updated class ${updated.name}`,
          })
          return updated
        }
        const created = await tx.academicClass.create({ data: { ...input, organizationId } })
        await audit(tx, ctx, {
          action: "class.create", entityType: "class", entityId: created.id, summary: `Created class ${created.name}`,
        })
        return created
      }),
    { unique: ["name", "A class with this name already exists here."] }
  )
}

export async function generateClasses(ctx: Ctx, raw: unknown) {
  const input = generateClassesSchema.parse(raw)
  const organizationId = ctx.organization.id

  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        await checkClassPlacement(tx, ctx, input.educationLevelId, input.programId)
        const names = generatedClassNames(input.kind, input.count!, input.startAt)
        const existing = new Set(
          (
            await tx.academicClass.findMany({
              where: { organizationId, educationLevelId: input.educationLevelId, programId: input.programId },
              select: { name: true },
            })
          ).map((c) => c.name.toLowerCase())
        )
        const data = names
          .map((name, i) => ({
            organizationId,
            educationLevelId: input.educationLevelId,
            programId: input.programId,
            name,
            kind: input.kind,
            sequence: input.startAt + i,
          }))
          .filter((c) => !existing.has(c.name.toLowerCase()))
        await tx.academicClass.createMany({ data })
        await audit(tx, ctx, {
          action: "class.generate", entityType: "class",
          summary: `Generated ${data.length} classes`,
        })
        return { created: data.length }
      }),
    { unique: ["name", "Some of these classes already exist."] }
  )
}

export async function deleteAcademicClass(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  await findOwned(prisma.academicClass.findFirst({ where: { id, organizationId } }), "Class")
  await guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.academicClass.deleteMany({ where: { id, organizationId } })
        await audit(tx, ctx, { action: "class.delete", entityType: "class", entityId: id, summary: "Deleted a class" })
      }),
    { inUse: "This class still has sections or enrollments. Deactivate it instead." }
  )
}

// ----------------------------------------------------------------- sections

export async function saveSection(ctx: Ctx, id: string | null, raw: unknown) {
  const input = sectionSchema.parse(raw)
  const organizationId = ctx.organization.id

  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        await requireClass(tx, ctx, input.classId)
        if (id) {
          const existing = await findOwned(tx.section.findFirst({ where: { id, organizationId } }), "Section")
          if (
            existing.classId !== input.classId &&
            (await tx.enrollment.count({ where: { sectionId: id, organizationId } })) > 0
          ) {
            fieldError("classId", "Students are enrolled in this section; it can't move to another class.")
          }
          const section = await tx.section.update({ where: { id: existing.id }, data: input })
          await audit(tx, ctx, {
            action: "section.update", entityType: "section", entityId: id, summary: `Updated section ${section.name}`,
          })
          return section
        }
        const section = await tx.section.create({ data: { ...input, organizationId } })
        await audit(tx, ctx, {
          action: "section.create", entityType: "section", entityId: section.id,
          summary: `Created section ${section.name}`,
        })
        return section
      }),
    { unique: ["name", "This class already has a section with that name."] }
  )
}

export async function deleteSection(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  await findOwned(prisma.section.findFirst({ where: { id, organizationId } }), "Section")
  await guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.section.deleteMany({ where: { id, organizationId } })
        await audit(tx, ctx, { action: "section.delete", entityType: "section", entityId: id, summary: "Deleted a section" })
      }),
    { inUse: "Students are enrolled in this section. Deactivate it instead." }
  )
}

// ------------------------------------------------------------ academic years

export async function saveAcademicYear(ctx: Ctx, id: string | null, raw: unknown) {
  const input = academicYearSchema.parse(raw)
  const organizationId = ctx.organization.id
  const data = {
    name: input.name,
    startDate: toDate(input.startDate),
    endDate: toDate(input.endDate),
    status: input.status,
    isCurrent: input.isCurrent,
  }

  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        // Only one current year: clear the flag elsewhere first (the partial
        // unique index backs this up under concurrency).
        if (input.isCurrent) {
          await tx.academicYear.updateMany({
            where: { organizationId, isCurrent: true, ...(id && { id: { not: id } }) },
            data: { isCurrent: false },
          })
        }
        if (id) {
          await findOwned(tx.academicYear.findFirst({ where: { id, organizationId } }), "Academic year")
          const year = await tx.academicYear.update({ where: { id }, data })
          await audit(tx, ctx, {
            action: "academic_year.update", entityType: "academic_year", entityId: id,
            summary: `Updated academic year ${year.name}${year.isCurrent ? " (current)" : ""}`,
          })
          return year
        }
        const year = await tx.academicYear.create({ data: { ...data, organizationId } })
        await audit(tx, ctx, {
          action: "academic_year.create", entityType: "academic_year", entityId: year.id,
          summary: `Created academic year ${year.name}`,
        })
        return year
      }),
    { unique: ["name", "An academic year with this name already exists."] }
  )
}

export async function setCurrentAcademicYear(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const year = await findOwned(tx.academicYear.findFirst({ where: { id, organizationId } }), "Academic year")
    if (year.status === "COMPLETED" || year.status === "ARCHIVED") {
      throw new ConflictError("A completed or archived year can't be the current year.")
    }
    await tx.academicYear.updateMany({ where: { organizationId, isCurrent: true }, data: { isCurrent: false } })
    await tx.academicYear.update({ where: { id }, data: { isCurrent: true, status: "ACTIVE" } })
    await audit(tx, ctx, {
      action: "academic_year.set_current", entityType: "academic_year", entityId: id,
      summary: `Set ${year.name} as the current academic year`,
    })
  })
}

export async function deleteAcademicYear(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  await findOwned(prisma.academicYear.findFirst({ where: { id, organizationId } }), "Academic year")
  await guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.academicYear.deleteMany({ where: { id, organizationId } })
        await audit(tx, ctx, {
          action: "academic_year.delete", entityType: "academic_year", entityId: id,
          summary: "Deleted an academic year",
        })
      }),
    { inUse: "This year has enrollments. Mark it completed or archived instead." }
  )
}

// ---------------------------------------------------------------- faculties

export async function saveFaculty(ctx: Ctx, id: string | null, raw: unknown) {
  const input = facultySchema.parse(raw)
  const organizationId = ctx.organization.id
  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        if (id) {
          await findOwned(tx.faculty.findFirst({ where: { id, organizationId } }), "Faculty")
          const faculty = await tx.faculty.update({ where: { id }, data: input })
          await audit(tx, ctx, {
            action: "faculty.update", entityType: "faculty", entityId: id, summary: `Updated ${faculty.name}`,
          })
          return faculty
        }
        const faculty = await tx.faculty.create({ data: { ...input, organizationId } })
        await audit(tx, ctx, {
          action: "faculty.create", entityType: "faculty", entityId: faculty.id, summary: `Created ${faculty.name}`,
        })
        return faculty
      }),
    { unique: ["code", "Another faculty or department already uses this code."] }
  )
}

export async function deleteFaculty(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  await findOwned(prisma.faculty.findFirst({ where: { id, organizationId } }), "Faculty")
  await guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.faculty.deleteMany({ where: { id, organizationId } })
        await audit(tx, ctx, { action: "faculty.delete", entityType: "faculty", entityId: id, summary: "Deleted a faculty" })
      }),
    { inUse: "Programs still belong to this faculty. Reassign them or deactivate it instead." }
  )
}

// ------------------------------------------------------------------ batches

export async function saveBatch(ctx: Ctx, id: string | null, raw: unknown) {
  const input = batchSchema.parse(raw)
  const organizationId = ctx.organization.id
  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        if (input.programId) await requireProgram(tx, ctx, input.programId)
        if (id) {
          await findOwned(tx.batch.findFirst({ where: { id, organizationId } }), "Batch")
          const batch = await tx.batch.update({ where: { id }, data: input })
          await audit(tx, ctx, { action: "batch.update", entityType: "batch", entityId: id, summary: `Updated ${batch.name}` })
          return batch
        }
        const batch = await tx.batch.create({ data: { ...input, organizationId } })
        await audit(tx, ctx, { action: "batch.create", entityType: "batch", entityId: batch.id, summary: `Created ${batch.name}` })
        return batch
      }),
    { unique: ["name", "A batch with this name already exists."] }
  )
}

export async function deleteBatch(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  await findOwned(prisma.batch.findFirst({ where: { id, organizationId } }), "Batch")
  await guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.batch.deleteMany({ where: { id, organizationId } })
        await audit(tx, ctx, { action: "batch.delete", entityType: "batch", entityId: id, summary: "Deleted a batch" })
      }),
    { inUse: "Students are enrolled in this batch. Deactivate it instead." }
  )
}

// ------------------------------------------------------- document requirements

export async function saveDocumentRequirement(ctx: Ctx, id: string | null, raw: unknown) {
  const input = documentRequirementSchema.parse(raw)
  const organizationId = ctx.organization.id
  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        if (input.educationLevelId) await requireLevel(tx, ctx, input.educationLevelId)
        if (id) {
          await findOwned(tx.documentRequirement.findFirst({ where: { id, organizationId } }), "Document type")
          const requirement = await tx.documentRequirement.update({ where: { id }, data: input })
          await audit(tx, ctx, {
            action: "document_requirement.update", entityType: "document_requirement", entityId: id,
            summary: `Updated document type ${requirement.name}`,
          })
          return requirement
        }
        const requirement = await tx.documentRequirement.create({ data: { ...input, organizationId } })
        await audit(tx, ctx, {
          action: "document_requirement.create", entityType: "document_requirement", entityId: requirement.id,
          summary: `Created document type ${requirement.name}`,
        })
        return requirement
      }),
    { unique: ["name", "A document type with this name already exists."] }
  )
}

export async function deleteDocumentRequirement(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  await findOwned(prisma.documentRequirement.findFirst({ where: { id, organizationId } }), "Document type")
  // Uploaded documents keep their files; only the link to this type is cleared.
  await prisma.$transaction(async (tx) => {
    await tx.documentRequirement.deleteMany({ where: { id, organizationId } })
    await audit(tx, ctx, {
      action: "document_requirement.delete", entityType: "document_requirement", entityId: id,
      summary: "Deleted a document type",
    })
  })
}

// ------------------------------------------------------------------ settings

export async function saveStudentSettings(ctx: Ctx, raw: unknown) {
  const input = studentSettingsSchema.parse(raw)
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    // The sequence may only move forward, so numbers are never handed out twice.
    const current = await getStudentSettings(tx, organizationId)
    if (input.nextAdmissionSequence < current.nextAdmissionSequence) {
      fieldError("nextAdmissionSequence", `Can't go below ${current.nextAdmissionSequence}; numbers up to there may be in use.`)
    }
    const settings = await tx.studentSettings.upsert({
      where: { organizationId },
      create: { ...input, organizationId },
      update: input,
    })
    await audit(tx, ctx, {
      action: "student_settings.update", entityType: "student_settings",
      summary: "Updated admission numbering settings",
    })
    return settings
  })
}

// ------------------------------------------------------------------ subjects

export async function saveSubject(ctx: Ctx, id: string | null, raw: unknown) {
  const input = subjectSchema.parse(raw)
  const organizationId = ctx.organization.id
  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        // A program implies its level; both must belong to this organisation.
        let educationLevelId = input.educationLevelId
        if (input.programId) {
          const program = await requireProgram(tx, ctx, input.programId)
          if (educationLevelId && educationLevelId !== program.educationLevelId) {
            fieldError("programId", "That program belongs to a different education level.")
          }
          educationLevelId = program.educationLevelId
        } else if (educationLevelId) {
          await requireLevel(tx, ctx, educationLevelId)
        }
        const data = { ...input, educationLevelId }
        if (id) {
          await findOwned(tx.subject.findFirst({ where: { id, organizationId } }), "Subject")
          const subject = await tx.subject.update({ where: { id }, data })
          await audit(tx, ctx, { action: "subject.update", entityType: "subject", entityId: id, summary: `Updated subject ${subject.name}` })
          return subject
        }
        const subject = await tx.subject.create({ data: { ...data, organizationId } })
        await audit(tx, ctx, { action: "subject.create", entityType: "subject", entityId: subject.id, summary: `Created subject ${subject.name}` })
        return subject
      }),
    { unique: ["code", "Another subject already uses this code."] }
  )
}

export async function deleteSubject(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  await findOwned(prisma.subject.findFirst({ where: { id, organizationId } }), "Subject")
  await guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.subject.deleteMany({ where: { id, organizationId } })
        await audit(tx, ctx, { action: "subject.delete", entityType: "subject", entityId: id, summary: "Deleted a subject" })
      }),
    { inUse: "Teachers have been assigned to this subject. Deactivate it instead." }
  )
}

// -------------------------------------------------------------- designations

export async function saveDesignation(ctx: Ctx, id: string | null, raw: unknown) {
  const input = designationSchema.parse(raw)
  const organizationId = ctx.organization.id
  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        if (id) {
          await findOwned(tx.designation.findFirst({ where: { id, organizationId } }), "Designation")
          const designation = await tx.designation.update({ where: { id }, data: input })
          await audit(tx, ctx, { action: "designation.update", entityType: "designation", entityId: id, summary: `Updated designation ${designation.name}` })
          return designation
        }
        const designation = await tx.designation.create({ data: { ...input, organizationId } })
        await audit(tx, ctx, { action: "designation.create", entityType: "designation", entityId: designation.id, summary: `Created designation ${designation.name}` })
        return designation
      }),
    { unique: ["name", "This designation already exists."] }
  )
}

export async function deleteDesignation(ctx: Ctx, id: string) {
  const organizationId = ctx.organization.id
  await findOwned(prisma.designation.findFirst({ where: { id, organizationId } }), "Designation")
  await guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.designation.deleteMany({ where: { id, organizationId } })
        await audit(tx, ctx, { action: "designation.delete", entityType: "designation", entityId: id, summary: "Deleted a designation" })
      }),
    { inUse: "Teachers or staff have this designation. Deactivate it instead." }
  )
}

// ------------------------------------------------------------ staff settings

export async function saveStaffSettings(ctx: Ctx, raw: unknown) {
  const input = staffSettingsSchema.parse(raw)
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    // The sequence may only move forward, so IDs are never handed out twice.
    const current = await getStaffSettings(tx, organizationId)
    if (input.nextEmployeeSequence < current.nextEmployeeSequence) {
      fieldError("nextEmployeeSequence", `Can't go below ${current.nextEmployeeSequence}; IDs up to there may be in use.`)
    }
    const settings = await tx.staffSettings.upsert({
      where: { organizationId },
      create: { ...input, organizationId },
      update: input,
    })
    await audit(tx, ctx, { action: "staff_settings.update", entityType: "staff_settings", summary: "Updated employee ID settings" })
    return settings
  })
}
