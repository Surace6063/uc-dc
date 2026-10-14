import type { Metadata } from "next"
import Link from "next/link"
import { FileIcon, FileStackIcon, LinkIcon } from "lucide-react"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { NoStudentProfile, NotEnrolled } from "@/features/student-portal/components/no-student"
import { formatBytes } from "@/features/teaching/constants"
import { formatDateTime } from "@/features/teaching/format"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { myMaterials, mySubjects } from "@/services/student-portal/learning-service"
import { myEnrollment, myStudent } from "@/services/student-portal/me-service"

export const metadata: Metadata = { title: "Lesson materials" }

const PAGE_SIZE = 20

const params = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  subject: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
})

// Materials teachers have shared with the student's class.
export default async function StudentMaterialsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "courses.view")) return <AccessDenied />
  const f = params.parse(await searchParams)
  const [student, enrollment, subjects, list] = await Promise.all([
    myStudent(context),
    myEnrollment(context),
    mySubjects(context),
    myMaterials(context, { q: f.q, subject: f.subject, page: f.page, pageSize: PAGE_SIZE }),
  ])
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE))
  const href = (page: number) => `?${new URLSearchParams({ ...(f.q && { q: f.q }), ...(f.subject && { subject: f.subject }), ...(page > 1 && { page: String(page) }) })}`

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Lesson materials" description="Notes, worksheets, slides and links your teachers have shared with your class." breadcrumbs={[{ label: "Lesson materials" }]} />
      {!student ? (
        <NoStudentProfile />
      ) : !enrollment ? (
        <NotEnrolled />
      ) : (
        <>
          <form className="flex flex-wrap items-end gap-3" role="search">
            <Input name="q" defaultValue={f.q ?? ""} placeholder="Search materials" aria-label="Search materials" className="h-9 w-full max-w-xs" />
            <NativeSelect name="subject" defaultValue={f.subject ?? ""} aria-label="Subject" className="min-w-44">
              <NativeSelectOption value="">All subjects</NativeSelectOption>
              {subjects.map((s) => (
                <NativeSelectOption key={s.subject.id} value={s.subject.id}>{s.subject.name}</NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit" size="sm" variant="outline">Filter</Button>
            {(f.q || f.subject) && <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="?" />}>Clear</Button>}
          </form>
          {list.rows.length === 0 ? (
            <EmptyState icon={FileStackIcon} title="No materials" description={f.q || f.subject ? "No materials match these filters." : "Your teachers haven't shared any materials yet."} />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {list.rows.map((m) => (
                <li key={m.id}>
                  <Card className="h-full flex-row items-start gap-3 p-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {m.kind === "LINK" ? <LinkIcon className="size-4" /> : <FileIcon className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a href={`/api/materials/${m.id}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{m.title}</a>
                      <p className="text-xs text-muted-foreground">
                        {m.subject.name} · {m.teacher.firstName} {m.teacher.lastName} · {formatDateTime(m.createdAt)}
                        {m.kind === "FILE" && m.sizeBytes ? ` · ${formatBytes(m.sizeBytes)}` : ""}
                      </p>
                      {m.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{m.description}</p>}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Page {f.page} of {pages} · {list.total} materials</span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" disabled={f.page <= 1} nativeButton={false} render={<Link href={href(f.page - 1)} aria-disabled={f.page <= 1} />}>Previous</Button>
                <Button size="sm" variant="outline" disabled={f.page >= pages} nativeButton={false} render={<Link href={href(f.page + 1)} aria-disabled={f.page >= pages} />}>Next</Button>
              </span>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
