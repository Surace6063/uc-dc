// Development seed: demo data for the teacher and student dashboards.
//
//   npm run db:seed:teaching
//
// Run after db:seed, db:seed:students and db:seed:teachers (students
// enrolled and teachers assigned in the current academic year). Adds a
// weekly timetable, daily attendance for recent school days, a published
// first terminal examination and a scheduled second terminal, and notices.
// Teachers with a login (abc.teacher@example.com) also get lesson plans,
// materials and assignments with submissions.
//
// Each part runs only while its table is empty for the organisation, so the
// seed is safe to re-run. Everything goes through the app's services, so
// the usual rules and the audit log apply.
import { addDays, localDate } from "@/features/attendance/constants"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, ValidationError } from "@/lib/authorization/errors"
import type { PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import { getPolicy } from "@/services/attendance/policy-service"
import { addOfferings } from "@/services/subjects/offering-service"
import { saveRegister } from "@/services/attendance/session-service"
import { addExamSubjects, getExaminationDetail, saveExamination, saveExamSubject, scheduleExamination } from "@/services/exams/examination-service"
import { getMarksSheet, saveMarks } from "@/services/exams/marks-service"
import { activateGradingScale, createSampleSetup } from "@/services/exams/settings-service"
import { approveExamination, approveSheets, publishResults, verifySheets } from "@/services/exams/workflow-service"
import { recordSubmission, reviewSubmission, saveClassAssignment } from "@/services/teaching/class-assignment-service"
import { saveLessonPlan } from "@/services/teaching/lesson-plan-service"
import { addMaterial } from "@/services/teaching/material-service"
import { saveNotice } from "@/services/teaching/notice-service"
import { saveSlot } from "@/services/teaching/timetable-service"

import { seedContext, type SeedOrganization } from "./seed-structure"

// A fixed seed, so every run makes the same choices.
let state = 20831
function random() {
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]
const chunks = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size))

const today = localDate()
// 0 = Sunday … 6 = Saturday.
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()

const PERIODS = [
  ["10:00", "10:45"], ["10:45", "11:30"], ["11:30", "12:15"],
  ["13:00", "13:45"], ["13:45", "14:30"], ["14:30", "15:15"],
] as const
const SCHOOL_DAYS = [0, 1, 2, 3, 4, 5]

type Ctx = AuthContext
type Group = { classId: string; className: string; sectionId: string | null; studentIds: string[] }

const PLANS = ["abc-international-school", "xyz-college"]

async function memberCtx(org: SeedOrganization, where: object): Promise<Ctx | null> {
  const m = await prisma.organizationMember.findFirst({
    where: { organizationId: org.id, ...where },
    orderBy: { createdAt: "asc" },
    select: { userId: true, role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } },
  })
  if (!m) return null
  return { ...seedContext(org, m.userId), permissions: m.role.permissions.map((p) => p.permission.key as PermissionKey) } as Ctx
}

