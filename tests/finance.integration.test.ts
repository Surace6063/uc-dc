// Finance against a real database: fees, payments, receipts, reversals,
// concessions, entries and the figures built from them.
// Run with: npm run test:integration (needs DATABASE_URL).
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import { localDate } from "@/features/attendance/constants"
import { parseFeeFilters, parsePaymentFilters } from "@/features/finance/filters"
import type { AuthContext } from "@/lib/authorization/context"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/authorization/errors"
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/authorization/permissions"
import { prisma } from "@/lib/prisma"
import { addConcession, addDefaultCategories, addStudentFee, assignFeeStructure, cancelStudentFee, revokeConcession, saveFeeStructure } from "@/services/finance/fee-service"
import { listEntries, saveEntry, voidEntry } from "@/services/finance/ledger-service"
import { confirmPayment, getReceipt, listPayments, listStudentFees, recordPayment, reversePayment, studentAccount } from "@/services/finance/payment-service"
import { collectionReport, financeSummary, monthlyReport, outstandingReport } from "@/services/finance/report-service"

const run = randomUUID().slice(0, 8)
const ids = {} as Record<string, string>
const userIds: string[] = []
let org: { id: string; name: string; slug: string }
let other: { id: string; name: string; slug: string }

function ctxFor(o: { id: string; name: string; slug: string }, userId: string, permissions: readonly PermissionKey[]): AuthContext {
  return {
    user: { id: userId, authUserId: randomUUID(), email: "f@example.com", name: "Finance", avatarUrl: null, isPlatformAdmin: false },
    organization: { ...o, type: "COLLEGE" },
    membership: { id: randomUUID() },
    role: { id: randomUUID(), name: "Role", slug: "role" },
    permissions,
  }
}

async function rejects<T extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => T, field?: string) {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof type, `expected ${type.name}, got ${(error as Error)?.constructor?.name}: ${(error as Error)?.message} ${JSON.stringify((error as unknown as ValidationError).fieldErrors ?? "")}`)
    if (field) assert.ok(error instanceof ValidationError && error.fieldErrors[field], `expected an error on ${field}, got ${JSON.stringify((error as unknown as ValidationError).fieldErrors)}`)
    return
  }
  assert.fail(`expected ${type.name}`)
}

let admin: AuthContext // everything
let accountant: AuthContext // create, update, reports; no adjust or reverse
let parent: AuthContext // finance.view only
let outsider: AuthContext // another organisation

const today = localDate()

before(async () => {
  org = await prisma.organization.create({ data: { name: `Finance College ${run}`, slug: `test-fin-${run}`, type: "COLLEGE" } })
  other = await prisma.organization.create({ data: { name: `Other ${run}`, slug: `test-fin-o-${run}`, type: "COLLEGE" } })
  const organizationId = org.id
  const u = await prisma.user.create({ data: { authUserId: randomUUID(), email: `fin-${run}@example.com`, name: "Kamala Accounts" } })
  userIds.push(u.id)
  admin = ctxFor(org, u.id, PERMISSION_KEYS)
  accountant = ctxFor(org, u.id, ["dashboard.view", "students.view", "finance.view", "finance.create", "finance.update", "finance.reports"])
  parent = ctxFor(org, u.id, ["dashboard.view", "finance.view"])
  outsider = ctxFor(other, u.id, PERMISSION_KEYS)

  const level = await prisma.educationLevel.create({ data: { organizationId, name: "Bachelor", code: `B${run}` } })
  const bbs1 = await prisma.academicClass.create({ data: { organizationId, educationLevelId: level.id, name: "BBS 1st year" } })
  const bbs2 = await prisma.academicClass.create({ data: { organizationId, educationLevelId: level.id, name: "BBS 2nd year" } })
  const year = await prisma.academicYear.create({ data: { organizationId, name: "2083", startDate: new Date("2026-04-14"), endDate: new Date("2027-04-13"), status: "ACTIVE", isCurrent: true } })
  const enrol = async (n: number, classId: string) => {
    const s = await prisma.student.create({ data: { organizationId, admissionNumber: `F${n}-${run}`, firstName: `Student${n}`, lastName: "Shrestha", admissionDate: new Date("2026-04-14") } })
    await prisma.enrollment.create({ data: { organizationId, studentId: s.id, academicYearId: year.id, educationLevelId: level.id, classId, enrollmentDate: new Date("2026-04-14") } })
    return s.id
  }
  Object.assign(ids, { year: year.id, bbs1: bbs1.id, bbs2: bbs2.id, s1: await enrol(1, bbs1.id), s2: await enrol(2, bbs1.id), s3: await enrol(3, bbs2.id) })
})

