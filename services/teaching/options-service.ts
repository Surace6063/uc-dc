import "server-only"

import { prisma } from "@/lib/prisma"
import { myTeacher, overseesTeaching, type Ctx } from "@/services/teaching/scope-service"

// Choices for teaching forms and filters. Forms offer only the classes,
// sections and subjects the teacher is assigned to (the services check the
// same rule); academic heads filter by any class or subject.

export type TeachingPlace = {
  academicYearId: string
  classId: string
  className: string
  sectionId: string | null
  sectionName: string | null
  // Subjects taught there; empty for a class-teacher-only assignment.
  subjects: { id: string; name: string }[]
  // Sections of the class, for whole-class assignments.
  sections: { id: string; name: string }[]
}

export async function teachingOptions(ctx: Ctx) {
  const organizationId = ctx.organization.id
  const [years, teacher] = await Promise.all([
    prisma.academicYear.findMany({
      where: { organizationId, status: { not: "ARCHIVED" } },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, isCurrent: true },
    }),
    myTeacher(ctx),
  ])
  const assignments = teacher
    ? await prisma.teacherAssignment.findMany({
        where: { organizationId, teacherId: teacher.id, status: "ACTIVE", classId: { not: null }, academicYear: { status: { not: "ARCHIVED" } } },
        orderBy: [{ class: { sequence: "asc" } }, { class: { name: "asc" } }],
        select: {
          academicYearId: true,
          class: { select: { id: true, name: true, sections: { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } } } },
          section: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
        },
      })
    : []

  const places = new Map<string, TeachingPlace>()
  for (const a of assignments) {
    if (!a.class) continue
    const key = `${a.academicYearId}:${a.class.id}:${a.section?.id ?? ""}`
    const p = places.get(key) ?? {
      academicYearId: a.academicYearId, classId: a.class.id, className: a.class.name,
      sectionId: a.section?.id ?? null, sectionName: a.section?.name ?? null, subjects: [], sections: a.class.sections,
    }
    if (a.subject && !p.subjects.some((s) => s.id === a.subject!.id)) p.subjects.push(a.subject)
    places.set(key, p)
  }

  // Filter choices: the teacher's own, or every class and subject for heads.
  const oversees = overseesTeaching(ctx)
  const [classes, subjects] = oversees
    ? await Promise.all([
        prisma.academicClass.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sequence: "asc" }, { name: "asc" }], select: { id: true, name: true, sections: { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } } } }),
        prisma.subject.findMany({ where: { organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      ])
    : [
        [...new Map([...places.values()].map((p) => [p.classId, { id: p.classId, name: p.className, sections: p.sections }])).values()],
        [...new Map([...places.values()].flatMap((p) => p.subjects).map((s) => [s.id, s])).values()],
      ]

  return {
    years,
    currentYearId: years.find((y) => y.isCurrent)?.id ?? null,
    isTeacher: !!teacher,
    teacherId: teacher?.id ?? null,
    oversees,
    places: [...places.values()],
    classes,
    subjects,
  }
}

export type TeachingOptions = Awaited<ReturnType<typeof teachingOptions>>