async function seedOrganization(slug: string) {
  const org = (await prisma.organization.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, type: true } })) as SeedOrganization | null
  if (!org) {
    console.log(`✘ ${slug} not found; run npm run db:seed first`)
    return
  }
  const organizationId = org.id
  console.log(`✔ ${org.name}`)
  const year = await prisma.academicYear.findFirst({ where: { organizationId, isCurrent: true }, select: { id: true, name: true, startDate: true, endDate: true } })
  if (!year) {
    console.log("    no current academic year; skipped")
    return
  }
  const yearStart = year.startDate.toISOString().slice(0, 10)
  const yearEnd = year.endDate.toISOString().slice(0, 10)

  // Two different office members, so marks are verified by someone other
  // than the person who entered them.
  const owners = await prisma.organizationMember.findMany({ where: { organizationId, role: { slug: { in: ["owner", "admin"] } } }, orderBy: { createdAt: "asc" }, select: { userId: true } })
  if (owners.length < 2) {
    console.log("    needs an owner and an admin; skipped")
    return
  }
  const office = seedContext(org, owners[0].userId) as Ctx
  const reviewer = seedContext(org, owners[1].userId) as Ctx

  // Class/section groups with their enrolled students.
  const enrollments = await prisma.enrollment.findMany({
    where: { organizationId, academicYearId: year.id, status: "ACTIVE", student: { archivedAt: null } },
    select: { studentId: true, classId: true, sectionId: true, class: { select: { name: true } } },
  })
  const groups = new Map<string, Group>()
  for (const e of enrollments) {
    const key = `${e.classId}:${e.sectionId ?? ""}`
    const g = groups.get(key) ?? { classId: e.classId, className: e.class.name, sectionId: e.sectionId, studentIds: [] }
    g.studentIds.push(e.studentId)
    groups.set(key, g)
  }
  const assignments = await prisma.teacherAssignment.findMany({
    where: { organizationId, academicYearId: year.id, status: "ACTIVE", classId: { not: null }, subjectId: { not: null }, teacher: { archivedAt: null } },
    select: { teacherId: true, classId: true, sectionId: true, subjectId: true },
  })
  const teachersOf = (g: Group) => assignments.filter((a) => a.classId === g.classId && (!a.sectionId || a.sectionId === g.sectionId))

  await seedTimetable(org, office, year.id, [...groups.values()], teachersOf)
  await seedAttendance(org, office, year.id, yearStart, [...groups.values()])
  await seedOfferings(org, office, year.id, [...groups.values()], teachersOf)
  await seedExams(org, office, reviewer, year.id, yearStart, yearEnd, [...groups.values()])
  await seedNotices(org, office, year.id)

  const teacher = await memberCtx(org, { role: { slug: "teacher" }, user: { teacherProfiles: { some: { organizationId, archivedAt: null } } } })
  if (teacher) await seedTeacherWork(org, teacher, year.id, [...groups.values()])
  else console.log("    no teacher with a login; lesson plans, materials and assignments skipped")
}

// ------------------------------------------------------------ timetable

async function seedTimetable(org: SeedOrganization, ctx: Ctx, yearId: string, groups: Group[], teachersOf: (g: Group) => { teacherId: string; subjectId: string | null }[]) {
  if ((await prisma.timetableSlot.count({ where: { organizationId: org.id } })) > 1) return console.log("    timetable exists; skipped")
  let slots = 0
  for (const [gi, g] of groups.entries()) {
    const subjects = teachersOf(g)
    if (!subjects.length) continue
    // Each subject in turn; a teacher busy elsewhere gives way to the next.
    let turn = gi
    for (const day of SCHOOL_DAYS) {
      for (const [start, end] of PERIODS) {
        for (let tries = 0; tries < subjects.length; tries++) {
          const s = subjects[turn++ % subjects.length]
          try {
            await saveSlot(ctx, null, {
              academicYearId: yearId, classId: g.classId, sectionId: g.sectionId, subjectId: s.subjectId, teacherId: s.teacherId,
              dayOfWeek: day, startTime: start, endTime: end, room: `Room ${101 + gi}`,
            })
            slots++
            break
          } catch (error) {
            if (!(error instanceof ConflictError)) throw error
          }
        }
      }
    }
  }
  console.log(`    ${slots} timetable periods`)
}

// ------------------------------------------------------------ attendance

