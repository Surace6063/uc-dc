import type { Metadata } from "next"
import Link from "next/link"
import { ClipboardCheckIcon, DownloadIcon, UploadIcon } from "lucide-react"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ExamsNav } from "@/features/exams/components/exams-nav"
import { MarksGrid } from "@/features/exams/components/marks-grid"
import { MarksPicker } from "@/features/exams/components/marks-picker"
import { marksTemplateUrl } from "@/features/exams/import-template"
import { hasPermission } from "@/lib/authorization/context"
import { AppError, ValidationError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { canReviewMarks } from "@/services/exams/access-service"
import { getMarksSheet, marksPicker, type MarksSheetData } from "@/services/exams/marks-service"

export const metadata: Metadata = {
  title: "Marks entry",
}

function Notice({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <Empty className="rounded-xl border border-dashed py-14">
      <EmptyHeader>
        <EmptyMedia variant="icon"><ClipboardCheckIcon /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

const uuid = z.uuid().optional().catch(undefined)

export default async function MarksEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  const canEnter = hasPermission(context, "exams.grade") || hasPermission(context, "exams.marks.manage")
  if (!canEnter && !canReviewMarks(context)) return <AccessDenied />

  const raw = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const examParam = uuid.parse(one(raw.exam))
  const subject = uuid.parse(one(raw.subject))
  const sectionRaw = one(raw.section)
  const section = sectionRaw === "none" ? null : uuid.parse(sectionRaw)
  const picker = await marksPicker(context, examParam)

  let sheet: MarksSheetData | null = null
  let problem: string | null = null
  if (picker.examinationId && subject && section !== undefined) {
    try {
      sheet = await getMarksSheet(context, { examinationSubjectId: subject, sectionId: section })
      if (sheet.exam.id !== picker.examinationId) sheet = null
    } catch (error) {
      if (!(error instanceof AppError)) throw error
      problem = error instanceof ValidationError ? (Object.values(error.fieldErrors).flat().find(Boolean) ?? error.message) : error.message
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Marks entry"
        description="Enter, check and submit marks for the subjects you teach."
        breadcrumbs={[{ label: "Examinations", href: "/dashboard/exams" }, { label: "Marks entry" }]}
      >
        {canEnter && picker.examinationId && (
          <>
            <Button variant="outline" nativeButton={false} render={<a href={marksTemplateUrl(picker.examinationId, subject)} />}>
              <DownloadIcon data-icon="inline-start" />
              {subject ? "Subject template" : "Marks template"}
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/exams/import?exam=${picker.examinationId}`} />}>
              <UploadIcon data-icon="inline-start" />
              Import
            </Button>
          </>
        )}
      </PageHeader>
      <ExamsNav />
      {picker.exams.length === 0 ? (
        <Notice
          title="No examinations to enter marks for"
          description={canReviewMarks(context) ? "Schedule an examination to open marks entry." : "Marks open here once an examination with subjects you're assigned to teach is scheduled."}
        />
      ) : (
        <>
          <MarksPicker exams={picker.exams} examinationId={picker.examinationId} sheets={picker.sheets} selected={subject ? `${subject}:${section ?? "none"}` : null} />
          {problem ? (
            <Notice title="These marks can't be opened" description={problem} />
          ) : sheet ? (
            <MarksGrid key={`${sheet.sheet?.id ?? "new"}:${sheet.sheet?.updatedAt ?? ""}:${sheet.sheet?.status ?? ""}`} data={sheet} />
          ) : (
            picker.sheets.length > 0 && <Notice title="Choose a marks sheet" description="Pick a subject and section above to load its students." />
          )}
        </>
      )}
    </div>
  )
}
