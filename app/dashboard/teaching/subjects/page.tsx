import type { Metadata } from "next"
import Link from "next/link"
import { BookMarkedIcon, UserRoundXIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TEACHING_ROLE_LABELS } from "@/features/teachers/constants"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { mySubjects } from "@/services/teaching/class-service"
import { myTeacher, resolveYear } from "@/services/teaching/scope-service"

export const metadata: Metadata = { title: "My subjects" }

// The subjects the signed-in teacher teaches this year, in each class, with
// the offering's details and the work they've prepared for it.
export default async function MySubjectsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "subjects.view")) return <AccessDenied />
  const [teacher, yearId] = await Promise.all([myTeacher(context), resolveYear(context, (await searchParams).year)])
  const subjects = teacher ? await mySubjects(context, yearId) : []
  const q = (s: (typeof subjects)[number]) => `year=${yearId}&class=${s.classId}${s.sectionId ? `&section=${s.sectionId}` : ""}&subject=${s.subject.id}`

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="My subjects" description="Subjects you teach in each class, and what you've prepared for them." breadcrumbs={[{ label: "My subjects" }]} />
      {!teacher ? (
        <EmptyState icon={UserRoundXIcon} title="Your account isn't linked to a teacher profile" description="Ask the office to link your login to your teacher profile." />
      ) : subjects.length === 0 ? (
        <EmptyState icon={BookMarkedIcon} title="No subjects assigned" description="You have no subject assignments in this academic year." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Subject</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Credit hours</TableHead>
                <TableHead className="text-right">Periods / week</TableHead>
                <TableHead>Curriculum</TableHead>
                <TableHead className="pr-4">Prepared</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="pl-4">
                    <span className="font-medium">{s.subject.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{s.offeringCode ?? s.subject.code}</span>
                  </TableCell>
                  <TableCell>
                    {s.className}
                    {s.sectionName && <span className="text-muted-foreground"> · {s.sectionName}</span>}
                    {!s.offered && <Badge variant="outline" className="ml-2 text-muted-foreground">Not offered this year</Badge>}
                  </TableCell>
                  <TableCell>{TEACHING_ROLE_LABELS[s.role]}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.creditHours ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.weeklyPeriods ?? "—"}</TableCell>
                  <TableCell>{s.curriculum ? <Link href={`/dashboard/subjects/${s.subject.id}`} className="text-sm hover:underline">{s.curriculum.name}</Link> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="pr-4">
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <Link href={`/dashboard/lesson-plans?${q(s)}`} className="rounded-md border px-2 py-0.5 hover:bg-muted">{s.lessonPlans} plan{s.lessonPlans === 1 ? "" : "s"}</Link>
                      <Link href={`/dashboard/materials?${q(s)}`} className="rounded-md border px-2 py-0.5 hover:bg-muted">{s.materials} material{s.materials === 1 ? "" : "s"}</Link>
                      <Link href={`/dashboard/assignments?${q(s)}`} className="rounded-md border px-2 py-0.5 hover:bg-muted">{s.assignments} assignment{s.assignments === 1 ? "" : "s"}</Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