async function seedAttendance(org: SeedOrganization, ctx: Ctx, yearId: string, yearStart: string, groups: Group[]) {
  if ((await prisma.attendanceSession.count({ where: { organizationId: org.id } })) > 0) return console.log("    attendance exists; skipped")
  const policy = await getPolicy(ctx)
  // The last 30 calendar days up to yesterday; today's register is left for
  // the teacher to take.
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, -30 + i)).filter((d) => d >= yearStart && !policy.weeklyOffDays.includes(weekday(d)))
  // Some students are absent more often than others (a few fall below the minimum).
  const habit = new Map<string, number>()
  for (const g of groups) for (const id of g.studentIds) habit.set(id, random() < 0.12 ? 0.2 + random() * 0.15 : random() * 0.08)
  let registers = 0
  for (const day of days) {
    for (const g of groups) {
      const entries = g.studentIds.map((studentId) => {
        const r = random()
        const absent = r < habit.get(studentId)!
        const late = !absent && r < habit.get(studentId)! + 0.04
        return { studentId, status: absent ? (random() < 0.25 ? "EXCUSED" : "ABSENT") : late ? "LATE" : "PRESENT", lateMinutes: late ? between(5, 25) : null, reason: absent && random() < 0.4 ? pick(["Sick", "Family function", "Travelling"]) : "" }
      })
      try {
        await saveRegister(ctx, {
          scope: { academicYearId: yearId, date: day, classId: g.classId, sectionId: g.sectionId, sessionType: "DAILY", slot: 1 },
          sessionId: null, expectedUpdatedAt: null, entries, submit: true, notes: "",
        })
        registers++
      } catch (error) {
        // Public holidays and other closed days.
        if (!(error instanceof ConflictError)) throw error
      }
    }
  }
  console.log(`    ${registers} attendance registers over ${days.length} school days`)
}

// ------------------------------------------------------------ subjects offered

// Each class offers the subjects its teachers are assigned to teach.
async function seedOfferings(org: SeedOrganization, ctx: Ctx, yearId: string, groups: Group[], teachersOf: (g: Group) => { subjectId: string | null }[]) {
  if ((await prisma.subjectOffering.count({ where: { organizationId: org.id, academicYearId: yearId } })) > 0) return
  let created = 0
  for (const classId of new Set(groups.map((g) => g.classId))) {
    const subjectIds = [...new Set(groups.filter((g) => g.classId === classId).flatMap((g) => teachersOf(g).map((t) => t.subjectId!)))]
    // One at a time, so a subject that doesn't fit the class is skipped alone.
    for (const subjectId of subjectIds) {
      try {
        created += (await addOfferings(ctx, { academicYearId: yearId, classId, subjectIds: [subjectId] })).created
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error
      }
    }
  }
  console.log(`    ${created} subjects offered to classes`)
}

// ------------------------------------------------------------ examinations

