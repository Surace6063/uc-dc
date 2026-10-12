"use client"

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { axis, chartClass, MissingYears, neutral, series, TooltipRow, xTitle, yTitle } from "@/features/dashboard/components/charts/chart-theme"
import { DoughnutChart } from "@/features/dashboard/components/charts/doughnut-chart"
import { ChartEmpty } from "@/features/dashboard/components/dashboard-ui"
import { shares, type QualificationKey } from "@/features/dashboard/calculations"
import { QUALIFICATION_LEVEL_LABELS } from "@/features/teachers/constants"
import type { FacultyByDesignation, FacultyQualifications, StudentTeacherRatio, StudentTeacherRatioTrend } from "@/services/dashboard/faculty-service"

// Faculty charts: designation, highest qualification and the
// student–teacher ratio (current, by program and over time).

const teachersConfig = { teachers: { label: "Teachers", theme: series[0] } } satisfies ChartConfig

export function FacultyByDesignationChart({ rows }: { rows: FacultyByDesignation }) {
  if (rows.length === 0) return <ChartEmpty>No eligible teachers for these filters.</ChartEmpty>
  return (
    <ChartContainer config={teachersConfig} className="aspect-auto w-full" style={{ height: Math.max(256, rows.length * 34 + 56) }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16, bottom: 12 }} accessibilityLayer>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" {...axis} allowDecimals={false} label={xTitle("Teachers")} />
        <YAxis type="category" dataKey="designation" {...axis} width={132} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="teachers" fill="var(--color-teachers)" maxBarSize={20} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

// Qualification is ordinal, so a single-hue ramp (darkest = highest) rather
// than categorical colours; "none recorded" is neutral.
const RAMP = ["#0b3c78", "#14529c", "#2a78d6", "#5293e0", "#7aaee9", "#9cc3ef", "#b9d4f3", "#d2e3f7", "#e3edf9"]
const qualificationConfig = Object.fromEntries([
  ...(["DOCTORATE", "MPHIL", "MASTER", "BACHELOR", "DIPLOMA", "PROFESSIONAL", "HIGHER_SECONDARY", "SECONDARY", "OTHER"] as const).map((k, i) => [
    k,
    { label: QUALIFICATION_LEVEL_LABELS[k], theme: { light: RAMP[i], dark: RAMP[Math.max(0, i - 1)] } },
  ]),
  ["NONE", { label: "None recorded", theme: neutral }],
]) satisfies ChartConfig

export function FacultyQualificationChart({ data }: { data: FacultyQualifications }) {
  if (data.teachers === 0) return <ChartEmpty>No eligible teachers for these filters.</ChartEmpty>
  const counts = Object.fromEntries(data.levels.map((l) => [l.key, l.teachers])) as Record<QualificationKey, number>
  const slices = shares(counts).map((s) => ({ ...s, label: String(qualificationConfig[s.key].label) }))
  const pct = (n: number) => `${Math.round((n / data.teachers) * 1000) / 10}%`
  return (
    <div className="flex flex-col gap-3">
      <DoughnutChart slices={slices} config={qualificationConfig} unit="teachers" listLabel="Teachers by highest qualification" />
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Master&apos;s or higher</dt>
          <dd className="font-semibold tabular-nums">{data.mastersOrHigher.toLocaleString()} <span className="font-normal text-muted-foreground">· {pct(data.mastersOrHigher)}</span></dd>
        </div>
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Highest qualification verified</dt>
          <dd className="font-semibold tabular-nums">{data.verified.toLocaleString()} <span className="font-normal text-muted-foreground">of {data.recorded.toLocaleString()} recorded</span></dd>
        </div>
      </dl>
    </div>
  )
}

const ratioConfig = { ratio: { label: "Students per teacher", theme: series[0] } } satisfies ChartConfig
const ratioText = (r: number | null) => (r === null ? "—" : `${r} : 1`)

export function StudentTeacherRatioChart({ data }: { data: StudentTeacherRatio }) {
  const rows = data.byProgram.filter((p) => p.ratio !== null)
  const unstaffed = data.byProgram.filter((p) => p.ratio === null && p.students > 0)
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {[
          { label: "Overall", value: ratioText(data.overall) },
          { label: "Students", value: data.students.toLocaleString() },
          { label: "Teachers", value: data.teachers.toLocaleString() },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-muted/40 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      {data.teachers === 0 && data.students > 0 && <p className="text-xs text-muted-foreground">No eligible teachers, so no ratio can be calculated.</p>}
      {rows.length === 0 ? (
        <ChartEmpty>No teachers are assigned to programs in this academic year.</ChartEmpty>
      ) : (
        <ChartContainer config={ratioConfig} className="aspect-auto h-52 w-full">
          <BarChart data={rows} margin={{ left: 8, right: 8, top: 16 }} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="program" {...axis} />
            <YAxis {...axis} width={48} label={yTitle("Students / teacher")} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, p) => p?.[0]?.payload?.name}
                  formatter={(value, _, item) => (
                    <div className="grid w-full gap-1">
                      <TooltipRow name="Ratio" value={`${value} : 1`} color={item.color} />
                      <TooltipRow name="Students" value={item.payload.students.toLocaleString()} />
                      <TooltipRow name="Teachers" value={item.payload.teachers.toLocaleString()} />
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="ratio" fill="var(--color-ratio)" maxBarSize={40} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      )}
      {unstaffed.length > 0 && <p className="text-xs text-muted-foreground">No teacher assignments yet: {unstaffed.map((p) => p.program).join(", ")}.</p>}
    </div>
  )
}

export function StudentTeacherRatioTrendChart({ data }: { data: StudentTeacherRatioTrend }) {
  const { points } = data
  if (!points.some((p) => p.ratio !== null)) return <ChartEmpty>Not enough enrollment and staffing history for a trend.</ChartEmpty>
  return (
    <div className="flex flex-col gap-2">
      <ChartContainer config={ratioConfig} className={chartClass}>
        <LineChart data={points} margin={{ left: 8, right: 12, top: 8 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="year" {...axis} />
          <YAxis {...axis} width={48} label={yTitle("Students / teacher")} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, _, item) => (
                  <div className="grid w-full gap-1">
                    <TooltipRow name="Ratio" value={value == null ? "No records" : `${value} : 1`} color={item.color} />
                    {item.payload.students != null && <TooltipRow name="Students" value={item.payload.students.toLocaleString()} />}
                    {item.payload.teachers != null && <TooltipRow name="Teachers" value={item.payload.teachers.toLocaleString()} />}
                  </div>
                )}
              />
            }
          />
          <Line dataKey="ratio" type="monotone" stroke="var(--color-ratio)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ChartContainer>
      <MissingYears rows={points} what="enrollments" />
      <p className="text-xs text-muted-foreground">
        Teachers counted as at each year&apos;s end (today for the current year) from employment history.
        {data.teachersWithoutHistory > 0 && ` ${data.teachersWithoutHistory} teacher${data.teachersWithoutHistory === 1 ? " has" : "s have"} no employment history, so their current status is used for every year they were employed.`}
      </p>
    </div>
  )
}
