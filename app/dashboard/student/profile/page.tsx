import type { Metadata } from "next"

import { ContentSection } from "@/components/shared/content-section"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { NoStudentProfile } from "@/features/student-portal/components/no-student"
import { ENROLLMENT_STATUS_LABELS, GENDER_LABELS, RELATIONSHIP_LABELS, STUDENT_STATUS_LABELS } from "@/features/students/constants"
import { formatDate } from "@/features/teaching/format"
import { getPageContext } from "@/lib/authorization/page"
import { provinceName } from "@/lib/nepal/locations"
import { myProfile } from "@/services/student-portal/record-service"
import { fullName } from "@/services/student-portal/me-service"

export const metadata: Metadata = { title: "My profile" }

// The signed-in student's own record, read-only. Changes go through the
// school office (staff-only notes and history are never shown here).
export default async function StudentProfilePage() {
  const context = await getPageContext()
  const data = await myProfile(context)

  if (!data) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="My profile" breadcrumbs={[{ label: "My profile" }]} />
        <NoStudentProfile />
      </div>
    )
  }
  const p = data.profile
  const field = (label: string, value: React.ReactNode) => (
    <div key={label}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  )
  const address = (type: "PERMANENT" | "TEMPORARY") => {
    const a = p.addresses.find((x) => x.type === type)
    return a ? [a.tole, a.wardNumber && `Ward ${a.wardNumber}`, a.municipality, a.district, provinceName(a.province)].filter(Boolean).join(", ") : null
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={fullName(p)} description={`Admission no. ${p.admissionNumber}`} breadcrumbs={[{ label: "My profile" }]}>
        <Badge variant="secondary">{STUDENT_STATUS_LABELS[p.status]}</Badge>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <ContentSection title="Personal details">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {field("Date of birth", p.dateOfBirth ? formatDate(p.dateOfBirth) : null)}
            {field("Gender", p.gender ? GENDER_LABELS[p.gender] : null)}
            {field("Nationality", p.nationality)}
            {field("Blood group", p.bloodGroup)}
            {field("Admitted on", formatDate(p.admissionDate))}
          </dl>
        </ContentSection>
        <ContentSection title="Contact">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {field("Email", p.email)}
            {field("Phone", p.phone)}
            {field("Alternate phone", p.alternatePhone)}
            {field("Permanent address", address("PERMANENT"))}
            {field("Temporary address", address("TEMPORARY"))}
          </dl>
        </ContentSection>
        <ContentSection title="Guardians" description="Guardians the school shares with your portal.">
          {p.guardians.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guardians are shown here.</p>
          ) : (
            <ul className="grid gap-2">
              {p.guardians.map((g, i) => (
                <li key={i} className="rounded-lg border px-3 py-2.5 text-sm">
                  <span className="font-medium">{g.guardian.fullName}</span>
                  <span className="text-muted-foreground"> · {RELATIONSHIP_LABELS[g.relationship]}{g.isPrimary ? " · primary" : ""}</span>
                  <span className="block text-xs text-muted-foreground">{[g.guardian.phone, g.guardian.email].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </ContentSection>
        <ContentSection title="Enrollment history">
          {data.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrollments yet.</p>
          ) : (
            <ul className="grid gap-2">
              {data.enrollments.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm">
                  <span>
                    <span className="font-medium">{e.academicYear.name} · {e.class.name}{e.section ? ` · Section ${e.section.name}` : ""}</span>
                    <span className="block text-xs text-muted-foreground">{[e.program?.name, e.rollNumber && `Roll ${e.rollNumber}`, `from ${formatDate(e.enrollmentDate)}`].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Badge variant="outline">{ENROLLMENT_STATUS_LABELS[e.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </ContentSection>
      </div>
      <p className="text-xs text-muted-foreground">To correct any of these details, contact the school office.</p>
    </div>
  )
}
