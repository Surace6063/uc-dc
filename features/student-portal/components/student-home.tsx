import { Suspense } from "react"
import Link from "next/link"
import {
  AwardIcon,
  BookOpenIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  FilePenLineIcon,
  FileStackIcon,
  FolderOpenIcon,
  GraduationCapIcon,
  MegaphoneIcon,
  PinIcon,
  SigmaIcon,
  UserRoundXIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

import { ContentSection } from "@/components/shared/content-section"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionSkeleton, SummaryCardsSkeleton } from "@/components/shared/loading-states"
import { PageHeader } from "@/components/shared/page-header"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { formatGpa, formatPercent } from "@/features/exams/calculation"
import { formatDate, formatDateTime, formatWeekdayDate, relativeTime } from "@/features/teaching/format"
import { NOTICE_AUDIENCE_LABELS } from "@/features/teaching/constants"
import type { AuthContext } from "@/lib/authorization/context"
import { latestResult, studentAssignments, studentAttendance, studentDocuments, studentPapers, studentResults } from "@/services/student-portal/home-service"
import { myEnrollment, myStudent } from "@/services/student-portal/me-service"
import { recentNotices } from "@/services/teaching/notice-service"
import { myFeeAccount } from "@/services/student-portal/fee-service"
import { formatRs } from "@/features/finance/money"

// Home for members whose navigation is the student portal. Everything is the
// signed-in student's own; each section loads (and fails) on its own.

type Props = { context: AuthContext }

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    return { ok: true, data: await fn() }
  } catch (error) {
    console.error(error)
    return { ok: false }
  }
}

function Failed({ what }: { what: string }) {
  return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground" role="alert">Couldn&apos;t load {what}. Refresh to try again.</p>
}

const STANDING: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ok: { label: "On track", variant: "secondary" },
  approaching: { label: "Close to the minimum", variant: "outline" },
  below: { label: "Below the minimum", variant: "destructive" },
  none: { label: "No registers yet", variant: "outline" },
}