after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [org.id, other.id] } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await prisma.$disconnect()
})

describe("fee structures and assignment", () => {
  it("sets up categories and a class's fee in installments", async () => {
    assert.ok((await addDefaultCategories(admin)) > 10)
    assert.equal(await addDefaultCategories(admin), 0, "only missing ones are added")
    const tuition = await prisma.financeCategory.findFirstOrThrow({ where: { organizationId: org.id, kind: "FEE", name: "Tuition fee" } })
    ids.tuition = tuition.id
    const s = await saveFeeStructure(accountant, null, {
      academicYearId: ids.year, categoryId: tuition.id, name: "BBS 1st year tuition", description: "", educationLevelId: "", programId: "", classId: ids.bbs1,
      amount: "60000", isActive: true,
      installments: [{ label: "First", dueDate: "2026-05-01", amount: "30000" }, { label: "Second", dueDate: "2026-12-01", amount: "30000" }],
    })
    ids.structure = s.id
  })

  it("assigns to the class's students once", async () => {
    const r = await assignFeeStructure(accountant, { feeStructureId: ids.structure })
    assert.deepEqual([r.students, r.created], [2, 4], "two BBS 1st year students, two installments each")
    assert.equal((await assignFeeStructure(accountant, { feeStructureId: ids.structure })).created, 0)
    await rejects(assignFeeStructure(accountant, { feeStructureId: ids.structure, studentIds: [ids.s3] }), ValidationError, "studentIds")
    // Amounts are fixed once assigned.
    await rejects(saveFeeStructure(accountant, ids.structure, { academicYearId: ids.year, categoryId: ids.tuition, name: "Changed", description: "", educationLevelId: "", programId: "", classId: ids.bbs1, amount: "70000", isActive: true, installments: [] }), ConflictError)
  })
})

describe("payments", () => {
  it("issues sequential receipts and splits payments oldest-due first", async () => {
    const p1 = await recordPayment(accountant, { studentId: ids.s1, amount: "40000", receivedOn: today, method: "CASH" })
    assert.equal(p1.receiptNumber, "RC-000001")
    const acc = await studentAccount(accountant, ids.s1)
    assert.deepEqual(acc.fees.map((f) => [f.paid, f.status]), [[3000000, "PAID"], [1000000, "PARTIAL"]])
    assert.equal(acc.totals.balance, 2000000)
    await rejects(recordPayment(accountant, { studentId: ids.s1, amount: "20000.01", receivedOn: today, method: "CASH" }), ValidationError, "amount")
    const p2 = await recordPayment(accountant, { studentId: ids.s1, amount: "5000", receivedOn: today, method: "ESEWA", reference: "ES-123", confirmedOnline: true })
    assert.equal(p2.receiptNumber, "RC-000002")
    await rejects(recordPayment(accountant, { studentId: ids.s1, amount: "100", receivedOn: today, method: "ESEWA", reference: "ES-123", confirmedOnline: true }), ValidationError, "reference")
    const receipt = await getReceipt(accountant, p1.id)
    assert.equal(receipt.lines.length, 2)
    assert.equal(receipt.balanceAfter, 1500000)
    ids.p1 = p1.id
  })

  it("counts a cheque only once it clears, and reverses without deleting", async () => {
    const cheque = await recordPayment(accountant, { studentId: ids.s2, amount: "30000", receivedOn: today, method: "CHEQUE", reference: "000777", pending: true })
    let acc = await studentAccount(accountant, ids.s2)
    assert.deepEqual([acc.totals.paid, acc.totals.pending], [0, 3000000])
    // The pending amount isn't collectable twice.
    await rejects(recordPayment(accountant, { studentId: ids.s2, amount: "30000.01", receivedOn: today, method: "CASH" }), ValidationError, "amount")
    await confirmPayment(accountant, cheque.id)
    acc = await studentAccount(accountant, ids.s2)
    assert.equal(acc.totals.paid, 3000000)
    await rejects(reversePayment(accountant, cheque.id, { reason: "Bounced" }), ForbiddenError)
    await reversePayment(admin, cheque.id, { reason: "Cheque bounced" })
    acc = await studentAccount(accountant, ids.s2)
    assert.equal(acc.totals.paid, 0)
    assert.equal(acc.payments[0].status, "REVERSED")
    await rejects(reversePayment(admin, cheque.id, { reason: "Again" }), ConflictError)
    const pending = await listPayments(accountant, parsePaymentFilters({ status: "reversed" }))
    assert.equal(pending.total, 1)
  })
})

