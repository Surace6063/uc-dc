// Development data: dummy non-teaching staff for the seeded organisations.
//
//   npm run db:seed:staff
//
// Staff are added through the real services, so employee IDs (shared with
// teachers), employment history, responsibilities and audit logs follow the
// same rules as the UI. Data comes from a fixed seed (same people every run).
// The common departments and designations are added if missing, and an
// organisation that already has staff is skipped, so this is safe to re-run.
// No document files are uploaded (documents need real files in storage).
// Run `npm run db:seed` first to create the organisations.
import { prisma } from "@/lib/prisma"
import {
  addSuggestedStaffStructure,
  getStaffFormOptions,
  saveStaffDocumentType,
} from "@/services/staff/config-service"
import {
  archiveStaff,
  changeStaffEmployment,
  createStaff,
  verifyStaffRecord,
} from "@/services/staff/staff-service"

import { seedContext, type SeedOrganization } from "./seed-structure"

// [department code, designation, qualification level, qualification title, specialization, extra certification?]
type Role = [string, string, string, string, string, [string, string]?]

const ROLES: Role[] = [
  ["ADMIN", "Administrative Officer", "MASTER", "MBS", "Management", ["Office Management", "Nepal Administrative Staff College"]],
  ["HR", "HR Officer", "MASTER", "MBA", "Human Resource Management"],
  ["FIN", "Accountant", "BACHELOR", "BBS", "Accounting", ["CA Intermediate", "ICAN"]],
  ["FIN", "Accountant", "BACHELOR", "BBS", "Finance"],
  ["RECEP", "Receptionist", "HIGHER_SECONDARY", "+2 Management", "Business Studies"],
  ["LIB", "Librarian", "MASTER", "Master in Library and Information Science", "Library Science"],
  ["LIB", "Assistant Librarian", "BACHELOR", "Bachelor in Library Science", "Library Science"],
  ["LAB", "Lab Assistant", "BACHELOR", "B.Sc.", "Chemistry", ["Laboratory Safety Training", "Nepal Academy of Science and Technology"]],
  ["IT", "IT Support Officer", "BACHELOR", "B.Sc. CSIT", "Networking", ["CCNA", "Cisco"]],
  ["TRANS", "Transport Coordinator", "BACHELOR", "BA", "Sociology"],
  ["TRANS", "Driver", "SECONDARY", "SEE", "General", ["Heavy Vehicle Driving Licence Training", "Department of Transport Management"]],
  ["TRANS", "Driver", "SECONDARY", "SEE", "General"],
  ["HOSTEL", "Hostel Warden", "BACHELOR", "B.Ed.", "Education"],
  ["HEALTH", "Nurse", "DIPLOMA", "PCL Nursing", "Nursing", ["Basic Life Support", "Nepal Red Cross Society"]],
  ["SEC", "Security Guard", "SECONDARY", "SEE", "General"],
  ["SEC", "Security Guard", "SECONDARY", "SEE", "General"],
  ["FAC", "Maintenance Staff", "DIPLOMA", "Diploma in Electrical Engineering", "Electrical", ["Electrician Level 2", "CTEVT"]],
  ["FAC", "Cleaner", "SECONDARY", "SEE", "General"],
  ["FAC", "Cleaner", "SECONDARY", "SEE", "General"],
  ["ADMIN", "Office Assistant", "HIGHER_SECONDARY", "+2 Management", "Accountancy"],
]

const PLANS: { slug: string; count: number; locations: [number, string, string][] }[] = [
  {
    slug: "abc-international-school",
    count: 20,
    locations: [
      [3, "Kathmandu", "Kathmandu Metropolitan City"],
      [3, "Lalitpur", "Lalitpur Metropolitan City"],
      [3, "Bhaktapur", "Madhyapur Thimi Municipality"],
      [1, "Jhapa", "Mechinagar Municipality"],
    ],
  },
  {
    slug: "xyz-college",
    count: 15,
    locations: [
      [4, "Kaski", "Pokhara Metropolitan City"],
      [4, "Tanahun", "Byas Municipality"],
      [5, "Rupandehi", "Butwal Sub-Metropolitan City"],
    ],
  },
]

