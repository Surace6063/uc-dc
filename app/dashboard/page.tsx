import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import {
  BanknoteIcon,
  BookOpenTextIcon,
  BriefcaseBusinessIcon,
  CalendarCheckIcon,
  ChartColumnIcon,
  ChartLineIcon,
  ChartPieIcon,
  CoinsIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  GraduationCapIcon,
  HandHeartIcon,
  LandmarkIcon,
  HouseHeartIcon,
  PercentIcon,
  ScaleIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UsersIcon,
  VenusAndMarsIcon,
  WalletIcon,
} from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { AttendanceOverviewChart } from "@/features/dashboard/components/charts/attendance-overview-chart"
import { EnrollmentTrendChart } from "@/features/dashboard/components/charts/enrollment-trend-chart"
import {
  FacultyByDesignationChart,
  FacultyByRankChart,
  FacultyQualificationChart,
  StudentTeacherRatioChart,
  StudentTeacherRatioTrendChart,
} from "@/features/dashboard/components/charts/faculty-charts"
import { GenderChart } from "@/features/dashboard/components/charts/gender-chart"
import { CasteEthnicityChart, EquityGroups } from "@/features/dashboard/components/charts/inclusion-charts"
import { GpaDistributionChart } from "@/features/dashboard/components/charts/gpa-distribution-chart"
import { PassFailChart } from "@/features/dashboard/components/charts/pass-fail-chart"
import { PassRateTrendChart } from "@/features/dashboard/components/charts/pass-rate-trend-chart"
import { StudentsByProgramChart } from "@/features/dashboard/components/charts/students-by-program-chart"
import { ActivityPanel, AlertsPanel, PanelSkeleton, QaaTasksPanel } from "@/features/dashboard/components/dashboard-panels"
import { DashboardToolbar, FacultyProfileFilters, RefreshButton } from "@/features/dashboard/components/dashboard-toolbar"
import {
  ChartCard,
  ChartSkeleton,
  KpiCard,
  KpiSkeleton,
  ModulePendingCard,
  ReportingPeriod,
  SectionError,
  SectionHeading,
} from "@/features/dashboard/components/dashboard-ui"
import { parseDashboardFilters } from "@/features/dashboard/filters"
import { describeScope, type DashboardScope, type ScopeOptions } from "@/features/dashboard/scope"
import { countChange, pointsChange } from "@/features/dashboard/format"
import { formatDay } from "@/features/exams/constants"
import { organizationTypeLabels } from "@/features/organizations/schemas"
import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { fromDate } from "@/lib/validation"
import { loadDashboardScope, studentOverview } from "@/services/dashboard/overview-service"
import { managementAlerts, recentActivity } from "@/services/dashboard/alerts-service"
import { canSeeAll } from "@/services/attendance/access-service"
import { attendanceOverview, gpaDistribution, passFailByProgram, passRateTrend } from "@/services/dashboard/academic-service"
import { resolveNavKind } from "@/services/navigation/navigation-service"
import { TeacherHome } from "@/features/teaching/components/teacher-home"
import { StudentHome } from "@/features/student-portal/components/student-home"
import { FinanceHome } from "@/features/finance/components/finance-home"
import { facultyByDesignation, facultyByRank, facultyQualifications, studentTeacherRatio, studentTeacherRatioTrend } from "@/services/dashboard/faculty-service"
import { facultyKpis, passRateKpi, studentKpis } from "@/services/dashboard/kpi-service"
import { getGuardianAccountState } from "@/services/guardians/portal-service"

export const metadata: Metadata = {
  title: "Dashboard",
}

// Institutional dashboard for those who oversee the college; everyone else
// (teachers, students, parents) keeps the personal welcome view. Each section
// is gated by the permission of the module its figures come from, streams in
// its own Suspense boundary and fails on its own. Sections whose module
// doesn't exist yet show a "not set up" card and never any figures.
type Can = (permission: Parameters<typeof hasPermission>[1]) => boolean

// A failed query shows an error card for its section instead of failing the
// whole page.
async function attempt<T>(load: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    return { ok: true, data: await load() }
  } catch (error) {
    console.error("Dashboard section failed", error)
    return { ok: false }
  }
}

