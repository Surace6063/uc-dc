import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarCheckIcon, CalendarOffIcon, ClipboardListIcon, WalletIcon } from "lucide-react"
import { z } from "zod"

import { PageHeader } from "@/components/shared/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GENDER_LABELS, initials } from "@/features/students/constants"
import {
  StaffAccountPanel,
  StaffDocumentsPanel,
  StaffEmploymentPanel,
  StaffPhotoControl,
  StaffProfileActions,
  StaffQualificationsPanel,
  StaffResponsibilitiesPanel,
} from "@/features/staff/components/profile-panels"
import { StaffStatusBadge, VerificationBadge } from "@/features/staff/components/status-badges"
import {
  JOB_CATEGORY_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  QUALIFICATION_RANK,
  STAFF_EMPLOYMENT_TYPE_LABELS,
  staffName,
} from "@/features/staff/constants"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { provinceName } from "@/lib/nepal/locations"
import { prisma } from "@/lib/prisma"
import { signedUrls } from "@/lib/supabase/storage"
import { listEntityActivity } from "@/services/audit/audit-service"
import { getStaffFormOptions } from "@/services/staff/config-service"
import { listStaffDocuments } from "@/services/staff/document-service"
import { getStaffProfile, listLinkableStaffUsers } from "@/services/staff/staff-service"

