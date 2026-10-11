import type { Metadata } from "next"
import { notFound } from "next/navigation"
import {
  BookOpenIcon,
  CalendarCheckIcon,
  ClipboardListIcon,
  HeartHandshakeIcon,
  WalletIcon,
} from "lucide-react"
import { z } from "zod"

import { PageHeader } from "@/components/shared/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DocumentsPanel,
  EnrollmentPanel,
  GuardiansPanel,
  PhotoControl,
  ProfileActions,
} from "@/features/students/components/profile-panels"
import { EnrollmentStatusBadge, StudentStatusBadge } from "@/features/students/components/status-badges"
import {
  ADMISSION_TYPE_LABELS,
  fullName,
  GENDER_LABELS,
  initials,
  RELATIONSHIP_LABELS,
} from "@/features/students/constants"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { provinceName } from "@/lib/nepal/locations"
import { signedUrls } from "@/lib/supabase/storage"
import { getEducationStructure } from "@/services/academics/structure-service"
import { listEntityActivity } from "@/services/audit/audit-service"
import { listStudentDocuments } from "@/services/students/document-service"
import { getStudentProfile } from "@/services/students/student-service"

export const metadata: Metadata = {
  title: "Student profile",
}

const formatDate = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"

const formatDateTime = (d: Date) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

