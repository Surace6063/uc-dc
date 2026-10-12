import "server-only"

import { fractionToPercent, toPercentUnits } from "@/features/exams/calculation"
import type { ReportFilters } from "@/features/exams/filters"
import { fullName } from "@/features/students/constants"
import type { AuthContext } from "@/lib/authorization/context"
import type { Prisma, ResultStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { sheetProgress } from "@/services/exams/examination-service"
import { loadSubjects } from "@/services/exams/rules-service"

// Academic reports from *published* results only (the active version of
// each examination), so every figure matches what students and guardians
// were given and was produced by the same calculation. Aggregation happens
// in the database; only the "needs support" list names students, and the
// page that shows it requires results.view_all.
type Ctx = Pick<AuthContext, "organization">

const pct = (value: Prisma.Decimal | null | undefined) => (value === null || value === undefined ? null : toPercentUnits(value))
const rate = (pass: number, decided: number) => (decided === 0 ? null : fractionToPercent(BigInt(pass), BigInt(decided), 1))
export const DECIDED: ResultStatus[] = ["PASS", "FAIL", "ABSENT"]

async function classScope(ctx: Ctx, f: ReportFilters) {
  if (!f.level && !f.program) return null
  const classes = await prisma.academicClass.findMany({
    where: { organizationId: ctx.organization.id, ...(f.level && { educationLevelId: f.level }), ...(f.program && { programId: f.program }) },
    select: { id: true },
  })
  return classes.map((c) => c.id)
}

export async function resultAnalytics(ctx: Ctx, f: ReportFilters & { year: string }) {
  const organizationId = ctx.organization.id
  const classIds = await classScope(ctx, f)
  const base: Prisma.StudentResultWhereInput = {
    organizationId,
    publication: { status: "ACTIVE" },
    academicYearId: f.year,
    ...(f.exam && { examinationId: f.exam }),
    ...(f.class ? { classId: f.class } : classIds ? { classId: { in: classIds } } : {}),
    ...(f.section && { sectionId: f.section }),
    ...(f.status && { status: f.status }),
  }
  const subjectWhere: Prisma.StudentSubjectResultWhereInput = {
    organizationId,
    publication: { status: "ACTIVE" },
    result: base,
    ...(f.subject && { subjectId: f.subject }),
  }

  const [byStatus, avg, byGrade, gpas, bySubject, bySubjectStatus, byClass, byClassStatus, byExam, byExamStatus, support] = await Promise.all([
    prisma.studentResult.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.studentResult.aggregate({ where: { ...base, percentage: { not: null } }, _avg: { percentage: true, gpa: true } }),
    prisma.studentResult.groupBy({ by: ["grade"], where: { ...base, grade: { not: null } }, _count: { _all: true } }),
    prisma.studentResult.findMany({ where: { ...base, gpa: { not: null } }, select: { gpa: true }, take: 50_000 }),
    prisma.studentSubjectResult.groupBy({ by: ["subjectId"], where: { ...subjectWhere, percentage: { not: null } }, _avg: { percentage: true }, _count: { _all: true } }),
    prisma.studentSubjectResult.groupBy({ by: ["subjectId", "status"], where: subjectWhere, _count: { _all: true } }),
    prisma.studentResult.groupBy({ by: ["classId", "sectionId"], where: { ...base, percentage: { not: null } }, _avg: { percentage: true } }),
    prisma.studentResult.groupBy({ by: ["classId", "sectionId", "status"], where: base, _count: { _all: true } }),
    prisma.studentResult.groupBy({ by: ["examinationId"], where: { ...base, percentage: { not: null } }, _avg: { percentage: true } }),
    prisma.studentResult.groupBy({ by: ["examinationId", "status"], where: base, _count: { _all: true } }),
    prisma.studentResult.findMany({
      where: { ...base, OR: [{ status: { in: ["FAIL", "ABSENT"] } }, { percentage: { lt: f.support } }] },
      orderBy: [{ percentage: { sort: "asc", nulls: "first" } }],
      take: 50,
      select: {
        id: true, examinationId: true, studentId: true, status: true, percentage: true, grade: true,
        student: { select: { firstName: true, middleName: true, lastName: true, admissionNumber: true } },
        enrollment: { select: { rollNumber: true, class: { select: { name: true } }, section: { select: { name: true } } } },
      },
    }),
  ])

  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Partial<Record<ResultStatus, number>>
  const decided = DECIDED.reduce((sum, s) => sum + (counts[s] ?? 0), 0)

  const [subjects, classes, sections, exams] = await Promise.all([
    prisma.subject.findMany({ where: { organizationId, id: { in: bySubject.map((s) => s.subjectId) } }, select: { id: true, name: true, code: true } }),
    prisma.academicClass.findMany({ where: { organizationId, id: { in: [...new Set(byClass.map((c) => c.classId))] } }, select: { id: true, name: true, sequence: true } }),
    prisma.section.findMany({ where: { organizationId, id: { in: byClass.map((c) => c.sectionId).filter((v): v is string => !!v) } }, select: { id: true, name: true } }),
    prisma.examination.findMany({ where: { organizationId, id: { in: byExam.map((e) => e.examinationId) } }, select: { id: true, name: true, startDate: true } }),
  ])
  const subjectName = new Map(subjects.map((s) => [s.id, s]))
  const className = new Map(classes.map((c) => [c.id, c]))
  const sectionName = new Map(sections.map((s) => [s.id, s.name]))
  const examName = new Map(exams.map((e) => [e.id, e]))
  const statusCount = <T extends Record<string, unknown>>(rows: (T & { status: ResultStatus; _count: { _all: number } })[], match: (r: T) => boolean) => {
    const mine = rows.filter((r) => match(r))
    const pass = mine.filter((r) => r.status === "PASS").reduce((s, r) => s + r._count._all, 0)
    const dec = mine.filter((r) => DECIDED.includes(r.status)).reduce((s, r) => s + r._count._all, 0)
    return { students: mine.reduce((s, r) => s + r._count._all, 0), passRate: rate(pass, dec), failed: dec - pass }
  }

  // GPA in half-point bands.
  const gpaBands = new Map<string, number>()
  for (const g of gpas) {
    const value = Number(g.gpa)
    const low = Math.min(Math.floor(value * 2) / 2, 3.5)
    const key = `${low.toFixed(1)}–${(low + 0.5).toFixed(1)}`
    gpaBands.set(key, (gpaBands.get(key) ?? 0) + 1)
  }

  return {
    totals: {
      students: Object.values(counts).reduce((s, n) => s + (n ?? 0), 0),
      counts,
      passRate: rate(counts.PASS ?? 0, decided),
      averagePercentage: pct(avg._avg.percentage),
      averageGpa: pct(avg._avg.gpa),
    },
    grades: byGrade.map((g) => ({ grade: g.grade!, students: g._count._all })).sort((a, b) => a.grade.localeCompare(b.grade)),
    gpaBands: [...gpaBands.entries()].map(([band, students]) => ({ band, students })).sort((a, b) => a.band.localeCompare(b.band)),
    subjects: bySubject
      .map((s) => ({
        subjectId: s.subjectId,
        name: subjectName.get(s.subjectId)?.name ?? "—",
        code: subjectName.get(s.subjectId)?.code ?? "",
        average: pct(s._avg.percentage),
        ...statusCount(bySubjectStatus, (r) => r.subjectId === s.subjectId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    classes: byClass
      .map((c) => ({
        classId: c.classId,
        sectionId: c.sectionId,
        label: [className.get(c.classId)?.name, c.sectionId ? `Section ${sectionName.get(c.sectionId) ?? ""}` : null].filter(Boolean).join(" · "),
        sequence: className.get(c.classId)?.sequence ?? 0,
        average: pct(c._avg.percentage),
        ...statusCount(byClassStatus, (r) => r.classId === c.classId && r.sectionId === c.sectionId),
      }))
      .sort((a, b) => a.sequence - b.sequence || a.label.localeCompare(b.label)),
    exams: byExam
      .map((e) => ({
        examinationId: e.examinationId,
        name: examName.get(e.examinationId)?.name ?? "—",
        start: examName.get(e.examinationId)?.startDate ?? null,
        average: pct(e._avg.percentage),
        ...statusCount(byExamStatus, (r) => r.examinationId === e.examinationId),
      }))
      .sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0)),
    support: support.map((r) => ({
      resultId: r.id,
      examinationId: r.examinationId,
      studentId: r.studentId,
      examName: examName.get(r.examinationId)?.name ?? "",
      name: fullName(r.student),
      admissionNumber: r.student.admissionNumber,
      className: [r.enrollment.class.name, r.enrollment.section?.name].filter(Boolean).join(" · "),
      status: r.status,
      percentage: pct(r.percentage),
      grade: r.grade,
    })),
  }
}

// Average and pass rate per academic year (all published examinations).
export async function yearComparison(ctx: Ctx) {
  const organizationId = ctx.organization.id
  const where: Prisma.StudentResultWhereInput = { organizationId, publication: { status: "ACTIVE" } }
  const [avg, status, years] = await Promise.all([
    prisma.studentResult.groupBy({ by: ["academicYearId"], where: { ...where, percentage: { not: null } }, _avg: { percentage: true } }),
    prisma.studentResult.groupBy({ by: ["academicYearId", "status"], where, _count: { _all: true } }),
    prisma.academicYear.findMany({ where: { organizationId }, orderBy: { startDate: "asc" }, select: { id: true, name: true } }),
  ])
  return years
    .filter((y) => status.some((s) => s.academicYearId === y.id))
    .map((y) => {
      const mine = status.filter((s) => s.academicYearId === y.id)
      const pass = mine.filter((s) => s.status === "PASS").reduce((n, s) => n + s._count._all, 0)
      const dec = mine.filter((s) => DECIDED.includes(s.status)).reduce((n, s) => n + s._count._all, 0)
      return { yearId: y.id, name: y.name, average: pct(avg.find((a) => a.academicYearId === y.id)?._avg.percentage), passRate: rate(pass, dec), students: mine.reduce((n, s) => n + s._count._all, 0) }
    })
}

// Marks-sheet completion for examinations still collecting marks, by the
// teachers assigned to each subject and section.
export async function marksCompletion(ctx: Ctx, yearId: string, examinationId?: string) {
  const organizationId = ctx.organization.id
  const exams = await prisma.examination.findMany({
    where: { organizationId, academicYearId: yearId, status: { in: ["SCHEDULED", "REVISION"] }, ...(examinationId && { id: examinationId }) },
    orderBy: { startDate: "asc" },
    take: 20,
  })
  const assignments = await prisma.teacherAssignment.findMany({
    where: { organizationId, academicYearId: yearId, status: "ACTIVE", subjectId: { not: null }, classId: { not: null } },
    select: { classId: true, sectionId: true, subjectId: true, teacher: { select: { id: true, firstName: true, middleName: true, lastName: true } } },
  })
  const teachers = new Map<string, { name: string; assigned: number; submitted: number; returned: number; notStarted: number }>()
  const missing: { examName: string; label: string; status: string; entered: number; expected: number }[] = []
  let total = 0
  let submitted = 0
  for (const exam of exams) {
    const subjects = await loadSubjects(prisma, organizationId, exam.id)
    const subjectOf = new Map(subjects.map((s) => [s.id, s.subjectOffering.subjectId]))
    for (const p of await sheetProgress(prisma, organizationId, exam, subjects)) {
      if (!p.required) continue
      total++
      const done = p.status === "SUBMITTED" || p.status === "VERIFIED" || p.status === "APPROVED"
      if (done) submitted++
      else missing.push({ examName: exam.name, label: [p.className, p.sectionName && `Section ${p.sectionName}`, p.subjectName].filter(Boolean).join(" · "), status: p.status, entered: p.entered, expected: p.expected })
      const owners = assignments.filter((a) => a.classId === p.classId && a.subjectId === subjectOf.get(p.examinationSubjectId) && (a.sectionId === null || a.sectionId === p.sectionId))
      for (const a of owners) {
        const t = teachers.get(a.teacher.id) ?? { name: fullName(a.teacher), assigned: 0, submitted: 0, returned: 0, notStarted: 0 }
        t.assigned++
        if (done) t.submitted++
        if (p.status === "RETURNED") t.returned++
        if (p.status === "NOT_STARTED") t.notStarted++
        teachers.set(a.teacher.id, t)
      }
    }
  }
  return {
    exams: exams.map((e) => ({ id: e.id, name: e.name })),
    total,
    submitted,
    teachers: [...teachers.values()].sort((a, b) => a.submitted / a.assigned - b.submitted / b.assigned || a.name.localeCompare(b.name)),
    missing: missing.slice(0, 100),
  }
}