describe("concessions and cancellations", () => {
  it("applies discounts within the unpaid balance; a full waiver settles the fee", async () => {
    const fees = (await studentAccount(admin, ids.s2)).fees
    await rejects(addConcession(accountant, { studentFeeId: fees[0].id, kind: "DISCOUNT", title: "x", amount: "100", percent: "" }), ForbiddenError)
    await rejects(addConcession(admin, { studentFeeId: fees[0].id, kind: "DISCOUNT", title: "Too much", amount: "30000.01", percent: "" }), ValidationError, "amount")
    const c = await addConcession(admin, { studentFeeId: fees[0].id, kind: "SCHOLARSHIP", scholarshipCategory: "MERIT", title: "Merit", amount: "", percent: "50", reason: "Top of class" })
    let acc = await studentAccount(admin, ids.s2)
    assert.deepEqual([acc.fees[0].discount, acc.fees[0].balance], [1500000, 1500000])
    await revokeConcession(admin, c.id, { reason: "Entered on the wrong fee" })
    await addConcession(admin, { studentFeeId: fees[1].id, kind: "WAIVER", title: "Full waiver", amount: "30000", percent: "" })
    acc = await studentAccount(admin, ids.s2)
    assert.deepEqual([acc.fees[0].discount, acc.fees[1].status], [0, "PAID"])
  })

  it("cancels only fees nobody has paid towards", async () => {
    const charge = await addStudentFee(accountant, { studentId: ids.s3, academicYearId: ids.year, categoryId: ids.tuition, title: "Late registration", amount: "500", dueDate: "2026-05-01" })
    await cancelStudentFee(admin, charge.id, { reason: "Waived by principal" })
    assert.equal((await prisma.studentFee.findUniqueOrThrow({ where: { id: charge.id } })).status, "CANCELLED")
    const paidFee = (await studentAccount(admin, ids.s1)).fees[0]
    await rejects(cancelStudentFee(admin, paidFee.id, { reason: "x" }), ConflictError)
  })
})

