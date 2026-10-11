import type { Metadata } from "next"
import Link from "next/link"
import {
  BookOpenCheckIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  HeartHandshakeIcon,
  MegaphoneIcon,
  MessagesSquareIcon,
  ShieldOffIcon,
  TableIcon,
  WalletIcon,
} from "lucide-react"
import { z } from "zod"

import { PageHeader } from "@/components/shared/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PortalPreferencesForm } from "@/features/guardians/components/portal-preferences"
import { LINK_FLAGS, RELATIONSHIP_LABELS } from "@/features/guardians/constants"
import { StudentAttendanceOverviewView } from "@/features/attendance/components/student-overview"
import { StudentStatusBadge } from "@/features/students/components/status-badges"
import { GENDER_LABELS, initials } from "@/features/students/constants"
import { getPageContext } from "@/lib/authorization/page"
import { signedUrls } from "@/lib/supabase/storage"
import { cn } from "@/lib/utils"
import { childAttendance } from "@/services/attendance/portal-service"
import {
  getGuardianAccountState,
  getPortalChildOverview,
  getPortalGuardian,
  listPortalChildren,
} from "@/services/guardians/portal-service"

export const metadata: Metadata = {
  title: "My children",
}

const formatDate = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

// Integration points for modules that don't exist yet. Each card states
// plainly that the information isn't available, rather than showing
// placeholder numbers.
function ModuleCard({ title, description, icon: Icon }: { title: string; description: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function Notice({ icon: Icon, title, description }: { icon: React.ComponentType; title: string; description: string }) {
  return (
    <Empty className="rounded-xl border py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

// The parent portal. Access comes only from the signed-in user's guardian
// profile and its per-student links (portal-service), never from the role
// or from the requested child ID.
export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const context = await getPageContext()
  const header = <PageHeader title="My children" description="Information the school shares with you about your children." breadcrumbs={[{ label: "My children" }]} />

  const state = await getGuardianAccountState(context)
  if (state !== "active") {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        {header}
        {state === "none" ? (
          <Notice icon={HeartHandshakeIcon} title="No guardian profile is linked to your account" description="This page is for parents and guardians. If you are one, ask the school to send you a parent portal invitation." />
        ) : (
          <Notice icon={ShieldOffIcon} title="Parent portal access is turned off" description="The school has paused portal access for your account. Contact the school if you think this is a mistake." />
        )}
      </div>
    )
  }

  const [guardian, children] = await Promise.all([getPortalGuardian(context), listPortalChildren(context)])
  if (!guardian || children.length === 0) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        {header}
        <Notice icon={HeartHandshakeIcon} title="No children are shared with you yet" description="The school decides which students each guardian can see. Contact the school to have your children added." />
      </div>
    )
  }

  // A requested child is used only if it's one of this guardian's; the
  // overview re-checks access on the server either way.
  const requested = z.uuid().safeParse((await searchParams).child)
  const selected = children.find((c) => requested.success && c.id === requested.data) ?? children[0]
  const [overview, attendance, photos] = await Promise.all([
    getPortalChildOverview(context, selected.id),
    childAttendance(context, selected.id),
    signedUrls(children.map((c) => c.profileImagePath).filter((p): p is string => !!p), 600),
  ])
  const { student, enrollment, classTeachers, link } = overview
  const photo = (path: string | null) => (path ? (photos.get(path) ?? undefined) : undefined)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {header}

      {children.length > 1 && (
        <nav aria-label="Choose a child" className="flex flex-wrap gap-2">
          {children.map((c) => {
            const active = c.id === selected.id
            return (
              <Link
                key={c.id}
                href={`/dashboard/family?child=${c.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors hover:bg-muted/50",
                  active && "border-primary/50 bg-primary/5 font-medium"
                )}
              >
                <Avatar className="size-7">
                  {photo(c.profileImagePath) && <AvatarImage src={photo(c.profileImagePath)} alt="" />}
                  <AvatarFallback className="text-[10px]">{initials(c)}</AvatarFallback>
                </Avatar>
                {c.firstName}
              </Link>
            )
          })}
        </nav>
      )}

      <Card className="flex-row flex-wrap items-center gap-5 p-5">
        <Avatar className="size-20">
          {photo(student.profileImagePath) && <AvatarImage src={photo(student.profileImagePath)} alt="" />}
          <AvatarFallback className="text-xl">{initials(student)}</AvatarFallback>
        </Avatar>
        <div className="grid flex-1 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{student.name}</h2>
            <StudentStatusBadge status={student.status} />
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Admission number" value={<span className="font-mono">{student.admissionNumber}</span>} />
            <Field label="Date of birth (AD)" value={formatDate(student.dateOfBirth)} />
            <Field label="Gender" value={student.gender ? GENDER_LABELS[student.gender] : null} />
            <Field label="Admitted" value={formatDate(student.admissionDate)} />
          </dl>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-4 p-5 lg:col-span-2">
          <h2 className="text-base font-semibold">Current class</h2>
          {enrollment ? (
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="Academic year" value={enrollment.academicYear.name} />
              <Field label="Level" value={enrollment.educationLevel.name} />
              {enrollment.program && <Field label="Program" value={enrollment.program.name} />}
              <Field label="Class" value={enrollment.class.name} />
              {enrollment.section && <Field label="Section" value={enrollment.section.name} />}
              {enrollment.batch && <Field label="Batch" value={enrollment.batch.name} />}
              <Field label="Roll number" value={enrollment.rollNumber} />
              <Field label={classTeachers.length > 1 ? "Class teachers" : "Class teacher"} value={classTeachers.join(", ")} />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Not currently enrolled in a class.</p>
          )}
        </Card>
        <Card className="gap-3 p-5">
          <h2 className="text-base font-semibold">You and {student.firstName}</h2>
          <p className="text-sm">{RELATIONSHIP_LABELS[link.relationship]}</p>
          <div className="flex flex-wrap gap-1">
            {LINK_FLAGS.filter((f) => f.key !== "canAccessStudentPortalData" && link[f.key as keyof typeof link] === true).map((f) => (
              <Badge key={f.key} variant="secondary">{f.label}</Badge>
            ))}
          </div>
        </Card>
      </div>

      <section className="grid gap-3" aria-labelledby="child-attendance">
        <h2 id="child-attendance" className="text-base font-semibold">Attendance</h2>
        <StudentAttendanceOverviewView data={attendance} who={student.firstName} />
      </section>

      <Card className="gap-3 p-5">
        <h2 className="text-base font-semibold">School updates</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ModuleCard title="Examinations & results" icon={ClipboardListIcon} description="Upcoming exams and released results will appear here when the exams module is enabled." />
          <ModuleCard title="Homework & assignments" icon={BookOpenCheckIcon} description="Shown here when the school uses the learning module." />
          <ModuleCard title="Timetable" icon={TableIcon} description="Shown here once the school publishes timetables online." />
          <ModuleCard title="Events & announcements" icon={CalendarDaysIcon} description="School notices and events will appear here." />
          {link.receivesBillingNotifications && (
            <ModuleCard title="Fees" icon={WalletIcon} description="Fee statements and payments will appear here when the finance module is enabled." />
          )}
          <ModuleCard title="Messages" icon={MessagesSquareIcon} description="Messaging with your child's teachers will be available when the school enables it." />
          <ModuleCard title="Notifications" icon={MegaphoneIcon} description="Alerts follow your notice preferences below." />
        </div>
      </Card>

      <PortalPreferencesForm
        students={children.map((c) => ({ id: c.id, name: c.firstName }))}
        initial={{
          preferredContactMethod: guardian.preferredContactMethod ?? "",
          preferredLanguage: guardian.preferredLanguage ?? "",
          alternatePhone: guardian.alternatePhone ?? "",
          children: children.map((c) => ({ studentId: c.id, ...c.preferences })),
        }}
      />
    </div>
  )
}
