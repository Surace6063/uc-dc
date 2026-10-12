import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { PrintButton } from "@/features/exams/components/print-button"
import { ReportCard } from "@/features/exams/components/report-card"
import { formatDay } from "@/features/exams/constants"
import { AppError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { signedUrls } from "@/lib/supabase/storage"
import { cn } from "@/lib/utils"
import { hasExamStaffAccess } from "@/services/exams/access-service"
import { resultVersions, staffResultCard } from "@/services/exams/result-service"

export const metadata: Metadata = {
  title: "Mark sheet",
}

export default async function StudentMarkSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string; studentId: string }>
  searchParams: Promise<{ view?: string; version?: string }>
}) {
  const context = await getPageContext()
  if (!hasExamStaffAccess(context)) redirect("/dashboard/results")
  const p = await params
  const ids = z.object({ examId: z.uuid(), studentId: z.uuid() }).safeParse(p)
  if (!ids.success) notFound()
  const query = await searchParams
  const version = z.coerce.number().int().min(1).optional().catch(undefined).parse(query.version)
  const provisional = query.view === "provisional"

  let card
  try {
    card = await staffResultCard(context, ids.data.examId, ids.data.studentId, { version, provisional })
  } catch (error) {
    if (error instanceof AppError) notFound()
    throw error
  }
  const [versions, photos] = await Promise.all([
    resultVersions(context, ids.data.examId, ids.data.studentId),
    card.student.profileImagePath ? signedUrls([card.student.profileImagePath], 600) : new Map<string, string | null>(),
  ])
  const base = `/dashboard/exams/${ids.data.examId}/results/${ids.data.studentId}`

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="print:hidden">
        <PageHeader
          title={card.student.name}
          description={`${card.exam.name} · ${card.official ? "official result" : card.publication ? "superseded version" : "provisional preview"}`}
          breadcrumbs={[
            { label: "Examinations", href: "/dashboard/exams" },
            { label: card.exam.name, href: `/dashboard/exams/${ids.data.examId}` },
            { label: "Results", href: `/dashboard/exams/${ids.data.examId}/results` },
            { label: card.student.name },
          ]}
        >
          <PrintButton />
        </PageHeader>
      </div>
      {versions.length > 0 && (
        <nav aria-label="Result versions" className="flex flex-wrap items-center gap-2 text-sm print:hidden">
          <span className="text-muted-foreground">Versions:</span>
          {versions.map((v) => {
            const active = card.publication?.version === v.version
            return (
              <Link key={v.version} href={`${base}?version=${v.version}`} aria-current={active ? "page" : undefined} className={cn("rounded-full border px-3 py-1 hover:bg-muted/50", active && "border-primary/50 bg-primary/5 font-medium")} title={v.reason ?? undefined}>
                v{v.version} · {formatDay(v.publishedAt)} {v.status === "ACTIVE" && <Badge className="ml-1">current</Badge>}
              </Link>
            )
          })}
          <Link href={`${base}?view=provisional`} className={cn("rounded-full border px-3 py-1 hover:bg-muted/50", provisional && "border-primary/50 bg-primary/5 font-medium")}>
            Provisional
          </Link>
        </nav>
      )}
      <ReportCard card={card} photoUrl={card.student.profileImagePath ? (photos.get(card.student.profileImagePath) ?? null) : null} showInternal />
    </div>
  )
}