const count = (n: number) => n.toLocaleString()

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "dashboard.view")) return <AccessDenied />
  // Same choice as the sidebar: teachers get their own home.
  const kind = await resolveNavKind(context)
  if (kind === "teacher") return <TeacherHome context={context} />
  if (kind === "student") return <StudentHome context={context} />
  if (kind === "finance") return <FinanceHome context={context} year={(await searchParams).year as string | undefined} />
  const can: Can = (p) => hasPermission(context, p)

  const institutional = can("students.view") || can("results.view_all") || can("teachers.view") || canSeeAll(context) || can("finance.view") || can("reports.view")
  if (!institutional) return <PersonalDashboard context={context} />

  // One validated scope for every section: ids are checked against the
  // organisation's own options, and `filters` is what was actually applied.
  const { options, exams, scope, filters } = await loadDashboardScope(context, parseDashboardFilters(await searchParams))
  const examName = scope?.examinationId ? (exams.find((e) => e.id === scope.examinationId)?.name ?? null) : null

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title="Institutional Dashboard" description="College performance and institutional overview">
        <RefreshButton />
      </PageHeader>

      <DashboardToolbar
        filters={filters}
        selectedYearId={scope?.year.id ?? null}
        yearRange={scope ? { from: fromDate(scope.year.startDate), to: fromDate(scope.year.endDate) } : null}
        options={{
          years: options.years.map(({ id, name, isCurrent }) => ({ id, name, isCurrent })),
          faculties: options.faculties,
          programs: options.programs.filter((p) => p.isActive),
          classes: options.classes.filter((c) => !c.archived),
          exams,
        }}
      />
      {scope && <ReportingPeriod items={describeScope(scope, filters, options, examName)} />}

      {scope ? (
        <>
          <Suspense fallback={<KpiGrid>{Array.from({ length: 6 }, (_, i) => <KpiSkeleton key={i} />)}</KpiGrid>}>
            <KpiRow context={context} scope={scope} can={can} />
          </Suspense>

          {can("students.view") && (
            <section className="flex flex-col gap-3">
              <SectionHeading title="Students & enrollment" description={`Students enrolled in ${scope.year.name}, counted once each.`} />
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <Suspense fallback={<><ChartSkeleton /><ChartSkeleton /><ChartSkeleton /><ChartSkeleton className="xl:col-span-2" /><ChartSkeleton /></>}>
                  <StudentCharts context={context} scope={scope} />
                </Suspense>
              </div>
            </section>
          )}

          {can("results.view_all") && (
            <section className="flex flex-col gap-3">
              <SectionHeading
                title="Academic results"
                description="Published results only. Each student counts once, by their latest published result in the year (or in the selected examination)."
              />
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <Suspense fallback={<><ChartSkeleton /><ChartSkeleton /><ChartSkeleton /></>}>
                  <ResultCharts context={context} scope={scope} examName={examName} />
                </Suspense>
              </div>
            </section>
          )}

          {canSeeAll(context) && (
            <section className="flex flex-col gap-3">
              <SectionHeading title="Attendance" description={`Submitted registers in ${scope.year.name}, calculated with the attendance policy.`} />
              <Suspense fallback={<ChartSkeleton />}>
                <AttendanceSection context={context} scope={scope} />
              </Suspense>
            </section>
          )}

          {can("teachers.view") && (
            <section className="flex flex-col gap-3">
              <SectionHeading
                title="Faculty & staffing"
                description="Eligible teaching faculty: teachers who are active or on leave. Department and employment type narrow the rank, designation and qualification charts."
              />
              <FacultyProfileFilters filters={filters} departments={options.faculties} />
              <div className="grid gap-4 lg:grid-cols-2">
                <Suspense fallback={<><ChartSkeleton className="lg:col-span-2" /><ChartSkeleton /><ChartSkeleton /><ChartSkeleton /><ChartSkeleton /></>}>
                  <FacultyCharts context={context} scope={scope} can={can} />
                </Suspense>
              </div>
            </section>
          )}
        </>
      ) : (
        <Card className="items-start gap-2 border-dashed p-6">
          <p className="font-medium">No academic year yet</p>
          <p className="text-sm text-muted-foreground">
            Enrollment, results and staffing figures follow the academic year. Add one under{" "}
            <Link href="/dashboard/academics?tab=years" className="underline underline-offset-2">Education structure</Link> and mark it as current.
          </p>
        </Card>
      )}

      {can("finance.view") && <FinanceSection />}

      {can("reports.view") && (
        <section className="flex flex-col gap-3">
          <SectionHeading title="Research, outcomes & quality" description="Research output, graduate outcomes and accreditation readiness." />
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <ModulePendingCard
              title="Research output"
              description="Publications and projects per year, by type."
              icon={BookOpenTextIcon}
              module="Research & Innovation"
              needs={["Journal articles", "Books & chapters", "Conference papers", "Research projects"]}
            />
            <ModulePendingCard
              title="Graduate employment outcomes"
              description="What graduates do after completing their program."
              icon={BriefcaseBusinessIcon}
              module="Alumni & Tracer Study"
              needs={["Graduate records", "Employment status", "Further study", "Employer"]}
            />
            <ModulePendingCard
              title="QAA/SSR evidence progress"
              description="Evidence collected against each QAA criterion."
              icon={ShieldCheckIcon}
              module="IQAC / QAA"
              needs={["QAA criteria & indicators", "Evidence documents", "Responsible units", "Status"]}
              className="lg:col-span-2 xl:col-span-1"
            />
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeading title="Follow-up" description="Alerts, accreditation tasks and recent changes." />
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Suspense fallback={<PanelSkeleton />}>
            <AlertsSection context={context} scope={scope} options={options} />
          </Suspense>
          {can("reports.view") && <QaaTasksPanel />}
          {can("audit.view") && (
            <Suspense fallback={<PanelSkeleton />}>
              <ActivitySection context={context} scope={scope} />
            </Suspense>
          )}
        </div>
      </section>
    </div>
  )
}

