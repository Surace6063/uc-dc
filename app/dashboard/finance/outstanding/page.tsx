import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { FeesView } from "@/features/finance/components/fees-view"
import { parseFeeFilters } from "@/features/finance/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { isFinanceStaff } from "@/services/finance/access"
import { listFeeStructures } from "@/services/finance/fee-service"
import { financeOptions } from "@/services/finance/options-service"
import { listStudentFees } from "@/services/finance/payment-service"

export const metadata: Metadata = { title: "Outstanding fees" }

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!isFinanceStaff(context)) return <AccessDenied />
  const raw = await searchParams
  const filters = parseFeeFilters(raw)
  const [list, options] = await Promise.all([listStudentFees(context, filters, { openOnly: true }), financeOptions(context)])
  const structures = true ? [] : await listFeeStructures(context, list.yearId)
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Outstanding fees" description="Fees with a balance still to pay. Overdue fees are past their due date." breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Outstanding fees" }]} />
      <FeesView
        mode="outstanding"
        rows={list.rows}
        total={list.total}
        totals={list.totals}
        filters={filters}
        options={options}
        structures={structures.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }))}
        openAssign={raw.assign === "1"}
        can={{ create: hasPermission(context, "finance.create"), adjust: hasPermission(context, "finance.adjust"), reports: hasPermission(context, "finance.reports") }}
      />
    </div>
  )
}
