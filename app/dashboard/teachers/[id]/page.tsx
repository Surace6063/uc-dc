import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  BookOpenIcon,
  CalendarCheckIcon,
  ClipboardListIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react"
import { z } from "zod"

import { PageHeader } from "@/components/shared/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GENDER_LABELS, initials } from "@/features/students/constants"
import {
  AccountPanel,
  AssignmentsPanel,
  CertificationsPanel,
  EmploymentPanel,
  QualificationsPanel,
  TeacherDocumentsPanel,
  TeacherPhotoControl,
  TeacherProfileActions,
} from "@/features/teachers/components/profile-panels"
import { EmploymentStatusBadge, VerificationBadge } from "@/features/teachers/components/status-badges"
import {
  assignmentSummary,
  EMPLOYMENT_TYPE_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  QUALIFICATION_RANK,
  teacherName,
} from "@/features/teachers/constants"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { provinceName } from "@/lib/nepal/locations"
import { prisma } from "@/lib/prisma"
import { signedUrls } from "@/lib/supabase/storage"
import { getEducationStructure } from "@/services/academics/structure-service"
import { listEntityActivity } from "@/services/audit/audit-service"
import { listTeacherDocuments } from "@/services/teachers/document-service"
import { getTeacherProfile, listLinkableUsers } from "@/services/teachers/teacher-service"

