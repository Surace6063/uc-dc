import type { Metadata } from "next"
import { BookMarkedIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { NoStudentProfile, NotEnrolled } from "@/features/student-portal/components/no-student"
import { REQUIREMENT_LABELS } from "@/features/subjects/constants"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { mySubjects } from "@/services/student-portal/learning-service"
import { myEnrollment, myStudent } from "@/services/student-portal/me-service"

export const metadata: Metadata = { title: "My subjects" }

export default async function StudentSubjectsPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "subjects.view")) return <AccessDenied />
  const [student, enrollment, subjects] = await Promise.all([myStudent(context), myEnrollment(context), mySubjects(context)])
  const totalCredits = subjects.reduce((n, s) => n + (s.creditHours ?? 0), 0)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="My subjects" description={enrollment ? `Subjects offered to ${enrollment.class.name}${enrollment.section ? ` · Section ${enrollment.section.name}` : ""} in ${enrollment.academicYear.name}.` : undefined} breadcrumbs={[{ label: "My subjects" }]} />
      {!student ? (
        <NoStudentProfile />
      ) : !enrollment ? (
        <NotEnrolled />
      ) : subjects.length === 0 ? (
        <EmptyState icon={BookMarkedIcon} title="No subjects yet" description="The school hasn't set the subjects for your class this year." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead className="text-right">Credit hours</TableHead>
                  <TableHead className="pr-4 text-right">Periods / week</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4">
                      <span className="font-medium">{s.subject.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{s.code ?? s.subject.code}</span>
                    </TableCell>
                    <TableCell><Badge variant={s.requirement === "COMPULSORY" ? "secondary" : "outline"}>{REQUIREMENT_LABELS[s.requirement]}</Badge></TableCell>
                    <TableCell className="text-sm">{s.teachers.length ? s.teachers.join(", ") : <span className="text-muted-foreground">Not assigned</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.creditHours ?? "—"}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{s.weeklyPeriods ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {totalCredits > 0 && `${totalCredits} credit hours in total. `}Elective and optional subjects are listed for your whole section; ask the office which ones you are registered for.
          </p>
        </>
      )}
    </div>
  )
}
