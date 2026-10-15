// Development seed: demo finance data for the seeded organisations.
//
//   npm run db:seed:finance
//
// Run after db:seed, db:seed:students (students must be enrolled in the
// current academic year). Organisations that already have fee structures
// are skipped, so it is safe to re-run. Everything goes through the finance
// services, so balances, receipts and the audit log stay consistent.
import { localDate } from "@/features/attendance/constants"
import { DEFAULT_CATEGORIES } from "@/features/finance/constants"
import { toPaisa } from "@/features/finance/money"
import type { PaymentMethod } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import { toDate } from "@/lib/validation"
import { addConcession, addDefaultCategories, assignFeeStructure, saveFeeStructure } from "@/services/finance/fee-service"
import { saveEntry } from "@/services/finance/ledger-service"
import { recordPayment, reversePayment } from "@/services/finance/payment-service"

import { seedContext, type SeedOrganization } from "./seed-structure"

// A fixed seed, so every run makes the same choices.
let state = 20830
function random() {
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]

const DAY = 864e5
// The institution's local date, as the payment form checks it.
const today = localDate()
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * DAY).toISOString().slice(0, 10)
const minDay = (a: string, b: string) => (a < b ? a : b)
const maxDay = (a: string, b: string) => (a > b ? a : b)

// Yearly fees per level, in rupees. Matched on the level's name, most
// specific first ("Higher Secondary" before "Secondary").
const LEVEL_FEES: { match: RegExp; tuition: number; admission: number; exam: number; lab?: number }[] = [
  { match: /bachelor/i, tuition: 96_000, admission: 20_000, exam: 4_000, lab: 5_000 },
  { match: /higher secondary|\+2/i, tuition: 72_000, admission: 15_000, exam: 3_000, lab: 4_000 },
  { match: /secondary/i, tuition: 60_000, admission: 10_000, exam: 2_500, lab: 3_000 },
  { match: /basic/i, tuition: 48_000, admission: 7_500, exam: 2_000 },
  { match: /ecd|ece|pre-?primary/i, tuition: 36_000, admission: 5_000, exam: 1_500 },
]

const PLANS: { slug: string; salaries: number; rent: number; grant?: number; donation?: number }[] = [
  { slug: "abc-international-school", salaries: 650_000, rent: 120_000, donation: 50_000 },
  { slug: "xyz-college", salaries: 900_000, rent: 150_000, grant: 1_500_000 },
]

type Ctx = ReturnType<typeof seedContext>

function payMethod(): { method: PaymentMethod; reference?: string; confirmedOnline?: boolean } {
  const r = random()
  if (r < 0.6) return { method: "CASH" }
  if (r < 0.8) return { method: "BANK_TRANSFER", reference: `NIC${between(10_000_000, 99_999_999)}` }
  if (r < 0.9) return { method: "ESEWA", reference: `ES${between(100_000_000, 999_999_999)}`, confirmedOnline: true }
  return { method: "CHEQUE", reference: `CHQ-${between(100_000, 999_999)}` }
}

