import { Suspense } from "react"
import Link from "next/link"
import {
  BookMarkedIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FilePenLineIcon,
  FileStackIcon,
  InboxIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  NotebookPenIcon,
  PenLineIcon,
  PinIcon,
  UserRoundXIcon,
  type LucideIcon,
} from "lucide-react"

import { ContentSection } from "@/components/shared/content-section"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionSkeleton, SummaryCardsSkeleton } from "@/components/shared/loading-states"
import { PageHeader } from "@/components/shared/page-header"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CLASS_ASSIGNMENT_STATUS_LABELS, NOTICE_AUDIENCE_LABELS, weekdayLabel } from "@/features/teaching/constants"
import { formatDateTime, formatWeekdayDate, relativeTime } from "@/features/teaching/format"
import type { AuthContext } from "@/lib/authorization/context"
import {
  pendingRegisters,
  recentAssessmentTasks,
  recentNotices,
  teacherCounts,
  teacherSchedule,
  teacherSummary,
} from "@/services/teaching/home-service"

// Home for members whose navigation is the teacher portal. Every figure is
// from the teacher's own records; each section loads (and fails) on its own.

type Props = { context: AuthContext; yearId: string | null }

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

export async function TeacherHome({ context }: { context: AuthContext }) {
  const { teacher, year } = await teacherSummary(context)
  const today = new Date()
  if (!teacher) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Welcome, ${context.user.name}`} description="Teacher portal" />
        <EmptyState icon={UserRoundXIcon} title="Your account isn't linked to a teacher profile" description="Ask the office to link your login to your teacher profile. Your classes, timetable and tasks will then appear here." />
      </div>
    )
  }
  const props: Props = { context, yearId: year?.id ?? null }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={`Namaste, ${teacher.firstName}`}
        description={`${today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kathmandu" })}${year ? ` · Academic year ${year.name}` : " · No current academic year"}`}
      >
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard/assignments?new=1" />}>
          <FilePenLineIcon data-icon="inline-start" />
          New assignment
        </Button>
        <Button size="sm" nativeButton={false} render={<Link href="/dashboard/attendance/take" />}>
          <CalendarCheckIcon data-icon="inline-start" />
          Take attendance
        </Button>
      </PageHeader>

      {!year && (
        <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          No academic year is marked as current, so classes and timetable can&apos;t be shown. The office sets it under Education structure.
        </p>
      )}

      <Suspense fallback={<SummaryCardsSkeleton count={7} className="xl:grid-cols-4" />}>
        <Cards {...props} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-3">
        <Suspense fallback={<SectionSkeleton className="lg:col-span-2" />}>
          <TodayTimetable {...props} />
        </Suspense>
        <QuickActions />
        <Suspense fallback={<SectionSkeleton />}>
          <RegistersDue {...props} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <UpcomingClasses {...props} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <UpcomingExams {...props} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton className="lg:col-span-2" />}>
          <AssessmentTasks {...props} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <Notices {...props} />
        </Suspense>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ cards

async function Cards({ context, yearId }: Props) {
  const [counts, schedule, registers] = await Promise.all([
    attempt(() => teacherCounts(context, yearId)),
    attempt(() => teacherSchedule(context, yearId)),
    attempt(() => pendingRegisters(context, yearId)),
  ])
  const v = <T,>(r: { ok: true; data: T } | { ok: false }, pick: (d: T) => number | string) => (r.ok ? pick(r.data) : "—")
  return (
    <SummaryGrid columns={4}>
      <SummaryCard label="Assigned classes" value={v(counts, (c) => c.classes)} hint={counts.ok ? `${counts.data.students.toLocaleString()} students` : "Couldn't load"} icon={LayoutGridIcon} href="/dashboard/teaching/classes" />
      <SummaryCard label="Assigned subjects" value={v(counts, (c) => c.subjects)} icon={BookMarkedIcon} href="/dashboard/teaching/subjects" />
      <SummaryCard
        label="Classes today"
        value={v(schedule, (s) => s.today.length)}
        hint={schedule.ok ? (schedule.data.hasTimetable ? weekdayLabel(schedule.data.day) : "No timetable set up yet") : "Couldn't load"}
        icon={CalendarClockIcon}
        href="/dashboard/timetable"
      />
      <SummaryCard label="Pending registers" value={v(registers, (r) => r.items.length)} hint="To take or submit today" icon={CalendarCheckIcon} href="/dashboard/attendance/take" />
      <SummaryCard label="Pending marks entry" value={v(counts, (c) => c.pendingSheets.length)} hint="Sheets not yet submitted" icon={PenLineIcon} href="/dashboard/exams/marks" />
      <SummaryCard
        label="Upcoming examinations"
        value={v(counts, (c) => c.upcomingExams)}
        hint={counts.ok ? `${counts.data.upcomingPapers.length} paper${counts.data.upcomingPapers.length === 1 ? "" : "s"} in your subjects` : "Couldn't load"}
        icon={ClipboardListIcon}
        href="/dashboard/teaching/exams"
      />
      <SummaryCard label="Awaiting review" value={v(counts, (c) => c.awaitingReview)} hint="Submitted assignment work" icon={InboxIcon} href="/dashboard/assignments?review=pending" />
    </SummaryGrid>
  )
}

// ------------------------------------------------------------ sections

function SlotLine({ slot, showDay, live }: { slot: Awaited<ReturnType<typeof teacherSchedule>>["today"][number]; showDay?: boolean; live?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <span className="w-24 shrink-0 text-sm font-semibold tabular-nums">
        {slot.startTime}–{slot.endTime}
        {showDay && <span className="block text-xs font-normal text-muted-foreground">{weekdayLabel(slot.dayOfWeek)}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{slot.subject?.name ?? "Class period"}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {[slot.class.name, slot.section && `Section ${slot.section.name}`, slot.room && `Room ${slot.room}`].filter(Boolean).join(" · ")}
        </span>
      </span>
      {live && <Badge>Now</Badge>}
    </li>
  )
}

async function TodayTimetable({ context, yearId }: Props) {
  const res = await attempt(() => teacherSchedule(context, yearId))
  return (
    <ContentSection
      title="Today's timetable"
      description={res.ok ? weekdayLabel(res.data.day) : undefined}
      actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/timetable" />}>Full week</Button>}
      className="lg:col-span-2"
    >
      {!res.ok ? (
        <Failed what="the timetable" />
      ) : !res.data.hasTimetable ? (
        <EmptyState icon={CalendarClockIcon} title="No timetable yet" description="Add your weekly periods, or ask the academic coordinator to set up the timetable." className="py-8">
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/dashboard/timetable" />}>Set up timetable</Button>
        </EmptyState>
      ) : res.data.today.length === 0 ? (
        <p className="text-sm text-muted-foreground">No classes scheduled today.</p>
      ) : (
        <ul className="grid gap-2">
          {res.data.today.map((s) => (
            <SlotLine key={s.id} slot={s} live={s.startTime <= res.data.now && res.data.now < s.endTime} />
          ))}
        </ul>
      )}
    </ContentSection>
  )
}

async function UpcomingClasses({ context, yearId }: Props) {
  const res = await attempt(() => teacherSchedule(context, yearId))
  return (
    <ContentSection title="Upcoming classes" description="Your next periods this week">
      {!res.ok ? (
        <Failed what="upcoming classes" />
      ) : res.data.upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">{res.data.hasTimetable ? "Nothing else scheduled." : "Your timetable isn't set up yet."}</p>
      ) : (
        <ul className="grid gap-2">
          {res.data.upcoming.map((s) => (
            <SlotLine key={s.id} slot={s} showDay />
          ))}
        </ul>
      )}
    </ContentSection>
  )
}

async function RegistersDue({ context, yearId }: Props) {
  const res = await attempt(() => pendingRegisters(context, yearId))
  return (
    <ContentSection title="Registers to submit" description="Today's attendance still to take or submit">
      {!res.ok ? (
        <Failed what="registers" />
      ) : res.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{res.data.total ? "All of today's registers are done." : "No registers for you today."}</p>
      ) : (
        <ul className="grid gap-2">
          {res.data.items.slice(0, 6).map((r) => {
            const params = new URLSearchParams({ type: r.type, class: r.classId, section: r.sectionId ?? "all", ...(r.offeringId && { offering: r.offeringId }), date: res.data.date })
            return (
              <li key={r.key}>
                <Link href={`/dashboard/attendance/take?${params}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/40">
                  <span className="min-w-0 truncate">{r.label}</span>
                  <Badge variant={r.status === "DRAFT" ? "secondary" : "outline"}>{r.status === "DRAFT" ? "Draft" : "Not taken"}</Badge>
                </Link>
              </li>
            )
          })}
          {res.data.items.length > 6 && <li className="text-xs text-muted-foreground">+{res.data.items.length - 6} more</li>}
        </ul>
      )}
    </ContentSection>
  )
}

async function UpcomingExams({ context, yearId }: Props) {
  const res = await attempt(() => teacherCounts(context, yearId))
  return (
    <ContentSection title="Upcoming exam dates" actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/teaching/exams" />}>All</Button>}>
      {!res.ok ? (
        <Failed what="examinations" />
      ) : res.data.upcomingPapers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming papers in your subjects.</p>
      ) : (
        <ul className="grid gap-2">
          {res.data.upcomingPapers.slice(0, 5).map((p) => (
            <li key={p.id} className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
              <span className="w-20 shrink-0 text-sm font-semibold">{p.examDate ? formatWeekdayDate(p.examDate) : "Date TBC"}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{p.subjectOffering.subject.name} · {p.class.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.examination.name}{p.startTime ? ` · ${p.startTime}` : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </ContentSection>
  )
}

async function AssessmentTasks({ context, yearId }: Props) {
  const [tasks, counts] = await Promise.all([attempt(() => recentAssessmentTasks(context)), attempt(() => teacherCounts(context, yearId))])
  const sheets = counts.ok ? counts.data.pendingSheets.slice(0, 4) : []
  return (
    <ContentSection
      title="Recent assessment tasks"
      description="Marks to enter and assignments you've set"
      className="lg:col-span-2"
      actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/assignments" />}>Assignments</Button>}
    >
      {!tasks.ok && !counts.ok ? (
        <Failed what="assessment tasks" />
      ) : sheets.length === 0 && (!tasks.ok || tasks.data.length === 0) ? (
        <EmptyState icon={ClipboardCheckIcon} title="Nothing pending" description="Marks sheets to enter and assignments you set will appear here." className="py-8" />
      ) : (
        <ul className="grid gap-2">
          {sheets.map((s) => (
            <li key={`${s.examinationId}:${s.key}`}>
              <Link href={`/dashboard/exams/marks?exam=${s.examinationId}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">Marks: {s.subjectName} · {s.className}{s.sectionName ? ` ${s.sectionName}` : ""}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.examinationName} · {s.entered}/{s.expected} entered</span>
                </span>
                <Badge variant={s.status === "RETURNED" ? "destructive" : "outline"}>{s.status === "RETURNED" ? "Returned" : s.status === "DRAFT" ? "Draft" : "Not started"}</Badge>
              </Link>
            </li>
          ))}
          {tasks.ok &&
            tasks.data.map((t) => (
              <li key={t.id}>
                <Link href={`/dashboard/assignments/${t.id}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[t.subject.name, t.class.name, t.section && `Section ${t.section.name}`].filter(Boolean).join(" · ")} · due {relativeTime(t.dueAt)}
                    </span>
                  </span>
                  {t.awaitingReview > 0 ? <Badge>{t.awaitingReview} to review</Badge> : <Badge variant="outline">{CLASS_ASSIGNMENT_STATUS_LABELS[t.status]}</Badge>}
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
    <ContentSection title="Recent notices" actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/notices" />}>All</Button>}>
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

const QUICK: { title: string; href: string; icon: LucideIcon }[] = [
  { title: "Take attendance", href: "/dashboard/attendance/take", icon: CalendarCheckIcon },
  { title: "Enter marks", href: "/dashboard/exams/marks", icon: PenLineIcon },
  { title: "New assignment", href: "/dashboard/assignments?new=1", icon: FilePenLineIcon },
  { title: "Write lesson plan", href: "/dashboard/lesson-plans?new=1", icon: NotebookPenIcon },
  { title: "Share material", href: "/dashboard/materials?new=1", icon: FileStackIcon },
  { title: "Post a notice", href: "/dashboard/notices?new=1", icon: MegaphoneIcon },
]

function QuickActions() {
  return (
    <ContentSection title="Quick actions">
      <div className="grid grid-cols-2 gap-2">
        {QUICK.map((q) => (
          <Link key={q.href} href={q.href} className="flex flex-col items-start gap-2 rounded-lg border p-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5">
            <q.icon className="size-4 text-primary" />
            {q.title}
          </Link>
        ))}
      </div>
    </ContentSection>
  )
}