// ------------------------------------------------------------ KPIs

function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">{children}</div>
}

async function KpiRow({ context, scope, can }: { context: AuthContext; scope: DashboardScope; can: Can }) {
  const [students, faculty, pass] = await Promise.all([
    can("students.view") ? attempt(() => studentKpis(context, scope)) : null,
    can("teachers.view") ? attempt(() => facultyKpis(context, scope)) : null,
    can("results.view_all") ? attempt(() => passRateKpi(context, scope)) : null,
  ])
  const year = scope.year.name
  const period =
    scope.from && scope.to ? `${formatDay(scope.from)} – ${formatDay(scope.to)}`
    : scope.from ? `Since ${formatDay(scope.from)}`
    : scope.to ? `Until ${formatDay(scope.to)}`
    : `In ${year}`

  return (
    <KpiGrid>
      {students && (
        <KpiCard
          label="Total students"
          icon={UsersIcon}
          href="/dashboard/students"
          state={students.ok ? "ready" : "error"}
          value={students.ok ? count(students.data.total) : undefined}
          change={students.ok ? countChange(students.data.total, students.data.totalComparison) : null}
          hint={students.ok && students.data.total === 0 ? `No students enrolled in ${year} yet` : `Enrolled in ${year}`}
          info="Each student counted once: enrolled in the academic year and not withdrawn, transferred out or cancelled. Archived students are excluded."
        />
      )}
      {students && (
        <KpiCard
          label="New admissions"
          icon={UserPlusIcon}
          state={students.ok ? "ready" : "error"}
          value={students.ok ? count(students.data.newAdmissions) : undefined}
          change={students.ok ? countChange(students.data.newAdmissions, students.data.admissionsComparison) : null}
          hint={period}
          info="Students admitted in the academic year (new admission or lateral entry; promotions, class transfers and readmissions excluded). The From/To dates narrow this by enrollment date."
        />
      )}
      {faculty && (
        <KpiCard
          label="Total faculty"
          icon={GraduationCapIcon}
          href="/dashboard/teachers"
          state={faculty.ok ? "ready" : "error"}
          value={faculty.ok ? count(faculty.data.total) : undefined}
          hint={faculty.ok ? (faculty.data.total === 0 ? "No active teachers yet" : `${count(faculty.data.fullTime)} full-time · ${count(faculty.data.partTime)} part-time, contract or visiting`) : undefined}
          info="Teachers who are active or on leave (not archived, resigned, retired or otherwise left). With a program filter, those assigned to it this year. No yearly comparison: past headcounts aren't recorded."
        />
      )}
      {pass && (
        <KpiCard
          label="Overall pass rate"
          icon={PercentIcon}
          href={`/dashboard/exams/analytics?year=${scope.year.id}`}
          state={pass.ok ? "ready" : "error"}
          value={pass.ok && pass.data.current.rate !== null ? `${pass.data.current.rate.toFixed(1)}%` : "—"}
          change={pass.ok ? pointsChange(pass.data.current.rate, pass.data.comparison) : null}
          hint={pass.ok ? (pass.data.current.students === 0 ? `No published results in ${year} yet` : `${count(pass.data.current.passed)} of ${count(pass.data.current.students)} students passed`) : undefined}
          info="Student-level: each student counted once, by their most recent published result in the year (pass, fail or absent). Withheld, incomplete and pending results aren't counted."
        />
      )}
      {/* Unavailable until the schema has the data; never estimated. */}
      {can("finance.view") && (
        <KpiCard
          label="Total revenue"
          icon={BanknoteIcon}
          state="unavailable"
          reason="No finance records exist yet: the database has no fee, payment or income tables."
        />
      )}
      {can("reports.view") && (
        <KpiCard
          label="Research publications"
          icon={BookOpenTextIcon}
          state="unavailable"
          reason="No research records exist yet: the database has no publication tables."
        />
      )}
    </KpiGrid>
  )
}

