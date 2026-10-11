import type { Metadata } from "next"
import Link from "next/link"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { AttendanceNav } from "@/features/attendance/components/attendance-nav"
import { CorrectionsList } from "@/features/attendance/components/corrections-list"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { cn } from "@/lib/utils"
import { listCorrections } from "@/services/attendance/correction-service"

export const metadata: Metadata = {
  title: "Attendance corrections",
}

const VIEWS = { PENDING: "Waiting for review", ALL: "All corrections" } as const

export default async function AttendanceCorrectionsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const context = await getPageContext()
  const canReview = hasPermission(context, "attendance.approve")
  if (!canReview && !hasPermission(context, "attendance.update")) return <AccessDenied />

  const view = (await searchParams).view === "all" ? "ALL" : "PENDING"
  const rows = await listCorrections(context, { status: view })

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Corrections"
        description="Changes to submitted attendance. Every change keeps the original mark, who asked for it and who approved it."
        breadcrumbs={[{ label: "Attendance", href: "/dashboard/attendance" }, { label: "Corrections" }]}
      />
      <AttendanceNav />
      <div className="flex gap-2">
        {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((key) => (
          <Link
            key={key}
            href={key === "ALL" ? "/dashboard/attendance/corrections?view=all" : "/dashboard/attendance/corrections"}
            aria-current={view === key ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", view === key ? "border-primary/50 bg-primary/5 font-medium" : "text-muted-foreground hover:bg-muted/50")}
          >
            {VIEWS[key]}
          </Link>
        ))}
      </div>
      <CorrectionsList rows={rows} canReview={canReview} />
    </div>
  )
}
