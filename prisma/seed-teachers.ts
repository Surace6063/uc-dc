// Development data: dummy teachers for the seeded organisations.
//
//   npm run db:seed:teachers
//
// Teachers are added through the real services, so employee IDs, employment
// history, assignments and audit logs follow the same rules as the UI. Data
// is generated from a fixed seed (same names every run). Departments,
// designations and subjects are created only when the organisation has none,
// and an organisation that already has teachers is skipped, so this is safe
// to re-run. Run `npm run db:seed` first to create the organisations.
import type { EducationStructure } from "@/services/academics/structure-service"
import {
  getEducationStructure,
  saveDesignation,
  saveFaculty,
  saveSubject,
} from "@/services/academics/structure-service"
import { prisma } from "@/lib/prisma"
import {
  archiveTeacher,
  changeEmployment,
  createTeacher,
  verifyRecord,
} from "@/services/teachers/teacher-service"

import { seedContext, seedEducationStructure, type SeedOrganization } from "./seed-structure"

type Department = { code: string; name: string }
// [department code, subject name, subject code, level code, program code?]
type SubjectPlan = [string, string, string, string, string?]

type Plan = {
  slug: string
  presets: string[]
  teachers: number
  departments: Department[]
  designations: string[]
  subjects: SubjectPlan[]
  degrees: Record<string, [string, string][]> // department → [qualification title, specialization]
  locations: [number, string, string][]
}

const SCHOOL_SUBJECTS = (level: string, prefix: string): SubjectPlan[] => [
  ["LANG", "English", `${prefix}-ENG`, level],
  ["LANG", "Nepali", `${prefix}-NEP`, level],
  ["SCIMATH", "Mathematics", `${prefix}-MATH`, level],
  ["SCIMATH", "Science", `${prefix}-SCI`, level],
  ["SOC", "Social Studies", `${prefix}-SOC`, level],
  ["SCIMATH", "Computer Science", `${prefix}-COMP`, level],
  ["SOC", "Health & Physical Education", `${prefix}-HPE`, level],
]

