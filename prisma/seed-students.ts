// Development data: dummy students for the seeded organisations.
//
//   npm run db:seed:students
//
// Students are admitted through the real services, so admission numbers,
// guardians, roll numbers and enrollments follow the same rules as the UI.
// Data is generated from a fixed seed (same names every run). An
// organisation that already has students is skipped, so this is safe to
// re-run. Run `npm run db:seed` first to create the organisations.
import type { EducationStructure } from "@/services/academics/structure-service"
import { getEducationStructure } from "@/services/academics/structure-service"
import { prisma } from "@/lib/prisma"
import { progressEnrollment } from "@/services/students/enrollment-service"
import {
  archiveStudent,
  changeStudentStatus,
  createStudent,
} from "@/services/students/student-service"

import { seedContext, seedEducationStructure, type SeedOrganization } from "./seed-structure"

type Plan = { slug: string; presets: string[]; students: number; locations: [number, string, string][] }

const PLANS: Plan[] = [
  {
    slug: "abc-international-school",
    presets: ["ecd", "basic", "secondary"],
    students: 80,
    locations: [
      [3, "Kathmandu", "Kathmandu Metropolitan City"],
      [3, "Kathmandu", "Budhanilkantha Municipality"],
      [3, "Lalitpur", "Lalitpur Metropolitan City"],
      [3, "Bhaktapur", "Madhyapur Thimi Municipality"],
      [3, "Kathmandu", "Kageshwori Manohara Municipality"],
    ],
  },
  {
    slug: "xyz-college",
    presets: ["higher_secondary", "bachelor"],
    students: 50,
    locations: [
      [4, "Kaski", "Pokhara Metropolitan City"],
      [3, "Chitwan", "Bharatpur Metropolitan City"],
      [5, "Rupandehi", "Butwal Sub-Metropolitan City"],
      [1, "Morang", "Biratnagar Metropolitan City"],
      [4, "Syangja", "Waling Municipality"],
      [7, "Kailali", "Dhangadhi Sub-Metropolitan City"],
    ],
  },
]

const SURNAMES = [
  "Shrestha", "Gurung", "Tamang", "Rai", "Magar", "Thapa", "Karki", "Adhikari", "Sharma", "Poudel",
  "Bhattarai", "Maharjan", "Shakya", "Bajracharya", "Limbu", "Sherpa", "Khadka", "Basnet", "Joshi", "Yadav",
]
const BOYS = [
  "Aarav", "Aayush", "Bibek", "Bishal", "Kushal", "Nischal", "Prabin", "Rohan", "Sagar", "Sujan",
  "Saugat", "Anish", "Pratik", "Ritesh", "Suraj", "Kiran", "Utsav", "Prajwal", "Aadarsha", "Samir",
]
const GIRLS = [
  "Aastha", "Anjali", "Bipana", "Prakriti", "Sanjana", "Shristi", "Sneha", "Aakriti", "Pooja", "Rojina",
  "Samikshya", "Nisha", "Puja", "Sushma", "Kritika", "Manisha", "Riya", "Srijana", "Asmita", "Barsha",
]
const FATHERS = ["Ram", "Hari", "Krishna", "Shyam", "Gopal", "Bishnu", "Dipak", "Ramesh", "Suresh", "Rajendra", "Binod", "Madan"]
const MOTHERS = ["Sita", "Gita", "Laxmi", "Kamala", "Sarita", "Sunita", "Radha", "Maya", "Bimala", "Anita", "Mina", "Sabita"]
const OCCUPATIONS = ["Teacher", "Business", "Farmer", "Civil servant", "Engineer", "Nurse", "Driver", "Shopkeeper", "Abroad (foreign employment)", null]
const TONGUES = ["Nepali", "Nepali", "Nepali", "Newari", "Maithili", "Tamang", "Gurung", "Bhojpuri"]
const BLOOD = ["A+", "B+", "O+", "AB+", "O-", "", ""]

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

type Class = EducationStructure["classes"][number]

