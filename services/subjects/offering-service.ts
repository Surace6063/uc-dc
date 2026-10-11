import "server-only"

import { subjectFitsClass } from "@/features/subjects/constants"
import {
  addOfferingsSchema,
  copyOfferingsSchema,
  electiveGroupSchema,
  offeringSchema,
  offeringTeacherSchema,
} from "@/features/subjects/schemas"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { prisma, type TransactionClient } from "@/lib/prisma"
import { isUniqueViolation } from "@/lib/prisma-errors"
import { toDate } from "@/lib/validation"
import { audit } from "@/services/audit/audit-service"
import { addAssignment } from "@/services/teachers/assignment-service"

// Subject offerings: which subjects a class studies in an academic year, as
// what (compulsory, elective, …), with which curriculum version and, when
// not every section takes them, in which sections. Teachers are ordinary
// teaching assignments for (year, class, section, subject). Past years'
// offerings are never changed by later years' configuration.
type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">
type Db = TransactionClient | typeof prisma

function fieldError(field: string, message: string): never {
  throw new ValidationError({ [field]: [message] })
}

const today = () => toDate(new Date().toISOString().slice(0, 10))

async function requireWritableYear(db: Db, ctx: Ctx, id: string, field = "academicYearId") {
  const year = await db.academicYear.findFirst({ where: { id, organizationId: ctx.organization.id } })
  if (!year) fieldError(field, "Choose a valid academic year.")
  if (year.status === "ARCHIVED" || year.status === "COMPLETED") {
    throw new ConflictError(`${year.name} is ${year.status.toLowerCase()}; its subjects are kept as history and can't change.`)
  }
  return year
}

async function requireClass(db: Db, ctx: Ctx, id: string) {
  const academicClass = await db.academicClass.findFirst({
    where: { id, organizationId: ctx.organization.id },
    select: { id: true, name: true, educationLevelId: true, programId: true, isActive: true, archivedAt: true },
  })
  if (!academicClass) fieldError("classId", "Choose a valid class.")
  return academicClass
}

async function findOffering(db: Db, ctx: Ctx, id: string) {
  const offering = await db.subjectOffering.findFirst({
    where: { id, organizationId: ctx.organization.id },
    include: {
      subject: { select: { id: true, name: true, code: true, isActive: true } },
      class: { select: { id: true, name: true } },
      academicYear: { select: { id: true, name: true, status: true } },
      sections: { select: { sectionId: true } },
    },
  })
  if (!offering) throw new NotFoundError("Subject offering not found.")
  return offering
}

// The active curriculum that suits a class best: one for its program, then
// its level, then a general one.
async function defaultCurriculumId(
  db: Db,
  organizationId: string,
  subjectId: string,
  academicClass: { educationLevelId: string; programId: string | null }
) {
  const candidates = await db.curriculum.findMany({
    where: { organizationId, subjectId, status: "ACTIVE" },
    select: { id: true, educationLevelId: true, programId: true },
    orderBy: { effectiveFrom: "desc" },
  })
  const fits = candidates.filter(
    (c) =>
      (!c.programId || c.programId === academicClass.programId) &&
      (!c.educationLevelId || c.educationLevelId === academicClass.educationLevelId)
  )
  return (fits.find((c) => c.programId) ?? fits.find((c) => c.educationLevelId) ?? fits[0])?.id ?? null
}

// --------------------------------------------------------------- reading