async function seedExams(org: SeedOrganization, office: Ctx, reviewer: Ctx, yearId: string, yearStart: string, yearEnd: string, groups: Group[]) {
  const organizationId = org.id
  if ((await prisma.examination.count({ where: { organizationId } })) > 0) return console.log("    examinations exist; skipped")
  await createSampleSetup(office)
  const scale = await prisma.gradingScale.findFirstOrThrow({ where: { organizationId }, orderBy: { createdAt: "asc" } })
  if (scale.status !== "ACTIVE") await activateGradingScale(office, scale.id)
  const policy = await prisma.resultPolicy.findFirstOrThrow({ where: { organizationId }, orderBy: { createdAt: "asc" } })
  const type = async (name: string) => (await prisma.assessmentType.findFirst({ where: { organizationId, name } })) ?? (await prisma.assessmentType.findFirstOrThrow({ where: { organizationId } }))
  const [first, second] = [await type("First Terminal Examination"), await type("Second Terminal Examination")]

  const classIds = [...new Set(groups.map((g) => g.classId))]
  const offerings = await prisma.subjectOffering.findMany({ where: { organizationId, academicYearId: yearId, classId: { in: classIds }, status: "ACTIVE" }, select: { id: true } })
  if (!offerings.length) return console.log("    no subjects offered this year; examinations skipped")
  const components = [{ name: "Theory", componentType: "THEORY", maximumMarks: 100, passMarks: "", weightage: "" }]

  async function makeExam(name: string, code: string, assessmentTypeId: string, startDate: string, endDate: string, term: string) {
    const exam = await saveExamination(office, null, {
      academicYearId: yearId, assessmentTypeId, name, code, description: "", educationLevelId: "", programId: "", term,
      startDate, endDate, resultPublicationDate: "", gradingScaleId: scale.id, resultPolicyId: policy.id,
    })
    await addExamSubjects(office, { examinationId: exam.id, offeringIds: offerings.map((o) => o.id), passMarks: 35, components })
    await scheduleExamination(office, { examinationId: exam.id })
    // The paper timetable: one subject a day, skipping Saturdays.
    const detail = await getExaminationDetail(office, exam.id)
    const byClass = new Map<string, typeof detail.subjects>()
    for (const s of detail.subjects) byClass.set(s.classId, [...(byClass.get(s.classId) ?? []), s])
    for (const subjects of byClass.values()) {
      let day = startDate
      for (const s of subjects) {
        while (weekday(day) === 6) day = addDays(day, 1)
        await saveExamSubject(office, s.id, { maximumMarks: 100, passMarks: 35, isCompulsory: true, examDate: day > endDate ? endDate : day, venue: "Exam hall", components: [{ name: "Theory", componentType: "THEORY", maximumMarks: 100 }] })
        day = addDays(day, 1)
      }
    }
    return { id: exam.id, subjects: detail.subjects }
  }

  // First terminal: sat in August, marked, verified, approved and published.
  const ftStart = addDays(yearStart, 110)
  const ft = await makeExam("First Terminal Examination", "FT", first.id, ftStart, addDays(ftStart, 12), "First term")
  const ability = new Map<string, number>()
  for (const g of groups) for (const id of g.studentIds) ability.set(id, 35 + random() * 55)
  let sheets = 0
  for (const s of ft.subjects) {
    for (const g of groups.filter((x) => x.classId === s.classId)) {
      const sheet = await getMarksSheet(office, { examinationSubjectId: s.id, sectionId: g.sectionId })
      const componentId = sheet.subject.components[0].id
      const entries = sheet.students.filter((x) => x.eligible).map((x) => {
        const absent = random() < 0.02
        const marks = Math.max(8, Math.min(99, Math.round((ability.get(x.studentId) ?? 60) + (random() - 0.5) * 24)))
        return { studentId: x.studentId, remark: "", internalNote: "", marks: [absent ? { componentId, status: "ABSENT", marks: null } : { componentId, status: "SCORED", marks }] }
      })
      if (!entries.length) continue
      await saveMarks(office, { scope: { examinationSubjectId: s.id, sectionId: g.sectionId }, sheetId: null, expectedUpdatedAt: null, submit: true, reason: "", entries })
      sheets++
    }
  }
  const sheetIds = (await prisma.marksSheet.findMany({ where: { organizationId, examinationId: ft.id }, select: { id: true } })).map((x) => x.id)
  for (const batch of chunks(sheetIds, 500)) await verifySheets(reviewer, { sheetIds: batch })
  for (const batch of chunks(sheetIds, 500)) await approveSheets(reviewer, { sheetIds: batch })
  await approveExamination(reviewer, { examinationId: ft.id })
  const published = await publishResults(office, { examinationId: ft.id, notifyGuardians: false })
  console.log(`    First Terminal: ${sheets} marks sheets, results published for ${published.students} students`)

  // Second terminal: scheduled for the coming weeks (upcoming papers).
  const stStart = addDays(today, 21)
  if (addDays(stStart, 12) <= yearEnd) {
    await makeExam("Second Terminal Examination", "ST", second.id, stStart, addDays(stStart, 12), "Second term")
    console.log("    Second Terminal scheduled")
  }
}

// ------------------------------------------------------------ notices

