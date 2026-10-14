import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { StructuresView } from "@/features/finance/components/structures-view"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { isFinanceStaff } from "@/services/finance/access"
import { listFeeStructures } from "@/services/finance/fee-service"
import { financeOptions } from "@/services/finance/options-service"
import { currentYear } from "@/services/finance/report-service"

export const metadata: Metadata = { title: "Fee structures" }

export default async function FeeStructuresPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const context = await getPageContext()
  if (!isFinanceStaff(context)) return <AccessDenied />
  const year = await currentYear(context, (await searchParams).year)
  const [structures, options] = await Promise.all([listFeeStructures(context, year?.id ?? null), financeOptions(context)])
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Fee structures"
        description={`What each group of students is charged${year ? ` in ${year.name}` : ""}, with installments and due dates.`}
        breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Fee structures" }]}
      />
      <StructuresView
        structures={structures}
        options={options}
        yearId={year?.id ?? null}
        canEdit={hasPermission(context, "finance.update")}
        canAssign={hasPermission(context, "finance.create")}
      />
    </div>
  )
}
