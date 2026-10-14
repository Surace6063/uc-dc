import { Suspense } from "react"
import Link from "next/link"
import {
  BanknoteIcon,
  CalendarCheckIcon,
  CalendarRangeIcon,
  CircleAlertIcon,
  ClipboardListIcon,
  HandCoinsIcon,
  HourglassIcon,
  LandmarkIcon,
  ReceiptIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { ContentSection } from "@/components/shared/content-section"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionSkeleton, SummaryCardsSkeleton } from "@/components/shared/loading-states"
import { PageHeader } from "@/components/shared/page-header"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FeeCollectionTrend, IncomeExpenseChart } from "@/features/finance/components/finance-charts"
import { PAYMENT_METHOD_LABELS } from "@/features/finance/constants"
import { formatRs, formatRsShort } from "@/features/finance/money"
import { formatDate, formatDateTime } from "@/features/teaching/format"
import type { AuthContext } from "@/lib/authorization/context"
import { isFinanceStaff } from "@/services/finance/access"
import {
  currentYear,
  financeSummary,
  monthlyTrend,
  outstandingReport,
  overdueStudents,
  recentFinanceActivity,
  recentPayments,
} from "@/services/finance/report-service"
import { hasPermission } from "@/lib/authorization/context"

// The finance home. Every figure comes from fee, payment and entry records
// for the organisation (fees for the selected academic year); each section
// loads on its own and says so when it fails.

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

export async function FinanceHome({ context, year }: { context: AuthContext; year?: string }) {
  if (!isFinanceStaff(context)) return <AccessDenied />
  const academicYear = await currentYear(context, year)
  const props: Props = { context, yearId: academicYear?.id ?? null }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Finance" description={`Fees, collections, income and expenses${academicYear ? ` · fees for ${academicYear.name}` : " · all years"}.`}>
        {hasPermission(context, "finance.create") && (
          <>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard/finance/expenses?new=1" />}>Record expense</Button>
            <Button size="sm" nativeButton={false} render={<Link href="/dashboard/finance/collect" />}>
              <HandCoinsIcon data-icon="inline-start" />
              Collect fee
            </Button>
          </>
        )}
      </PageHeader>

      <Suspense fallback={<SummaryCardsSkeleton count={6} className="xl:grid-cols-3" />}>
        <Cards {...props} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<SectionSkeleton />}>
          <Trends {...props} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <Flows {...props} />
        </Suspense>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Suspense fallback={<SectionSkeleton className="lg:col-span-2" />}>
          <RecentPayments {...props} />
        </Suspense>
        <QuickActions context={context} />
        <Suspense fallback={<SectionSkeleton />}>
          <Outstanding {...props} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <Overdue {...props} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <Activity {...props} />
        </Suspense>
      </div>
    </div>
  )
}

async function Cards({ context, yearId }: Props) {
  const res = await attempt(() => financeSummary(context, yearId))
  if (!res.ok) return <Failed what="finance totals" />
  const s = res.data
  return (
    <SummaryGrid columns={3}>
      <SummaryCard label="Total fees assessed" value={formatRs(s.assessed)} hint={s.discount ? `${formatRs(s.discount)} in discounts & scholarships` : "Before discounts"} icon={ClipboardListIcon} href="/dashboard/finance/assignments" />
      <SummaryCard label="Total fees collected" value={formatRs(s.collected)} hint={s.assessed ? `${Math.round((s.collected / Math.max(1, s.assessed - s.discount)) * 1000) / 10}% of what's due` : "Verified payments only"} icon={WalletIcon} href="/dashboard/finance/payments" />
      <SummaryCard label="Outstanding balance" value={formatRs(s.outstanding)} hint={s.overdue ? `${formatRs(s.overdue)} overdue` : "Nothing overdue"} icon={CircleAlertIcon} href="/dashboard/finance/outstanding" />
      <SummaryCard label="Today's collections" value={formatRs(s.today.amount)} hint={`${s.today.count} receipt${s.today.count === 1 ? "" : "s"}`} icon={CalendarCheckIcon} href="/dashboard/finance/reports/daily" />
      <SummaryCard label="This month's collections" value={formatRs(s.month.amount)} hint={`${s.month.count} receipt${s.month.count === 1 ? "" : "s"}`} icon={CalendarRangeIcon} href="/dashboard/finance/reports/monthly" />
      <SummaryCard label="Pending reconciliation" value={s.pending.count} hint={s.pending.count ? `${formatRs(s.pending.amount)} in cheques/transfers awaiting clearance` : "No uncleared payments"} icon={HourglassIcon} href="/dashboard/finance/payments?status=pending" />
    </SummaryGrid>
  )
}

async function Trends({ context }: Props) {
  const res = await attempt(() => monthlyTrend(context))
  return (
    <ContentSection title="Fee collection trend" description="Verified fee payments per month, last 12 months.">
      {res.ok ? <FeeCollectionTrend months={res.data} /> : <Failed what="the collection trend" />}
    </ContentSection>
  )
}

async function Flows({ context }: Props) {
  const res = await attempt(() => monthlyTrend(context))
  return (
    <ContentSection title="Income and expenses" description="Income is fee collections plus other income; last 12 months.">
      {res.ok ? <IncomeExpenseChart months={res.data} /> : <Failed what="income and expenses" />}
    </ContentSection>
  )
}

