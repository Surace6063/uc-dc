import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { MessagesSquareIcon } from "lucide-react"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ChildrenPanel,
  GuardianPhotoControl,
  GuardianProfileActions,
  PortalPanel,
} from "@/features/guardians/components/profile-panels"
import { PortalStatusBadge, RecordBadge } from "@/features/guardians/components/status-badges"
import { CONTACT_METHOD_LABELS, GENDER_LABELS, guardianInitials } from "@/features/guardians/constants"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { provinceName } from "@/lib/nepal/locations"
import { signedUrls } from "@/lib/supabase/storage"
import { listEntityActivity } from "@/services/audit/audit-service"
import { getGuardianProfile } from "@/services/guardians/guardian-service"

export const metadata: Metadata = {
  title: "Guardian profile",
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

export default async function GuardianProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const context = await getPageContext()
  if (!hasPermission(context, "parents.view")) return <AccessDenied />
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) notFound()

  // Organisation scope and field-level restrictions are enforced in the service.
  const guardian = await getGuardianProfile(context, id.data).catch((error) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })
  const canSeeStudents = hasPermission(context, "students.view")
  const canSeeActivity = hasPermission(context, "audit.view") || hasPermission(context, "parents.update")
  const [photos, activity] = await Promise.all([
    signedUrls(
      [guardian.profileImagePath, ...guardian.students.map((l) => l.student.profileImagePath)].filter((p): p is string => !!p),
      600
    ),
    canSeeActivity ? listEntityActivity(context, "guardian", guardian.id) : Promise.resolve([]),
  ])
  const photoUrl = guardian.profileImagePath ? photos.get(guardian.profileImagePath) : undefined
  const links = guardian.students.map(({ student: { profileImagePath, ...student }, ...link }) => ({
    ...link,
    student: { ...student, photoUrl: profileImagePath ? (photos.get(profileImagePath) ?? null) : null },
  }))
  const archived = guardian.archivedAt !== null
  const portalChildren = guardian.students.filter((l) => l.canAccessStudentPortalData).length
  // Client components get only what they need.
  const summary = { id: guardian.id, fullName: guardian.fullName, archivedAt: guardian.archivedAt, userId: guardian.userId, childCount: guardian.childCount }

  const tabs = ["overview", ...(canSeeStudents ? ["children"] : []), "portal", ...(canSeeActivity ? ["activity"] : [])]
  const requested = (await searchParams).tab
  const defaultTab = requested && tabs.includes(requested) ? requested : "overview"
  const addressText = (type: "PERMANENT" | "TEMPORARY") => {
    const a = guardian.sensitive?.addresses.find((x) => x.type === type)
    return a ? [a.street, a.tole, a.wardNumber && `Ward ${a.wardNumber}`, a.municipality, a.district, provinceName(a.province)].filter(Boolean).join(", ") : null
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={guardian.fullName}
        description={guardian.guardianCode ? `Guardian ID ${guardian.guardianCode}` : undefined}
        breadcrumbs={[{ label: "Parents", href: "/dashboard/parents" }, { label: guardian.fullName }]}
      >
        <GuardianProfileActions guardian={summary} />
      </PageHeader>

      {archived && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          This guardian was archived on {formatDate(guardian.archivedAt)}. The profile is read-only and portal access is blocked until restored.
        </p>
      )}

      <Card className="flex-row flex-wrap items-center gap-5 p-5">
        <div className="flex flex-col items-center gap-1">
          <Avatar className="size-20">
            {photoUrl && <AvatarImage src={photoUrl} alt="" />}
            <AvatarFallback className="text-xl">{guardianInitials(guardian.fullName)}</AvatarFallback>
          </Avatar>
          <GuardianPhotoControl guardianId={guardian.id} hasPhoto={Boolean(photoUrl)} disabled={archived} />
        </div>
        <dl className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Record" value={<RecordBadge archived={archived} />} />
          <Field label="Portal access" value={<PortalStatusBadge status={guardian.portalStatus} />} />
          <Field label="Phone" value={[guardian.phone, guardian.alternatePhone].filter(Boolean).join(" · ")} />
          <Field label="Email" value={guardian.email} />
          <Field label="Linked students" value={guardian.childCount} />
        </dl>
      </Card>

      <Tabs defaultValue={defaultTab} className="gap-5">
        <div className="overflow-x-auto">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {canSeeStudents && <TabsTrigger value="children">Linked students ({guardian.childCount})</TabsTrigger>}
            <TabsTrigger value="portal">Portal access</TabsTrigger>
            {canSeeActivity && <TabsTrigger value="activity">Activity</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <Card className="gap-4 p-5 lg:col-span-2">
            <h2 className="text-base font-semibold">Details</h2>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="Full name" value={guardian.fullName} />
              <Field label="Guardian ID" value={guardian.guardianCode && <span className="font-mono">{guardian.guardianCode}</span>} />
              <Field label="Gender" value={guardian.gender ? GENDER_LABELS[guardian.gender] : null} />
              <Field label="Nationality" value={guardian.nationality} />
              <Field label="Preferred contact" value={guardian.preferredContactMethod ? CONTACT_METHOD_LABELS[guardian.preferredContactMethod] : null} />
              <Field label="Preferred language" value={guardian.preferredLanguage} />
              <Field label="Occupation" value={guardian.occupation} />
              <Field label="Workplace" value={guardian.workplace} />
              <Field label="Created" value={formatDate(guardian.createdAt)} />
              {guardian.sensitive && (
                <>
                  <Field label="Date of birth (AD)" value={formatDate(guardian.sensitive.dateOfBirth)} />
                  <Field label="Permanent address" value={addressText("PERMANENT")} />
                  <Field label="Temporary address" value={addressText("TEMPORARY")} />
                </>
              )}
              <Field label="Address notes" value={guardian.address} />
            </dl>
            {!guardian.sensitive && <p className="text-xs text-muted-foreground">Date of birth and home addresses are visible to authorised roles only.</p>}
          </Card>
          <Card className="gap-3 p-5">
            <h2 className="text-base font-semibold">Account</h2>
            <dl className="grid gap-3">
              <Field label="Portal access" value={<PortalStatusBadge status={guardian.portalStatus} />} />
              <Field label="Linked account" value={guardian.user?.email ?? "Not linked"} />
              <Field label="Students visible in the portal" value={`${portalChildren} of ${guardian.childCount}`} />
            </dl>
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-dashed p-3">
              <MessagesSquareIcon className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Communication history</p>
                <p className="text-xs text-muted-foreground">Available when the messaging module is enabled.</p>
              </div>
            </div>
          </Card>
        </TabsContent>

        {canSeeStudents && (
          <TabsContent value="children">
            <ChildrenPanel guardian={summary} links={links} />
          </TabsContent>
        )}

        <TabsContent value="portal">
          <PortalPanel
            guardian={{
              id: guardian.id, fullName: guardian.fullName, email: guardian.email, archivedAt: guardian.archivedAt,
              portalStatus: guardian.portalStatus, invitations: guardian.invitations, user: guardian.user, portalChildren,
            }}
          />
        </TabsContent>

        {canSeeActivity && (
          <TabsContent value="activity">
            <Card className="gap-3 p-5">
              <h2 className="text-base font-semibold">Activity</h2>
              <p className="text-sm text-muted-foreground">Profile changes, student links, invitations and portal access changes.</p>
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