// ------------------------------------------------------------ chart sections

async function StudentCharts({ context, scope }: { context: AuthContext; scope: DashboardScope }) {
  const res = await attempt(() => studentOverview(context, scope))
  if (!res.ok) return <SectionError title="student figures" className="lg:col-span-2 xl:col-span-3" />
  const { trend, byProgram, gender, byCaste, equity } = res.data
  return (
    <>
      <ChartCard title="Student enrollment trend" description={`Students and new admissions over the last ${trend.length} academic years.`} icon={ChartLineIcon}>
        <EnrollmentTrendChart trend={trend} />
      </ChartCard>
      <ChartCard title="Students by program" description="Enrolled students per program, by gender." icon={ChartColumnIcon} href="/dashboard/students">
        <StudentsByProgramChart rows={byProgram} />
      </ChartCard>
      <ChartCard title="Gender distribution" description={`All enrolled students in ${scope.year.name}.`} icon={VenusAndMarsIcon} className="lg:col-span-2 xl:col-span-1">
        <GenderChart gender={gender} />
      </ChartCard>
      <ChartCard title="Students by caste / ethnicity" description="Enrolled students per group, by gender (UGC enrollment annex)." icon={ChartColumnIcon} className="xl:col-span-2" href="/dashboard/students">
        <CasteEthnicityChart rows={byCaste} />
      </ChartCard>
      <ChartCard title="Equity & inclusion" description="Students in each equity group, as a share of those with it recorded." icon={HandHeartIcon}>
        <EquityGroups data={equity} />
      </ChartCard>
    </>
  )
}

