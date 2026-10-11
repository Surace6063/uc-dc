"use client"

import * as React from "react"
import { SlidersHorizontalIcon } from "lucide-react"

import { FilterChips, FilterSelect, labelOptions, SearchBox } from "@/components/shared/filter-controls"
import { useCan } from "@/components/shared/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  JOB_CATEGORY_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  STAFF_EMPLOYMENT_STATUS_LABELS,
  STAFF_EMPLOYMENT_TYPE_LABELS,
  VERIFICATION_LABELS,
} from "@/features/staff/constants"
import { STAFF_FILTER_KEYS, type StaffFilterKey, type StaffFilters } from "@/features/staff/filters"
import { districtsOf, PROVINCES, provinceName } from "@/lib/nepal/locations"
import type { StaffFormOptions } from "@/services/staff/config-service"

type SetParams = (updates: Record<string, string | null>, options?: { resetPage?: boolean }) => void
type Manager = { id: string; name: string }

const presenceOptions = (has: string) => [{ value: "has", label: has }, { value: "missing", label: "Missing" }]
const yesNoOptions = (yes: string, no: string) => [{ value: "yes", label: yes }, { value: "no", label: no }]

function DateFilter({ id, label, value, onChange }: { id: string; label: string; value?: string; onChange: (v: string | null) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground" htmlFor={id}>{label}</Label>
      <Input id={id} type="date" value={value ?? ""} className="h-8" onChange={(e) => onChange(e.target.value || null)} />
    </div>
  )
}

function TextFilter({ id, label, value, onChange, placeholder }: { id: string; label: string; value?: string; onChange: (v: string | null) => void; placeholder?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground" htmlFor={id}>{label}</Label>
      {/* Applied on blur; re-keyed so "clear" resets it. */}
      <Input id={id} key={`${id}-${value ?? ""}`} defaultValue={value ?? ""} className="h-8" placeholder={placeholder}
        onBlur={(e) => onChange(e.target.value.trim() || null)} />
    </div>
  )
}

function useDesignationOptions(options: StaffFormOptions, filters: Pick<StaffFilters, "department" | "category">) {
  return React.useMemo(
    () =>
      options.designations
        .filter((d) => (!filters.department || !d.departmentId || d.departmentId === filters.department) && (!filters.category || d.category === filters.category))
        .map((d) => ({ value: d.id, label: d.name })),
    [options.designations, filters.department, filters.category]
  )
}