describe("income, expenses and figures", () => {
  it("records and voids entries", async () => {
    const salaries = await prisma.financeCategory.findFirstOrThrow({ where: { organizationId: org.id, kind: "EXPENSE", name: "Salaries" } })
    const e = await saveEntry(accountant, { kind: "EXPENSE", categoryId: salaries.id, entryDate: today, amount: "15000", description: "Part-time lecturer", party: "R. Karki", method: "BANK_TRANSFER", reference: "TT-1" })
    await saveEntry(accountant, { kind: "EXPENSE", categoryId: salaries.id, entryDate: today, amount: "999", description: "Typo", party: "", method: "CASH", reference: "" })
    const typo = (await listEntries(accountant, "EXPENSE", { page: 1, pageSize: 25, dir: "desc", sort: "entryDate", view: "active", q: "Typo" })).rows[0]
    await rejects(voidEntry(accountant, typo.id, { reason: "Typo" }), ForbiddenError)
    await voidEntry(admin, typo.id, { reason: "Entered by mistake" })
    const list = await listEntries(accountant, "EXPENSE", { page: 1, pageSize: 25, dir: "desc", sort: "entryDate", view: "active" })
    assert.deepEqual([list.total, list.sum], [1, 1500000])
    ids.entry = e.id
  })

  it("builds the dashboard and reports from verified records only", async () => {
    const s = await financeSummary(accountant, ids.year)
    // 4 tuition lines of 30,000 = 120,000; waiver 30,000; paid 40,000 + 5,000 (the cheque was reversed).
    assert.deepEqual([s.assessed, s.discount, s.collected, s.outstanding], [12000000, 3000000, 4500000, 4500000])
    assert.equal(s.today.amount, 4500000)
    assert.equal(s.pending.count, 0)
    const outstanding = await outstandingReport(accountant, { yearId: ids.year })
    assert.equal(outstanding.total, 4500000)
    assert.deepEqual(outstanding.byClass.map((c) => [c.className, c.students]), [["BBS 1st year", 2]])
    const collected = await collectionReport(accountant, { from: today, to: today })
    assert.deepEqual([collected.total, collected.receipts], [4500000, 2])
    const month = await monthlyReport(accountant, today.slice(0, 7))
    assert.deepEqual([month.totals.fees, month.totals.expenses, month.totals.net], [4500000, 1500000, 3000000])
    const open = await listStudentFees(accountant, parseFeeFilters({}), { openOnly: true })
    assert.equal(open.total, 2)
  })
})

describe("access", () => {
  it("keeps finance to finance staff and to the organisation", async () => {
    await rejects(listPayments(parent, parsePaymentFilters({})), ForbiddenError)
    await rejects(financeSummary(parent, ids.year), ForbiddenError)
    await rejects(studentAccount(outsider, ids.s1), NotFoundError)
    await rejects(getReceipt(outsider, ids.p1), NotFoundError)
    await rejects(recordPayment(outsider, { studentId: ids.s1, amount: "1", receivedOn: today, method: "CASH" }), ValidationError, "studentId")
    assert.equal((await listPayments(outsider, parsePaymentFilters({}))).total, 0)
  })
})

describe("integrity and the student view", () => {
  it("records a repeated submission once", async () => {
    const requestId = randomUUID()
    const fees = (await studentAccount(admin, ids.s1)).fees.filter((f) => f.balance > 0)
    const first = await recordPayment(accountant, { studentId: ids.s1, amount: "100", receivedOn: today, method: "CASH", requestId })
    const again = await recordPayment(accountant, { studentId: ids.s1, amount: "100", receivedOn: today, method: "CASH", requestId })
    assert.deepEqual(again, first)
    assert.equal((await prisma.payment.count({ where: { organizationId: org.id, requestId } })), 1)
    assert.equal((await studentAccount(admin, ids.s1)).totals.balance, fees.reduce((n, f) => n + f.balance, 0) - 10000)
  })

  it("shows students only their own fees and receipts", async () => {
    const studentUser = await prisma.user.create({ data: { authUserId: randomUUID(), email: `fin-s1-${run}@example.com`, name: "Student One" } })
    userIds.push(studentUser.id)
    await prisma.student.update({ where: { id: ids.s1 }, data: { userId: studentUser.id } })
    const me = ctxFor(org, studentUser.id, ["dashboard.view"])
    const { myFeeAccount } = await import("@/services/student-portal/fee-service")
    const { getMyReceipt } = await import("@/services/finance/payment-service")
    const account = await myFeeAccount(me)
    assert.ok(account && account.fees.length === 2 && account.payments.length >= 2)
    assert.equal((await getMyReceipt(me, ids.p1)).receiptNumber, "RC-000001")
    // Another student's payment is "not found".
    const other = await prisma.payment.findFirstOrThrow({ where: { organizationId: org.id, studentId: ids.s2 } })
    await rejects(getMyReceipt(me, other.id), NotFoundError)
    await rejects(getReceipt(me, ids.p1), ForbiddenError)
  })
})
