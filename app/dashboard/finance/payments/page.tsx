import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { PaymentsView } from "@/features/finance/components/payments-view"
import { parsePaymentFilters } from "@/features/finance/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { isFinanceStaff } from "@/services/finance/access"
import { financeOptions } from "@/services/finance/options-service"
import { listPayments } from "@/services/finance/payment-service"

export const metadata: Metadata = { title: "Payment history" }

export default async function PaymentHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!isFinanceStaff(context)) return <AccessDenied />
  const filters = parsePaymentFilters(await searchParams)
  const [list, options] = await Promise.all([listPayments(context, filters), financeOptions(context)])
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Payment history" description="Every receipt issued, including pending and reversed payments." breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Payment history" }]} />
      <PaymentsView
        rows={list.rows}
        total={list.total}
        collected={list.collected}
        filters={filters}
        options={options}
        can={{ update: hasPermission(context, "finance.update"), reverse: hasPermission(context, "finance.reverse"), reports: hasPermission(context, "finance.reports") }}
      />
    </div>
  )
}
