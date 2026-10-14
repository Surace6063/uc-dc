import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { CategoriesView } from "@/features/finance/components/categories-view"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { isFinanceStaff } from "@/services/finance/access"
import { listCategories } from "@/services/finance/fee-service"

export const metadata: Metadata = { title: "Financial categories" }

export default async function FinanceCategoriesPage() {
  const context = await getPageContext()
  if (!isFinanceStaff(context)) return <AccessDenied />
  const categories = await listCategories(context)
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Financial categories" description="Fee heads, income sources and expense heads used across finance." breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Categories" }]} />
      <CategoriesView categories={categories} canEdit={hasPermission(context, "finance.update")} />
    </div>
  )
}
