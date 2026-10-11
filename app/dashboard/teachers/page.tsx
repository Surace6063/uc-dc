import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { TeachersHeaderActions, TeachersView } from "@/features/teachers/components/teachers-view"
import { parseTeacherFilters } from "@/features/teachers/filters"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { signedUrls } from "@/lib/supabase/storage"
import { getEducationStructure } from "@/services/academics/structure-service"
import { getTeacherStats, listTeachers } from "@/services/teachers/teacher-query"

export const metadata: Metadata = {
  title: "Teachers",
}

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await getPageContext()
  if (!hasPermission(context, "teachers.view")) return <AccessDenied />

  // Filters, sort and page come from the URL and are applied on the server.
  const filters = parseTeacherFilters(await searchParams)
  const [structure, list] = await Promise.all([getEducationStructure(context), listTeachers(context, filters)])
  const [stats, photos] = await Promise.all([
    getTeacherStats(context, list.yearId),
    signedUrls(list.rows.map((r) => r.profileImagePath).filter((p): p is string => !!p)),
  ])
  const rows = list.rows.map(({ profileImagePath, ...row }) => ({
    ...row,
    photoUrl: profileImagePath ? (photos.get(profileImagePath) ?? null) : null,
  }))

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Teachers"
        description="Teacher profiles, employment, qualifications and teaching assignments."
        breadcrumbs={[{ label: "Teachers" }]}
      >
        <TeachersHeaderActions years={structure.years} yearId={list.yearId} />
      </PageHeader>
      <TeachersView rows={rows} total={list.total} stats={stats} filters={filters} structure={structure} yearId={list.yearId} />
    </div>
  )
}