export const metadata: Metadata = {
  title: "Teacher profile",
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

function ModuleCard({ title, icon: Icon, href }: { title: string; icon: React.ComponentType<{ className?: string }>; href?: string }) {
  const body = (
    <>
      <Icon className="size-4 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{href ? "Open" : "Available when this module is enabled."}</p>
      </div>
    </>
  )
  return href ? (
    <Link href={href} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40">{body}</Link>
  ) : (
    <div className="flex items-center gap-3 rounded-lg border border-dashed p-3">{body}</div>
  )
}

export default async function TeacherProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const context = await getPageContext()
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) notFound()

  // Access (staff with teachers.view, or the teacher themselves) and
  // field-level restrictions are enforced inside the service.
  const teacher = await getTeacherProfile(context, id.data).catch((error) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })
  const isStaff = hasPermission(context, "teachers.view")
  const canSeeActivity = hasPermission(context, "audit.view") || hasPermission(context, "teachers.update")
  const canLinkAccounts = hasPermission(context, "teachers.update") && hasPermission(context, "members.view")

  // Assignment management: full managers, or department heads for teachers
  // in their own department.
  let canManageAssignments = hasPermission(context, "teachers.assignments.manage")
  if (!canManageAssignments && hasPermission(context, "teachers.assignments.manage_department")) {
    const own = await prisma.teacher.findFirst({
      where: { organizationId: context.organization.id, userId: context.user.id, archivedAt: null },
      select: { departmentId: true },
    })
    canManageAssignments = Boolean(own?.departmentId && own.departmentId === teacher.department?.id)
  }

  const [structure, documents, activity, photos, linkableUsers, managers] = await Promise.all([
    getEducationStructure(context),
    teacher.access.documents ? listTeacherDocuments(context, teacher.id) : Promise.resolve([]),
    canSeeActivity ? listEntityActivity(context, "teacher", teacher.id) : Promise.resolve([]),
    signedUrls(teacher.profileImagePath ? [teacher.profileImagePath] : [], 600),
    canLinkAccounts ? listLinkableUsers(context, teacher.id) : Promise.resolve(null),
    hasPermission(context, "teachers.employment.manage")
      ? prisma.teacher.findMany({
          where: { organizationId: context.organization.id, archivedAt: null, id: { not: teacher.id } },
          orderBy: { firstName: "asc" },
          take: 500,
          select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true },
        })
      : Promise.resolve([]),
  ])
  const photoUrl = teacher.profileImagePath ? photos.get(teacher.profileImagePath) : undefined
  const current = teacher.assignments.filter((a) => a.status === "ACTIVE")
  const best = [...teacher.qualifications].sort((a, b) => QUALIFICATION_RANK[b.level] - QUALIFICATION_RANK[a.level])[0]
  const requirements = structure.requirements
    .filter((r) => r.audience === "TEACHER" && r.isActive)
    .map((r) => ({ id: r.id, name: r.name, isRequired: r.isRequired }))
  const docOptions = documents.map((d) => ({ id: d.id, title: d.title }))

  const tabs = [
    "overview", "personal", "employment", "qualifications", "assignments",
    ...(teacher.access.documents ? ["documents"] : []),
    ...(canSeeActivity ? ["activity"] : []),
  ]
  const requested = (await searchParams).tab
  const defaultTab = requested && tabs.includes(requested) ? requested : "overview"
  const address = (type: "PERMANENT" | "TEMPORARY") => teacher.sensitive?.addresses.find((a) => a.type === type)
  const addressText = (type: "PERMANENT" | "TEMPORARY") => {
    const a = address(type)
    return a ? [a.tole, a.wardNumber && `Ward ${a.wardNumber}`, a.municipality, a.district, provinceName(a.province)].filter(Boolean).join(", ") : null
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={teacherName(teacher)}
        description={`Employee ID ${teacher.employeeId}${teacher.nameNepali ? ` · ${teacher.nameNepali}` : ""}`}
        breadcrumbs={isStaff ? [{ label: "Teachers", href: "/dashboard/teachers" }, { label: teacherName(teacher) }] : [{ label: "My profile" }]}
      >
        {isStaff && <TeacherProfileActions teacher={teacher} />}
      </PageHeader>

      {teacher.archivedAt && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          This profile was archived on {formatDate(teacher.archivedAt)}. It is read-only until restored.
        </p>
      )}

      <Card className="flex-row flex-wrap items-center gap-5 p-5">
        <div className="flex flex-col items-center gap-1">
          <Avatar className="size-20">
            {photoUrl && <AvatarImage src={photoUrl} alt="" />}
            <AvatarFallback className="text-xl">{initials(teacher)}</AvatarFallback>
          </Avatar>
          {isStaff && <TeacherPhotoControl teacherId={teacher.id} hasPhoto={Boolean(photoUrl)} disabled={teacher.archivedAt !== null} />}
        </div>
        <dl className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Status" value={<EmploymentStatusBadge status={teacher.employmentStatus} archived={teacher.archivedAt !== null} />} />
          <Field label="Designation" value={teacher.designation?.name} />
          <Field label="Department" value={teacher.department?.name} />
          <Field label="Joined" value={formatDate(teacher.dateOfJoining)} />
          <Field label="Contact" value={[teacher.phone, teacher.email].filter(Boolean).join(" · ")} />
        </dl>
      </Card>

      <Tabs defaultValue={defaultTab} className="gap-5">
        <div className="overflow-x-auto">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="employment">Employment</TabsTrigger>
            <TabsTrigger value="qualifications">Qualifications</TabsTrigger>
            <TabsTrigger value="assignments">Teaching</TabsTrigger>
            {teacher.access.documents && <TabsTrigger value="documents">Documents</TabsTrigger>}
            {canSeeActivity && <TabsTrigger value="activity">Activity</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <Card className="gap-4 p-5 lg:col-span-2">
            <h2 className="text-base font-semibold">Current teaching</h2>
            {current.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active assignments.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {current.map((a) => (
                  <li key={a.id} className="rounded-lg border p-3">
                    <p className="font-medium">{assignmentSummary(a)}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.academicYear.name}
                      {a.weeklyPeriods != null ? ` · ${a.weeklyPeriods}/week` : ""}
                      {a.role === "CLASS_TEACHER" ? " · Class teacher" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <h2 className="text-base font-semibold">Summary</h2>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="Employment type" value={EMPLOYMENT_TYPE_LABELS[teacher.employmentType]} />
              <Field
                label="Highest qualification"
                value={best ? <span className="flex flex-wrap items-center gap-2">{best.title} <VerificationBadge status={best.verificationStatus} /></span> : null}
              />
              <Field label="Level" value={best ? QUALIFICATION_LEVEL_LABELS[best.level] : null} />
              <Field label="Certifications" value={teacher.certifications.length || null} />
              <Field label="Login account" value={teacher.user ? teacher.user.email : "Not linked"} />
            </dl>
          </Card>
          <Card className="gap-3 p-5">
            <h2 className="text-base font-semibold">Related</h2>
            <ModuleCard title="Class rosters" icon={UsersIcon} href={current.some((a) => a.classId) ? `/dashboard/students?class=${current.find((a) => a.classId)?.classId}` : undefined} />
            <ModuleCard title="Attendance" icon={CalendarCheckIcon} />
            <ModuleCard title="Examinations" icon={ClipboardListIcon} />
            <ModuleCard title="LMS courses" icon={BookOpenIcon} />
            <ModuleCard title="Payroll (finance)" icon={WalletIcon} />
          </Card>
        </TabsContent>

        <TabsContent value="personal" className="grid gap-4">
          <Card className="gap-4 p-5">
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="First name" value={teacher.firstName} />
              <Field label="Middle name" value={teacher.middleName} />
              <Field label="Last name" value={teacher.lastName} />
              <Field label="Name (Nepali)" value={teacher.nameNepali} />
              <Field label="Gender" value={teacher.gender ? GENDER_LABELS[teacher.gender] : null} />
              <Field label="Nationality" value={teacher.nationality} />
              <Field label="Email" value={teacher.email} />
              <Field label="Phone" value={teacher.phone} />
              <Field label="Alternate phone" value={teacher.alternatePhone} />
              {teacher.sensitive && (
                <>
                  <Field label="Date of birth (AD)" value={formatDate(teacher.sensitive.dateOfBirth)} />
                  <Field label="Emergency contact" value={[teacher.sensitive.emergencyContactName, teacher.sensitive.emergencyContactRelationship, teacher.sensitive.emergencyContactPhone].filter(Boolean).join(" · ")} />
                  <Field label="Permanent address" value={addressText("PERMANENT")} />
                  <Field label="Temporary address" value={addressText("TEMPORARY")} />
                </>
              )}
            </dl>
            {!teacher.sensitive && <p className="text-xs text-muted-foreground">Date of birth, addresses and emergency contacts are visible to authorised roles only.</p>}
          </Card>
          {(linkableUsers || teacher.access.isSelf || isStaff) && <AccountPanel teacher={teacher} linkableUsers={linkableUsers} />}
        </TabsContent>

        <TabsContent value="employment">
          <EmploymentPanel
            teacher={teacher}
            structure={structure}
            managers={managers.map((m) => ({ id: m.id, name: `${teacherName(m)} (${m.employeeId})` }))}
          />
        </TabsContent>

        <TabsContent value="qualifications" className="grid gap-4">
          <QualificationsPanel teacher={teacher} documents={docOptions} />
          <CertificationsPanel teacher={teacher} documents={docOptions} />
        </TabsContent>

        <TabsContent value="assignments">
          <AssignmentsPanel teacher={teacher} structure={structure} canManage={canManageAssignments} />
        </TabsContent>

        {teacher.access.documents && (
          <TabsContent value="documents">
            <TeacherDocumentsPanel teacher={teacher} documents={documents} requirements={requirements} />
          </TabsContent>
        )}

        {canSeeActivity && (
          <TabsContent value="activity">
            <Card className="gap-3 p-5">
              <h2 className="text-base font-semibold">Activity</h2>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded.</p>
              ) : (
                <ol className="grid gap-3">
                  {activity.map((a) => (
                    <li key={a.id} className="grid gap-0.5 border-l-2 pl-3">
                      <p className="text-sm">{a.summary}</p>
                      <p className="text-xs text-muted-foreground">{a.actor?.name ?? a.actor?.email ?? "System"} · {formatDateTime(a.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
