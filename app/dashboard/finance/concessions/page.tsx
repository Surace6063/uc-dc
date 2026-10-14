import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { ConcessionsView } from "@/features/finance/components/concessions-view"
import { parseConcessionFilters } from "@/features/finance/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { isFinanceStaff } from "@/services/finance/access"
import { listConcessions } from "@/services/finance/ledger-service"

export const metadata: Metadata = { title: "Discounts & scholarships" }

export default async function ConcessionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!isFinanceStaff(context)) return <AccessDenied />
  const filters = parseConcessionFilters(await searchParams)
  const list = await listConcessions(context, filters)
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Discounts & scholarships" description="Concessions on student fees. To add one, open the fee from a student's account or the fee list." breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Discounts & scholarships" }]} />
      <ConcessionsView list={list} filters={filters} canAdjust={hasPermission(context, "finance.adjust")} />
    </div>
  )
}
