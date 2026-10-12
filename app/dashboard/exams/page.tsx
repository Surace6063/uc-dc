import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PlusIcon, SettingsIcon } from "lucide-react"

import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { ExamsNav } from "@/features/exams/components/exams-nav"
import { ExamDashboardCards, ExamsTable } from "@/features/exams/components/exams-table"
import { parseExamFilters } from "@/features/exams/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { hasExamStaffAccess } from "@/services/exams/access-service"
import { examDashboard, examFilterOptions, listExaminations } from "@/services/exams/examination-query"

export const metadata: Metadata = {
  title: "Examinations",
}

// Staff overview of examinations. Students and parents (who only see their
// own published results) go to the results portal.
export default async function ExaminationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!hasExamStaffAccess(context)) redirect("/dashboard/results")

  const raw = await searchParams
  const options = await examFilterOptions(context)
  const currentYear = options.years.find((y) => y.isCurrent) ?? options.years[0] ?? null
  // The list opens on the current academic year; "all years" is one click away.
  const filters = parseExamFilters(raw.year === undefined && currentYear ? { ...raw, year: currentYear.id } : raw)
  const [list, stats] = await Promise.all([listExaminations(context, filters), examDashboard(context, filters.year ?? null)])

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title="Examinations" description="Assessments, marks, review and published results." breadcrumbs={[{ label: "Examinations" }]}>
        {hasPermission(context, "exams.configure") && (
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/exams/settings" />}>
            <SettingsIcon data-icon="inline-start" />
            Grading & policies
          </Button>
        )}
        {hasPermission(context, "exams.create") && (
          <Button nativeButton={false} render={<Link href="/dashboard/exams/new" />}>
            <PlusIcon data-icon="inline-start" />
            New examination
          </Button>
        )}
      </PageHeader>
      <ExamsNav />
      <ExamDashboardCards stats={stats} yearName={options.years.find((y) => y.id === filters.year)?.name ?? null} />
      <ExamsTable rows={list.rows} total={list.total} filters={filters} options={options} canExport={hasPermission(context, "exams.export")} />
    </div>
  )
}