async function ResultCharts({ context, scope, examName }: { context: AuthContext; scope: DashboardScope; examName: string | null }) {
  const [trend, passFail, gpa] = await Promise.all([
    attempt(() => passRateTrend(context, scope)),
    attempt(() => passFailByProgram(context, scope)),
    attempt(() => gpaDistribution(context, scope)),
  ])
  const period = examName ?? `all published examinations in ${scope.year.name}`
  return (
    <>
      {trend.ok ? (
        <ChartCard title="Pass rate trend" description="Student-level pass rate per academic year, from each student’s latest published result." icon={ChartLineIcon} href="/dashboard/exams/analytics">
          <PassRateTrendChart trend={trend.data} />
        </ChartCard>
      ) : (
        <SectionError title="the pass rate trend" />
      )}
      {passFail.ok ? (
        <ChartCard title="Pass vs fail" description={`Students by outcome per program: ${period}.`} icon={ClipboardCheckIcon} href={`/dashboard/exams/analytics?year=${scope.year.id}`}>
          <PassFailChart data={passFail.data} />
        </ChartCard>
      ) : (
        <SectionError title="pass and fail figures" />
      )}
      {gpa.ok ? (
        <ChartCard title="GPA distribution" description={`Students by examination GPA: ${period}.`} icon={ChartColumnIcon} className="lg:col-span-2 xl:col-span-1">
          <GpaDistributionChart data={gpa.data} />
        </ChartCard>
      ) : (
        <SectionError title="the GPA distribution" className="lg:col-span-2 xl:col-span-1" />
      )}
    </>
  )
}

async function AttendanceSection({ context, scope }: { context: AuthContext; scope: DashboardScope }) {
  const res = await attempt(() => attendanceOverview(context, scope))
  if (!res.ok) return <SectionError title="attendance figures" />
  const by = res.data.groupBy === "class" ? "class / semester" : "program"
  return (
    <ChartCard title="Attendance overview" description={`Attendance percentage by ${by}, and students short of the ${res.data.minimumPercentage}% minimum.`} icon={CalendarCheckIcon} href={`/dashboard/attendance/reports?kind=classes&year=${scope.year.id}`}>
      <AttendanceOverviewChart data={res.data} />
    </ChartCard>
  )
}

async function FacultyCharts({ context, scope, can }: { context: AuthContext; scope: DashboardScope; can: Can }) {
  const ratios = can("students.view")
  const [rank, designation, qualifications, ratio, trend] = await Promise.all([
    attempt(() => facultyByRank(context, scope)),
    attempt(() => facultyByDesignation(context, scope)),
    attempt(() => facultyQualifications(context, scope)),
    ratios ? attempt(() => studentTeacherRatio(context, scope)) : null,
    ratios ? attempt(() => studentTeacherRatioTrend(context, scope)) : null,
  ])
  return (
    <>
      {rank.ok ? (
        <ChartCard
          title="Faculty by academic rank"
          description="Eligible teachers by academic rank and gender. Use the employment type filter for visiting or part-time faculty."
          icon={ChartColumnIcon}
          href="/dashboard/teachers"
          className="lg:col-span-2"
        >
          <FacultyByRankChart rows={rank.data} />
        </ChartCard>
      ) : (
        <SectionError title="faculty by academic rank" className="lg:col-span-2" />
      )}
      {designation.ok ? (
        <ChartCard title="Faculty by designation" description="Eligible teachers by their recorded designation." icon={ChartColumnIcon} href="/dashboard/teachers">
          <FacultyByDesignationChart rows={designation.data} />
        </ChartCard>
      ) : (
        <SectionError title="faculty by designation" />
      )}
      {qualifications.ok ? (
        <ChartCard title="Faculty qualification" description="Each teacher once, by their highest recorded qualification." icon={GraduationCapIcon} href="/dashboard/teachers">
          <FacultyQualificationChart data={qualifications.data} />
        </ChartCard>
      ) : (
        <SectionError title="faculty qualifications" />
      )}
      {ratio &&
        (ratio.ok ? (
          <ChartCard
            title="Student–teacher ratio"
            description="Unique enrolled students ÷ eligible teachers, overall and by program (from this year's teaching assignments)."
            icon={ScaleIcon}
            badge={<Badge variant="outline" className="text-muted-foreground">{scope.year.name}</Badge>}
          >
            <StudentTeacherRatioChart data={ratio.data} />
          </ChartCard>
        ) : (
          <SectionError title="the student–teacher ratio" />
        ))}
      {trend &&
        (trend.ok ? (
          <ChartCard title="Student–teacher ratio trend" description="The same ratio per academic year, from enrollment and employment history." icon={ChartLineIcon}>
            <StudentTeacherRatioTrendChart data={trend.data} />
          </ChartCard>
        ) : (
          <SectionError title="the ratio trend" />
        ))}
    </>
  )
}