async function seedOrganization(plan: (typeof PLANS)[number]) {
  const organization = (await prisma.organization.findUnique({ where: { slug: plan.slug }, select: { id: true, name: true, slug: true, type: true } })) as SeedOrganization | null
  if (!organization) {
    console.log(`✘ ${plan.slug} not found; run npm run db:seed first`)
    return
  }
  const organizationId = organization.id
  // Receipts show who took the money: the accountant when there is one.
  const actor =
    (await prisma.organizationMember.findFirst({ where: { organizationId, role: { slug: "accountant" } }, orderBy: { createdAt: "asc" }, select: { userId: true } })) ??
    (await prisma.organizationMember.findFirst({ where: { organizationId, role: { slug: { in: ["owner", "admin"] } } }, orderBy: { createdAt: "asc" }, select: { userId: true } }))
  if (!actor) {
    console.log(`✘ ${organization.name} has no accountant, owner or admin`)
    return
  }
  console.log(`✔ ${organization.name}`)
  if ((await prisma.feeStructure.count({ where: { organizationId } })) > 0) {
    console.log("    already has fee structures; skipped")
    return
  }
  const year = await prisma.academicYear.findFirst({ where: { organizationId, isCurrent: true }, select: { id: true, name: true, startDate: true } })
  if (!year) {
    console.log("    no current academic year; skipped")
    return
  }
  const ctx: Ctx = seedContext(organization, actor.userId)
  const yearStart = year.startDate.toISOString().slice(0, 10)
  const due = (days: number) => addDays(yearStart, days)

  await addDefaultCategories(ctx)
  const categories = await prisma.financeCategory.findMany({ where: { organizationId }, select: { id: true, name: true, kind: true } })
  const category = (name: string) => categories.find((c) => c.name === name)!.id
  const expectedNames = DEFAULT_CATEGORIES.map((c) => c.name)
  if (!expectedNames.every((n) => categories.some((c) => c.name === n))) throw new Error("Default finance categories are missing")

  // ------------------------------------------------------------ structures
  const levels = await prisma.educationLevel.findMany({ where: { organizationId }, select: { id: true, name: true } })
  let structures = 0
  for (const level of levels) {
    const fees = LEVEL_FEES.find((f) => f.match.test(level.name))
    if (!fees) continue
    const enrolled = await prisma.enrollment.count({ where: { organizationId, academicYearId: year.id, educationLevelId: level.id, status: { in: ["ACTIVE", "ON_HOLD"] } } })
    if (!enrolled) continue
    const quarter = fees.tuition / 4
    const defs = [
      { categoryId: category("Admission fee"), name: `${level.name} admission fee ${year.name}`, amount: fees.admission, installments: [] as { label: string; dueDate: string; amount: number }[], dueDate: due(16) },
      {
        categoryId: category("Tuition fee"), name: `${level.name} tuition fee ${year.name}`, amount: fees.tuition,
        installments: [
          { label: "1st quarter", dueDate: due(31), amount: quarter },
          { label: "2nd quarter", dueDate: due(123), amount: quarter },
          { label: "3rd quarter", dueDate: due(215), amount: quarter },
          { label: "4th quarter", dueDate: due(307), amount: quarter },
        ],
      },
      { categoryId: category("Examination fee"), name: `${level.name} first terminal exam fee ${year.name}`, amount: fees.exam, installments: [], dueDate: due(169) },
      ...(fees.lab ? [{ categoryId: category("Laboratory / practical fee"), name: `${level.name} lab fee ${year.name}`, amount: fees.lab, installments: [], dueDate: due(61) }] : []),
    ]
    for (const d of defs) {
      // A structure without installments has no due date; give it one
      // installment so the fee is due on a date (and can become overdue).
      const installments = d.installments.length ? d.installments : [{ label: "Full", dueDate: d.dueDate!, amount: d.amount }]
      const saved = await saveFeeStructure(ctx, null, {
        academicYearId: year.id, categoryId: d.categoryId, name: d.name, educationLevelId: level.id, amount: String(d.amount), isActive: true,
        installments: installments.map((i) => ({ label: i.label, dueDate: i.dueDate, amount: String(i.amount) })),
      })
      await assignFeeStructure(ctx, { feeStructureId: saved.id, studentIds: [] })
      structures++
    }
  }
  console.log(`    ${structures} fee structures assigned`)

  const students = await prisma.student.findMany({
    where: { organizationId, archivedAt: null, fees: { some: {} } },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, firstName: true, lastName: true },
  })

  // ------------------------------------------------------------ concessions
  let concessions = 0
  for (const s of students) {
    const r = random()
    if (r > 0.12) continue
    const later = await prisma.studentFee.findMany({ where: { organizationId, studentId: s.id, status: "UNPAID", dueDate: { gt: toDate(today) } }, orderBy: { dueDate: "asc" }, select: { id: true } })
    for (const fee of later) {
      if (r < 0.06) {
        await addConcession(ctx, { studentFeeId: fee.id, kind: "SCHOLARSHIP", scholarshipCategory: pick(["MERIT", "NEED_BASED", "DALIT"] as const), title: "Scholarship", percent: pick([25, 50]), reason: "Approved by the scholarship committee" })
      } else {
        await addConcession(ctx, { studentFeeId: fee.id, kind: "DISCOUNT", title: "Sibling discount", percent: 10, reason: "Sibling studying at the institution" })
      }
      concessions++
    }
  }
  console.log(`    ${concessions} concessions`)

  // ------------------------------------------------------------ payments
  // Each student pays in visits: fees due within a month of each other are
  // paid together, shortly before (or after) they fall due.
  let payments = 0
  const cheques: string[] = []
  for (const s of students) {
    // The demo student login always has paid, partly paid and open fees.
    const r = s.userId ? 0.5 : random()
    const profile = r < 0.15 ? "full" : r < 0.7 ? "partial" : r < 0.9 ? "admission" : "none"
    if (profile === "none") continue
    const lines = (await prisma.studentFee.findMany({ where: { organizationId, studentId: s.id, cancelledAt: null }, orderBy: { dueDate: "asc" }, select: { amount: true, discountAmount: true, dueDate: true } }))
      .map((f) => ({ due: f.dueDate!.toISOString().slice(0, 10), amount: toPaisa(f.amount) - toPaisa(f.discountAmount) }))
      .filter((l) => l.amount > 0)
    const pastDue = lines.filter((l) => l.due <= today)
    const covered =
      profile === "full" ? pastDue.map((l) => ({ ...l }))
      : profile === "admission" ? pastDue.slice(0, 1).map((l) => ({ ...l }))
      : (() => {
          const early = pastDue.filter((l) => l.due <= due(60)).map((l) => ({ ...l }))
          const next = pastDue[early.length]
          if (next) early.push({ ...next, amount: Math.round((next.amount * between(30, 80)) / 100 / 10_000) * 10_000 || next.amount })
          return early
        })()
    const visits: { due: string; amount: number }[] = []
    for (const line of covered) {
      const last = visits.at(-1)
      if (last && Date.parse(line.due) - Date.parse(last.due) <= 31 * DAY) last.amount += line.amount
      else visits.push({ ...line })
    }
    for (const v of visits) {
      const receivedOn = maxDay(yearStart, minDay(addDays(v.due, between(-20, 10)), addDays(today, -1)))
      const m = payMethod()
      const payment = await recordPayment(ctx, { studentId: s.id, amount: (v.amount / 100).toFixed(2), receivedOn, ...m, payerName: `Guardian of ${s.firstName} ${s.lastName}` })
      if (m.method === "CHEQUE") cheques.push(payment.id)
      payments++
    }
  }

  // A few cheques for the next installment are still clearing.
  let pending = 0
  for (const s of students) {
    if (pending >= 3) break
    const open = await prisma.studentFee.findFirst({ where: { organizationId, studentId: s.id, status: "UNPAID", dueDate: { gt: toDate(today) } }, select: { id: true, amount: true, discountAmount: true } })
    if (!open || random() < 0.7) continue
    await recordPayment(ctx, {
      studentId: s.id, studentFeeIds: [open.id], amount: ((toPaisa(open.amount) - toPaisa(open.discountAmount)) / 100).toFixed(2),
      receivedOn: addDays(today, -between(1, 4)), method: "CHEQUE", reference: `CHQ-${between(100_000, 999_999)}`, pending: true,
    })
    pending++
    payments++
  }

  // One cheque bounced: the receipt stays on record as reversed.
  if (cheques.length) await reversePayment(ctx, cheques[0], { reason: "Cheque returned by the bank (insufficient funds)" })
  console.log(`    ${payments} payments (${pending} awaiting clearance${cheques.length ? ", 1 reversed" : ""})`)

  // ------------------------------------------------------------ income & expenses
  let entries = 0
  const entry = async (kind: "INCOME" | "EXPENSE", name: string, entryDate: string, amount: number, description: string, party: string, method: PaymentMethod, reference?: string) => {
    if (entryDate > today) return
    await saveEntry(ctx, { kind, categoryId: category(name), entryDate, amount: String(amount), description, party, method, reference })
    entries++
  }
  for (let month = 0; month < 7; month++) {
    const start = new Date(year.startDate.getTime())
    start.setUTCMonth(start.getUTCMonth() + month)
    const label = start.toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" })
    const day = (d: number) => addDays(start.toISOString().slice(0, 10), d)
    await entry("EXPENSE", "Salaries", day(28), plan.salaries, `Staff salaries, ${label}`, "Staff payroll", "BANK_TRANSFER", `SAL-${day(28).slice(0, 7)}`)
    await entry("EXPENSE", "Rent", day(2), plan.rent, `Building rent, ${label}`, "Property owner", "CHEQUE", `CHQ-${between(100_000, 999_999)}`)
    await entry("EXPENSE", "Utilities (electricity, water, internet)", day(10), between(18, 32) * 1_000, `Electricity, water and internet, ${label}`, "NEA / KUKL / ISP", "BANK_TRANSFER")
    if (random() < 0.6) await entry("EXPENSE", "Stationery & supplies", day(between(3, 25)), between(5, 25) * 1_000, "Stationery and classroom supplies", "Local stationery supplier", "CASH")
    if (random() < 0.3) await entry("EXPENSE", "Repairs & maintenance", day(between(3, 25)), between(8, 40) * 1_000, pick(["Plumbing repairs", "Classroom furniture repair", "Generator servicing"]), "Maintenance contractor", "CASH")
    if (month % 3 === 2) await entry("INCOME", "Bank interest", day(14), between(12, 20) * 1_000, "Quarterly interest on savings account", "Bank", "BANK_TRANSFER")
  }
  if (plan.grant) await entry("INCOME", "Government / UGC grant", due(97), plan.grant, "UGC performance grant (first tranche)", "University Grants Commission", "BANK_TRANSFER", "UGC-PG-2083-01")
  if (plan.donation) await entry("INCOME", "Donation", due(140), plan.donation, "Donation for library books", "Alumni association", "CHEQUE", `CHQ-${between(100_000, 999_999)}`)
  console.log(`    ${entries} income and expense entries`)
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
