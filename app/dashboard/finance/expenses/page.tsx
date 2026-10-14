import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { EntriesView } from "@/features/finance/components/entries-view"
import { parseEntryFilters } from "@/features/finance/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { isFinanceStaff } from "@/services/finance/access"
import { listEntries } from "@/services/finance/ledger-service"
import { financeOptions } from "@/services/finance/options-service"

export const metadata: Metadata = { title: "Expenses" }

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!isFinanceStaff(context)) return <AccessDenied />
  const raw = await searchParams
  const filters = parseEntryFilters(raw)
  const [list, options] = await Promise.all([listEntries(context, "EXPENSE", filters), financeOptions(context)])
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Expenses" description="Money the institution spends. Entries are voided, never deleted." breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Expenses" }]} />
      <EntriesView
        kind="EXPENSE"
        list={list}
        filters={filters}
        categories={options.expenseCategories}
        openNew={raw.new === "1"}
        can={{ create: hasPermission(context, "finance.create"), reverse: hasPermission(context, "finance.reverse"), reports: hasPermission(context, "finance.reports") }}
      />
    </div>
  )
}