// One class in one year: its offerings with sections and teachers, its
// elective groups, and what can still be added.
export async function getClassSubjects(ctx: Pick<AuthContext, "organization">, yearId: string, classId: string) {
  const organizationId = ctx.organization.id
  const academicClass = await prisma.academicClass.findFirst({
    where: { id: classId, organizationId },
    select: {
      id: true, name: true, localName: true, educationLevelId: true, programId: true, isActive: true, archivedAt: true,
      educationLevel: { select: { name: true } },
      program: { select: { name: true, code: true } },
      sections: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, isActive: true },
      },
    },
  })
  if (!academicClass) return null

  const [offerings, groups, assignments, subjects, curricula, otherYears] = await Promise.all([
    prisma.subjectOffering.findMany({
      where: { organizationId, academicYearId: yearId, classId },
      orderBy: [{ requirement: "asc" }, { subject: { sortOrder: "asc" } }, { subject: { name: "asc" } }],
      select: {
        id: true, requirement: true, creditHours: true, weeklyPeriods: true, code: true, status: true, notes: true,
        curriculumId: true, electiveGroupId: true,
        subject: { select: { id: true, name: true, code: true, creditHours: true, weeklyPeriods: true, localName: true } },
        curriculum: { select: { id: true, name: true, version: true, status: true } },
        sections: { select: { sectionId: true } },
      },
    }),
    prisma.electiveGroup.findMany({
      where: { organizationId, academicYearId: yearId, classId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, minChoices: true, maxChoices: true },
    }),
    prisma.teacherAssignment.findMany({
      where: { organizationId, academicYearId: yearId, classId, status: "ACTIVE", subjectId: { not: null } },
      orderBy: { startDate: "asc" },
      select: {
        id: true, subjectId: true, sectionId: true, role: true, weeklyPeriods: true, startDate: true,
        teacher: { select: { id: true, firstName: true, middleName: true, lastName: true } },
      },
    }),
    prisma.subject.findMany({
      where: { organizationId, archivedAt: null, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, code: true, educationLevelId: true, programId: true, requirement: true, creditHours: true,
        category: { select: { name: true } },
      },
    }),
    prisma.curriculum.findMany({
      where: { organizationId, status: { in: ["ACTIVE", "RETIRED"] } },
      select: { id: true, subjectId: true, name: true, version: true, status: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    // Years in which this class had offerings (for "copy from").
    prisma.subjectOffering.groupBy({
      by: ["academicYearId"],
      where: { organizationId, classId, academicYearId: { not: yearId } },
      _count: { _all: true },
    }),
  ])

  return {
    academicClass,
    offerings,
    groups,
    assignments: assignments.map((a) => ({ ...a, startDate: a.startDate.toISOString().slice(0, 10) })),
    // Subjects that fit this class and aren't offered yet.
    available: subjects.filter((s) => subjectFitsClass(s, academicClass) && !offerings.some((o) => o.subject.id === s.id)),
    curricula,
    copyFrom: otherYears.map((y) => ({ yearId: y.academicYearId, count: y._count._all })),
  }
}

export type ClassSubjects = NonNullable<Awaited<ReturnType<typeof getClassSubjects>>>

// Weekly periods each teacher already teaches in a year (workload).
export async function teacherWorkload(ctx: Pick<AuthContext, "organization">, yearId: string) {
  const rows = await prisma.teacherAssignment.groupBy({
    by: ["teacherId"],
    where: { organizationId: ctx.organization.id, academicYearId: yearId, status: "ACTIVE" },
    _sum: { weeklyPeriods: true },
    _count: { _all: true },
  })
  return Object.fromEntries(rows.map((r) => [r.teacherId, { periods: r._sum.weeklyPeriods ?? 0, assignments: r._count._all }]))
}

// ------------------------------------------------------------- offerings

// Adds subjects to a class for a year with the subject's defaults. Subjects
// tied to another level or program are refused; already-offered ones skipped.
export async function addOfferings(ctx: Ctx, raw: unknown) {
  const input = addOfferingsSchema.parse(raw)
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const year = await requireWritableYear(tx, ctx, input.academicYearId)
    const academicClass = await requireClass(tx, ctx, input.classId)
    if (!academicClass.isActive || academicClass.archivedAt) fieldError("classId", "This class is inactive or archived.")
    const subjects = await tx.subject.findMany({ where: { id: { in: input.subjectIds }, organizationId } })
    if (subjects.length !== new Set(input.subjectIds).size) fieldError("subjectIds", "Choose valid subjects.")
    for (const s of subjects) {
      if (!s.isActive || s.archivedAt) fieldError("subjectIds", `${s.name} is inactive or archived.`)
      if (!subjectFitsClass(s, academicClass)) fieldError("subjectIds", `${s.name} belongs to another level or program.`)
    }
    const existing = new Set(
      (
        await tx.subjectOffering.findMany({
          where: { academicYearId: year.id, classId: academicClass.id, subjectId: { in: input.subjectIds } },
          select: { subjectId: true },
        })
      ).map((o) => o.subjectId)
    )
    let created = 0
    for (const s of subjects.filter((x) => !existing.has(x.id))) {
      await tx.subjectOffering.create({
        data: {
          organizationId, subjectId: s.id, academicYearId: year.id, classId: academicClass.id,
          requirement: s.requirement,
          curriculumId: await defaultCurriculumId(tx, organizationId, s.id, academicClass),
        },
      })
      created++
    }
    await audit(tx, ctx, {
      action: "subject_offering.create", entityType: "class", entityId: academicClass.id,
      summary: `Added ${created} subject${created === 1 ? "" : "s"} to ${academicClass.name} for ${year.name}`,
      metadata: { subjectIds: subjects.map((s) => s.id) },
    })
    return { created, skipped: subjects.length - created }
  })
}

