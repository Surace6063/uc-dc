import Link from "next/link"
import { ArrowUpRightIcon, CircleAlertIcon, InfoIcon, MinusIcon, TrendingDownIcon, TrendingUpIcon, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { RetryButton } from "@/features/dashboard/components/dashboard-toolbar"
import type { Change } from "@/features/dashboard/format"
import { cn } from "@/lib/utils"

// Building blocks of the institutional dashboard: KPI tiles, chart cards and
// their loading, empty, error and "module not set up" states.

export const CHART_HEIGHT = "h-64"

export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mt-2">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" aria-label="How this is calculated" className="rounded text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50" />}
      >
        <InfoIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{text}</TooltipContent>
    </Tooltip>
  )
}

// ------------------------------------------------------------ KPI tiles

export type KpiState = "ready" | "unavailable" | "error"

const CHANGE_STYLES: Record<Change["trend"], { icon: LucideIcon; className: string }> = {
  up: { icon: TrendingUpIcon, className: "text-emerald-700 dark:text-emerald-400" },
  down: { icon: TrendingDownIcon, className: "text-rose-700 dark:text-rose-400" },
  flat: { icon: MinusIcon, className: "text-muted-foreground" },
}

function ChangeLine({ change }: { change: Change }) {
  const { icon: Icon, className } = CHANGE_STYLES[change.trend]
  return (
    <p className="flex items-center gap-1 text-xs">
      <span className={cn("flex items-center gap-0.5 font-medium tabular-nums", className)}>
        <Icon className="size-3.5" aria-hidden />
        {change.text}
      </span>
      <span className="text-muted-foreground">{change.label}</span>
    </p>
  )
}

// One headline figure. `unavailable` is for figures the schema can't
// produce yet (`reason` says why); `error` for a failed query. `change` is
// shown only when a genuine comparison exists.
export function KpiCard({
  label,
  value,
  hint,
  info,
  change,
  icon: Icon,
  href,
  state = "ready",
  reason,
}: {
  label: string
  value?: string
  hint?: string
  info?: string
  change?: Change | null
  icon: LucideIcon
  href?: string
  state?: KpiState
  reason?: string
}) {
  const iconBox = "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
  return (
    <div className="flex min-h-[124px] flex-col justify-between gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          {info && <InfoTip text={info} />}
        </div>
        {href && state === "ready" ? (
          <Link href={href} aria-label={`Open ${label.toLowerCase()}`} className={cn(iconBox, "outline-none hover:bg-primary/10 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50")}>
            <Icon className="size-4" />
          </Link>
        ) : (
          <span className={iconBox}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      {state === "ready" ? (
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value ?? "—"}</p>
      ) : state === "unavailable" ? (
        <Badge variant="outline" className="w-fit text-muted-foreground">Not tracked yet</Badge>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
          <CircleAlertIcon className="size-4" /> Couldn&apos;t load
        </p>
      )}
      <div className="grid gap-0.5">
        {state === "ready" && change && <ChangeLine change={change} />}
        {(state === "unavailable" ? reason : hint) && <p className="text-xs text-muted-foreground">{state === "unavailable" ? reason : hint}</p>}
      </div>
    </div>
  )
}

export function KpiSkeleton() {
  return <Skeleton className="h-[124px] rounded-xl" />
}

// ------------------------------------------------------------ chart cards

export function ChartCard({
  title,
  description,
  icon: Icon,
  href,
  badge,
  className,
  children,
}: {
  title: string
  description: string
  icon: LucideIcon
  href?: string
  badge?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn("min-w-0 gap-4 p-5", className)}>
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{title}</h3>
            {badge}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {href && (
          <Link href={href} aria-label={`Open ${title}`} className="rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
            <ArrowUpRightIcon className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </Card>
  )
}

export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(CHART_HEIGHT, "flex items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground")}>
      {children}
    </div>
  )
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("gap-4 p-5", className)} aria-busy="true">
      <div className="flex items-start gap-3">
        <Skeleton className="size-8 rounded-lg" />
        <div className="grid flex-1 gap-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
      </div>
      <Skeleton className={cn(CHART_HEIGHT, "w-full rounded-lg")} />
    </Card>
  )
}

// A section whose data failed to load. Server errors are logged; the card
// only says what failed and offers a retry (a router refresh).
export function SectionError({ title, className }: { title: string; className?: string }) {
  return (
    <Card className={cn("items-center justify-center gap-3 p-6 text-center", className)} role="alert">
      <span className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <CircleAlertIcon className="size-4" />
      </span>
      <div>
        <p className="font-medium">Couldn&apos;t load {title}</p>
        <p className="text-sm text-muted-foreground">Something went wrong while loading this section. Your data hasn&apos;t changed.</p>
      </div>
      <RetryButton />
    </Card>
  )
}

// DEVELOPMENT PLACEHOLDER — for dashboard sections whose source module
// (finance, research, alumni/tracer study, IQAC/QAA) doesn't exist yet. It
// shows no figures, only what the section will need. Replace each use with a
// real chart when its module and data land.
export function ModulePendingCard({
  title,
  description,
  icon,
  module,
  needs,
  className,
}: {
  title: string
  description: string
  icon: LucideIcon
  module: string
  needs: string[]
  className?: string
}) {
  return (
    <ChartCard
      title={title}
      description={description}
      icon={icon}
      className={className}
      badge={<Badge variant="outline" className="text-muted-foreground">Not set up</Badge>}
    >
      <div className={cn(CHART_HEIGHT, "flex flex-col justify-center gap-3 rounded-lg border border-dashed bg-muted/20 px-5")}>
        <p className="text-sm">
          Available once the <span className="font-medium">{module}</span> module is set up.
        </p>
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Data needed</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {needs.map((n) => (
              <li key={n}>
                <Badge variant="secondary" className="font-normal">{n}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ChartCard>
  )
}

// What every figure on the page covers, under the filters.
export function ReportingPeriod({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm" aria-label="Reporting period">
      {items.map((i) => (
        <div key={i.label} className="flex min-w-0 items-baseline gap-1.5">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className="font-medium">{i.value}</dd>
        </div>
      ))}
    </dl>
  )
}
