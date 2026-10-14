import type { Metadata } from "next"
import { CheckCircle2Icon, CircleAlertIcon, FileIcon, FolderOpenIcon } from "lucide-react"

import { ContentSection } from "@/components/shared/content-section"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { NoStudentProfile } from "@/features/student-portal/components/no-student"
import { formatBytes } from "@/features/teaching/constants"
import { formatDateTime } from "@/features/teaching/format"
import { getPageContext } from "@/lib/authorization/page"
import { myDocuments } from "@/services/student-portal/record-service"

export const metadata: Metadata = { title: "My documents" }

// The student's documents on file, and which required documents are still
// missing (only when the school has set document requirements).
export default async function StudentDocumentsPage() {
  const context = await getPageContext()
  const data = await myDocuments(context)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="My documents" description="Documents the school holds for you. To add or replace one, hand it to the office." breadcrumbs={[{ label: "My documents" }]} />
      {!data ? (
        <NoStudentProfile />
      ) : (
        <>
          {data.requirements.length > 0 && (
            <ContentSection title="Required documents" description={data.missing ? `${data.missing} required document${data.missing === 1 ? " is" : "s are"} still missing.` : "Everything required has been submitted."}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.requirements.map((r) => (
                  <li key={r.id} className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm">
                    {r.submitted ? <CheckCircle2Icon className="mt-0.5 size-4 text-emerald-600 dark:text-emerald-400" /> : <CircleAlertIcon className={r.isRequired ? "mt-0.5 size-4 text-destructive" : "mt-0.5 size-4 text-muted-foreground"} />}
                    <span className="min-w-0">
                      <span className="font-medium">{r.name}</span>
                      <span className="block text-xs text-muted-foreground">{r.submitted ? "Submitted" : r.isRequired ? "Required, not submitted" : "Optional"}{r.description ? ` · ${r.description}` : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </ContentSection>
          )}
          <ContentSection title="On file">
            {data.documents.length === 0 ? (
              <EmptyState icon={FolderOpenIcon} title="No documents on file" description="Documents the office uploads for you will appear here." className="py-8" />
            ) : (
              <ul className="grid gap-2">
                {data.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <a href={`/api/me/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium hover:underline">{d.title}</a>
                        <span className="block text-xs text-muted-foreground">{[d.fileName, formatBytes(d.sizeBytes), formatDateTime(d.createdAt)].filter(Boolean).join(" · ")}</span>
                      </span>
                    </span>
                    {d.requirement && <Badge variant="outline">{d.requirement.name}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </ContentSection>
        </>
      )}
    </div>
  )
}
