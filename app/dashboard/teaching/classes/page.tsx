import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRightIcon, LayoutGridIcon, UserRoundXIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { myClasses } from "@/services/teaching/class-service"
import { myTeacher, resolveYear } from "@/services/teaching/scope-service"

export const metadata: Metadata = { title: "My classes" }

// Classes and sections the signed-in teacher is assigned to this year
// (the header's year selector changes the year).
export default async function MyClassesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "classes.view")) return <AccessDenied />
  const [teacher, yearId] = await Promise.all([myTeacher(context), resolveYear(context, (await searchParams).year)])
  const classes = teacher ? await myClasses(context, yearId) : []

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="My classes" description="Classes and sections you teach, with their students." breadcrumbs={[{ label: "My classes" }]} />
      {!teacher ? (
        <EmptyState icon={UserRoundXIcon} title="Your account isn't linked to a teacher profile" description="Ask the office to link your login to your teacher profile." />
      ) : !yearId ? (
        <EmptyState icon={LayoutGridIcon} title="No academic year" description="No academic year is current. Choose one from the year selector, or ask the office to set the current year." />
      ) : classes.length === 0 ? (
        <EmptyState icon={LayoutGridIcon} title="No classes assigned" description="You have no active teaching assignments in this year. The office assigns classes and subjects." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => (
            <Link
              key={c.key}
              href={`/dashboard/teaching/classes/${c.classId}?year=${yearId}${c.sectionId ? `&section=${c.sectionId}` : ""}`}
              className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card className="h-full gap-3 p-5 transition-colors group-hover:border-primary/40 group-hover:bg-primary/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">
                      {c.className}
                      {c.sectionName && <span className="text-muted-foreground"> · Section {c.sectionName}</span>}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {c.students.toLocaleString()} student{c.students === 1 ? "" : "s"}
                      {c.programCode && ` · ${c.programCode}`}
                      {!c.sectionName && " · whole class"}
                    </p>
                  </div>
                  <ChevronRightIcon className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.classTeacher && <Badge>Class teacher</Badge>}
                  {c.subjects.map((s) => (
                    <Badge key={s.id} variant="outline">{s.name}</Badge>
                  ))}
                </div>
                {c.weeklyPeriods > 0 && <p className="text-xs text-muted-foreground">{c.weeklyPeriods} periods a week</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
