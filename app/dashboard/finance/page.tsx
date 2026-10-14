import type { Metadata } from "next"

import { FinanceHome } from "@/features/finance/components/finance-home"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Fees & Finance",
}

// Finance overview for anyone with finance staff permissions (finance users
// also see it as their dashboard home).
export default async function FeesFinancePage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const context = await getPageContext()
  return <FinanceHome context={context} year={(await searchParams).year} />
}