const PLANS: Plan[] = [
  {
    slug: "abc-international-school",
    presets: ["ecd", "basic", "secondary"],
    teachers: 24,
    departments: [
      { code: "ECD", name: "Early Childhood" },
      { code: "LANG", name: "Languages" },
      { code: "SCIMATH", name: "Science & Mathematics" },
      { code: "SOC", name: "Social Studies" },
    ],
    designations: ["Principal", "Head of Department", "Senior Teacher", "Teacher", "Assistant Teacher"],
    subjects: [
      ["ECD", "Language & Literacy", "ECD-LIT", "ECD"],
      ["ECD", "Numbers & Play", "ECD-NUM", "ECD"],
      ["ECD", "Art & Craft", "ECD-ART", "ECD"],
      ...SCHOOL_SUBJECTS("BASIC", "B"),
      ...SCHOOL_SUBJECTS("SEC", "S"),
      ["SCIMATH", "Optional Mathematics", "S-OPTM", "SEC"],
    ],
    degrees: {
      ECD: [["B.Ed. in Early Childhood Development", "Early Childhood"], ["Diploma in Montessori Education", "Montessori"]],
      LANG: [["M.A. in English", "English Literature"], ["M.Ed. in Nepali", "Nepali Language"], ["B.Ed. in English", "ELT"]],
      SCIMATH: [["M.Sc. in Mathematics", "Pure Mathematics"], ["M.Sc. in Physics", "Physics"], ["B.Sc. CSIT", "Computer Science"], ["M.Ed. in Mathematics Education", "Mathematics"]],
      SOC: [["M.A. in Sociology", "Sociology"], ["M.Ed. in Health & Physical Education", "Physical Education"], ["M.A. in History", "History"]],
    },
    locations: [
      [3, "Kathmandu", "Kathmandu Metropolitan City"],
      [3, "Lalitpur", "Lalitpur Metropolitan City"],
      [3, "Bhaktapur", "Bhaktapur Municipality"],
      [3, "Kathmandu", "Tokha Municipality"],
      [4, "Tanahun", "Byas Municipality"],
    ],
  },
  {
    slug: "xyz-college",
    presets: ["higher_secondary", "bachelor"],
    teachers: 18,
    departments: [
      { code: "SCI", name: "Science" },
      { code: "MGMT", name: "Management" },
      { code: "HUM", name: "Humanities" },
      { code: "CS", name: "Computer Science & IT" },
    ],
    designations: ["Campus Chief", "Head of Department", "Associate Professor", "Lecturer", "Teaching Assistant"],
    subjects: [
      ["HUM", "Compulsory English", "H-ENG", "HSEB"],
      ["HUM", "Compulsory Nepali", "H-NEP", "HSEB"],
      ["SCI", "Physics", "H-PHY", "HSEB", "SCI"],
      ["SCI", "Chemistry", "H-CHEM", "HSEB", "SCI"],
      ["SCI", "Biology", "H-BIO", "HSEB", "SCI"],
      ["SCI", "Mathematics", "H-MATH", "HSEB", "SCI"],
      ["MGMT", "Accountancy", "H-ACC", "HSEB", "MGMT"],
      ["MGMT", "Economics", "H-ECO", "HSEB", "MGMT"],
      ["MGMT", "Business Studies", "H-BUS", "HSEB", "MGMT"],
      ["HUM", "Sociology", "H-SOC", "HSEB", "HUM"],
      ["MGMT", "Business Statistics", "BBS-STAT", "BACH", "BBS"],
      ["MGMT", "Financial Accounting", "BBS-ACC", "BACH", "BBS"],
      ["CS", "Programming in C", "BCA-C", "BACH", "BCA"],
      ["CS", "Database Management Systems", "BCA-DBMS", "BACH", "BCA"],
      ["CS", "Web Technology", "BIT-WEB", "BACH", "BIT"],
      ["MGMT", "Principles of Management", "BBA-POM", "BACH", "BBA"],
    ],
    degrees: {
      SCI: [["M.Sc. in Chemistry", "Organic Chemistry"], ["M.Sc. in Physics", "Condensed Matter"], ["M.Sc. in Zoology", "Biology"]],
      MGMT: [["MBS", "Finance"], ["MBA", "Marketing"], ["M.A. in Economics", "Economics"]],
      HUM: [["M.A. in English", "English Literature"], ["M.A. in Sociology", "Sociology"]],
      CS: [["M.Sc. CSIT", "Computer Science"], ["MCA", "Software Engineering"], ["M.E. in Computer Engineering", "Networks"]],
    },
    locations: [
      [4, "Kaski", "Pokhara Metropolitan City"],
      [3, "Chitwan", "Bharatpur Metropolitan City"],
      [4, "Syangja", "Putalibazar Municipality"],
      [5, "Rupandehi", "Butwal Sub-Metropolitan City"],
    ],
  },
]

const SURNAMES = [
  "Shrestha", "Gurung", "Tamang", "Rai", "Magar", "Thapa", "Karki", "Adhikari", "Sharma", "Poudel",
  "Bhattarai", "Maharjan", "Shakya", "Acharya", "Limbu", "Subedi", "Khadka", "Basnet", "Joshi", "Neupane",
]
const MEN = ["Ram", "Hari", "Bikash", "Dinesh", "Gopal", "Narayan", "Prakash", "Rajesh", "Santosh", "Umesh", "Mohan", "Deepak", "Kamal", "Bishnu"]
const WOMEN = ["Sabina", "Sarita", "Kalpana", "Sunita", "Pramila", "Anita", "Rekha", "Bindu", "Manju", "Shanti", "Gita", "Rachana", "Laxmi", "Nirmala"]
const UNIVERSITIES = ["Tribhuvan University", "Kathmandu University", "Pokhara University", "Purbanchal University"]
const TRAININGS: [string, string][] = [
  ["Teacher Professional Development (TPD)", "Center for Education and Human Resource Development"],
  ["ICT in Education", "Kathmandu University School of Education"],
  ["First Aid Training", "Nepal Red Cross Society"],
  ["Inclusive Classroom Practices", "British Council Nepal"],
]

