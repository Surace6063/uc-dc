import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { ReceiptView } from "@/features/finance/components/receipt-view"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { isFinanceStaff } from "@/services/finance/access"
import { getReceipt } from "@/services/finance/payment-service"

export const metadata: Metadata = { title: "Receipt" }

export default async function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const context = await getPageContext()
  if (!isFinanceStaff(context)) return <AccessDenied />
  const id = z.uuid().safeParse((await params).paymentId)
  if (!id.success) notFound()
  let r
  try {
    r = await getReceipt(context, id.data)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  return <ReceiptView r={r} back={{ href: `/dashboard/finance/collect?student=${r.student.id}`, label: "Student account" }} />
}