export async function updateOffering(ctx: Ctx, id: string, raw: unknown) {
  const input = offeringSchema.parse(raw)
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const offering = await findOffering(tx, ctx, id)
    await requireWritableYear(tx, ctx, offering.academicYear.id)
    if (input.curriculumId) {
      const curriculum = await tx.curriculum.findFirst({
        where: { id: input.curriculumId, organizationId, subjectId: offering.subjectId },
      })
      if (!curriculum) fieldError("curriculumId", "Choose a curriculum of this subject.")
      if (curriculum.status === "DRAFT") fieldError("curriculumId", "Activate the curriculum before using it.")
    }
    if (input.electiveGroupId) {
      const group = await tx.electiveGroup.findFirst({
        where: { id: input.electiveGroupId, organizationId, academicYearId: offering.academicYearId, classId: offering.classId },
      })
      if (!group) fieldError("electiveGroupId", "Choose an elective group of this class and year.")
    }
    const sectionIds = [...new Set(input.sectionIds)]
    if (sectionIds.length) {
      const sections = await tx.section.findMany({
        where: { id: { in: sectionIds }, organizationId, classId: offering.classId, archivedAt: null },
        select: { id: true },
      })
      if (sections.length !== sectionIds.length) fieldError("sectionIds", "Choose sections of this class.")
      // Teachers already placed in a section that is being removed would be orphaned.
      const orphaned = await tx.teacherAssignment.count({
        where: {
          organizationId, academicYearId: offering.academicYearId, classId: offering.classId,
          subjectId: offering.subjectId, status: "ACTIVE", sectionId: { not: null, notIn: sectionIds },
        },
      })
      if (orphaned) fieldError("sectionIds", "Teachers are assigned to a section you removed. End those assignments first.")
    }

    const updated = await tx.subjectOffering.update({
      where: { id },
      data: {
        requirement: input.requirement, creditHours: input.creditHours, weeklyPeriods: input.weeklyPeriods,
        curriculumId: input.curriculumId, electiveGroupId: input.electiveGroupId, code: input.code,
        notes: input.notes, status: input.status,
      },
    })
    await tx.subjectOfferingSection.deleteMany({ where: { offeringId: id } })
    if (sectionIds.length) {
      await tx.subjectOfferingSection.createMany({
        data: sectionIds.map((sectionId) => ({ offeringId: id, sectionId, classId: offering.classId, organizationId })),
      })
    }
    if (input.status === "DISCONTINUED" && offering.status === "ACTIVE") {
      await endOfferingAssignments(tx, ctx, offering, "Subject discontinued for this class")
    }
    await audit(tx, ctx, {
      action: "subject_offering.update", entityType: "subject", entityId: offering.subjectId,
      summary: `Updated ${offering.subject.name} in ${offering.class.name} (${offering.academicYear.name})`,
      metadata: {
        offeringId: id,
        before: {
          requirement: offering.requirement, creditHours: offering.creditHours, weeklyPeriods: offering.weeklyPeriods,
          curriculumId: offering.curriculumId, status: offering.status, sectionIds: offering.sections.map((s) => s.sectionId),
        },
      },
    })
    return updated
  })
}

async function endOfferingAssignments(
  tx: TransactionClient,
  ctx: Ctx,
  offering: { academicYearId: string; classId: string; subjectId: string },
  reason: string
) {
  return (
    await tx.teacherAssignment.updateMany({
      where: {
        organizationId: ctx.organization.id, academicYearId: offering.academicYearId, classId: offering.classId,
        subjectId: offering.subjectId, status: "ACTIVE",
      },
      data: { status: "ENDED", endDate: today(), endReason: reason },
    })
  ).count
}

// Removes an offering added by mistake; one that already had teachers is
// discontinued instead, so its history stays.
export async function removeOffering(ctx: Ctx, id: string) {
  return prisma.$transaction(async (tx) => {
    const offering = await findOffering(tx, ctx, id)
    await requireWritableYear(tx, ctx, offering.academicYear.id)
    const taught = await tx.teacherAssignment.count({
      where: {
        organizationId: ctx.organization.id, academicYearId: offering.academicYearId,
        classId: offering.classId, subjectId: offering.subjectId,
      },
    })
    const where = `${offering.subject.name} in ${offering.class.name} (${offering.academicYear.name})`
    if (taught) {
      await tx.subjectOffering.update({ where: { id }, data: { status: "DISCONTINUED" } })
      const ended = await endOfferingAssignments(tx, ctx, offering, "Subject discontinued for this class")
      await audit(tx, ctx, {
        action: "subject_offering.discontinue", entityType: "subject", entityId: offering.subjectId,
        summary: `Discontinued ${where}${ended ? `; ended ${ended} teaching assignments` : ""}`, metadata: { offeringId: id },
      })
      return { removed: false }
    }
    await tx.subjectOffering.delete({ where: { id } })
    await audit(tx, ctx, {
      action: "subject_offering.delete", entityType: "subject", entityId: offering.subjectId,
      summary: `Removed ${where}`, metadata: { offeringId: id },
    })
    return { removed: true }
  })
}

