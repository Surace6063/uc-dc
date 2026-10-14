// Finance rules (no database). Run with: npm test
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { orderedRange, parseFeeFilters, parsePaymentFilters, parseReportFilters } from "@/features/finance/filters"
import { allocate, feeState, formatRs, toDecimal, toPaisa } from "@/features/finance/money"
import { concessionSchema, entrySchema, feeStructureSchema, paymentSchema, rupees } from "@/features/finance/schemas"
import { DEFAULT_ROLES } from "@/lib/authorization/permissions"

const ID = "2f1d3c8e-6d2a-4c55-9a51-0d6f4d9f3b10"
const role = (slug: string) => DEFAULT_ROLES.find((r) => r.slug === slug)!.permissions as readonly string[]

describe("money", () => {
  it("works in whole paisa without float drift", () => {
    assert.equal(toPaisa("0.1"), 10)
    assert.equal(toPaisa(0.1 + 0.2), 30)
    assert.equal(toPaisa({ toString: () => "12500.55" }), 1250055)
    assert.equal(toDecimal(1250055), "12500.55")
    assert.equal(formatRs(12500055), "Rs. 1,25,000.55")
    assert.equal(rupees().parse("1,25,000.5"), 12500050)
    assert.ok(!rupees().safeParse("12.345").success)
    assert.ok(!rupees().safeParse("0").success)
  })

  it("derives balance and status the same way everywhere", () => {
    assert.deepEqual(feeState({ amount: 10000, discount: 0, paid: 0, cancelled: false }), { balance: 10000, status: "UNPAID" })
    assert.deepEqual(feeState({ amount: 10000, discount: 2000, paid: 3000, cancelled: false }), { balance: 5000, status: "PARTIAL" })
    assert.deepEqual(feeState({ amount: 10000, discount: 2000, paid: 8000, cancelled: false }), { balance: 0, status: "PAID" })
    // A full discount (waiver) settles the fee without any payment.
    assert.deepEqual(feeState({ amount: 10000, discount: 10000, paid: 0, cancelled: false }), { balance: 0, status: "PAID" })
    assert.equal(feeState({ amount: 10000, discount: 0, paid: 0, cancelled: true }).status, "CANCELLED")
  })

  it("splits a payment oldest-due first and never overpays", () => {
    const fees = [{ id: "a", balance: 5000 }, { id: "b", balance: 3000 }]
    assert.deepEqual(allocate(6000, fees), [{ studentFeeId: "a", amount: 5000 }, { studentFeeId: "b", amount: 1000 }])
    assert.deepEqual(allocate(8000, fees), [{ studentFeeId: "a", amount: 5000 }, { studentFeeId: "b", amount: 3000 }])
    assert.equal(allocate(8001, fees), null)
    assert.deepEqual(allocate(2000, [{ id: "x", balance: 0 }, { id: "y", balance: 2500 }]), [{ studentFeeId: "y", amount: 2000 }])
  })
})

describe("finance forms", () => {
  it("requires installments to add up to the structure total", () => {
    const base = { academicYearId: ID, categoryId: ID, name: "Tuition", description: "", educationLevelId: "", programId: "", classId: "", amount: "60000", isActive: true }
    assert.ok(feeStructureSchema.safeParse({ ...base, installments: [] }).success)
    assert.ok(feeStructureSchema.safeParse({ ...base, installments: [{ label: "1", dueDate: "2026-05-01", amount: "30000" }, { label: "2", dueDate: "2026-09-01", amount: "30000" }] }).success)
    assert.ok(!feeStructureSchema.safeParse({ ...base, installments: [{ label: "1", dueDate: "2026-05-01", amount: "30000" }] }).success)
  })

  it("needs references for non-cash payments and confirmation for wallets", () => {
    const p = { studentId: ID, amount: "1000", receivedOn: "2026-05-01", method: "CASH", reference: "", payerName: "", note: "" }
    assert.ok(paymentSchema.safeParse(p).success)
    assert.ok(!paymentSchema.safeParse({ ...p, method: "BANK_TRANSFER" }).success, "bank transfers need a reference")
    assert.ok(!paymentSchema.safeParse({ ...p, method: "ESEWA", reference: "0ABC123" }).success, "eSewa needs staff confirmation")
    assert.ok(paymentSchema.safeParse({ ...p, method: "ESEWA", reference: "0ABC123", confirmedOnline: true }).success)
    assert.ok(!paymentSchema.safeParse({ ...p, pending: true }).success, "cash can't await clearance")
    assert.ok(paymentSchema.safeParse({ ...p, method: "CHEQUE", reference: "000123", pending: true }).success)
  })

  it("takes a concession as an amount or a percentage, not both", () => {
    const c = { studentFeeId: ID, kind: "DISCOUNT", scholarshipCategory: "", title: "Sibling", reason: "" }
    assert.equal(concessionSchema.parse({ ...c, amount: "500", percent: "" }).amount, 50000)
    assert.equal(concessionSchema.parse({ ...c, amount: "", percent: "10" }).percent, 10)
    assert.ok(!concessionSchema.safeParse({ ...c, amount: "500", percent: "10" }).success)
    assert.ok(!concessionSchema.safeParse({ ...c, amount: "", percent: "" }).success)
  })

  it("validates entries and drops bad filter values", () => {
    assert.ok(!entrySchema.safeParse({ kind: "EXPENSE", categoryId: ID, entryDate: "2026-05-01", amount: "-5", description: "x", party: "", method: "CASH", reference: "" }).success)
    assert.equal(parseFeeFilters({ status: "LOST", min: "abc" }).status, undefined)
    assert.equal(parseFeeFilters({ min: "100.50" }).min, 10050)
    assert.equal(parsePaymentFilters({ method: "BITCOIN" }).method, undefined)
  })
})

describe("finance permissions", () => {
  it("keep adjustments and reversals to senior roles", () => {
    assert.ok(role("owner").includes("finance.reverse") && role("admin").includes("finance.reverse"))
    assert.ok(role("principal").includes("finance.adjust") && !role("principal").includes("finance.reverse"))
    assert.ok(role("accountant").includes("finance.reports") && !role("accountant").includes("finance.adjust") && !role("accountant").includes("finance.reverse"))
    // Parents' finance.view is for their own children; it opens no finance staff page.
    assert.ok(!["finance.create", "finance.update", "finance.reports"].some((k) => role("parent").includes(k)))
  })
})

describe("report date ranges", () => {
  it("treats a backwards range as the same period", () => {
    assert.deepEqual(parseReportFilters({ from: "2026-10-31", to: "2026-10-01" }).from, "2026-10-01")
    assert.deepEqual(parsePaymentFilters({ from: "2026-10-31", to: "2026-10-01" }).to, "2026-10-31")
    assert.deepEqual(orderedRange({ from: "2026-01-01" }), { from: "2026-01-01" })
  })
})
