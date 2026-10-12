import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/shared/page-header"
import { PrintButton } from "@/features/exams/components/print-button"
import { ReportCard } from "@/features/exams/components/report-card"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { signedUrls } from "@/lib/supabase/storage"
import { portalResultCard } from "@/services/exams/portal-service"

export const metadata: Metadata = {
  title: "Report card",
}

// A published report card for its student or a linked guardian. The result
// ID from the URL is checked against the signed-in user on the server.
export default async function PortalReportCardPage({ params }: { params: Promise<{ resultId: string }> }) {
  const context = await getPageContext()
  const resultId = z.uuid().safeParse((await params).resultId)
  if (!resultId.success) notFound()
  let card
  try {
    card = await portalResultCard(context, resultId.data)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const photos = card.student.profileImagePath ? await signedUrls([card.student.profileImagePath], 600) : new Map<string, string>()
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="print:hidden">
        <PageHeader title={card.exam.name} description={card.student.name} breadcrumbs={[{ label: "Results", href: "/dashboard/results" }, { label: card.exam.name }]}>
          <PrintButton />
        </PageHeader>
      </div>
      <ReportCard card={card} photoUrl={card.student.profileImagePath ? (photos.get(card.student.profileImagePath) ?? null) : null} />
    </div>
  )
}