// Copies a class's subjects from one year to another (e.g. 2082/83 → 2083/84):
// requirement, credits, periods, sections and elective groups. Curricula are
// kept if still active, otherwise the current default is used. Subjects that
// are now archived or already offered are skipped.
export async function copyOfferings(ctx: Ctx, raw: unknown) {
  const input = copyOfferingsSchema.parse(raw)
  if (input.fromYearId === input.toYearId) fieldError("fromYearId", "Choose a different year to copy from.")
  const organizationId = ctx.organization.id
  return prisma.$transaction(async (tx) => {
    const from = await tx.academicYear.findFirst({ where: { id: input.fromYearId, organizationId } })
    if (!from) fieldError("fromYearId", "Choose a valid academic year.")
    const to = await requireWritableYear(tx, ctx, input.toYearId, "toYearId")
    const academicClass = await requireClass(tx, ctx, input.classId)
    if (!academicClass.isActive || academicClass.archivedAt) fieldError("classId", "This class is inactive or archived.")

    const [source, groups, existing] = await Promise.all([
      tx.subjectOffering.findMany({
        where: { organizationId, academicYearId: from.id, classId: academicClass.id, status: "ACTIVE" },
        include: {
          subject: { select: { isActive: true, archivedAt: true } },
          curriculum: { select: { status: true } },
          electiveGroup: true,
          sections: { include: { section: { select: { archivedAt: true } } } },
        },
      }),
      tx.electiveGroup.findMany({ where: { organizationId, academicYearId: to.id, classId: academicClass.id } }),
      tx.subjectOffering.findMany({ where: { academicYearId: to.id, classId: academicClass.id }, select: { subjectId: true } }),
    ])
    const taken = new Set(existing.map((o) => o.subjectId))
    const groupIds = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]))
    let created = 0
    for (const o of source) {
      if (taken.has(o.subjectId) || !o.subject.isActive || o.subject.archivedAt) continue
      let electiveGroupId: string | null = null
      if (o.electiveGroup) {
        const key = o.electiveGroup.name.toLowerCase()
        electiveGroupId =
          groupIds.get(key) ??
          (
            await tx.electiveGroup.create({
              data: {
                organizationId, academicYearId: to.id, classId: academicClass.id, name: o.electiveGroup.name,
                description: o.electiveGroup.description, minChoices: o.electiveGroup.minChoices, maxChoices: o.electiveGroup.maxChoices,
              },
            })
          ).id
        groupIds.set(key, electiveGroupId)
      }
      const copy = await tx.subjectOffering.create({
        data: {
          organizationId, subjectId: o.subjectId, academicYearId: to.id, classId: academicClass.id,
          requirement: o.requirement, creditHours: o.creditHours, weeklyPeriods: o.weeklyPeriods, code: o.code, notes: o.notes,
          electiveGroupId,
          curriculumId:
            o.curriculumId && o.curriculum?.status === "ACTIVE"
              ? o.curriculumId
              : await defaultCurriculumId(tx, organizationId, o.subjectId, academicClass),
        },
      })
      const sections = o.sections.filter((s) => !s.section.archivedAt)
      if (sections.length) {
        await tx.subjectOfferingSection.createMany({
          data: sections.map((s) => ({ offeringId: copy.id, sectionId: s.sectionId, classId: academicClass.id, organizationId })),
        })
      }
      created++
    }
    await audit(tx, ctx, {
      action: "subject_offering.copy", entityType: "class", entityId: academicClass.id,
      summary: `Copied ${created} subjects of ${academicClass.name} from ${from.name} to ${to.name}`,
    })
    return { created, skipped: source.length - created }
  })
}

// ------------------------------------------------------- elective groups

