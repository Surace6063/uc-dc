"use client"

import Link from "next/link"
import { CheckCircle2Icon, CircleDashedIcon, PencilLineIcon } from "lucide-react"

import { FilterSelect } from "@/components/shared/filter-controls"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { slotLabel } from "@/features/attendance/constants"
import { REGISTER_DEPENDENTS, type RegisterParams } from "@/features/attendance/filters"
import { useUrlFilters } from "@/hooks/use-url-filters"
import { cn } from "@/lib/utils"

export type PickerData = {
  years: { id: string; name: string; isCurrent: boolean }[]
  yearId: string | null
  date: string
  today: string
  type: "DAILY" | "PERIOD"
  levels: { id: string; name: string; usesPrograms: boolean }[]
  programs: { id: string; name: string; code: string; educationLevelId: string }[]
  classes: { id: string; name: string; educationLevelId: string; programId: string | null }[]
  sections: { id: string; name: string; classId: string }[]
  offerings: { id: string; name: string; code: string; sectionIds: string[] }[]
  policy: { dailyEnabled: boolean; periodEnabled: boolean; dailySlots: number; maxPeriodsPerDay: number }
  // Teachers without attendance.manage only see their own classes.
  limitedTo: string[] | null
}

// Year → date → level → program → class → section → register type → subject
// → slot. Every choice lives in the URL; the server loads the register for
// the full selection and re-checks it.
export function RegisterPicker({ data, params }: { data: PickerData; params: RegisterParams }) {
  const { setParams, pending } = useUrlFilters(REGISTER_DEPENDENTS)
  const classes = data.classes.filter(
    (c) =>
      (!data.limitedTo || data.limitedTo.includes(c.id)) &&
      (!params.level || c.educationLevelId === params.level) &&
      (!params.program || c.programId === params.program)
  )
  const levels = data.levels.filter((l) => classes.some((c) => c.educationLevelId === l.id) || l.id === params.level)
  const level = data.levels.find((l) => l.id === params.level)
  const programs = data.programs.filter((p) => p.educationLevelId === params.level)
  const sections = data.sections.filter((s) => s.classId === params.class)
  const offering = data.offerings.find((o) => o.id === params.offering)
  const sectionOptions = sections
    .filter((s) => !offering || offering.sectionIds.length === 0 || offering.sectionIds.includes(s.id))
    .map((s) => ({ value: s.id, label: `Section ${s.name}` }))
  const slots = data.type === "DAILY" ? data.policy.dailySlots : data.policy.maxPeriodsPerDay

  return (
    <Card className={cn("gap-4 p-4 transition-opacity", pending && "opacity-70")} aria-busy={pending || undefined}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <FilterSelect
          label="Academic year"
          value={data.yearId ?? undefined}
          onChange={(v) => setParams({ year: v })}
          allLabel="Choose…"
          options={data.years.map((y) => ({ value: y.id, label: `${y.name}${y.isCurrent ? " (current)" : ""}` }))}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="register-date" className="text-xs text-muted-foreground">Date</Label>
          <Input
            id="register-date"
            type="date"
            value={data.date}
            max={data.today}
            onChange={(e) => e.target.value && setParams({ date: e.target.value })}
            className="h-8"
          />
        </div>
        <FilterSelect label="Education level" value={params.level} onChange={(v) => setParams({ level: v })} allLabel="All levels" options={levels.map((l) => ({ value: l.id, label: l.name }))} />
        {level?.usesPrograms && programs.length > 0 ? (
          <FilterSelect label="Program" value={params.program} onChange={(v) => setParams({ program: v })} allLabel="All programs" options={programs.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))} />
        ) : (
          <div className="hidden xl:block" />
        )}
        <FilterSelect label="Class" value={params.class} onChange={(v) => setParams({ class: v })} allLabel="Choose…" options={classes.map((c) => ({ value: c.id, label: c.name }))} />
        <FilterSelect
          label="Section"
          value={params.section}
          onChange={(v) => setParams({ section: v })}
          allLabel={sections.length ? "Choose…" : "Whole class"}
          disabled={!params.class}
          options={[...sectionOptions, ...(sections.length ? [{ value: "all", label: "Whole class" }] : [])]}
        />
        {data.policy.dailyEnabled && data.policy.periodEnabled ? (
          <FilterSelect
            label="Register"
            value={data.type === "PERIOD" ? "PERIOD" : undefined}
            onChange={(v) => setParams({ type: v })}
            allLabel="Daily"
            options={[{ value: "PERIOD", label: "Period / subject" }]}
          />
        ) : (
          <div className="hidden xl:block" />
        )}
        {data.type === "PERIOD" ? (
          <FilterSelect
            label="Subject"
            value={params.offering}
            onChange={(v) => setParams({ offering: v })}
            allLabel={params.class ? "Choose…" : "Choose a class first"}
            disabled={!params.class}
            options={data.offerings.map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }))}
          />
        ) : null}
        {slots > 1 && (
          <FilterSelect
            label={data.type === "DAILY" ? "Part of day" : "Period"}
            value={params.slot && params.slot > 1 ? params.slot : undefined}
            onChange={(v) => setParams({ slot: v })}
            allLabel={slotLabel(data.type, 1, data.policy.dailySlots)}
            options={Array.from({ length: slots - 1 }, (_, i) => ({ value: String(i + 2), label: slotLabel(data.type, i + 2, data.policy.dailySlots) }))}
          />
        )}
      </div>
    </Card>
  )
}

// A teacher's registers for today, as shortcuts.
export function MyRegisters({
  items,
  yearId,
  date,
}: {
  items: { key: string; label: string; classId: string; sectionId: string | null; type: "DAILY" | "PERIOD"; offeringId: string | null; status: string | null }[]
  yearId: string | null
  date: string
}) {
  if (!yearId || items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const q = new URLSearchParams({ year: yearId, date, class: item.classId, section: item.sectionId ?? "all", type: item.type })
        if (item.offeringId) q.set("offering", item.offeringId)
        const Icon = item.status === "SUBMITTED" || item.status === "LOCKED" ? CheckCircle2Icon : item.status === "DRAFT" ? PencilLineIcon : CircleDashedIcon
        return (
          <Link
            key={item.key}
            href={`/dashboard/attendance/take?${q}`}
            className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted/50"
          >
            <Icon className={cn("size-4", item.status === "SUBMITTED" || item.status === "LOCKED" ? "text-emerald-600" : item.status === "DRAFT" ? "text-amber-600" : "text-muted-foreground")} />
            {item.label}
            {item.status && item.type === "PERIOD" && <span className="text-xs text-muted-foreground">({item.status})</span>}
          </Link>
        )
      })}
    </div>
  )
}