// ------------------------------------------------------------ finance

// The schema has no finance records (fees, payments, income, expenditure,
// budgets or financial years), so every finance figure is unavailable and
// says why. Nothing is estimated, and income is never treated as budget.
// Amounts will be shown with formatNpr (features/dashboard/format) once
// finance data exists.
const NO_FINANCE = "The database has no finance tables yet, so this can't be calculated."

function FinanceSection() {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title="Finance" description="Income, expenditure and budget by financial year (NPR)." />
      <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        No finance or budget records exist in the system yet: there are no tables for fees, payments, income, expenditure, budgets or financial years, so there is no financial-year filter either. These figures stay empty until a finance module records them.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Approved budget" icon={LandmarkIcon} state="unavailable" reason={NO_FINANCE} />
        <KpiCard label="Actual expenditure" icon={WalletIcon} state="unavailable" reason={NO_FINANCE} />
        <KpiCard label="Remaining budget" icon={CoinsIcon} state="unavailable" reason={NO_FINANCE} />
        <KpiCard label="Budget variance" icon={ScaleIcon} state="unavailable" reason={NO_FINANCE} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ModulePendingCard
          title="Income vs expenditure"
          description="Income and expenditure by month or quarter of the financial year."
          icon={ChartColumnIcon}
          module="Finance"
          needs={["Financial years", "Income transactions (fees, grants, donations)", "Expenditure transactions by category"]}
        />
        <ModulePendingCard
          title="Budget allocation"
          description="Approved budget by category (salary, academics, infrastructure, library, ICT, research, scholarships, administration)."
          icon={ChartPieIcon}
          module="Finance"
          needs={["Approved budget per financial year", "Budget categories", "Amount per category"]}
        />
      </div>
    </section>
  )
}

// ------------------------------------------------------------ bottom row

async function AlertsSection({ context, scope, options }: { context: AuthContext; scope: DashboardScope | null; options: ScopeOptions }) {
  const res = await attempt(() => managementAlerts(context, scope, options))
  return res.ok ? <AlertsPanel alerts={res.data} /> : <SectionError title="alerts" />
}

async function ActivitySection({ context, scope }: { context: AuthContext; scope: DashboardScope | null }) {
  const res = await attempt(() => recentActivity(context, scope))
  return res.ok ? <ActivityPanel entries={res.data} /> : <SectionError title="recent activity" />
}

// ------------------------------------------------------------ personal view

// For members without institutional permissions: who they are, where, and
// with which permissions; plus the parent-portal shortcut for guardians.
async function PersonalDashboard({ context }: { context: AuthContext }) {
  const { user, organization, role, permissions } = context
  const guardian = (await getGuardianAccountState(context)) === "active"
  const groups = Object.entries(Object.groupBy(permissions, (key) => key.split(".")[0]))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>

      {guardian && (
        <Link href="/dashboard/family" className="group flex items-center gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HouseHeartIcon className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">My children</span>
            <span className="block text-sm text-muted-foreground">Classes, teachers and school updates for your children.</span>
          </span>
          <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="gap-1 p-5">
          <p className="text-sm text-muted-foreground">Organisation</p>
          <p className="text-lg font-semibold">{organization.name}</p>
          <p className="text-sm text-muted-foreground">{organizationTypeLabels[organization.type]}</p>
        </Card>
        <Card className="gap-1 p-5">
          <p className="text-sm text-muted-foreground">Role</p>
          <p className="text-lg font-semibold">{role.name}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </Card>
      </div>

      <Card className="gap-4 p-5">
        <div>
          <p className="font-semibold">Permissions</p>
          <p className="text-sm text-muted-foreground">
            {permissions.length} granted by the {role.name} role in {organization.name}.
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(([area, keys]) => (
            <div key={area}>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{area}</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {keys?.map((key) => (
                  <Badge key={key} variant="outline" className="font-mono">
                    {key.split(".")[1]}
                  </Badge>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  )
}