async function Outstanding({ context, yearId }: Props) {
  const res = hasPermission(context, "finance.reports") ? await attempt(() => outstandingReport(context, { yearId })) : null
  return (
    <ContentSection title="Outstanding by class" actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/finance/outstanding" />}>All</Button>}>
      {!res ? (
        <p className="text-sm text-muted-foreground">Needs the finance reports permission.</p>
      ) : !res.ok ? (
        <Failed what="outstanding balances" />
      ) : res.data.byClass.length === 0 ? (
        <p className="text-sm text-muted-foreground">No outstanding balances.</p>
      ) : (
        <ul className="grid gap-2.5">
          {res.data.byClass.slice(0, 6).map((c) => (
            <li key={c.className} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{c.className}</span>
                <span className="font-semibold tabular-nums">{formatRsShort(c.balance)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (c.balance / res.data.byClass[0].balance) * 100)}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">{c.students} student{c.students === 1 ? "" : "s"}{c.overdue ? ` · ${formatRsShort(c.overdue)} overdue` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </ContentSection>
  )
}

async function RecentPayments({ context }: Props) {
  const res = await attempt(() => recentPayments(context, 6))
  return (
    <ContentSection title="Recent payments" className="lg:col-span-2" actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/finance/payments" />}>Payment history</Button>}>
      {!res.ok ? (
        <Failed what="payments" />
      ) : res.data.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title="No payments yet" description="Payments you record under Fee collection appear here." className="py-8" />
      ) : (
        <ul className="divide-y rounded-lg border">
          {res.data.map((p) => (
            <li key={p.id}>
              <Link href={`/dashboard/finance/payments/${p.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/40">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.student.firstName} {p.student.lastName} <span className="font-normal text-muted-foreground">· {p.student.admissionNumber}</span></span>
                  <span className="block text-xs text-muted-foreground">{p.receiptNumber} · {formatDate(p.receivedOn)} · {PAYMENT_METHOD_LABELS[p.method]}</span>
                </span>
                <span className="flex items-center gap-2">
                  {p.status === "REVERSED" ? <Badge variant="destructive">Reversed</Badge> : p.verificationStatus === "PENDING" ? <Badge variant="outline">Pending</Badge> : null}
                  <span className="text-sm font-semibold tabular-nums">{formatRs(p.amount)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ContentSection>
  )
}

async function Overdue({ context, yearId }: Props) {
  const res = await attempt(() => overdueStudents(context, yearId, 6))
  return (
    <ContentSection title="Students with overdue fees" actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/finance/outstanding?due=overdue" />}>All</Button>}>
      {!res.ok ? (
        <Failed what="overdue fees" />
      ) : res.data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fees are overdue.</p>
      ) : (
        <ul className="grid gap-2">
          {res.data.rows.map((r) => (
            <li key={r.student.id}>
              <Link href={`/dashboard/finance/collect?student=${r.student.id}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-muted/40">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.student.firstName} {r.student.lastName}</span>
                  <span className="block text-xs text-muted-foreground">since {formatDate(r.oldest)} · {r.fees} fee{r.fees === 1 ? "" : "s"}</span>
                </span>
                <span className="font-semibold text-destructive tabular-nums">{formatRsShort(r.amount)}</span>
              </Link>
            </li>
          ))}
          {res.data.total > res.data.rows.length && <li className="text-xs text-muted-foreground">+{res.data.total - res.data.rows.length} more students</li>}
        </ul>
      )}
    </ContentSection>
  )
}

async function Activity({ context }: Props) {
  const res = await attempt(() => recentFinanceActivity(context, 6))
  return (
    <ContentSection title="Recent activity">
      {!res.ok ? (
        <Failed what="activity" />
      ) : res.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No finance activity yet.</p>
      ) : (
        <ul className="grid gap-2.5">
          {res.data.map((a) => (
            <li key={a.id} className="text-sm">
              <span className="line-clamp-2">{a.summary}</span>
              <span className="block text-xs text-muted-foreground">{a.actor ?? "Someone"} · {formatDateTime(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </ContentSection>
  )
}

function QuickActions({ context }: { context: AuthContext }) {
  const actions: { title: string; href: string; icon: LucideIcon; show: boolean }[] = [
    { title: "Collect a fee", href: "/dashboard/finance/collect", icon: HandCoinsIcon, show: hasPermission(context, "finance.create") },
    { title: "Assign fees", href: "/dashboard/finance/assignments?assign=1", icon: ClipboardListIcon, show: hasPermission(context, "finance.create") },
    { title: "Record expense", href: "/dashboard/finance/expenses?new=1", icon: BanknoteIcon, show: hasPermission(context, "finance.create") },
    { title: "Record income", href: "/dashboard/finance/income?new=1", icon: LandmarkIcon, show: hasPermission(context, "finance.create") },
    { title: "Daily report", href: "/dashboard/finance/reports/daily", icon: CalendarCheckIcon, show: hasPermission(context, "finance.reports") },
    { title: "Outstanding report", href: "/dashboard/finance/reports/outstanding", icon: CircleAlertIcon, show: hasPermission(context, "finance.reports") },
  ]
  const shown = actions.filter((a) => a.show)
  return (
    <ContentSection title="Quick actions">
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">You can view finance figures; recording needs more permissions.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {shown.map((q) => (
            <Link key={q.href} href={q.href} className="flex flex-col items-start gap-2 rounded-lg border p-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5">
              <q.icon className="size-4 text-primary" />
              {q.title}
            </Link>
          ))}
        </div>
      )}
    </ContentSection>
  )
}