export const metadata: Metadata = {
  title: "Staff profile",
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

// Links to related modules; shown as unavailable until each module exists.
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

export default async function StaffProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const context = await getPageContext()
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) notFound()

  // Access (directory, own department, or the staff member themselves) and
  // field-level restrictions are enforced inside the service.
  const staff = await getStaffProfile(context, id.data).catch((error) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })
  const inDirectory = hasPermission(context, "staff.view") || hasPermission(context, "staff.view_department")
  const canSeeActivity = hasPermission(context, "audit.view") || hasPermission(context, "staff.update")
  const canLinkAccounts = hasPermission(context, "staff.update") && hasPermission(context, "members.view")

  const [options, documents, activity, photos, linkableUsers, managers] = await Promise.all([
    getStaffFormOptions(context),
    staff.access.documents ? listStaffDocuments(context, staff.id) : Promise.resolve([]),
    canSeeActivity ? listEntityActivity(context, "staff", staff.id) : Promise.resolve([]),
    signedUrls(staff.profileImagePath ? [staff.profileImagePath] : [], 600),
    canLinkAccounts ? listLinkableStaffUsers(context, staff.id) : Promise.resolve(null),
    hasPermission(context, "staff.employment.manage")
      ? prisma.staff.findMany({
          where: { organizationId: context.organization.id, archivedAt: null, id: { not: staff.id } },
          orderBy: { firstName: "asc" },
          take: 500,
          select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true },
        })
      : Promise.resolve([]),
  ])
  const photoUrl = staff.profileImagePath ? photos.get(staff.profileImagePath) : undefined
  const responsibilities = staff.assignments.filter((a) => a.status === "ACTIVE")
  const academic = staff.qualifications.filter((q) => q.kind === "ACADEMIC")
  const best = [...academic].sort((a, b) => QUALIFICATION_RANK[b.level ?? "OTHER"] - QUALIFICATION_RANK[a.level ?? "OTHER"])[0]
  const certifications = staff.qualifications.filter((q) => q.kind !== "ACADEMIC").length
  const requirements = options.documentTypes.filter((r) => r.isActive).map((r) => ({ id: r.id, name: r.name, isRequired: r.isRequired }))
  const docOptions = documents.map((d) => ({ id: d.id, title: d.title }))
  const archived = staff.archivedAt !== null

  const tabs = [
    "overview", "personal", "employment", "qualifications", "responsibilities",
    ...(staff.access.documents ? ["documents"] : []),
    ...(canSeeActivity ? ["activity"] : []),
  ]
  const requested = (await searchParams).tab
  const defaultTab = requested && tabs.includes(requested) ? requested : "overview"
  const addressText = (type: "PERMANENT" | "TEMPORARY") => {
    const a = staff.sensitive?.addresses.find((x) => x.type === type)
    return a ? [a.street, a.tole, a.wardNumber && `Ward ${a.wardNumber}`, a.municipality, a.district, provinceName(a.province)].filter(Boolean).join(", ") : null
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={staffName(staff)}
        description={`Employee ID ${staff.employeeId}${staff.nameNepali ? ` · ${staff.nameNepali}` : ""}`}
        breadcrumbs={inDirectory ? [{ label: "Staff", href: "/dashboard/staff" }, { label: staffName(staff) }] : [{ label: "My profile" }]}
      >
        {inDirectory && <StaffProfileActions staff={staff} />}
      </PageHeader>

      {archived && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          This profile was archived on {formatDate(staff.archivedAt)}. It is read-only until restored.
        </p>
      )}

      <Card className="flex-row flex-wrap items-center gap-5 p-5">
        <div className="flex flex-col items-center gap-1">
          <Avatar className="size-20">
            {photoUrl && <AvatarImage src={photoUrl} alt="" />}
            <AvatarFallback className="text-xl">{initials(staff)}</AvatarFallback>
          </Avatar>
          {inDirectory && <StaffPhotoControl staffId={staff.id} hasPhoto={Boolean(photoUrl)} disabled={archived} />}
        </div>
        <dl className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Status" value={<StaffStatusBadge status={staff.employmentStatus} archived={archived} />} />
          <Field label="Designation" value={staff.designation?.name} />
          <Field label="Department" value={staff.department?.name} />
          <Field label="Joined" value={formatDate(staff.dateOfJoining)} />
          <Field label="Contact" value={[staff.phone, staff.email].filter(Boolean).join(" · ")} />
        </dl>
      </Card>

      <Tabs defaultValue={defaultTab} className="gap-5">
        <div className="overflow-x-auto">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="employment">Employment</TabsTrigger>
            <TabsTrigger value="qualifications">Qualifications</TabsTrigger>
            <TabsTrigger value="responsibilities">Responsibilities</TabsTrigger>
            {staff.access.documents && <TabsTrigger value="documents">Documents</TabsTrigger>}
            {canSeeActivity && <TabsTrigger value="activity">Activity</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <Card className="gap-4 p-5 lg:col-span-2">
            <h2 className="text-base font-semibold">Summary</h2>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="Employee ID" value={<span className="font-mono">{staff.employeeId}</span>} />
              <Field label="Employment type" value={STAFF_EMPLOYMENT_TYPE_LABELS[staff.employmentType]} />
              <Field label="Job category" value={staff.designation?.category ? JOB_CATEGORY_LABELS[staff.designation.category] : null} />
              <Field
                label="Highest qualification"
                value={best ? <span className="flex flex-wrap items-center gap-2">{best.title} <VerificationBadge status={best.verificationStatus} /></span> : null}
              />
              <Field label="Level" value={best?.level ? QUALIFICATION_LEVEL_LABELS[best.level] : null} />
              <Field label="Certifications / training" value={certifications || null} />
              {staff.employment && (
                <Field label="Contract ends" value={staff.employment.contractEndDate ? formatDate(staff.employment.contractEndDate) : null} />
              )}
              {staff.employment && <Field label="Probation" value={staff.employment.onProbation ? `Until ${formatDate(staff.employment.probationEndDate)}` : "No"} />}
              <Field label="Login account" value={staff.user ? staff.user.email : "Not linked"} />
            </dl>
            <h2 className="text-base font-semibold">Current responsibilities</h2>
            {responsibilities.length === 0 ? (
              <p className="text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {responsibilities.map((a) => (
                  <li key={a.id} className="rounded-lg border p-3">
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{[a.department?.name, `since ${formatDate(a.startDate)}`].filter(Boolean).join(" · ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="gap-3 p-5">
            <h2 className="text-base font-semibold">Related</h2>
            <ModuleCard title="Attendance" icon={CalendarCheckIcon} />
            <ModuleCard title="Leave" icon={CalendarOffIcon} />
            <ModuleCard title="Tasks" icon={ClipboardListIcon} />
            <ModuleCard title="Payroll (finance)" icon={WalletIcon} />
          </Card>
        </TabsContent>

        <TabsContent value="personal" className="grid gap-4">
          <Card className="gap-4 p-5">
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="First name" value={staff.firstName} />
              <Field label="Middle name" value={staff.middleName} />
              <Field label="Last name" value={staff.lastName} />
              <Field label="Name (Nepali)" value={staff.nameNepali} />
              <Field label="Gender" value={staff.gender ? GENDER_LABELS[staff.gender] : null} />
              <Field label="Nationality" value={staff.nationality} />
              <Field label="Phone" value={staff.phone} />
              <Field label="Alternate phone" value={staff.alternatePhone} />
              <Field label="Email" value={staff.email} />
              {staff.sensitive && (
                <>
                  <Field label="Date of birth (AD)" value={formatDate(staff.sensitive.dateOfBirth)} />
                  <Field
                    label="Emergency contact"
                    value={[staff.sensitive.emergencyContactName, staff.sensitive.emergencyContactRelationship, staff.sensitive.emergencyContactPhone].filter(Boolean).join(" · ")}
                  />
                  <Field label="Permanent address" value={addressText("PERMANENT")} />
                  <Field label="Temporary address" value={addressText("TEMPORARY")} />
                </>
              )}
            </dl>
            {!staff.sensitive && <p className="text-xs text-muted-foreground">Date of birth, addresses and emergency contacts are visible to authorised roles only.</p>}
          </Card>
          {(linkableUsers || staff.access.isSelf || inDirectory) && <StaffAccountPanel staff={staff} linkableUsers={linkableUsers} />}
        </TabsContent>

        <TabsContent value="employment">
          <StaffEmploymentPanel
            staff={staff}
            options={options}
            managers={managers.map((m) => ({ id: m.id, name: `${staffName(m)} (${m.employeeId})` }))}
          />
        </TabsContent>

        <TabsContent value="qualifications">
          <StaffQualificationsPanel staff={staff} documents={docOptions} />
        </TabsContent>

        <TabsContent value="responsibilities">
          <StaffResponsibilitiesPanel staff={staff} options={options} />
        </TabsContent>

        {staff.access.documents && (
          <TabsContent value="documents">
            <StaffDocumentsPanel staff={staff} documents={documents} requirements={requirements} />
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
