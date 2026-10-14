import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { ReceiptView } from "@/features/finance/components/receipt-view"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { getMyReceipt } from "@/services/finance/payment-service"

export const metadata: Metadata = { title: "Receipt" }

// The signed-in student's own receipt; any other payment is "not found".
export default async function MyReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const context = await getPageContext()
  const id = z.uuid().safeParse((await params).paymentId)
  if (!id.success) notFound()
  let r
  try {
    r = await getMyReceipt(context, id.data)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  return <ReceiptView r={r} back={{ href: "/dashboard/student/payments", label: "Payment history" }} />
}
