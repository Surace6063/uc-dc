import Link from "next/link"
import { AwardIcon, ChevronRightIcon } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ResultStatusBadge } from "@/features/exams/components/exams-nav"
import { formatGpa, formatMarks, formatPercent } from "@/features/exams/calculation"
import { formatDay } from "@/features/exams/constants"
import type { PortalResultYears } from "@/services/exams/portal-service"

// Published results by academic year (students and guardians). Only
// figures from the active published version are shown.
export function PortalResults({ years, who }: { years: PortalResultYears; who: string }) {
  if (years.length === 0) {
    return (
      <Empty className="rounded-xl border py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon"><AwardIcon /></EmptyMedia>
          <EmptyTitle>No published results yet</EmptyTitle>
          <EmptyDescription>{who}&apos;s results appear here once the school publishes them.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="grid gap-5">
      {years.map((y) => (
        <section key={y.id} className="grid gap-2" aria-labelledby={`year-${y.id}`}>
          <h3 id={`year-${y.id}`} className="text-sm font-semibold text-muted-foreground">Academic year {y.name}</h3>
          <Card className="gap-0 divide-y p-0">
            {y.items.map((r) => (
              <Link key={r.resultId} href={`/dashboard/results/${r.resultId}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 transition-colors hover:bg-muted/40">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{r.examName}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.typeName} · {r.className} · published {formatDay(r.publishedAt)}{r.version > 1 ? ` (revised, v${r.version})` : ""}
                  </p>
                </div>
                {r.status !== "WITHHELD" && (
                  <dl className="flex gap-5 text-sm">
                    {r.totalObtained !== null && <div><dt className="text-xs text-muted-foreground">Total</dt><dd className="tabular-nums">{formatMarks(r.totalObtained)}/{formatMarks(r.totalMaximum)}</dd></div>}
                    {r.percentage !== null && <div><dt className="text-xs text-muted-foreground">%</dt><dd className="tabular-nums">{formatPercent(r.percentage, r.percentageDecimals)}</dd></div>}
                    {r.grade && <div><dt className="text-xs text-muted-foreground">Grade</dt><dd className="font-semibold">{r.grade}</dd></div>}
                    {r.gpa !== null && <div><dt className="text-xs text-muted-foreground">GPA</dt><dd className="tabular-nums">{formatGpa(r.gpa, r.gpaDecimals)}</dd></div>}
                    {r.rank !== null && <div><dt className="text-xs text-muted-foreground">Position</dt><dd className="tabular-nums">{r.rank}</dd></div>}
                  </dl>
                )}
                <ResultStatusBadge status={r.status} />
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </Card>
        </section>
      ))}
    </div>
  )
}