// Typical age at the start of 2083 (AD 2026) for a class.
function ageFor(c: Class, level: string, program?: string) {
  const n = Number(c.name.match(/\d+/)?.[0] ?? c.sequence)
  if (level === "ECD") return 3 + c.sequence // Nursery 4, LKG 5, UKG 6
  if (c.kind === "GRADE") return n + 5
  if (program === "BBS") return 18 + n
  return 18 + Math.floor((n - 1) / 2) // semesters
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

  if ((await prisma.student.count({ where: { organizationId: organization.id } })) > 0) {
    console.log("    already has students; skipped")
    return
  }

  const ctx = seedContext(organization, actor.userId)
  const structure = await getEducationStructure(ctx)
  const previousYear = structure.years.find((y) => y.name === "2082")
  const currentYear = structure.years.find((y) => y.isCurrent)
  if (!currentYear) throw new Error("No current academic year")

  const rand = random(organization.slug.length * 7919)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const chance = (p: number) => rand() < p

  // Families: siblings share a guardian (same name + phone → one record).
  const families = Array.from({ length: Math.ceil(plan.students * 0.8) }, (_, i) => {
    const surname = pick(SURNAMES)
    const [province, district, municipality] = pick(plan.locations)
    return {
      surname,
      father: `${pick(FATHERS)} ${surname}`,
      mother: `${pick(MOTHERS)} ${surname}`,
      phone: `98${String(41000000 + i * 1373 + Math.floor(rand() * 1000)).padStart(8, "0")}`,
      occupation: pick(OCCUPATIONS),
      address: { province: String(province), district, municipality, wardNumber: String(1 + Math.floor(rand() * 20)), tole: pick(["Chowk", "Tole", "Marg", "Gaun"]) },
    }
  })

  const level = (id: string) => structure.levels.find((l) => l.id === id)!
  const program = (id: string | null) => structure.programs.find((p) => p.id === id)
  const sectionsOf = (classId: string) => structure.sections.filter((s) => s.classId === classId)
  // The class before this one in the same level/program (none for the first).
  const previousClass = (c: Class) =>
    structure.classes.find(
      (x) => x.educationLevelId === c.educationLevelId && x.programId === c.programId && x.sequence === c.sequence - 1
    ) ?? null

  let created = 0
  const failures: string[] = []
  const tasks = Array.from({ length: plan.students }, (_, i) => async () => {
    const family = families[i % families.length]
    const female = chance(0.5)
    const firstName = pick(female ? GIRLS : BOYS)
    const academicClass = pick(structure.classes)
    const lvl = level(academicClass.educationLevelId)
    const prog = program(academicClass.programId)
    const age = ageFor(academicClass, lvl.code, prog?.code)
    const sections = sectionsOf(academicClass.id)
    const section = sections.length ? pick(sections) : null
    // Promoted from last year for most students not in a first class.
    const prior = previousYear && academicClass.sequence > 1 && chance(0.7) ? previousClass(academicClass) : null
    const priorSection = prior ? (sectionsOf(prior.id).find((s) => s.name === section?.name) ?? sectionsOf(prior.id)[0] ?? null) : null
    const incomplete = chance(0.06)

    const guardians = incomplete && chance(0.5)
      ? []
      : [
          {
            fullName: family.father, phone: family.phone, occupation: family.occupation ?? "",
            relationship: "FATHER", isPrimary: true, isEmergencyContact: true,
            receivesAcademicNotifications: true, receivesBillingNotifications: true,
          },
          ...(chance(0.6)
            ? [{
                fullName: family.mother, phone: `98${String(51000000 + i * 977).padStart(8, "0")}`,
                relationship: "MOTHER", isPrimary: false, isEmergencyContact: true,
                receivesAcademicNotifications: true, receivesBillingNotifications: false,
              }]
            : []),
        ]

    const placement = (c: Class, sectionId: string | null, yearId: string) => ({
      academicYearId: yearId,
      educationLevelId: c.educationLevelId,
      programId: c.programId ?? "",
      classId: c.id,
      sectionId: sectionId ?? "",
      batchId: "",
      rollNumber: "",
      enrollmentDate: "",
      enrollmentType: "NEW_ADMISSION",
    })

    try {
      const student = await createStudent(ctx, {
        personal: {
          firstName,
          middleName: chance(0.2) ? pick(["Kumar", "Bahadur", "Kumari", "Prasad"]) : "",
          lastName: family.surname,
          dateOfBirth: incomplete && chance(0.5) ? "" : date(2026 - age - 1, 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 28)),
          gender: female ? "FEMALE" : "MALE",
          nationality: "Nepali",
          email: age >= 15 && chance(0.6) ? `${firstName}.${family.surname}${i}@example.com`.toLowerCase() : "",
          phone: age >= 16 && chance(0.5) ? `97${String(40000000 + i * 4111).padStart(8, "0")}` : "",
          bloodGroup: pick(BLOOD),
          motherTongue: pick(TONGUES),
        },
        admission: {
          admissionNumber: "",
          admissionDate: prior ? date(2025, 4, 15 + Math.floor(rand() * 10)) : date(2026, 4, 15 + Math.floor(rand() * 10)),
          admissionType: chance(0.1) ? "TRANSFER" : "NEW",
          previousSchool: chance(0.1) ? "Shree Janata Secondary School" : "",
        },
        permanentAddress: family.address,
        sameAsPermanent: chance(0.8),
        temporaryAddress: { province: "3", district: "Kathmandu", municipality: "Kathmandu Metropolitan City", wardNumber: "4" },
        guardians,
        enroll: true,
        enrollment: prior
          ? placement(prior, priorSection?.id ?? null, previousYear!.id)
          : placement(academicClass, section?.id ?? null, currentYear.id),
      })

      if (prior) {
        const first = await prisma.enrollment.findFirstOrThrow({ where: { studentId: student.id }, select: { id: true } })
        await progressEnrollment(ctx, first.id, {
          outcome: "PROMOTED",
          endedOn: "2026-04-10",
          createNext: true,
          next: { ...placement(academicClass, section?.id ?? null, currentYear.id), enrollmentDate: "2026-04-20", enrollmentType: "PROMOTION" },
        })
      }

      // A realistic mix of lifecycle states.
      const r = rand()
      if (r < 0.04) await changeStudentStatus(ctx, student.id, { status: "WITHDRAWN", reason: "Family relocated" })
      else if (r < 0.07) await changeStudentStatus(ctx, student.id, { status: "TRANSFERRED", reason: "Transferred to another school" })
      else if (r < 0.09) await changeStudentStatus(ctx, student.id, { status: "SUSPENDED", reason: "Disciplinary review" })
      else if (r < 0.12) await archiveStudent(ctx, student.id, "Duplicate record kept for reference")
      created++
    } catch (error) {
      failures.push(`${firstName} ${family.surname}: ${(error as Error).message} ${JSON.stringify((error as { fieldErrors?: unknown }).fieldErrors ?? "")}`)
    }
  })

  // A few at a time keeps the remote database comfortable.
  const queue = [...tasks]
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) await queue.shift()!()
  }))

  console.log(`    ${created} students admitted`)
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
