import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AwardIcon } from "lucide-react"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PortalResults } from "@/features/exams/components/portal-results"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { cn } from "@/lib/utils"
import { hasExamStaffAccess } from "@/services/exams/access-service"
import { childResults, myResults } from "@/services/exams/portal-service"
import { getGuardianAccountState, listPortalChildren } from "@/services/guardians/portal-service"

export const metadata: Metadata = {
  title: "Grades & Results",
}

// Published results for students (their own) and guardians (children whose
// link allows portal access). Staff work from the examinations pages.
export default async function GradesResultsPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "results.view")) return <AccessDenied />

  const mine = await myResults(context)
  if (mine) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="My results" description="Your published examination results, newest first." breadcrumbs={[{ label: "Results" }]} />
        <PortalResults years={mine.years} who="Your" />
      </div>
    )
  }

  if ((await getGuardianAccountState(context)) === "active") {
    const children = await listPortalChildren(context)
    const requested = z.uuid().safeParse((await searchParams).child)
    // A requested child is used only if it's one of this guardian's; the
    // service re-checks the link either way.
    const selected = children.find((c) => requested.success && c.id === requested.data) ?? children[0]
    const years = selected ? await childResults(context, selected.id) : []
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="Results" description="Published results of your children." breadcrumbs={[{ label: "Results" }]} />
        {children.length > 1 && (
          <nav aria-label="Choose a child" className="flex flex-wrap gap-2">
            {children.map((c) => (
              <Link key={c.id} href={`/dashboard/results?child=${c.id}`} aria-current={c.id === selected?.id ? "page" : undefined} className={cn("rounded-full border px-3 py-1 text-sm hover:bg-muted/50", c.id === selected?.id && "border-primary/50 bg-primary/5 font-medium")}>
                {c.firstName}
              </Link>
            ))}
          </nav>
        )}
        {selected ? (
          <PortalResults years={years} who={selected.firstName} />
        ) : (
          <Empty className="rounded-xl border py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon"><AwardIcon /></EmptyMedia>
              <EmptyTitle>No children are shared with you yet</EmptyTitle>
              <EmptyDescription>The school decides which students each guardian can see.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    )
  }

  if (hasExamStaffAccess(context)) redirect("/dashboard/exams")
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Results" breadcrumbs={[{ label: "Results" }]} />
      <Empty className="rounded-xl border py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon"><AwardIcon /></EmptyMedia>
          <EmptyTitle>No student profile is linked to your account</EmptyTitle>
          <EmptyDescription>Results are shown to students and to guardians with portal access.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