export async function saveElectiveGroup(ctx: Ctx, id: string | null, raw: unknown) {
  const input = electiveGroupSchema.parse(raw)
  const organizationId = ctx.organization.id
  try {
    return await prisma.$transaction(async (tx) => {
      await requireWritableYear(tx, ctx, input.academicYearId)
      const academicClass = await requireClass(tx, ctx, input.classId)
      if (id) {
        const group = await tx.electiveGroup.findFirst({ where: { id, organizationId } })
        if (!group) throw new NotFoundError("Elective group not found.")
        if (group.academicYearId !== input.academicYearId || group.classId !== input.classId) {
          fieldError("name", "An elective group can't move to another class or year.")
        }
        return tx.electiveGroup.update({ where: { id }, data: input })
      }
      const group = await tx.electiveGroup.create({ data: { ...input, organizationId } })
      await audit(tx, ctx, {
        action: "elective_group.create", entityType: "class", entityId: academicClass.id,
        summary: `Created elective group ${group.name} for ${academicClass.name}`,
      })
      return group
    })
  } catch (error) {
    if (isUniqueViolation(error)) fieldError("name", "This class already has an elective group with this name this year.")
    throw error
  }
}

export async function deleteElectiveGroup(ctx: Ctx, id: string) {
  return prisma.$transaction(async (tx) => {
    const group = await tx.electiveGroup.findFirst({ where: { id, organizationId: ctx.organization.id } })
    if (!group) throw new NotFoundError("Elective group not found.")
    await requireWritableYear(tx, ctx, group.academicYearId)
    await tx.subjectOffering.updateMany({ where: { electiveGroupId: id }, data: { electiveGroupId: null } })
    await tx.electiveGroup.delete({ where: { id } })
  })
}

// ------------------------------------------------------------- teachers

// Assigns a teacher to an offering (whole class or one section). Recorded as
// a teaching assignment through the teacher module, which checks the
// teacher, duplicates and department rules.
export async function assignOfferingTeacher(ctx: Ctx, raw: unknown) {
  const input = offeringTeacherSchema.parse(raw)
  const offering = await findOffering(prisma, ctx, input.offeringId)
  await requireWritableYear(prisma, ctx, offering.academicYear.id)
  if (offering.status !== "ACTIVE") throw new ConflictError("This subject is discontinued for the class.")
  if (input.sectionId) {
    const section = await prisma.section.findFirst({
      where: { id: input.sectionId, organizationId: ctx.organization.id, classId: offering.classId, archivedAt: null },
    })
    if (!section) fieldError("sectionId", "Choose a section of this class.")
    if (offering.sections.length && !offering.sections.some((s) => s.sectionId === input.sectionId)) {
      fieldError("sectionId", "This subject isn't taught in that section.")
    }
  }
  return addAssignment(ctx, input.teacherId, {
    academicYearId: offering.academicYearId,
    classId: offering.classId,
    sectionId: input.sectionId,
    subjectId: offering.subjectId,
    role: input.role,
    startDate: input.startDate,
    weeklyPeriods: input.weeklyPeriods ?? offering.weeklyPeriods,
  })
}

// Whether a subject is offered (actively) to a class in a year: the class
// page only assigns subject teachers for offered subjects.
export async function findActiveOffering(
  db: Db,
  organizationId: string,
  where: { academicYearId: string; classId: string; subjectId: string }
) {
  return db.subjectOffering.findFirst({
    where: { organizationId, ...where, status: "ACTIVE" },
    include: { sections: { select: { sectionId: true } } },
  })
}

// Subjects a class studies in a year (for teacher pickers on class pages).
export async function listOfferedSubjects(ctx: Pick<AuthContext, "organization">, yearId: string | null, classId: string) {
  if (!yearId) return []
  const offerings = await prisma.subjectOffering.findMany({
    where: { organizationId: ctx.organization.id, academicYearId: yearId, classId, status: "ACTIVE" },
    orderBy: { subject: { name: "asc" } },
    select: { subject: { select: { id: true, name: true, code: true } } },
  })
  return offerings.map((o) => o.subject)
}

// Per class in a year: active offerings and how many have no teacher yet.
export async function classOfferingCounts(ctx: Pick<AuthContext, "organization">, yearId: string | null) {
  if (!yearId) return {}
  const rows = await prisma.$queryRaw<{ class_id: string; offerings: number; without_teacher: number }[]>`
    SELECT o.class_id,
           count(*)::int AS offerings,
           count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM teacher_assignments a
             WHERE a.organization_id = o.organization_id AND a.academic_year_id = o.academic_year_id
               AND a.class_id = o.class_id AND a.subject_id = o.subject_id AND a.status = 'ACTIVE'
           ))::int AS without_teacher
    FROM subject_offerings o
    WHERE o.organization_id = ${ctx.organization.id}::uuid
      AND o.academic_year_id = ${yearId}::uuid
      AND o.status = 'ACTIVE'
    GROUP BY o.class_id`
  return Object.fromEntries(rows.map((r) => [r.class_id, { offerings: r.offerings, withoutTeacher: r.without_teacher }]))
}
