import Link from "next/link"
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// A headline figure for module and portal pages. (The institutional
// dashboard's KPI cards, with comparisons and "not tracked" states, live in
// features/dashboard.) `trend` is only for a real comparison.
export type SummaryTrend = { direction: "up" | "down" | "flat"; label: string; good?: boolean }

export function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  trend,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: LucideIcon
  href?: string
  trend?: SummaryTrend
  className?: string
}) {
  const TrendIcon = trend?.direction === "up" ? ArrowUpRightIcon : trend?.direction === "down" ? ArrowDownRightIcon : MinusIcon
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {(trend || hint) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                trend.good === true && "text-emerald-600 dark:text-emerald-400",
                trend.good === false && "text-destructive"
              )}
            >
              <TrendIcon className="size-3.5" />
              {trend.label}
            </span>
          )}
          {hint && <span className="min-w-0">{hint}</span>}
        </div>
      )}
    </>
  )
  const classes = cn("flex min-h-[112px] flex-col justify-between gap-2 rounded-xl border bg-card p-4 text-card-foreground", className)
  return href ? (
    <Link href={href} className={cn(classes, "transition-colors outline-none hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}

// Responsive grid for summary cards: one column on phones, two on tablets,
// up to `columns` on desktop.
export function SummaryGrid({ columns = 4, children, className }: { columns?: 2 | 3 | 4 | 6; children: React.ReactNode; className?: string }) {
  const cols = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 6: "lg:grid-cols-3 xl:grid-cols-6" }[columns]
  return <div className={cn("grid gap-3 sm:grid-cols-2", cols, className)}>{children}</div>
}
