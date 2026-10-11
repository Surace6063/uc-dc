import "server-only"

import { bulkSectionsSchema, classFormSchema, idsSchema, parseSectionNames } from "@/features/classes/schemas"
import { OPEN_ENROLLMENT_STATUSES } from "@/features/students/constants"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import type { EnrollmentStatus } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import { toDate } from "@/lib/validation"
import {
  CLASS_WRITE_ERRORS,
  guardWrite,
  saveAcademicClassInTx,
  saveSection,
} from "@/services/academics/structure-service"
import { audit } from "@/services/audit/audit-service"

// Classes and sections as day-to-day records: reading a class with its
// sections, students and teachers for a year, its history across years, and
// creating, editing, archiving and restoring classes and sections.
//
// Classes and sections are reusable definitions (Grade 8, Section A); which
// academic year something happened in is recorded on each enrollment and
// teaching assignment. A class "runs" in a year when students are enrolled.
type Ctx = Pick<AuthContext, "organization" | "user">

function fieldError(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

const openStatuses = [...OPEN_ENROLLMENT_STATUSES]
const today = () => toDate(new Date().toISOString().slice(0, 10))

// --------------------------------------------------------------- reading

// The organisation's academic years and the one a classes page shows: the
// requested one if it is ours, else the current year, else the most recent.
export async function resolveAcademicYear(ctx: Pick<AuthContext, "organization">, requested?: string | null) {
  const years = await prisma.academicYear.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, isCurrent: true, status: true, startDate: true },
  })
  const yearId =
    years.find((y) => y.id === requested)?.id ?? years.find((y) => y.isCurrent)?.id ?? years[0]?.id ?? null
  return {
    years: years.map((y) => ({ ...y, startDate: y.startDate.toISOString().slice(0, 10) })),
    yearId,
  }
}

export type AcademicYearOption = Awaited<ReturnType<typeof resolveAcademicYear>>["years"][number]

// One class in one year: its sections (archived ones included, flagged),
// open enrollments (when the caller may see students) and active teaching
// assignments. Section pages use the same data narrowed to one section.
export async function getClassDetail(
  ctx: Pick<AuthContext, "organization">,
  classId: string,
  yearId: string | null,
  { includeStudents }: { includeStudents: boolean }
) {
  const organizationId = ctx.organization.id
  const academicClass = await prisma.academicClass.findFirst({
    where: { id: classId, organizationId },
    select: {
      id: true, name: true, localName: true, code: true, description: true, kind: true, sequence: true,
      capacity: true, isActive: true, archivedAt: true, educationLevelId: true, programId: true, createdAt: true,
      educationLevel: { select: { id: true, name: true } },
      program: { select: { id: true, name: true, code: true } },
      sections: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true, name: true, code: true, description: true, capacity: true, shift: true, medium: true,
          room: true, isActive: true, archivedAt: true, sortOrder: true, classId: true,
        },
      },
    },
  })
  if (!academicClass) return null

  const [enrollments, assignments] = yearId
    ? await Promise.all([
        includeStudents
          ? prisma.enrollment.findMany({
              where: {
                organizationId, classId, academicYearId: yearId, status: { in: openStatuses },
                student: { archivedAt: null },
              },
              select: {
                id: true, sectionId: true, rollNumber: true, status: true, enrollmentDate: true, enrollmentType: true,
                student: {
                  select: {
                    id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true,
                    gender: true, phone: true,
                  },
                },
              },
            })
          : Promise.resolve([]),
        prisma.teacherAssignment.findMany({
          where: { organizationId, classId, academicYearId: yearId, status: "ACTIVE" },
          orderBy: [{ role: "asc" }, { startDate: "asc" }],
          select: {
            id: true, role: true, sectionId: true, startDate: true, weeklyPeriods: true,
            subject: { select: { id: true, name: true, code: true } },
            teacher: { select: { id: true, firstName: true, middleName: true, lastName: true, phone: true, employeeId: true } },
          },
        }),
      ])
    : [[], []]

  return {
    academicClass: { ...academicClass, createdAt: academicClass.createdAt.toISOString() },
    enrollments: enrollments.map((e) => ({ ...e, enrollmentDate: e.enrollmentDate.toISOString().slice(0, 10) })),
    assignments: assignments.map((a) => ({ ...a, startDate: a.startDate.toISOString().slice(0, 10) })),
  }
}

export type ClassDetailData = NonNullable<Awaited<ReturnType<typeof getClassDetail>>>

