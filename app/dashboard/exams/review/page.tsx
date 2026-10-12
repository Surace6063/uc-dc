import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { ExamsNav } from "@/features/exams/components/exams-nav"
import { ReviewTable } from "@/features/exams/components/review-table"
import { parseSheetFilters } from "@/features/exams/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { listReviewSheets } from "@/services/exams/workflow-service"

export const metadata: Metadata = {
  title: "Review marks",
}

export default async function ReviewMarksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "exams.review") && !hasPermission(context, "exams.approve")) return <AccessDenied />
  const filters = parseSheetFilters(await searchParams)
  const [list, exams] = await Promise.all([
    listReviewSheets(context, filters),
    prisma.examination.findMany({
      where: { organizationId: context.organization.id, status: { in: ["SCHEDULED", "REVISION", "APPROVED", "PUBLISHED"] } },
      orderBy: { startDate: "desc" },
      take: 50,
      select: { id: true, name: true },
    }),
  ])
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Review marks"
        description="Verify submitted marks, approve them, or return them to the teacher with a note."
        breadcrumbs={[{ label: "Examinations", href: "/dashboard/exams" }, { label: "Review" }]}
      />
      <ExamsNav />
      <ReviewTable rows={list.rows} total={list.total} filters={filters} exams={exams} />
    </div>
  )
}