export async function StudentHome({ context }: Props) {
  const [student, enrollment] = await Promise.all([myStudent(context), myEnrollment(context)])
  if (!student) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Welcome, ${context.user.name}`} description="Student portal" />
        <EmptyState icon={UserRoundXIcon} title="Your account isn't linked to a student profile" description="Ask the school office to link your login to your student record." />
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={`Namaste, ${student.firstName}`}
        description={enrollment ? `${[enrollment.class.name, enrollment.section && `Section ${enrollment.section.name}`].filter(Boolean).join(" · ")} · ${enrollment.academicYear.name}` : "Not enrolled in a class this year"}
      >
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard/student/timetable" />}>
          <CalendarClockIcon data-icon="inline-start" />
          Timetable
        </Button>
        <Button size="sm" nativeButton={false} render={<Link href="/dashboard/student/assignments" />}>
          <FilePenLineIcon data-icon="inline-start" />
          Assignments
        </Button>
      </PageHeader>

      <Suspense fallback={<SummaryCardsSkeleton count={8} />}>
        <Cards context={context} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-3">
        <Suspense fallback={<SectionSkeleton className="lg:col-span-2" />}>
          <Deadlines context={context} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <AttendanceSummary context={context} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <UpcomingExams context={context} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <RecentResults context={context} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <Notices context={context} />
        </Suspense>
        <QuickLinks />
      </div>
    </div>
  )
}

async function Cards({ context }: Props) {
  const [enrollment, attendance, latest, papers, work, docs] = await Promise.all([
    attempt(() => myEnrollment(context)),
    attempt(() => studentAttendance(context)),
    attempt(() => latestResult(context)),
    attempt(() => studentPapers(context)),
    attempt(() => studentAssignments(context)),
    attempt(() => studentDocuments(context)),
  ])
  const feesRes = await attempt(() => myFeeAccount(context))
  const fees = feesRes.ok ? feesRes.data : null
  const e = enrollment.ok ? enrollment.data : null
  const pct = attendance.ok ? attendance.data?.summary?.percentage ?? null : null
  const r = latest.ok ? latest.data : null
  const pending = work.ok ? work.data.filter((a) => a.state === "pending" || a.state === "returned") : []
  const overdue = work.ok ? work.data.filter((a) => a.state === "overdue").length : 0
  const d = docs.ok ? docs.data : null
  return (
    <SummaryGrid columns={4}>
      <SummaryCard
        label="My class"
        value={e ? e.class.name : "—"}
        hint={e ? [e.educationLevel.name, e.section && `Section ${e.section.name}`, e.rollNumber && `Roll ${e.rollNumber}`].filter(Boolean).join(" · ") : "Not enrolled this year"}
        icon={GraduationCapIcon}
        href="/dashboard/student/classes"
      />
      <SummaryCard
        label="Attendance"
        value={pct === null ? "—" : `${pct}%`}
        hint={attendance.ok ? (attendance.data?.summary ? `${attendance.data.summary.attended} of ${attendance.data.summary.conducted} attended` : "No registers yet") : "Couldn't load"}
        icon={CalendarCheckIcon}
        href="/dashboard/attendance/me"
      />
      <SummaryCard
        label="Latest result"
        value={r ? (r.status === "WITHHELD" ? "Withheld" : r.grade ?? (r.percentage !== null ? `${formatPercent(r.percentage, r.percentageDecimals)}%` : r.status)) : "—"}
        hint={r ? r.examName : latest.ok ? "No published results yet" : "Couldn't load"}
        icon={AwardIcon}
        href="/dashboard/results"
      />
      <SummaryCard
        label="GPA"
        value={r?.gpa !== null && r?.gpa !== undefined ? formatGpa(r.gpa, r.gpaDecimals) : "—"}
        hint={r?.gpa !== null && r?.gpa !== undefined ? `${r.examName} · CGPA isn't calculated` : "Shown when your grading scale uses grade points"}
        icon={SigmaIcon}
        href="/dashboard/results"
      />
      <SummaryCard
        label="Upcoming exams"
        value={papers.ok ? new Set(papers.data.map((p) => p.examination.id)).size : "—"}
        hint={papers.ok ? `${papers.data.length} paper${papers.data.length === 1 ? "" : "s"}` : "Couldn't load"}
        icon={ClipboardListIcon}
        href="/dashboard/student/exams"
      />
      <SummaryCard
        label="Pending assignments"
        value={work.ok ? pending.length : "—"}
        hint={overdue ? `${overdue} overdue` : work.ok ? "Due or returned to you" : "Couldn't load"}
        icon={FilePenLineIcon}
        href="/dashboard/student/assignments?status=pending"
      />
      <SummaryCard
        label="Fee balance"
        value={fees ? formatRs(fees.totals.balance) : "—"}
        hint={!feesRes.ok ? "Couldn't load" : !fees || fees.fees.length === 0 ? "No fees assigned" : fees.totals.overdue ? `${formatRs(fees.totals.overdue)} overdue` : fees.nextDue ? `Next due ${formatDate(fees.nextDue.dueDate)}` : "Nothing due"}
        icon={WalletIcon}
        href="/dashboard/student/fees"
      />
      <SummaryCard
        label="Missing documents"
        value={d ? (d.requirements.length ? d.missing : "—") : "—"}
        hint={d ? (d.requirements.length ? "Required documents not yet submitted" : "No document requirements set") : docs.ok ? "No student profile" : "Couldn't load"}
        icon={FolderOpenIcon}
        href="/dashboard/student/documents"
      />
    </SummaryGrid>
  )
}

