import type { Metadata } from "next"
import {
  BanknoteIcon,
  BookOpenIcon,
  CoinsIcon,
  GraduationCapIcon,
  LandmarkIcon,
  TrendingUpIcon,
  UserSquareIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { DashboardCharts } from "@/components/dashboard/charts"
import { WelcomeBanner } from "@/components/dashboard/welcome-banner"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Dashboard · United College",
}

type Stat = {
  label: string
  value: string
  change: number
  icon: LucideIcon
}

type Income = {
  label: string
  value: string
  description: string
  icon: LucideIcon
  highlight?: boolean
}

// TODO: replace with live data.
const stats: Stat[] = [
  {
    label: "Total students",
    value: "425",
    change: 418.3,
    icon: GraduationCapIcon,
  },
  { label: "Total staff", value: "53", change: 657.1, icon: UserSquareIcon },
  { label: "Total courses", value: "132", change: 1000, icon: BookOpenIcon },
  { label: "Fees collection", value: "NPR 0", change: 0, icon: BanknoteIcon },
]

const income: Income[] = [
  {
    label: "Other income",
    value: "NPR 0",
    description: "Grants, donations & more",
    icon: LandmarkIcon,
  },
  {
    label: "Total income",
    value: "NPR 0",
    description: "Fees + other sources",
    icon: CoinsIcon,
    highlight: true,
  },
]

function StatCard({ label, value, change, icon: Icon }: Stat) {
  const up = change > 0

  return (
    <Card className="gap-0 p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <div className="mt-4 flex items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium tabular-nums",
            up
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          {up && <TrendingUpIcon className="size-3" />}
          {up ? "+" : ""}
          {change.toFixed(1)}%
        </span>
        <span className="text-muted-foreground">vs last year</span>
      </div>
    </Card>
  )
}

function IncomeCard({
  label,
  value,
  description,
  icon: Icon,
  highlight,
}: Income) {
  return (
    <Card
      className={cn(
        "flex-row items-center gap-4 p-5",
        highlight && "bg-primary/5 ring-primary/20"
      )}
    >
      <span
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-xl",
          highlight
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
      </div>
      <p className="hidden text-right text-xs text-muted-foreground sm:block">
        {description}
      </p>
    </Card>
  )
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* TODO: use the signed-in user's name. */}
      <WelcomeBanner name="Krishna Pandey" />

      <section>
        <h2 className="sr-only">Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-tight">Finance</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {income.map((item) => (
            <IncomeCard key={item.label} {...item} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-tight">Analytics</h2>
        <DashboardCharts />
      </section>
    </div>
  )
}