async function seedNotices(org: SeedOrganization, ctx: Ctx, yearId: string) {
  if ((await prisma.notice.count({ where: { organizationId: org.id } })) > 0) return console.log("    notices exist; skipped")
  const notices = [
    { title: "Second Terminal Examination schedule", body: "The Second Terminal Examination starts in three weeks. The subject-wise routine is available in the Examinations section. Students must clear their dues to receive admit cards.", audience: "EVERYONE", pinned: true },
    { title: "Dashain and Tihar holidays", body: "The institution will remain closed for the Dashain and Tihar festivals as per the academic calendar. Classes resume on the published reopening date.", audience: "EVERYONE", pinned: false },
    { title: "Parent–teacher meeting", body: "A parent–teacher meeting will be held on Friday from 11:00 to 14:00 to discuss First Terminal results. Please bring the result card.", audience: "PARENTS", pinned: false },
    { title: "Library books due", body: "Students holding library books from the last term must return or renew them by the end of this month.", audience: "STUDENTS", pinned: false },
    { title: "Staff meeting", body: "All teaching staff are requested to attend the monthly staff meeting in the conference hall after classes on Thursday.", audience: "STAFF", pinned: false },
  ]
  for (const n of notices) await saveNotice(ctx, null, { ...n, academicYearId: yearId, classId: "", sectionId: "", expiresOn: "" })
  console.log(`    ${notices.length} notices`)
}

// ------------------------------------------------------------ teacher's own work

const TOPICS: Record<string, string[]> = {
  default: ["Introduction and overview", "Key concepts", "Worked examples", "Practice and discussion", "Review and assessment", "Project work"],
  math: ["Sets and relations", "Algebraic expressions", "Linear equations", "Geometry: triangles", "Statistics: mean and median", "Probability basics"],
  science: ["Matter and its properties", "Force and motion", "Light and reflection", "Cells and tissues", "Acids, bases and salts", "Electricity"],
  english: ["Reading comprehension", "Grammar: tenses", "Letter writing", "Poetry appreciation", "Essay writing", "Speaking practice"],
  nepali: ["व्याकरण", "निबन्ध लेखन", "कविता", "कथा", "पत्र लेखन", "बोध प्रश्न"],
  social: ["Our community", "Geography of Nepal", "History of Nepal", "Civic sense", "Economic activities", "Current affairs"],
}
const topicsFor = (subject: string) => {
  const s = subject.toLowerCase()
  return TOPICS[s.includes("math") ? "math" : s.includes("science") ? "science" : s.includes("english") ? "english" : s.includes("nepali") ? "nepali" : s.includes("social") ? "social" : "default"]
}

