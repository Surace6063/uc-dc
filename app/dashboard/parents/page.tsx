import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { GuardianHeaderActions, GuardiansView } from "@/features/guardians/components/guardians-view"
import { parseGuardianFilters } from "@/features/guardians/filters"
import { fullName } from "@/features/students/constants"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { signedUrls } from "@/lib/supabase/storage"
import { getGuardianStats, listGuardians } from "@/services/guardians/guardian-query"

export const metadata: Metadata = {
  title: "Parents & guardians",
}

export default async function ParentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await getPageContext()
  if (!hasPermission(context, "parents.view")) return <AccessDenied />

  // Filters, sort and page come from the URL and are applied on the server.
  const filters = parseGuardianFilters(await searchParams)
  const [list, stats, student] = await Promise.all([
    listGuardians(context, filters),
    getGuardianStats(context),
    // Label for the "guardians of this student" chip.
    filters.student && hasPermission(context, "students.view")
      ? prisma.student.findFirst({
          where: { id: filters.student, organizationId: context.organization.id },
          select: { firstName: true, middleName: true, lastName: true },
        })
      : Promise.resolve(null),
  ])
  const photos = await signedUrls(list.rows.map((r) => r.profileImagePath).filter((p): p is string => !!p))
  const rows = list.rows.map(({ profileImagePath, ...row }) => ({
    ...row,
    photoUrl: profileImagePath ? (photos.get(profileImagePath) ?? null) : null,
  }))

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Parents & guardians"
        description="Guardian profiles, their links to students, notification preferences and parent-portal access."
        breadcrumbs={[{ label: "Parents" }]}
      >
        <GuardianHeaderActions />
      </PageHeader>
      <GuardiansView rows={rows} total={list.total} stats={stats} filters={filters} studentLabel={student ? fullName(student) : null} />
    </div>
  )
}