// Every academic year the class has run: enrollments by outcome and who the
// class teachers were. Nothing here is ever rewritten, so it is the class's
// complete history.
export async function getClassHistory(ctx: Pick<AuthContext, "organization">, classId: string) {
  const organizationId = ctx.organization.id
  const [counts, teachers, years] = await Promise.all([
    prisma.enrollment.groupBy({
      by: ["academicYearId", "status"],
      where: { organizationId, classId },
      _count: { _all: true },
    }),
    prisma.teacherAssignment.findMany({
      where: { organizationId, classId, role: "CLASS_TEACHER", status: { not: "CANCELLED" } },
      orderBy: { startDate: "asc" },
      select: {
        academicYearId: true, status: true, startDate: true, endDate: true,
        section: { select: { name: true } },
        teacher: { select: { firstName: true, middleName: true, lastName: true } },
      },
    }),
    prisma.academicYear.findMany({
      where: { organizationId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, isCurrent: true },
    }),
  ])
  return years
    .map((year) => {
      const byStatus = Object.fromEntries(
        counts.filter((c) => c.academicYearId === year.id).map((c) => [c.status, c._count._all])
      ) as Partial<Record<EnrollmentStatus, number>>
      return {
        ...year,
        byStatus,
        total: Object.values(byStatus).reduce((n, c) => n + (c ?? 0), 0),
        classTeachers: teachers
          .filter((t) => t.academicYearId === year.id)
          .map((t) => ({
            ...t,
            startDate: t.startDate.toISOString().slice(0, 10),
            endDate: t.endDate?.toISOString().slice(0, 10) ?? null,
          })),
      }
    })
    .filter((y) => y.total > 0 || y.classTeachers.length > 0)
}

export type ClassHistory = Awaited<ReturnType<typeof getClassHistory>>

// Teachers who can receive new assignments (active or on leave).
export async function listAssignableTeachers(ctx: Pick<AuthContext, "organization">) {
  return prisma.teacher.findMany({
    where: { organizationId: ctx.organization.id, archivedAt: null, employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true },
  })
}

// Active students with no open placement in the year, for "enroll students".
export async function searchEnrollableStudents(ctx: Pick<AuthContext, "organization">, yearId: string, query: string) {
  const q = query.trim().slice(0, 100)
  const words = q.split(/\s+/).filter(Boolean).slice(0, 4)
  const students = await prisma.student.findMany({
    where: {
      organizationId: ctx.organization.id,
      archivedAt: null,
      status: "ACTIVE",
      enrollments: { none: { academicYearId: yearId, status: { in: openStatuses } } },
      AND: words.map((w) => ({
        OR: [
          { firstName: { contains: w, mode: "insensitive" as const } },
          { lastName: { contains: w, mode: "insensitive" as const } },
          { admissionNumber: { contains: w, mode: "insensitive" as const } },
        ],
      })),
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 25,
    select: {
      id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true, gender: true,
      enrollments: {
        orderBy: { enrollmentDate: "desc" },
        take: 1,
        select: { status: true, class: { select: { name: true } }, academicYear: { select: { name: true } } },
      },
    },
  })
  return students.map(({ enrollments, ...s }) => ({
    ...s,
    lastPlacement: enrollments[0]
      ? `${enrollments[0].class.name}, ${enrollments[0].academicYear.name} (${enrollments[0].status.toLowerCase()})`
      : null,
  }))
}

export type EnrollableStudent = Awaited<ReturnType<typeof searchEnrollableStudents>>[number]

// ----------------------------------------------------------------- classes

// Creates or edits a class; on create, also its first sections (A, B, …).
export async function saveClass(ctx: Ctx, id: string | null, raw: unknown) {
  const { sections, sectionCapacity, ...input } = classFormSchema.parse(raw)
  const names = id ? [] : parseSectionNames(sections ?? "")
  const organizationId = ctx.organization.id

  return guardWrite(
    () =>
      prisma.$transaction(async (tx) => {
        const saved = await saveAcademicClassInTx(tx, ctx, id, input)
        if (names.length) {
          await tx.section.createMany({
            data: names.map((name, i) => ({
              organizationId, classId: saved.id, name, capacity: sectionCapacity, sortOrder: i * 10,
            })),
          })
          await audit(tx, ctx, {
            action: "section.generate", entityType: "class", entityId: saved.id,
            summary: `Added sections ${names.join(", ")} to ${saved.name}`,
          })
        }
        return { id: saved.id }
      }),
    CLASS_WRITE_ERRORS
  )
}

export type BulkResult = { succeeded: number; failed: { id: string; name: string; reason: string }[] }

// Archiving hides a class from day-to-day lists and new placements while
// keeping every enrollment. A class with students still placed in it (in any
// year) can't be archived; its active teaching assignments are ended.
export async function setClassesArchived(ctx: Ctx, rawIds: unknown, archived: boolean): Promise<BulkResult> {
  const ids = idsSchema.parse(rawIds)
  const organizationId = ctx.organization.id
  const classes = await prisma.academicClass.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true, name: true, archivedAt: true },
  })
  const result: BulkResult = { succeeded: 0, failed: [] }

  for (const id of ids) {
    const c = classes.find((x) => x.id === id)
    if (!c) {
      result.failed.push({ id, name: "Unknown class", reason: "Not found." })
      continue
    }
    if (archived === (c.archivedAt !== null)) {
      result.failed.push({ id, name: c.name, reason: archived ? "Already archived." : "Not archived." })
      continue
    }
    if (archived) {
      const open = await prisma.enrollment.count({ where: { organizationId, classId: id, status: { in: openStatuses } } })
      if (open > 0) {
        result.failed.push({
          id, name: c.name,
          reason: `${open} student${open === 1 ? " is" : "s are"} still placed here. Promote, move or close their enrollments first.`,
        })
        continue
      }
    }
    await prisma.$transaction(async (tx) => {
      let ended = 0
      if (archived) {
        ended = (
          await tx.teacherAssignment.updateMany({
            where: { organizationId, classId: id, status: "ACTIVE" },
            data: { status: "ENDED", endDate: today(), endReason: "Class archived" },
          })
        ).count
      }
      await tx.academicClass.update({
        where: { id },
        data: archived ? { archivedAt: new Date(), isActive: false } : { archivedAt: null, isActive: true },
      })
      await audit(tx, ctx, {
        action: archived ? "class.archive" : "class.restore", entityType: "class", entityId: id,
        summary: `${archived ? "Archived" : "Restored"} class ${c.name}${ended ? ` (ended ${ended} teaching assignments)` : ""}`,
      })
    })
    result.succeeded++
  }
  return result
}