async function seedTeacherWork(org: SeedOrganization, ctx: Ctx, yearId: string, groups: Group[]) {
  const organizationId = org.id
  if ((await prisma.lessonPlan.count({ where: { organizationId } })) > 0) return console.log("    teacher work exists; skipped")
  const teacher = await prisma.teacher.findFirstOrThrow({ where: { organizationId, userId: ctx.user.id }, select: { id: true, firstName: true, lastName: true } })
  const mine = await prisma.teacherAssignment.findMany({
    where: { organizationId, teacherId: teacher.id, academicYearId: yearId, status: "ACTIVE", classId: { not: null }, subjectId: { not: null } },
    select: { classId: true, sectionId: true, subject: { select: { id: true, name: true } } },
  })
  let plans = 0
  let materials = 0
  let works = 0
  let submissions = 0
  for (const { subject, ...a } of mine) {
    if (!subject) continue
    // A whole-class assignment covers every section of the class.
    for (const g of groups.filter((x) => x.classId === a.classId && (!a.sectionId || a.sectionId === x.sectionId))) {
      const place = { academicYearId: yearId, classId: g.classId, sectionId: g.sectionId ?? "", subjectId: subject.id }
      const topics = topicsFor(subject.name)

      // Lesson plans: four delivered, two coming up.
      for (const [i, topic] of topics.entries()) {
        const delivered = i < 4
        await saveLessonPlan(ctx, null, {
          ...place, title: `${subject.name}: ${topic}`, topic, plannedDate: addDays(today, delivered ? -28 + i * 7 : 2 + (i - 4) * 5), periods: between(1, 3),
          objectives: `Students will understand ${topic.toLowerCase()} and apply it to simple problems.`,
          activities: "Warm-up questions, explanation with examples on the board, group work, and a short recap.",
          resources: "Textbook, whiteboard, worksheet", assessment: "Oral questions and a short classwork exercise.",
          status: delivered ? "DELIVERED" : "PLANNED", reflection: delivered ? pick(["Most students followed well; a few need extra practice.", "Group work went well. Revisit the examples next class.", "Covered as planned."]) : "",
        })
        plans++
      }

      // Materials: web links shared with the class.
      const links = [
        { title: `${subject.name} reference notes`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(subject.name.replace(/ /g, "_"))}` },
        { title: "Practice exercises", url: "https://www.khanacademy.org/" },
        { title: "Curriculum (CDC Nepal)", url: "https://moecdc.gov.np/" },
      ]
      for (const l of links) {
        const form = new FormData()
        for (const [k, v] of Object.entries({ ...place, title: l.title, description: `Shared for ${g.className}.`, kind: "LINK", url: l.url, sharedWithStudents: "true" })) form.set(k, v)
        await addMaterial(ctx, form)
        materials++
      }

      // Assignments: two from past weeks (submitted and marked), one open.
      const set = [
        { title: `${subject.name} worksheet 1`, due: addDays(today, -18), reviewed: 0.9 },
        { title: `${subject.name} worksheet 2`, due: addDays(today, -6), reviewed: 0.4 },
        { title: `${subject.name} project`, due: addDays(today, 7), reviewed: 0 },
      ]
      for (const w of set) {
        const past = w.due < today
        // The form refuses past due dates, so past work is set due tomorrow
        // and moved back once its submissions are in.
        const saved = await saveClassAssignment(ctx, null, {
          ...place, title: w.title, instructions: `Complete the ${w.title.toLowerCase()} in your notebook and submit it on time. Show all your working.`,
          dueDate: past ? addDays(today, 1) : w.due, dueTime: "17:00", maxMarks: 20, status: "PUBLISHED",
        })
        works++
        for (const studentId of g.studentIds) {
          const r = random()
          if (past ? r > 0.85 : r > 0.3) continue
          const submittedOn = past ? addDays(w.due, r < 0.08 ? 1 : -between(0, 3)) : today
          await recordSubmission(ctx, saved.id, { studentId, submittedOn: submittedOn > today ? today : submittedOn, content: "Submitted in class (paper copy)." })
          submissions++
        }
        if (past) {
          await prisma.classAssignment.update({ where: { id: saved.id }, data: { dueAt: new Date(`${w.due}T11:15:00.000Z`), publishedAt: new Date(`${addDays(w.due, -10)}T04:15:00.000Z`) } })
          const subs = await prisma.assignmentSubmission.findMany({ where: { assignmentId: saved.id }, select: { id: true } })
          for (const s of subs) {
            if (random() > w.reviewed) continue
            const marks = between(9, 20)
            await reviewSubmission(ctx, saved.id, s.id, { status: "REVIEWED", marks, feedback: marks >= 17 ? "Excellent work." : marks >= 13 ? "Good effort; check your working." : "Needs improvement. See me after class." })
          }
        }
      }
    }
  }
  // A class notice from the teacher.
  const g = groups.find((x) => mine.some((a) => a.classId === x.classId))
  if (g) await saveNotice(ctx, null, { title: "Bring your project materials", body: "Please bring chart paper and colour pens for project work this week.", audience: "CLASS", academicYearId: yearId, classId: g.classId, sectionId: g.sectionId ?? "", pinned: false, expiresOn: addDays(today, 10) })
  console.log(`    ${teacher.firstName} ${teacher.lastName}: ${plans} lesson plans, ${materials} materials, ${works} assignments, ${submissions} submissions`)
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production")
  for (const slug of PLANS) await seedOrganization(slug)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
