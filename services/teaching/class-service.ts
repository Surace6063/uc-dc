import "server-only"

import { teaches } from "@/features/teaching/access"
import { NotFoundError } from "@/lib/authorization/errors"
import { prisma } from "@/lib/prisma"
import { myTeacher, overseesTeaching, teachingAssignments, type Ctx } from "@/services/teaching/scope-service"

// The signed-in teacher's classes and subjects for a year, from their
// active teaching assignments, and the class rosters they may see.

const COUNTED = ["ACTIVE", "ON_HOLD"] as const

async function myAssignmentRows(ctx: Ctx, academicYearId: string) {
  const teacher = await myTeacher(ctx)
  if (!teacher) return []
  return prisma.teacherAssignment.findMany({
    where: { organizationId: ctx.organization.id, teacherId: teacher.id, academicYearId, status: "ACTIVE", classId: { not: null } },
    orderBy: [{ class: { sequence: "asc" } }, { class: { name: "asc" } }],
    select: {
      id: true, role: true, weeklyPeriods: true, startDate: true, classId: true, sectionId: true, subjectId: true,
      class: { select: { id: true, name: true, program: { select: { code: true } } } },
      section: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
    },
  })
}

// One row per class/section: the subjects taught there, whether the teacher
// is its class teacher, and how many students are enrolled.
export async function myClasses(ctx: Ctx, academicYearId: string | null) {
  if (!academicYearId) return []
  const rows = await myAssignmentRows(ctx, academicYearId)
  const groups = new Map<string, {
    key: string; classId: string; className: string; programCode: string | null; sectionId: string | null; sectionName: string | null
    classTeacher: boolean; subjects: { id: string; name: string; code: string }[]; weeklyPeriods: number
  }>()
  for (const r of rows) {
    const key = `${r.classId}:${r.sectionId ?? ""}`
    const g = groups.get(key) ?? {
      key, classId: r.class!.id, className: r.class!.name, programCode: r.class!.program?.code ?? null,
      sectionId: r.section?.id ?? null, sectionName: r.section?.name ?? null, classTeacher: false, subjects: [], weeklyPeriods: 0,
    }
    if (r.role === "CLASS_TEACHER") g.classTeacher = true
    if (r.subject && !g.subjects.some((s) => s.id === r.subject!.id)) g.subjects.push(r.subject)
    g.weeklyPeriods += r.weeklyPeriods ?? 0
    groups.set(key, g)
  }
  const list = [...groups.values()]
  const counts = await prisma.enrollment.groupBy({
    by: ["classId", "sectionId"],
    where: { organizationId: ctx.organization.id, academicYearId, status: { in: [...COUNTED] }, classId: { in: [...new Set(list.map((g) => g.classId))] } },
    _count: { _all: true },
  })
  return list.map((g) => ({
    ...g,
    // A whole-class assignment counts every section's students.
    students: counts
      .filter((c) => c.classId === g.classId && (g.sectionId === null || c.sectionId === g.sectionId))
      .reduce((n, c) => n + c._count._all, 0),
  }))
}

export type MyClass = Awaited<ReturnType<typeof myClasses>>[number]

// One row per subject taught, with the offering's details for that class.
export async function mySubjects(ctx: Ctx, academicYearId: string | null) {
  if (!academicYearId) return []
  const rows = (await myAssignmentRows(ctx, academicYearId)).filter((r) => r.subject)
  const offerings = await prisma.subjectOffering.findMany({
    where: {
      organizationId: ctx.organization.id, academicYearId,
      OR: rows.map((r) => ({ classId: r.classId!, subjectId: r.subjectId! })),
    },
    select: { classId: true, subjectId: true, code: true, creditHours: true, weeklyPeriods: true, requirement: true, status: true, curriculum: { select: { id: true, name: true } } },
  })
  const teacher = await myTeacher(ctx)
  const [plans, materials, work] = teacher
    ? await Promise.all([
        prisma.lessonPlan.groupBy({ by: ["classId", "subjectId"], where: { organizationId: ctx.organization.id, teacherId: teacher.id, academicYearId }, _count: { _all: true } }),
        prisma.teachingMaterial.groupBy({ by: ["classId", "subjectId"], where: { organizationId: ctx.organization.id, teacherId: teacher.id, academicYearId }, _count: { _all: true } }),
        prisma.classAssignment.groupBy({ by: ["classId", "subjectId"], where: { organizationId: ctx.organization.id, teacherId: teacher.id, academicYearId }, _count: { _all: true } }),
      ])
    : [[], [], []]
  const count = (list: { classId: string; subjectId: string; _count: { _all: number } }[], classId: string, subjectId: string) =>
    list.find((x) => x.classId === classId && x.subjectId === subjectId)?._count._all ?? 0
  return rows.map((r) => {
    const o = offerings.find((x) => x.classId === r.classId && x.subjectId === r.subjectId)
    return {
      id: r.id,
      subject: r.subject!,
      classId: r.classId!,
      className: r.class!.name,
      sectionId: r.sectionId,
      sectionName: r.section?.name ?? null,
      role: r.role,
      weeklyPeriods: r.weeklyPeriods ?? o?.weeklyPeriods ?? null,
      creditHours: o?.creditHours ?? null,
      offeringCode: o?.code ?? null,
      requirement: o?.requirement ?? null,
      offered: !!o && o.status === "ACTIVE",
      curriculum: o?.curriculum ?? null,
      lessonPlans: count(plans, r.classId!, r.subjectId!),
      materials: count(materials, r.classId!, r.subjectId!),
      assignments: count(work, r.classId!, r.subjectId!),
    }
  })
}

export type MySubject = Awaited<ReturnType<typeof mySubjects>>[number]

// Students of a class (or one section) for a year. Teachers see classes
// they teach; academic heads any class. Others get "not found".
export async function classRoster(ctx: Ctx, input: { academicYearId: string; classId: string; sectionId: string | null }) {
  const organizationId = ctx.organization.id
  const [cls, section, year] = await Promise.all([
    prisma.academicClass.findFirst({ where: { id: input.classId, organizationId }, select: { id: true, name: true, sections: { where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } } } }),
    input.sectionId ? prisma.section.findFirst({ where: { id: input.sectionId, classId: input.classId, organizationId }, select: { id: true, name: true } }) : null,
    prisma.academicYear.findFirst({ where: { id: input.academicYearId, organizationId }, select: { id: true, name: true } }),
  ])
  if (!cls || !year || (input.sectionId && !section)) throw new NotFoundError("Class not found.")
  if (!overseesTeaching(ctx)) {
    const assignments = await teachingAssignments(ctx, input.academicYearId)
    if (!teaches(assignments, { ...input, subjectId: null })) throw new NotFoundError("Class not found.")
  }
  const students = await prisma.enrollment.findMany({
    where: { organizationId, academicYearId: input.academicYearId, classId: input.classId, ...(input.sectionId && { sectionId: input.sectionId }), status: { in: [...COUNTED] } },
    orderBy: [{ section: { name: "asc" } }, { rollNumber: "asc" }, { student: { firstName: "asc" } }],
    select: {
      id: true, rollNumber: true, status: true,
      section: { select: { name: true } },
      student: { select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true, gender: true, phone: true, email: true } },
    },
  })
  return { cls, section, year, students }
}

export type ClassRoster = Awaited<ReturnType<typeof classRoster>>
