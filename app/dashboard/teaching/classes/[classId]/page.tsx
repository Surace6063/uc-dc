import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { RosterTable } from "@/features/teaching/components/roster-table"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { classRoster } from "@/services/teaching/class-service"
import { resolveYear } from "@/services/teaching/scope-service"

export const metadata: Metadata = { title: "Class roster" }

const uuid = z.uuid()

// A class's (or section's) students, for a teacher who teaches it.
export default async function ClassRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>
  searchParams: Promise<{ year?: string; section?: string }>
}) {
  const context = await getPageContext()
  if (!hasPermission(context, "classes.view")) return <AccessDenied />
  const { classId } = await params
  const sp = await searchParams
  const yearId = await resolveYear(context, sp.year)
  const section = sp.section ? uuid.safeParse(sp.section) : null
  if (!uuid.safeParse(classId).success || !yearId || (section && !section.success)) notFound()

  let roster
  try {
    roster = await classRoster(context, { academicYearId: yearId, classId, sectionId: section?.success ? section.data : null })
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const title = `${roster.cls.name}${roster.section ? ` · Section ${roster.section.name}` : ""}`
  const take = new URLSearchParams({ type: "DAILY", class: classId, section: roster.section?.id ?? "all" })

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={title}
        description={`${roster.students.length.toLocaleString()} enrolled student${roster.students.length === 1 ? "" : "s"} · ${roster.year.name}`}
        breadcrumbs={[{ label: "My classes", href: "/dashboard/teaching/classes" }, { label: title }]}
      >
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard/timetable?class=${classId}${roster.section ? `&section=${roster.section.id}` : ""}`} />}>
          Timetable
        </Button>
        <Button size="sm" nativeButton={false} render={<Link href={`/dashboard/attendance/take?${take}`} />}>
          Take attendance
        </Button>
      </PageHeader>
      <RosterTable students={roster.students} />
    </div>
  )
}