const SURNAMES = ["Shrestha", "Gurung", "Tamang", "Rai", "Magar", "Thapa", "Karki", "Adhikari", "Sharma", "Poudel", "Bhandari", "Maharjan", "Shakya", "Lama", "Chaudhary", "Yadav", "KC", "Bista"]
const MEN = ["Ram", "Krishna", "Suman", "Bijay", "Ramesh", "Sanjay", "Anil", "Roshan", "Sagar", "Dipendra", "Sujan", "Bhim"]
const WOMEN = ["Sita", "Kamala", "Radha", "Puja", "Asmita", "Srijana", "Bimala", "Usha", "Sarala", "Menuka", "Durga", "Pabitra"]
const COLLEGES = ["Shanker Dev Campus", "Tri-Chandra Multiple Campus", "Patan Multiple Campus", "Prithvi Narayan Campus", "Butwal Multiple Campus"]
const RESPONSIBILITIES: [string, string][] = [
  ["ADMIN", "Examination administration"],
  ["IT", "Computer lab maintenance"],
  ["LIB", "Book bank management"],
  ["FIN", "Inventory and stores"],
  ["HEALTH", "Health camp coordination"],
]

// Small deterministic PRNG so every run produces the same people.
function random(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const date = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
const isoDay = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)

async function seedOrganization(plan: (typeof PLANS)[number]) {
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
  if ((await prisma.staff.count({ where: { organizationId: organization.id } })) > 0) {
    console.log("    already has staff; skipped")
    return
  }

  const ctx = seedContext(organization, actor.userId)
  const added = await addSuggestedStaffStructure(ctx)
  console.log(`    ${added.departments} departments, ${added.designations} designations added`)
  const hasDocTypes = await prisma.documentRequirement.count({ where: { organizationId: organization.id, audience: "STAFF" } })
  if (!hasDocTypes) {
    await saveStaffDocumentType(ctx, null, { name: "CV / résumé", isRequired: true, isActive: true, sortOrder: 10 })
    await saveStaffDocumentType(ctx, null, { name: "Appointment letter", isRequired: true, isActive: true, sortOrder: 20 })
    await saveStaffDocumentType(ctx, null, { name: "Citizenship certificate copy", isRequired: false, isActive: true, sortOrder: 30 })
  }
  const options = await getStaffFormOptions(ctx)
  const departmentId = (code: string) => options.departments.find((d) => d.code === code)?.id ?? ""
  const designationId = (name: string) => options.designations.find((d) => d.name === name)?.id ?? ""

  const rand = random(organization.slug.length * 7919)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const chance = (p: number) => rand() < p

  const created: { id: string; dept: string; employment: Record<string, unknown> }[] = []
  const managers = new Map<string, string>() // department code → first person added there
  const failures: string[] = []

  for (let i = 0; i < plan.count; i++) {
    const [dept, title, level, qualification, specialization, cert] = ROLES[i % ROLES.length]
    const female = title === "Nurse" || title === "Receptionist" ? chance(0.8) : chance(0.4)
    const firstName = pick(female ? WOMEN : MEN)
    const surname = pick(SURNAMES)
    const age = 22 + Math.floor(rand() * 33)
    const [province, district, municipality] = pick(plan.locations)
    const type = pick(["FULL_TIME", "FULL_TIME", "FULL_TIME", "CONTRACT", "PART_TIME", "TEMPORARY", "CASUAL"] as const)
    const fixedTerm = type === "CONTRACT" || type === "TEMPORARY" || type === "CASUAL"
    const newJoiner = i > 3 && chance(0.15)
    const joined = newJoiner ? isoDay(-20 - Math.floor(rand() * 50)) : date(2026 - 1 - Math.floor(rand() * 12), 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 28))
    // A few contracts end soon so the "expiring" card has something to show.
    const contractEnd = fixedTerm ? (chance(0.4) ? isoDay(10 + Math.floor(rand() * 45)) : date(2027, 4, 13)) : ""
    const incomplete = chance(0.1)

    const employment = {
      dateOfJoining: joined,
      employmentType: type,
      employmentStatus: "ACTIVE",
      departmentId: departmentId(dept),
      designationId: designationId(title),
      reportingToId: managers.get(dept) ?? managers.get("ADMIN") ?? "",
      contractStartDate: fixedTerm ? (joined > "2026-04-14" ? joined : "2026-04-14") : "",
      contractEndDate: contractEnd,
      onProbation: newJoiner,
      probationStartDate: newJoiner ? joined : "",
      probationEndDate: newJoiner ? isoDay(120) : "",
    }

    try {
      const staff = await createStaff(ctx, {
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
          email: incomplete || chance(0.15) ? "" : `${firstName}.${surname}.staff${i}@example.com`.toLowerCase(),
          phone: incomplete && chance(0.5) ? "" : `98${String(41000000 + i * 6007 + Math.floor(rand() * 1000)).padStart(8, "0")}`,
          alternatePhone: chance(0.2) ? `01-${5000000 + i * 173}` : "",
          emergencyContactName: `${pick(female ? MEN : WOMEN)} ${surname}`,
          emergencyContactPhone: `98${String(80000000 + i * 2711).padStart(8, "0")}`,
          emergencyContactRelationship: pick(["Spouse", "Father", "Mother", "Brother"]),
        },
        permanentAddress: {
          province: String(province), district, municipality,
          wardNumber: String(1 + Math.floor(rand() * 18)), tole: pick(["Chowk", "Tole", "Marg", "Gaun"]),
        },
        sameAsPermanent: chance(0.6),
        temporaryAddress: { province: String(plan.locations[0][0]), district: plan.locations[0][1], municipality: plan.locations[0][2], wardNumber: "7" },
        employment,
        qualifications: incomplete
          ? []
          : [
              {
                kind: "ACADEMIC", level, title: qualification, specialization,
                institutionName: level === "SECONDARY" ? "" : pick(COLLEGES),
                awardingBody: level === "SECONDARY" ? "National Examinations Board" : level === "DIPLOMA" ? "CTEVT" : "Tribhuvan University",
                country: "Nepal", completionYear: Math.min(2026 - age + (level === "MASTER" ? 26 : level === "BACHELOR" ? 23 : 18), 2025),
                result: chance(0.5) ? "First Division" : `${(2.6 + rand() * 1.3).toFixed(2)} GPA`,
              },
              ...(cert
                ? [{ kind: "CERTIFICATION", title: cert[0], awardingBody: cert[1], country: "Nepal", completionYear: 2019 + Math.floor(rand() * 6) }]
                : []),
            ],
        assignments: RESPONSIBILITIES.filter(([d]) => d === dept && !managers.has(dept)).map(([, t]) => ({
          title: t, departmentId: departmentId(dept), startDate: "2026-04-14", notes: "",
        })),
        userId: "",
      })
      if (!managers.has(dept)) managers.set(dept, staff.id)
      created.push({ id: staff.id, dept, employment })
    } catch (error) {
      failures.push(`${firstName} ${surname}: ${(error as Error).message} ${JSON.stringify((error as { fieldErrors?: unknown }).fieldErrors ?? "")}`)
    }
  }

  // Verify most qualifications; leave some pending for the review queue.
  const qualifications = await prisma.staffQualification.findMany({ where: { organizationId: organization.id }, select: { id: true, staffId: true } })
  for (const q of qualifications) {
    if (chance(0.7)) await verifyStaffRecord(ctx, q.staffId, "qualification", q.id, { status: chance(0.95) ? "VERIFIED" : "REJECTED" })
  }

  // A realistic mix of employment states, recorded as history.
  const change = async (index: number, values: Record<string, unknown>) => {
    const s = created[index]
    if (s) await changeStaffEmployment(ctx, s.id, { ...s.employment, ...values })
  }
  const last = created.length - 1
  await change(last, { employmentStatus: "RESIGNED", resignationDate: isoDay(-5), lastWorkingDate: isoDay(-1), leavingReason: "Moved abroad", effectiveDate: isoDay(-1), changeNote: "Resigned" })
  await change(last - 1, { employmentStatus: "ON_LEAVE", effectiveDate: isoDay(-3), changeNote: "Maternity leave" })
  await change(last - 2, { employmentStatus: "RETIRED", lastWorkingDate: isoDay(-2), effectiveDate: isoDay(-2), changeNote: "Reached retirement age" })
  if (created.length > 8) {
    // Promoted within the same department.
    await change(1, { designationId: designationId("Administrative Officer"), departmentId: departmentId("ADMIN"), effectiveDate: "2026-04-14", changeNote: "Promoted" })
    // A duplicate entry: marked terminated and archived.
    await change(last - 3, { employmentStatus: "TERMINATED", terminationDate: isoDay(-1), lastWorkingDate: isoDay(-1), leavingReason: "Duplicate profile", effectiveDate: isoDay(-1) })
    await archiveStaff(ctx, created[last - 3].id)
  }

  console.log(`    ${created.length} staff added, ${qualifications.length} qualification records`)
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