function AdvancedFilters({
  open,
  onOpenChange,
  options,
  managers,
  filters,
  setParams,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: StaffFormOptions
  managers: Manager[]
  filters: StaffFilters
  setParams: SetParams
}) {
  const set = (key: string) => (value: string | null) => setParams({ [key]: value })
  const canSeeEmployment = useCan("staff.employment.view")
  const canSeeSensitive = useCan("staff.sensitive.view")
  const designations = useDesignationOptions(options, filters)
  const categories = [...new Set(options.designations.map((d) => d.category).filter((c) => c !== null))]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Changes apply immediately. Filters on restricted details appear only for roles that can see them.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4 pb-4">
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Employment</h3>
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect label="Employment status" value={filters.status[0]} onChange={set("status")} options={labelOptions(STAFF_EMPLOYMENT_STATUS_LABELS)} />
              <FilterSelect label="Employment type" value={filters.type[0]} onChange={set("type")} options={labelOptions(STAFF_EMPLOYMENT_TYPE_LABELS)} />
              <FilterSelect label="Department" value={filters.department} onChange={set("department")}
                options={options.departments.map((d) => ({ value: d.id, label: d.name }))} />
              <FilterSelect label="Designation" value={filters.designation} onChange={set("designation")} options={designations} />
              {categories.length > 0 && (
                <FilterSelect label="Job category" value={filters.category} onChange={set("category")}
                  options={categories.map((c) => ({ value: c, label: JOB_CATEGORY_LABELS[c] }))} />
              )}
              <DateFilter id="filter-joined-from" label="Joined from" value={filters.joinedFrom} onChange={set("joinedFrom")} />
              <DateFilter id="filter-joined-to" label="Joined to" value={filters.joinedTo} onChange={set("joinedTo")} />
              {canSeeEmployment && (
                <>
                  <DateFilter id="filter-contract-from" label="Contract ends from" value={filters.contractEndFrom} onChange={set("contractEndFrom")} />
                  <DateFilter id="filter-contract-to" label="Contract ends by" value={filters.contractEndTo} onChange={set("contractEndTo")} />
                  <FilterSelect label="Probation" value={filters.probation} onChange={set("probation")} options={yesNoOptions("On probation", "Not on probation")} allLabel="Any" />
                  {managers.length > 0 && (
                    <FilterSelect label="Reports to" value={filters.manager} onChange={set("manager")} options={managers.map((m) => ({ value: m.id, label: m.name }))} allLabel="Anyone" />
                  )}
                </>
              )}
            </div>
          </section>
          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Qualifications</h3>
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect label="Qualification level" value={filters.qualLevel} onChange={set("qualLevel")} options={labelOptions(QUALIFICATION_LEVEL_LABELS)} />
              <TextFilter id="filter-specialization" label="Specialization" value={filters.specialization} onChange={set("specialization")} placeholder="Accounting…" />
              <FilterSelect label="Verification" value={filters.qualVerification} onChange={set("qualVerification")} options={labelOptions(VERIFICATION_LABELS)} allLabel="Any" />
              <FilterSelect label="Certification / training" value={filters.certification} onChange={set("certification")} options={presenceOptions("Has some")} allLabel="Any" />
            </div>
          </section>
          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Profile completeness</h3>
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect label="Phone" value={filters.phone} onChange={set("phone")} options={presenceOptions("Has phone")} allLabel="Any" />
              <FilterSelect label="Email" value={filters.email} onChange={set("email")} options={presenceOptions("Has email")} allLabel="Any" />
              <FilterSelect label="Qualification records" value={filters.qualifications} onChange={set("qualifications")} options={presenceOptions("Has some")} allLabel="Any" />
              <FilterSelect label="Required documents" value={filters.documents} onChange={set("documents")}
                options={[{ value: "complete", label: "Complete" }, { value: "missing", label: "Missing some" }]} allLabel="Any" />
              <FilterSelect label="Verification" value={filters.pendingVerification} onChange={set("pendingVerification")}
                options={[{ value: "1", label: "Pending verification" }]} allLabel="Any" />
              <FilterSelect label="Record" value={filters.incomplete} onChange={set("incomplete")}
                options={[{ value: "1", label: "Incomplete profiles" }]} allLabel="Any" />
            </div>
          </section>
          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Other</h3>
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect label="Login account" value={filters.account} onChange={set("account")} options={yesNoOptions("Linked", "Not linked")} allLabel="Any" />
              <FilterSelect label="Responsibilities" value={filters.responsibilities} onChange={set("responsibilities")} options={yesNoOptions("Has active", "None")} allLabel="Any" />
              {canSeeSensitive && (
                <>
                  <FilterSelect label="Province" value={filters.province} onChange={set("province")}
                    options={PROVINCES.map((p) => ({ value: String(p.id), label: p.name }))} />
                  <FilterSelect label="District" value={filters.district} onChange={set("district")}
                    disabled={!filters.province} allLabel={filters.province ? "All" : "Choose a province first"}
                    options={districtsOf(filters.province).map((d) => ({ value: d, label: d }))} />
                  <div className="col-span-2">
                    <TextFilter id="filter-municipality" label="Municipality" value={filters.municipality} onChange={set("municipality")} placeholder="Contains…" />
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => setParams(Object.fromEntries(STAFF_FILTER_KEYS.map((k) => [k, null])))}>
            Clear all filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// Human-readable label for an active filter chip.
function chipLabel(key: StaffFilterKey, f: StaffFilters, options: StaffFormOptions, managers: Manager[]): string | null {
  const name = (list: { id: string; name: string }[], id?: string) => list.find((x) => x.id === id)?.name ?? "Unknown"
  switch (key) {
    case "status": return f.status.length ? `Status: ${f.status.map((s) => STAFF_EMPLOYMENT_STATUS_LABELS[s]).join(", ")}` : null
    case "type": return f.type.length ? `Type: ${f.type.map((t) => STAFF_EMPLOYMENT_TYPE_LABELS[t]).join(", ")}` : null
    case "department": return f.department ? `Department: ${name(options.departments, f.department)}` : null
    case "designation": return f.designation ? `Designation: ${name(options.designations, f.designation)}` : null
    case "category": return f.category ? `Category: ${JOB_CATEGORY_LABELS[f.category]}` : null
    case "joinedFrom": return f.joinedFrom ? `Joined from ${f.joinedFrom}` : null
    case "joinedTo": return f.joinedTo ? `Joined to ${f.joinedTo}` : null
    case "contractEndFrom": return f.contractEndFrom ? `Contract ends from ${f.contractEndFrom}` : null
    case "contractEndTo": return f.contractEndTo ? `Contract ends by ${f.contractEndTo}` : null
    case "contractExpiring": return f.contractExpiring ? "Contract expiring soon" : null
    case "probation": return f.probation ? (f.probation === "yes" ? "On probation" : "Not on probation") : null
    case "manager": return f.manager ? `Reports to ${name(managers, f.manager)}` : null
    case "qualLevel": return f.qualLevel ? `Qualification: ${QUALIFICATION_LEVEL_LABELS[f.qualLevel]}` : null
    case "specialization": return f.specialization ? `Specialization: ${f.specialization}` : null
    case "qualVerification": return f.qualVerification ? `Qualification ${VERIFICATION_LABELS[f.qualVerification].toLowerCase()}` : null
    case "certification": return f.certification ? (f.certification === "has" ? "Has certification" : "No certification") : null
    case "phone": return f.phone ? (f.phone === "has" ? "Has phone" : "Missing phone") : null
    case "email": return f.email ? (f.email === "has" ? "Has email" : "Missing email") : null
    case "qualifications": return f.qualifications ? (f.qualifications === "has" ? "Has qualifications" : "No qualifications") : null
    case "documents": return f.documents ? (f.documents === "complete" ? "Documents complete" : "Missing documents") : null
    case "pendingVerification": return f.pendingVerification ? "Pending verification" : null
    case "incomplete": return f.incomplete ? "Incomplete profiles" : null
    case "province": return f.province ? `Province: ${provinceName(f.province)}` : null
    case "district": return f.district ? `District: ${f.district}` : null
    case "municipality": return f.municipality ? `Municipality: ${f.municipality}` : null
    case "account": return f.account ? (f.account === "yes" ? "Account linked" : "No account") : null
    case "responsibilities": return f.responsibilities ? (f.responsibilities === "yes" ? "Has responsibilities" : "No responsibilities") : null
  }
}

export function StaffFilterToolbar({
  options,
  managers,
  filters,
  setParams,
}: {
  options: StaffFormOptions
  managers: Manager[]
  filters: StaffFilters
  setParams: SetParams
}) {
  const [open, setOpen] = React.useState(false)
  const set = (key: string) => (value: string | null) => setParams({ [key]: value })
  const onSearch = React.useCallback((q: string | null) => setParams({ q }), [setParams])
  const designations = useDesignationOptions(options, filters)
  const chips = STAFF_FILTER_KEYS.map((key) => ({ key, label: chipLabel(key, filters, options, managers) })).filter(
    (c): c is { key: StaffFilterKey; label: string } => c.label !== null
  )

  return (
    <div className="flex flex-col gap-3 border-b p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <SearchBox value={filters.q ?? ""} onSearch={onSearch} placeholder="Name, employee ID, phone, department…" label="Search staff" />
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <FilterSelect label="Department" value={filters.department} onChange={set("department")} allLabel="All departments"
            options={options.departments.filter((d) => d.isActive || d.id === filters.department).map((d) => ({ value: d.id, label: d.name }))} />
          <FilterSelect label="Designation" value={filters.designation} onChange={set("designation")} allLabel="All designations" options={designations} />
          <FilterSelect label="Status" value={filters.status[0]} onChange={set("status")} allLabel="Any status" options={labelOptions(STAFF_EMPLOYMENT_STATUS_LABELS)} />
          <FilterSelect label="Type" value={filters.type[0]} onChange={set("type")} allLabel="Any type" options={labelOptions(STAFF_EMPLOYMENT_TYPE_LABELS)} />
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="shrink-0">
          <SlidersHorizontalIcon data-icon="inline-start" />
          More filters
          {chips.length > 0 && <Badge className="ml-1">{chips.length}</Badge>}
        </Button>
      </div>
      <FilterChips
        chips={chips}
        onRemove={(key) => setParams({ [key]: null })}
        onClear={() => setParams(Object.fromEntries(STAFF_FILTER_KEYS.map((k) => [k, null])))}
      />
      <AdvancedFilters open={open} onOpenChange={setOpen} options={options} managers={managers} filters={filters} setParams={setParams} />
    </div>
  )
}
