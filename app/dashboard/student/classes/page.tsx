import type { Metadata } from "next"
import Link from "next/link"
import { MailIcon, PhoneIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { ContentSection } from "@/components/shared/content-section"
import { PageHeader } from "@/components/shared/page-header"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { Button } from "@/components/ui/button"
import { NoStudentProfile, NotEnrolled } from "@/features/student-portal/components/no-student"
import { TEACHING_ROLE_LABELS } from "@/features/teachers/constants"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { myClassInfo } from "@/services/student-portal/learning-service"
import { myStudent } from "@/services/student-portal/me-service"

export const metadata: Metadata = { title: "My class" }

export default async function StudentClassesPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "academics.view")) return <AccessDenied />
  const [student, info] = await Promise.all([myStudent(context), myClassInfo(context)])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="My class" description="Your class, section and class teacher for this year." breadcrumbs={[{ label: "My class" }]} />
      {!student ? (
        <NoStudentProfile />
      ) : !info ? (
        <NotEnrolled />
      ) : (
        <>
          <SummaryGrid columns={4}>
            <SummaryCard label="Class" value={info.enrollment.class.name} hint={info.enrollment.program?.name ?? info.enrollment.educationLevel.name} />
            <SummaryCard label="Section" value={info.enrollment.section?.name ?? "—"} hint={info.enrollment.batch ? `Batch ${info.enrollment.batch.name}` : undefined} />
            <SummaryCard label="Roll number" value={info.enrollment.rollNumber ?? "—"} hint={info.enrollment.academicYear.name} />
            <SummaryCard label="Classmates" value={Math.max(0, info.classmates - 1)} hint={info.enrollment.section ? "In your section" : "In your class"} />
          </SummaryGrid>
          <ContentSection title="Class teacher" description="Contact your class teacher for questions about your class.">
            {info.classTeachers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No class teacher has been assigned yet.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {info.classTeachers.map((t) => (
                  <li key={t.name} className="rounded-lg border p-4">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{TEACHING_ROLE_LABELS[t.role]}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      {t.email && <a href={`mailto:${t.email}`} className="inline-flex items-center gap-1.5 hover:underline"><MailIcon className="size-3.5" />{t.email}</a>}
                      {t.phone && <a href={`tel:${t.phone}`} className="inline-flex items-center gap-1.5 hover:underline"><PhoneIcon className="size-3.5" />{t.phone}</a>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ContentSection>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard/student/subjects" />}>Subjects & teachers</Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard/student/timetable" />}>Timetable</Button>
          </div>
        </>
      )}
    </div>
  )
}
