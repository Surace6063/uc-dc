"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  BanknoteIcon,
  BarChart3Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
  VenusAndMarsIcon,
  type LucideIcon,
} from "lucide-react"

import {
  dropoutByProgram,
  dropoutTrend,
  enrollmentByProgram,
  enrollmentTrend,
  recentEnrollments,
  recentFees,
  studentsByFaculty,
  studentsByProgramGender,
} from "@/components/dashboard/chart-data"
import { Card } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

// Categorical slots, validated for colour-blind separation on both surfaces.
const series = [
  { light: "#2a78d6", dark: "#3987e5" }, // blue
  { light: "#eb6834", dark: "#d95926" }, // orange
  { light: "#1baf7a", dark: "#199e70" }, // aqua
  { light: "#eda100", dark: "#c98500" }, // yellow
]

const genderConfig = {
  female: { label: "Female", theme: series[0] },
  male: { label: "Male", theme: series[1] },
  other: { label: "Other", theme: series[2] },
} satisfies ChartConfig

const ethnicityConfig = {
  others: { label: "Others", theme: series[0] },
  dalit: { label: "Dalit", theme: series[1] },
  madhesi: { label: "Madhesi", theme: series[2] },
  edj: { label: "EDJ", theme: series[3] },
} satisfies ChartConfig

const studentsConfig = {
  students: { label: "Students", color: "var(--primary)" },
} satisfies ChartConfig

const enrollmentsConfig = {
  value: { label: "Enrollments", color: "var(--primary)" },
} satisfies ChartConfig

const feesConfig = {
  value: { label: "Collected (NPR)", color: "var(--primary)" },
} satisfies ChartConfig

const BAR_SIZE = 24
const axisProps = { tickLine: false, axisLine: false, tickMargin: 8 } as const

function ChartCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string
  description: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <Card className="gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </span>
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  )
}

function StackedBars({
  config,
  data,
  categoryKey,
  layout = "horizontal",
}: {
  config: ChartConfig
  data: Record<string, string | number>[]
  categoryKey: string
  layout?: "horizontal" | "vertical"
}) {
  const keys = Object.keys(config)
  const vertical = layout === "vertical"

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart
        data={data}
        layout={layout}
        margin={{ left: vertical ? 0 : -12 }}
      >
        <CartesianGrid vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" {...axisProps} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey={categoryKey}
              {...axisProps}
              width={96}
            />
          </>
        ) : (
          <>
            <XAxis dataKey={categoryKey} {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} />
          </>
        )}
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {keys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="a"
            fill={`var(--color-${key})`}
            stroke="var(--card)"
            strokeWidth={2}
            maxBarSize={BAR_SIZE}
            radius={
              i === keys.length - 1
                ? vertical
                  ? [0, 4, 4, 0]
                  : [4, 4, 0, 0]
                : 0
            }
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

function GroupedBars({
  config,
  data,
  categoryKey,
}: {
  config: ChartConfig
  data: Record<string, string | number>[]
  categoryKey: string
}) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data} barGap={2} margin={{ left: -12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={categoryKey} {...axisProps} />
        <YAxis {...axisProps} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {Object.keys(config).map((key) => (
          <Bar
            key={key}
            dataKey={key}
            fill={`var(--color-${key})`}
            maxBarSize={16}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

function Sparkline({
  config,
  data,
}: {
  config: ChartConfig
  data: { day: number; value: number }[]
}) {
  return (
    <ChartContainer config={config} className="aspect-auto h-16 w-full">
      <LineChart data={data} margin={{ top: 4, bottom: 4, left: 4, right: 4 }}>
        <YAxis hide domain={[0, (max: number) => Math.max(max, 1)]} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) =>
                `Day ${payload?.[0]?.payload?.day ?? ""}`
              }
            />
          }
        />
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </LineChart>
    </ChartContainer>
  )
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  config,
  data,
}: {
  title: string
  value: string
  icon: LucideIcon
  config: ChartConfig
  data: { day: number; value: number }[]
}) {
  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </span>
          <h3 className="font-medium">{title}</h3>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          Last 30 days
        </span>
      </div>
      <div className="flex items-end gap-4">
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <div className="min-w-0 flex-1">
          <Sparkline config={config} data={data} />
        </div>
      </div>
    </Card>
  )
}

export function DashboardCharts() {
  const totalEnrollments = recentEnrollments.reduce((s, d) => s + d.value, 0)
  const totalFees = recentFees.reduce((s, d) => s + d.value, 0)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard
        title="Enrollment by program"
        description="Students per program by ethnic group · Academic year 2026"
        icon={BarChart3Icon}
      >
        <StackedBars
          config={ethnicityConfig}
          data={enrollmentByProgram}
          categoryKey="program"
        />
      </ChartCard>

      <ChartCard
        title="Dropout students"
        description="Dropouts per program by gender · Academic year 2026"
        icon={UserMinusIcon}
      >
        <StackedBars
          config={genderConfig}
          data={dropoutByProgram}
          categoryKey="program"
        />
      </ChartCard>

      <ChartCard
        title="Students by faculty and gender"
        description="Academic year 2026"
        icon={UsersIcon}
      >
        <StackedBars
          config={genderConfig}
          data={studentsByFaculty}
          categoryKey="faculty"
          layout="vertical"
        />
      </ChartCard>

      <ChartCard
        title="Students by program and gender"
        description="Academic year 2026"
        icon={VenusAndMarsIcon}
      >
        <GroupedBars
          config={genderConfig}
          data={studentsByProgramGender}
          categoryKey="program"
        />
      </ChartCard>

      <ChartCard
        title="Dropouts over the last 5 years"
        description="Total dropout students per academic year"
        icon={TrendingDownIcon}
      >
        <ChartContainer
          config={studentsConfig}
          className="aspect-auto h-64 w-full"
        >
          <AreaChart data={dropoutTrend} margin={{ left: -12, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <Area
              dataKey="students"
              type="monotone"
              fill="var(--color-students)"
              fillOpacity={0.1}
              stroke="var(--color-students)"
              strokeWidth={2}
              dot={{
                r: 4,
                fill: "var(--color-students)",
                strokeWidth: 2,
                stroke: "var(--card)",
              }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
            />
          </AreaChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard
        title="Enrollment over the last 5 years"
        description="New students per academic year"
        icon={TrendingUpIcon}
      >
        <ChartContainer
          config={studentsConfig}
          className="aspect-auto h-64 w-full"
        >
          <BarChart data={enrollmentTrend} margin={{ left: -12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="students"
              fill="var(--color-students)"
              maxBarSize={BAR_SIZE}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <SummaryCard
        title="Recent enrollments"
        value={totalEnrollments.toLocaleString()}
        icon={UserPlusIcon}
        config={enrollmentsConfig}
        data={recentEnrollments}
      />

      <SummaryCard
        title="Recent fees collection"
        value={`NPR ${totalFees.toLocaleString()}`}
        icon={BanknoteIcon}
        config={feesConfig}
        data={recentFees}
      />
    </div>
  )
}