async function Deadlines({ context }: Props) {
  const res = await attempt(() => studentAssignments(context))
  const due = res.ok
    ? res.data
        .filter((a) => a.state === "pending" || a.state === "returned" || a.state === "overdue")
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
        .slice(0, 6)
    : []
  return (
    <ContentSection title="Assignment deadlines" className="lg:col-span-2" actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/student/assignments" />}>All</Button>}>
      {!res.ok ? (
        <Failed what="assignments" />
      ) : due.length === 0 ? (
        <EmptyState icon={FilePenLineIcon} title="Nothing due" description="Assignments your teachers set will appear here." className="py-8" />
      ) : (
        <ul className="grid gap-2">
          {due.map((a) => (
            <li key={a.id}>
              <Link href={`/dashboard/student/assignments/${a.id}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{a.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.subject.name} · due {formatDateTime(a.dueAt)}</span>
                </span>
                {a.state === "overdue" ? <Badge variant="destructive">Overdue</Badge> : a.state === "returned" ? <Badge variant="outline">Returned</Badge> : <Badge variant="secondary">{relativeTime(a.dueAt)}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ContentSection>
  )
}

async function AttendanceSummary({ context }: Props) {
  const res = await attempt(() => studentAttendance(context))
  const data = res.ok ? res.data : null
  const s = data?.summary
  const st = STANDING[data?.standing ?? "none"]
  return (
    <ContentSection title="Attendance" actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/attendance/me" />}>Details</Button>}>
      {!res.ok ? (
        <Failed what="attendance" />
      ) : !s || s.conducted === 0 ? (
        <p className="text-sm text-muted-foreground">No attendance has been recorded for you yet this year.</p>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-end justify-between gap-3">
            <span className="text-3xl font-semibold tabular-nums">{s.percentage}%</span>
            <Badge variant={st.variant}>{st.label}</Badge>
          </div>
          <Progress value={s.percentage ?? 0} aria-label={`Attendance ${s.percentage}%`} />
          <p className="text-xs text-muted-foreground">Minimum required: {data!.policy.minimumPercentage}%</p>
          <dl className="grid grid-cols-3 gap-2 text-center text-sm">
            {[["Present", s.present], ["Late", s.late], ["Absent", s.absent]].map(([label, n]) => (
              <div key={label} className="rounded-lg bg-muted/40 px-2 py-1.5">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </ContentSection>
  )
}

async function UpcomingExams({ context }: Props) {
  const res = await attempt(() => studentPapers(context))
  return (
    <ContentSection title="Upcoming examinations" actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/student/exams" />}>Schedule</Button>}>
      {!res.ok ? (
        <Failed what="examinations" />
      ) : res.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming papers.</p>
      ) : (
        <ul className="grid gap-2">
          {res.data.slice(0, 5).map((p) => (
            <li key={p.id} className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
              <span className="w-20 shrink-0 text-sm font-semibold">{p.examDate ? formatWeekdayDate(p.examDate) : "Date TBC"}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{p.subjectOffering.subject.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.examination.name}{p.startTime ? ` · ${p.startTime}` : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </ContentSection>
  )
}

async function RecentResults({ context }: Props) {
  const res = await attempt(() => studentResults(context))
  const items = res.ok ? (res.data?.years.flatMap((y) => y.items) ?? []).slice(0, 4) : []
  return (
    <ContentSection title="Recent results" actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/results" />}>All</Button>}>
      {!res.ok ? (
        <Failed what="results" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No published results yet.</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((r) => (
            <li key={r.resultId}>
              <Link href={`/dashboard/results/${r.resultId}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.examName}</span>
                  <span className="block text-xs text-muted-foreground">{r.yearName}</span>
                </span>
                <span className="text-right text-sm">
                  {r.status === "WITHHELD" ? <Badge variant="outline">Withheld</Badge> : (
                    <>
                      <span className="block font-semibold">{r.grade ?? (r.percentage !== null ? `${formatPercent(r.percentage, r.percentageDecimals)}%` : "—")}</span>
                      {r.gpa !== null && <span className="block text-xs text-muted-foreground">GPA {formatGpa(r.gpa, r.gpaDecimals)}</span>}
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ContentSection>
  )
}

async function Notices({ context }: Props) {
  const res = await attempt(() => recentNotices(context, 4))
  return (
    <ContentSection title="Latest notices" actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/notices" />}>All</Button>}>
      {!res.ok ? (
        <Failed what="notices" />
      ) : res.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notices right now.</p>
      ) : (
        <ul className="grid gap-3">
          {res.data.map((n) => (
            <li key={n.id} className="grid gap-0.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {n.pinned && <PinIcon className="size-3.5 text-primary" aria-label="Pinned" />}
                <span className="truncate">{n.title}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {n.audience === "CLASS" ? [n.class?.name, n.section && `Section ${n.section.name}`].filter(Boolean).join(" ") : NOTICE_AUDIENCE_LABELS[n.audience]} · {formatDateTime(n.publishedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ContentSection>
  )
}

const LINKS: { title: string; href: string; icon: LucideIcon }[] = [
  { title: "My subjects", href: "/dashboard/student/subjects", icon: BookOpenIcon },
  { title: "Timetable", href: "/dashboard/student/timetable", icon: CalendarClockIcon },
  { title: "Lesson materials", href: "/dashboard/student/materials", icon: FileStackIcon },
  { title: "My marks", href: "/dashboard/student/marks", icon: AwardIcon },
  { title: "Notices", href: "/dashboard/notices", icon: MegaphoneIcon },
  { title: "My documents", href: "/dashboard/student/documents", icon: FolderOpenIcon },
]

function QuickLinks() {
  return (
    <ContentSection title="Quick links" className="lg:col-span-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {LINKS.map((q) => (
          <Link key={q.href} href={q.href} className="flex items-center gap-2.5 rounded-lg border p-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5">
            <q.icon className="size-4 text-primary" />
            {q.title}
          </Link>
        ))}
      </div>
    </ContentSection>
  )
}
