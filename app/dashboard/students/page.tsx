import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import {
  StudentsHeaderActions,
  StudentsView,
} from "@/features/students/components/students-view"
import { parseStudentFilters } from "@/features/students/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { signedUrls } from "@/lib/supabase/storage"
import { getEducationStructure } from "@/services/academics/structure-service"
import { getStudentStats, listStudents } from "@/services/students/student-query"

export const metadata: Metadata = {
  title: "Students",
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await getPageContext()
  if (!hasPermission(context, "students.view")) return <AccessDenied />

  // Filters, sort and page come from the URL and are applied on the server.
  const filters = parseStudentFilters(await searchParams)
  const [structure, list] = await Promise.all([getEducationStructure(context), listStudents(context, filters)])
  const [stats, photos] = await Promise.all([
    getStudentStats(context, list.yearId),
    // One batched request for the page's avatars (private bucket).
    signedUrls(list.rows.map((r) => r.profileImagePath).filter((p): p is string => !!p)),
  ])
  const rows = list.rows.map(({ profileImagePath, ...row }) => ({
    ...row,
    photoUrl: profileImagePath ? (photos.get(profileImagePath) ?? null) : null,
  }))

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Students"
        description="Admit, enroll and manage students across your academic structure."
        breadcrumbs={[{ label: "Students" }]}
      >
        <StudentsHeaderActions years={structure.years} yearId={list.yearId} />
      </PageHeader>
      <StudentsView
        rows={rows}
        total={list.total}
        stats={stats}
        filters={filters}
        structure={structure}
        yearId={list.yearId}
      />
    </div>
  )
}
