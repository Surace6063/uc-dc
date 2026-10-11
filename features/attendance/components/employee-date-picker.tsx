"use client"

import { FilterSelect } from "@/components/shared/filter-controls"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUrlFilters } from "@/hooks/use-url-filters"

export function EmployeeDatePicker({ date, today, type }: { date: string; today: string; type?: string }) {
  const { setParams } = useUrlFilters()
  return (
    <div className="flex items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="employee-date" className="text-xs text-muted-foreground">Date</Label>
        <Input id="employee-date" type="date" value={date} max={today} onChange={(e) => e.target.value && setParams({ date: e.target.value })} className="h-8" />
      </div>
      <div className="w-32">
        <FilterSelect label="Show" value={type} onChange={(v) => setParams({ type: v })} allLabel="Everyone" options={[{ value: "TEACHER", label: "Teachers" }, { value: "STAFF", label: "Staff" }]} />
      </div>
    </div>
  )
}
