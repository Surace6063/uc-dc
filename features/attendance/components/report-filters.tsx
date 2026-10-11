"use client"

import { DownloadIcon } from "lucide-react"

import { FilterSelect } from "@/components/shared/filter-controls"
import { useCan } from "@/components/shared/session-provider"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { REPORT_DEPENDENTS, REPORT_KINDS, type ReportKind, type ReportParams } from "@/features/attendance/filters"
import { useUrlFilters } from "@/hooks/use-url-filters"
import { cn } from "@/lib/utils"

export type ReportOptions = {
  kinds: ReportKind[]
  years: { id: string; name: string }[]
  levels: { id: string; name: string }[]
  programs: { id: string; name: string; educationLevelId: string }[]
  classes: { id: string; name: string; educationLevelId: string; programId: string | null }[]
  sections: { id: string; name: string }[]
  offerings: { id: string; name: string }[]
  periodEnabled: boolean
}

export function ReportFilters({ params, options, period }: { params: ReportParams; options: ReportOptions; period: { from: string; to: string; yearId: string | null } }) {
  const { searchParams, setParams, pending } = useUrlFilters(REPORT_DEPENDENTS)
  const canExport = useCan("attendance.export")
  const employees = params.kind === "employees"
  const classes = options.classes.filter((c) => (!params.level || c.educationLevelId === params.level) && (!params.program || c.programId === params.program))
  const programs = options.programs.filter((p) => p.educationLevelId === params.level)
  const exportHref = () => {
    const q = new URLSearchParams(searchParams.toString())
    q.set("kind", params.kind)
    return `/api/attendance/reports/export?${q}`
  }

  return (
    <div className={cn("flex flex-col gap-3 transition-opacity", pending && "opacity-70")}>
      <nav aria-label="Report type" className="flex flex-wrap gap-2">
        {options.kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setParams({ kind })}
            aria-current={params.kind === kind ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", params.kind === kind ? "border-primary/50 bg-primary/5 font-medium" : "text-muted-foreground hover:bg-muted/50")}
          >
            {REPORT_KINDS[kind]}
          </button>
        ))}
      </nav>
      <Card className="flex-row flex-wrap items-end gap-3 p-4">
        {!employees && (
          <div className="w-32"><FilterSelect label="Academic year" value={period.yearId ?? undefined} onChange={(v) => setParams({ year: v })} allLabel="Current" options={options.years.map((y) => ({ value: y.id, label: y.name }))} /></div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="report-from" className="text-xs text-muted-foreground">From</Label>
          <Input id="report-from" type="date" value={params.from ?? period.from} onChange={(e) => setParams({ from: e.target.value || null })} className="h-8" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="report-to" className="text-xs text-muted-foreground">To</Label>
          <Input id="report-to" type="date" value={params.to ?? period.to} onChange={(e) => setParams({ to: e.target.value || null })} className="h-8" />
        </div>
        {employees ? (
          <div className="w-32"><FilterSelect label="Show" value={params.employeeType} onChange={(v) => setParams({ employeeType: v })} allLabel="Everyone" options={[{ value: "TEACHER", label: "Teachers" }, { value: "STAFF", label: "Staff" }]} /></div>
        ) : (
          <>
            <div className="w-36"><FilterSelect label="Education level" value={params.level} onChange={(v) => setParams({ level: v })} options={options.levels.map((l) => ({ value: l.id, label: l.name }))} /></div>
            {programs.length > 0 && <div className="w-36"><FilterSelect label="Program" value={params.program} onChange={(v) => setParams({ program: v })} options={programs.map((p) => ({ value: p.id, label: p.name }))} /></div>}
            <div className="w-36"><FilterSelect label="Class" value={params.class} onChange={(v) => setParams({ class: v })} options={classes.map((c) => ({ value: c.id, label: c.name }))} /></div>
            {options.sections.length > 0 && <div className="w-28"><FilterSelect label="Section" value={params.section} onChange={(v) => setParams({ section: v })} options={options.sections.map((s) => ({ value: s.id, label: s.name }))} /></div>}
            {options.periodEnabled && options.offerings.length > 0 && params.kind !== "classes" && (
              <div className="w-40"><FilterSelect label="Subject" value={params.offering} onChange={(v) => setParams({ offering: v })} options={options.offerings.map((o) => ({ value: o.id, label: o.name }))} /></div>
            )}
            {options.periodEnabled && params.kind !== "subjects" && (
              <div className="w-32"><FilterSelect label="Registers" value={params.type} onChange={(v) => setParams({ type: v })} allLabel="All" options={[{ value: "DAILY", label: "Daily" }, { value: "PERIOD", label: "Period" }]} /></div>
            )}
          </>
        )}
        {canExport && (
          <Button size="sm" variant="outline" className="ml-auto" nativeButton={false} render={<a href={exportHref()} />}>
            <DownloadIcon data-icon="inline-start" />
            Export CSV
          </Button>
        )}
      </Card>
    </div>
  )
}
