"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { runAction } from "@/lib/authorization/action"
import { requireMembership } from "@/lib/authorization/context"
import {
  addConcession,
  addDefaultCategories,
  addStudentFee,
  assignFeeStructure,
  cancelStudentFee,
  revokeConcession,
  saveCategory,
  saveFeeStructure,
} from "@/services/finance/fee-service"
import { saveEntry, voidEntry } from "@/services/finance/ledger-service"
import { confirmPayment, recordPayment, reversePayment } from "@/services/finance/payment-service"

// Finance operations. Each service checks its own permission (create,
// update, adjust, reverse) and keeps an audit entry.

const id = z.uuid()
const nullableId = z.uuid().nullable()

function refresh() {
  revalidatePath("/dashboard/finance", "layout")
  revalidatePath("/dashboard")
}

export async function saveCategoryAction(categoryId: string | null, values: unknown) {
  return runAction(async () => {
    const saved = await saveCategory(await requireMembership(), nullableId.parse(categoryId), values)
    refresh()
    return saved
  }, categoryId ? "Category saved." : "Category added.")
}

export async function addDefaultCategoriesAction() {
  return runAction(async () => {
    const count = await addDefaultCategories(await requireMembership())
    refresh()
    return { count }
  }, "Suggested categories added.")
}

export async function saveFeeStructureAction(structureId: string | null, values: unknown) {
  return runAction(async () => {
    const saved = await saveFeeStructure(await requireMembership(), nullableId.parse(structureId), values)
    refresh()
    return saved
  }, structureId ? "Fee structure saved." : "Fee structure created.")
}

export async function assignFeeStructureAction(values: unknown) {
  return runAction(async () => {
    const result = await assignFeeStructure(await requireMembership(), values)
    refresh()
    return result
  })
}

export async function addStudentFeeAction(values: unknown) {
  return runAction(async () => {
    const fee = await addStudentFee(await requireMembership(), values)
    refresh()
    return fee
  }, "Fee added.")
}

export async function cancelStudentFeeAction(feeId: string, values: unknown) {
  return runAction(async () => {
    await cancelStudentFee(await requireMembership(), id.parse(feeId), values)
    refresh()
  }, "Fee cancelled.")
}

export async function addConcessionAction(values: unknown) {
  return runAction(async () => {
    const c = await addConcession(await requireMembership(), values)
    refresh()
    return c
  }, "Concession added.")
}

export async function revokeConcessionAction(concessionId: string, values: unknown) {
  return runAction(async () => {
    await revokeConcession(await requireMembership(), id.parse(concessionId), values)
    refresh()
  }, "Concession revoked.")
}

export async function recordPaymentAction(values: unknown) {
  return runAction(async () => {
    const payment = await recordPayment(await requireMembership(), values)
    refresh()
    return payment
  }, "Payment recorded.")
}

export async function confirmPaymentAction(paymentId: string) {
  return runAction(async () => {
    await confirmPayment(await requireMembership(), id.parse(paymentId))
    refresh()
  }, "Payment confirmed.")
}

export async function reversePaymentAction(paymentId: string, values: unknown) {
  return runAction(async () => {
    await reversePayment(await requireMembership(), id.parse(paymentId), values)
    refresh()
  }, "Payment reversed.")
}

export async function saveEntryAction(values: unknown) {
  return runAction(async () => {
    const entry = await saveEntry(await requireMembership(), values)
    refresh()
    return entry
  }, "Entry recorded.")
}

export async function voidEntryAction(entryId: string, values: unknown) {
  return runAction(async () => {
    await voidEntry(await requireMembership(), id.parse(entryId), values)
    refresh()
  }, "Entry voided.")
}