// ---------------------------------------------------------------- sections

// Creates or edits a section (same rules as the education structure page).
export async function saveClassSection(ctx: Ctx, id: string | null, raw: unknown) {
  const section = await saveSection(ctx, id, raw)
  return { id: section.id }
}

// A section with students still placed in it can't be archived (move them
// first); its active teaching assignments are ended, keeping their history.
export async function setSectionArchived(ctx: Ctx, sectionId: string, archived: boolean) {
  const organizationId = ctx.organization.id
  const section = await prisma.section.findFirst({
    where: { id: sectionId, organizationId },
    select: { id: true, name: true, archivedAt: true, class: { select: { name: true, archivedAt: true } } },
  })
  if (!section) throw new NotFoundError("Section not found.")
  if (archived === (section.archivedAt !== null)) {
    throw new ConflictError(archived ? "This section is already archived." : "This section isn't archived.")
  }
  if (archived) {
    const open = await prisma.enrollment.count({ where: { organizationId, sectionId, status: { in: openStatuses } } })
    if (open > 0) {
      throw new ConflictError(
        `${open} student${open === 1 ? " is" : "s are"} still placed in section ${section.name}. Move them to another section first.`
      )
    }
  } else if (section.class.archivedAt) {
    throw new ConflictError(`Restore ${section.class.name} first.`)
  }

  await prisma.$transaction(async (tx) => {
    if (archived) {
      await tx.teacherAssignment.updateMany({
        where: { organizationId, sectionId, status: "ACTIVE" },
        data: { status: "ENDED", endDate: today(), endReason: "Section archived" },
      })
    }
    await tx.section.update({
      where: { id: sectionId },
      data: archived ? { archivedAt: new Date(), isActive: false } : { archivedAt: null, isActive: true },
    })
    await audit(tx, ctx, {
      action: archived ? "section.archive" : "section.restore", entityType: "section", entityId: sectionId,
      summary: `${archived ? "Archived" : "Restored"} section ${section.name} of ${section.class.name}`,
    })
  })
}

// Adds the same set of sections to every active class of a level (or one
// program of it). Names a class already has (archived ones too) are skipped.
export async function bulkCreateSections(ctx: Ctx, raw: unknown) {
  const input = bulkSectionsSchema.parse(raw)
  const names = parseSectionNames(input.names)
  const organizationId = ctx.organization.id

  return prisma.$transaction(async (tx) => {
    const level = await tx.educationLevel.findFirst({ where: { id: input.educationLevelId, organizationId } })
    if (!level) fieldError("educationLevelId", "Choose a valid education level.")
    if (input.programId) {
      const program = await tx.program.findFirst({ where: { id: input.programId, organizationId } })
      if (!program || program.educationLevelId !== level.id) fieldError("programId", "Choose a program of this level.")
    }

    const classes = await tx.academicClass.findMany({
      where: {
        organizationId,
        educationLevelId: level.id,
        isActive: true,
        archivedAt: null,
        ...(input.programId ? { programId: input.programId } : {}),
      },
      select: { id: true, sections: { select: { name: true, sortOrder: true } } },
    })
    if (classes.length === 0) fieldError("educationLevelId", "There are no active classes here yet.")

    const data = classes.flatMap((c) => {
      const taken = new Set(c.sections.map((s) => s.name.toLowerCase()))
      const start = c.sections.reduce((max, s) => Math.max(max, s.sortOrder), -10) + 10
      return names
        .filter((name) => !taken.has(name.toLowerCase()))
        .map((name, i) => ({
          organizationId,
          classId: c.id,
          name,
          capacity: input.capacity,
          shift: input.shift,
          medium: input.medium,
          sortOrder: start + i * 10,
        }))
    })
    await tx.section.createMany({ data, skipDuplicates: true })
    await audit(tx, ctx, {
      action: "section.generate", entityType: "section",
      summary: `Added ${data.length} sections (${names.join(", ")}) across ${classes.length} classes of ${level.name}`,
    })
    return { created: data.length, classes: classes.length }
  })
}