// Small deterministic PRNG so every run produces the same people.
function random(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const date = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`

type Ctx = ReturnType<typeof seedContext>

// Departments, designations and subjects, unless the organisation already has some.
async function seedStaffStructure(ctx: Ctx, plan: Plan, structure: EducationStructure) {
  if (!structure.faculties.length) {
    for (const [i, d] of plan.departments.entries()) {
      await saveFaculty(ctx, null, { ...d, description: "", isActive: true, sortOrder: i })
    }
    console.log(`    ${plan.departments.length} departments`)
  }
  if (!structure.designations.length) {
    for (const [i, name] of plan.designations.entries()) {
      await saveDesignation(ctx, null, { name, isActive: true, sortOrder: i })
    }
    console.log(`    ${plan.designations.length} designations`)
  }
  if (!structure.subjects.length) {
    let created = 0
    for (const [i, [, name, code, levelCode, programCode]] of plan.subjects.entries()) {
      const level = structure.levels.find((l) => l.code === levelCode)
      const program = programCode
        ? structure.programs.find((p) => p.code === programCode && p.educationLevelId === level?.id)
        : null
      if (!level || program === undefined) continue
      await saveSubject(ctx, null, {
        name, code, educationLevelId: level.id, programId: program?.id ?? "",
        creditHours: levelCode === "BACH" ? 3 : null, isActive: true, sortOrder: i,
      })
      created++
    }
    console.log(`    ${created} subjects`)
  }
}

async function seedOrganization(plan: Plan) {
  const organization = (await prisma.organization.findUnique({
    where: { slug: plan.slug },
    select: { id: true, name: true, slug: true, type: true },
  })) as SeedOrganization | null
  if (!organization) {
    console.log(`✘ ${plan.slug} not found; run npm run db:seed first`)
    return
  }
  const actor = await prisma.organizationMember.findFirst({
    where: { organizationId: organization.id, role: { slug: { in: ["owner", "admin"] } } },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  })
  if (!actor) {
    console.log(`✘ ${organization.name} has no owner or admin`)
    return
  }
  console.log(`✔ ${organization.name}`)
  await seedEducationStructure(organization, actor.userId, plan.presets)

  if ((await prisma.teacher.count({ where: { organizationId: organization.id } })) > 0) {
    console.log("    already has teachers; skipped")
    return
  }

  const ctx = seedContext(organization, actor.userId)
  await seedStaffStructure(ctx, plan, await getEducationStructure(ctx))
  const structure = await getEducationStructure(ctx)
  const currentYear = structure.years.find((y) => y.isCurrent)
  if (!currentYear) throw new Error("No current academic year")
  const year = currentYear

  const rand = random(organization.slug.length * 104729)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const chance = (p: number) => rand() < p

  const designation = (name: string) => structure.designations.find((d) => d.name === name)?.id ?? ""
  const [headTitle, , seniorTitle, regularTitle, juniorTitle] = plan.designations
  const departments = plan.departments.map((d) => ({
    ...d,
    id: structure.faculties.find((f) => f.code === d.code)?.id ?? "",
    subjects: plan.subjects
      .filter(([dept]) => dept === d.code)
      .map(([, , code]) => structure.subjects.find((s) => s.code === code))
      .filter((s) => s !== undefined),
  }))
  const sectionsOf = (classId: string) => structure.sections.filter((s) => s.classId === classId)
  const classesFor = (subject: EducationStructure["subjects"][number]) =>
    structure.classes.filter(
      (c) => c.educationLevelId === subject.educationLevelId && (!subject.programId || c.programId === subject.programId)
    )

  // Each section gets at most one class teacher (enforced by the database too).
  const classTeacherPool = structure.classes.flatMap((c) =>
    sectionsOf(c.id).map((s) => ({ classId: c.id, sectionId: s.id }))
  )

  const people = Array.from({ length: plan.teachers }, (_, i) => {
    const female = chance(0.5)
    const surname = pick(SURNAMES)
    const firstName = pick(female ? WOMEN : MEN)
    // The first teacher heads the institution; the next one per department heads it.
    const department = i === 0 ? departments[1] : departments[(i - 1) % departments.length]
    const role = i === 0 ? "chief" : i <= departments.length ? "head" : "member"
    return { i, female, surname, firstName, department, role }
  })

  const heads = new Map<string, string>() // department code → teacher id
  let chiefId = ""
  let created = 0
  const failures: string[] = []
  const createdIds: { id: string; i: number; employment: Record<string, unknown> }[] = []

  async function add(person: (typeof people)[number]) {
    const { i, female, surname, firstName, department, role } = person
    const age = role === "member" ? 24 + Math.floor(rand() * 25) : 40 + Math.floor(rand() * 15)
    const joinedYear = Math.max(2026 - (age - 23), 2026 - Math.floor(rand() * 15) - 1)
    const [province, district, municipality] = pick(plan.locations)
    const type = role !== "member" ? "FULL_TIME" : pick(["FULL_TIME", "FULL_TIME", "FULL_TIME", "PART_TIME", "CONTRACT", "VISITING"] as const)
    const newJoiner = role === "member" && chance(0.15)
    const dateOfJoining = newJoiner ? date(2026, 4, 20) : date(joinedYear, 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 28))
    const incomplete = role === "member" && chance(0.08)

    const employment = {
      dateOfJoining,
      employmentType: type,
      employmentStatus: "ACTIVE",
      designationId: designation(
        role === "chief" ? plan.designations[0] : role === "head" ? headTitle! : age > 40 ? seniorTitle! : chance(0.2) ? juniorTitle! : regularTitle!
      ),
      departmentId: role === "chief" ? "" : department.id,
      reportingToId: role === "chief" ? "" : role === "head" ? chiefId : (heads.get(department.code) ?? chiefId),
      contractStartDate: type === "CONTRACT" ? date(2026, 4, 14) : "",
      contractEndDate: type === "CONTRACT" ? date(2027, 4, 13) : "",
      onProbation: newJoiner,
      probationEndDate: newJoiner ? date(2026, 10, 20) : "",
      employmentNotes: "",
    }

    const degrees = plan.degrees[department.code] ?? []
    const [title, specialization] = pick(degrees)
    const masters = /^M|^MBA|^MBS|^MCA/.test(title)
    const graduated = 2026 - age + 23 + (masters ? 2 : 0)
    const qualifications = incomplete
      ? []
      : [
          {
            level: masters ? "MASTER" : title.startsWith("Diploma") ? "DIPLOMA" : "BACHELOR",
            title, specialization, institutionName: pick(UNIVERSITIES), awardingBody: "",
            country: "Nepal", completionYear: Math.min(graduated, 2025), result: chance(0.5) ? "First Division" : `${(3 + rand()).toFixed(2)} GPA`,
          },
          ...(masters && chance(0.6)
            ? [{
                level: "BACHELOR", title: "B.Ed.", specialization: "", institutionName: pick(UNIVERSITIES),
                awardingBody: "", country: "Nepal", completionYear: Math.min(graduated - 3, 2023), result: "",
              }]
            : []),
        ]
    const certifications = chance(0.5)
      ? [(() => {
          const [name, issuingOrganization] = pick(TRAININGS)
          const year = Math.max(joinedYear, 2018) + Math.floor(rand() * 3)
          return { name, issuingOrganization, issueDate: date(Math.min(year, 2025), 6, 15), expiryDate: "", reference: "" }
        })()]
      : []

    // Subject teaching, plus one class-teacher role for most full-time staff.
    const assignments: Record<string, unknown>[] = []
    const subjects = department.subjects.length ? department.subjects : []
    const taught = role === "chief" ? [] : [...subjects].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 2))
    const seen = new Set<string>()
    for (const subject of taught) {
      const classes = [...classesFor(subject)].sort(() => rand() - 0.5).slice(0, 2 + Math.floor(rand() * 2))
      for (const c of classes) {
        const sections = sectionsOf(c.id)
        const section = sections.length ? pick(sections) : null
        const key = `${subject.id}:${c.id}:${section?.id}`
        if (seen.has(key)) continue
        seen.add(key)
        assignments.push({
          academicYearId: year.id, educationLevelId: "", programId: "", classId: c.id,
          sectionId: section?.id ?? "", subjectId: subject.id, batchId: "", role: "SUBJECT_TEACHER",
          startDate: newJoiner ? dateOfJoining : year.startDate, weeklyPeriods: 4 + Math.floor(rand() * 3), notes: "",
        })
      }
    }
    if (role === "member" && type === "FULL_TIME" && classTeacherPool.length && chance(0.7)) {
      const slot = classTeacherPool.shift()!
      assignments.push({
        academicYearId: year.id, educationLevelId: "", programId: "", classId: slot.classId,
        sectionId: slot.sectionId, subjectId: "", batchId: "", role: "CLASS_TEACHER",
        startDate: year.startDate, weeklyPeriods: "", notes: "",
      })
    }

    try {
      const teacher = await createTeacher(ctx, {
        employeeId: "",
        personal: {
          firstName,
          middleName: chance(0.25) ? pick(female ? ["Kumari", "Devi"] : ["Bahadur", "Prasad", "Kumar"]) : "",
          lastName: surname,
          nameNepali: "",
          dateOfBirth: incomplete ? "" : date(2026 - age, 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 28)),
          gender: female ? "FEMALE" : "MALE",
          nationality: "Nepali",
        },
        contact: {
          email: incomplete ? "" : `${firstName}.${surname}${i}@example.com`.toLowerCase(),
          phone: `98${String(60000000 + i * 7919 + Math.floor(rand() * 1000)).padStart(8, "0")}`,
          alternatePhone: chance(0.3) ? `01-${4000000 + i * 131}` : "",
          emergencyContactName: incomplete ? "" : `${pick(female ? MEN : WOMEN)} ${surname}`,
          emergencyContactPhone: incomplete ? "" : `98${String(70000000 + i * 3571).padStart(8, "0")}`,
          emergencyContactRelationship: incomplete ? "" : "Spouse",
        },
        permanentAddress: {
          province: String(province), district, municipality,
          wardNumber: String(1 + Math.floor(rand() * 20)), tole: pick(["Chowk", "Tole", "Marg", "Gaun"]),
        },
        sameAsPermanent: chance(0.6),
        temporaryAddress: { province: String(plan.locations[0][0]), district: plan.locations[0][1], municipality: plan.locations[0][2], wardNumber: "5" },
        employment,
        qualifications,
        certifications,
        assignments,
        userId: "",
      })
      if (role === "chief") chiefId = teacher.id
      if (role === "head") heads.set(department.code, teacher.id)
      createdIds.push({ id: teacher.id, i, employment })
      created++
    } catch (error) {
      failures.push(`${firstName} ${surname}: ${(error as Error).message} ${JSON.stringify((error as { fieldErrors?: unknown }).fieldErrors ?? "")}`)
    }
  }

  // Leaders first so everyone else can report to them.
  for (const person of people.filter((p) => p.role !== "member")) await add(person)
  const queue = people.filter((p) => p.role === "member")
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) await add(queue.shift()!)
  }))

  // Verify most qualifications; leave a few pending for the review queue.
  const qualifications = await prisma.teacherQualification.findMany({
    where: { organizationId: organization.id },
    select: { id: true, teacherId: true },
  })
  for (const q of qualifications) {
    if (chance(0.7)) await verifyRecord(ctx, q.teacherId, "qualification", q.id, { status: chance(0.95) ? "VERIFIED" : "REJECTED" })
  }

  // A realistic mix of employment states among regular staff.
  const members = createdIds.filter((t) => people[t.i].role === "member")
  const change = async (index: number, employmentStatus: string, effectiveDate: string, changeNote: string) => {
    const t = members[index]
    if (!t) return
    await changeEmployment(ctx, t.id, { ...t.employment, employmentStatus, effectiveDate, changeNote })
  }
  await change(members.length - 1, "RESIGNED", "2026-07-15", "Moved abroad for further studies")
  await change(members.length - 2, "ON_LEAVE", "2026-08-01", "Maternity/paternity leave")
  await change(members.length - 3, "RETIRED", "2026-06-30", "Reached retirement age")
  if (members.length > 6) {
    const t = members[members.length - 4]
    await change(members.length - 4, "RESIGNED", "2026-05-31", "Duplicate profile")
    await archiveTeacher(ctx, t.id)
  }

  console.log(`    ${created} teachers added, ${qualifications.length} qualifications`)
  for (const f of failures) console.log(`    ✘ ${f}`)
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production")
  for (const plan of PLANS) await seedOrganization(plan)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