// Placeholder for modules that will hang off the student record later.
function ModuleCard({ title, icon: Icon }: { title: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed p-3">
      <Icon className="size-4 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">Available when this module is enabled.</p>
      </div>
    </div>
  )
}

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const context = await getPageContext()
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) notFound()

  // Access: staff with students.view, or the student / a linked guardian
  // (checked inside the service). Anything else is a 404.
  const student = await getStudentProfile(context, id.data).catch((error) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })

  const isStaff = hasPermission(context, "students.view")
  const canSeeDocuments = isStaff && hasPermission(context, "students.documents.view")
  const canSeeActivity = hasPermission(context, "audit.view") || hasPermission(context, "students.update")
  const canSeeSensitive = hasPermission(context, "students.sensitive.view")

  const [structure, documents, activity, photos] = await Promise.all([
    getEducationStructure(context),
    canSeeDocuments ? listStudentDocuments(context, student.id) : Promise.resolve([]),
    canSeeActivity ? listEntityActivity(context, "student", student.id) : Promise.resolve([]),
    signedUrls(student.profileImagePath ? [student.profileImagePath] : [], 600),
  ])
  const photoUrl = student.profileImagePath ? photos.get(student.profileImagePath) : undefined
  const current = student.enrollments.find((e) => e.status === "ACTIVE" || e.status === "ON_HOLD")
  const primary = student.guardians[0]
  const address = (type: "PERMANENT" | "TEMPORARY") => student.addresses.find((a) => a.type === type)
  const levelIds = new Set(student.enrollments.filter((e) => e.status === "ACTIVE" || e.status === "ON_HOLD").map((e) => e.educationLevelId))
  const requirements = structure.requirements
    .filter((r) => r.audience === "STUDENT" && r.isActive && (!r.educationLevelId || levelIds.has(r.educationLevelId)))
    .map((r) => ({ id: r.id, name: r.name, isRequired: r.isRequired }))

  const tabs = [
    "overview", "personal", "address", "guardians", "enrollment",
    ...(canSeeDocuments ? ["documents"] : []),
    ...(canSeeActivity ? ["activity"] : []),
  ]
  const requested = (await searchParams).tab
  const defaultTab = requested && tabs.includes(requested) ? requested : "overview"

  const addressBlock = (type: "PERMANENT" | "TEMPORARY") => {
    const a = address(type)
    if (!a) return <p className="text-sm text-muted-foreground">Not recorded.</p>
    return (
      <dl className="grid gap-4 sm:grid-cols-3">
        <Field label="Province" value={provinceName(a.province)} />
        <Field label="District" value={a.district} />
        <Field label="Municipality" value={a.municipality} />
        <Field label="Ward" value={a.wardNumber} />
        <Field label="Tole / locality" value={a.tole} />
        <Field label="Street / house" value={a.street} />
        <Field label="Postal code" value={a.postalCode} />
      </dl>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={fullName(student)}
        description={`Admission number ${student.admissionNumber}`}
        breadcrumbs={isStaff ? [{ label: "Students", href: "/dashboard/students" }, { label: fullName(student) }] : [{ label: fullName(student) }]}
      >
        {isStaff && <ProfileActions student={student} />}
      </PageHeader>

      {student.archivedAt && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          This student was archived on {formatDate(student.archivedAt)}. The record is read-only until restored.
        </p>
      )}

      <Card className="flex-row flex-wrap items-center gap-5 p-5">
        <div className="flex flex-col items-center gap-1">
          <Avatar className="size-20">
            {photoUrl && <AvatarImage src={photoUrl} alt="" />}
            <AvatarFallback className="text-xl">{initials(student)}</AvatarFallback>
          </Avatar>
          {isStaff && <PhotoControl studentId={student.id} hasPhoto={Boolean(photoUrl)} disabled={student.archivedAt !== null} />}
        </div>
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status" value={<StudentStatusBadge status={student.status} archived={student.archivedAt !== null} />} />
          <Field
            label="Current placement"
            value={current ? `${current.class.name}${current.section ? ` · ${current.section.name}` : ""}${current.program ? ` · ${current.program.code}` : ""} (${current.academicYear.name})` : "Not enrolled"}
          />
          <Field label="Roll number" value={current?.rollNumber} />
          <Field label="Primary guardian" value={primary ? `${primary.guardian.fullName}${primary.guardian.phone ? ` · ${primary.guardian.phone}` : ""}` : null} />
        </div>
      </Card>

      <Tabs defaultValue={defaultTab} className="gap-5">
        <div className="overflow-x-auto">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="address">Address</TabsTrigger>
            <TabsTrigger value="guardians">Guardians</TabsTrigger>
            <TabsTrigger value="enrollment">Enrollment</TabsTrigger>
            {canSeeDocuments && <TabsTrigger value="documents">Documents</TabsTrigger>}
            {canSeeActivity && <TabsTrigger value="activity">Activity</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <Card className="gap-4 p-5 lg:col-span-2">
            <h2 className="text-base font-semibold">Summary</h2>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="Admission date" value={formatDate(student.admissionDate)} />
              <Field label="Admission type" value={ADMISSION_TYPE_LABELS[student.admissionType]} />
              <Field label="Date of birth" value={formatDate(student.dateOfBirth)} />
              <Field label="Gender" value={student.gender ? GENDER_LABELS[student.gender] : null} />
              <Field label="Phone" value={student.phone} />
              <Field label="Email" value={student.email} />
              <Field label="Education level" value={current?.educationLevel.name} />
              <Field label="Program" value={current?.program?.name} />
              <Field label="Enrollment" value={current ? <EnrollmentStatusBadge status={current.status} /> : null} />
            </dl>
          </Card>
          <Card className="gap-3 p-5">
            <h2 className="text-base font-semibold">Other modules</h2>
            <ModuleCard title="Attendance" icon={CalendarCheckIcon} />
            <ModuleCard title="Examinations & results" icon={ClipboardListIcon} />
            <ModuleCard title="Fees & payments" icon={WalletIcon} />
            <ModuleCard title="LMS courses" icon={BookOpenIcon} />
            <ModuleCard title="Parent portal" icon={HeartHandshakeIcon} />
          </Card>
        </TabsContent>

        <TabsContent value="personal">
          <Card className="gap-4 p-5">
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="First name" value={student.firstName} />
              <Field label="Middle name" value={student.middleName} />
              <Field label="Last name" value={student.lastName} />
              <Field label="Date of birth (AD)" value={formatDate(student.dateOfBirth)} />
              <Field label="Gender" value={student.gender ? GENDER_LABELS[student.gender] : null} />
              <Field label="Nationality" value={student.nationality} />
              <Field label="Email" value={student.email} />
              <Field label="Phone" value={student.phone} />
              <Field label="Alternate phone" value={student.alternatePhone} />
              <Field label="Blood group" value={student.bloodGroup} />
              <Field label="Mother tongue" value={student.motherTongue} />
              <Field label="Previous school" value={student.previousSchool} />
              {canSeeSensitive && <Field label="Medical notes (restricted)" value={student.medicalNotes} />}
            </dl>
          </Card>
        </TabsContent>

        <TabsContent value="address" className="grid gap-4">
          <Card className="gap-4 p-5">
            <h2 className="text-base font-semibold">Permanent address</h2>
            {addressBlock("PERMANENT")}
          </Card>
          <Card className="gap-4 p-5">
            <h2 className="text-base font-semibold">Temporary address</h2>
            {addressBlock("TEMPORARY")}
          </Card>
        </TabsContent>

        <TabsContent value="guardians">
          {isStaff ? (
            <GuardiansPanel student={student} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {student.guardians.map((g) => (
                <Card key={g.guardianId} className="p-4">
                  <p className="font-medium">{g.guardian.fullName}</p>
                  <p className="text-sm text-muted-foreground">{RELATIONSHIP_LABELS[g.relationship]}</p>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="enrollment">
          <EnrollmentPanel student={student} structure={structure} />
        </TabsContent>

        {canSeeDocuments && (
          <TabsContent value="documents">
            <DocumentsPanel
              studentId={student.id}
              archived={student.archivedAt !== null}
              documents={documents}
              requirements={requirements}
            />
          </TabsContent>
        )}

        {canSeeActivity && (
          <TabsContent value="activity" className="grid gap-4 lg:grid-cols-2">
            <Card className="gap-3 p-5">
              <h2 className="text-base font-semibold">Activity</h2>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded.</p>
              ) : (
                <ol className="grid gap-3">
                  {activity.map((a) => (
                    <li key={a.id} className="grid gap-0.5 border-l-2 pl-3">
                      <p className="text-sm">{a.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.actor?.name ?? a.actor?.email ?? "System"} · {formatDateTime(a.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card className="gap-3 p-5">
              <h2 className="text-base font-semibold">Status history</h2>
              <ol className="grid gap-3">
                {student.statusHistory.map((h) => (
                  <li key={h.id} className="grid gap-0.5 border-l-2 pl-3">
                    <p className="text-sm">
                      {h.action === "CREATED"
                        ? "Admitted"
                        : h.action === "ARCHIVED"
                          ? "Archived"
                          : h.action === "RESTORED"
                            ? "Restored"
                            : `${h.fromStatus?.toLowerCase()} → ${h.toStatus?.toLowerCase()}`}
                    </p>
                    {h.reason && <p className="text-xs text-muted-foreground">“{h.reason}”</p>}
                    <p className="text-xs text-muted-foreground">{formatDateTime(h.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
