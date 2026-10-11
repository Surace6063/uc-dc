"use client"

import * as React from "react"
import { SlidersHorizontalIcon } from "lucide-react"

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
  ADMISSION_TYPE_LABELS,
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_TYPE_LABELS,
  GENDER_LABELS,
  STUDENT_STATUS_LABELS,
} from "@/features/students/constants"
import { FILTER_KEYS, type FilterKey, type StudentFilters } from "@/features/students/filters"
import { BLOOD_GROUPS } from "@/features/students/schemas"
import { useCan } from "@/components/shared/session-provider"
import { FilterChips, FilterSelect, labelOptions, SearchBox } from "@/components/shared/filter-controls"
import { districtsOf, PROVINCES, provinceName } from "@/lib/nepal/locations"
import type { EducationStructure } from "@/services/academics/structure-service"

type SetParams = (updates: Record<string, string | null>, options?: { resetPage?: boolean }) => void

const entries = labelOptions

// Options that depend on earlier choices: level → program → class → section.
export function useAcademicOptions(structure: EducationStructure, filters: Pick<StudentFilters, "level" | "program" | "faculty" | "class">) {
  return React.useMemo(() => {
    const level = structure.levels.find((l) => l.id === filters.level)
    const programs = structure.programs.filter(
      (p) => (!filters.level || p.educationLevelId === filters.level) && (!filters.faculty || p.facultyId === filters.faculty)
    )
    const classes = structure.classes.filter(
      (c) =>
        (!filters.level || c.educationLevelId === filters.level) &&
        (!filters.program || c.programId === filters.program) &&
        (!filters.faculty || programs.some((p) => p.id === c.programId))
    )
    const sections = filters.class ? structure.sections.filter((s) => s.classId === filters.class) : []
    const batches = structure.batches.filter((b) => !filters.program || !b.programId || b.programId === filters.program)
    const showPrograms = structure.levels.some((l) => l.usesPrograms) && (!level || level.usesPrograms)
    return { programs, classes, sections, batches, showPrograms }
  }, [structure, filters.level, filters.program, filters.faculty, filters.class])
}



function AdvancedFilters({
  open,
  onOpenChange,
  structure,
  filters,
  setParams,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  structure: EducationStructure
  filters: StudentFilters
  setParams: SetParams
}) {
  const options = useAcademicOptions(structure, filters)
  const set = (key: string) => (value: string | null) => setParams({ [key]: value })
  const usesSemesters = structure.classes.some((c) => c.kind === "SEMESTER")
  const canSeeSensitive = useCan("students.sensitive.view")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Changes apply immediately. Only filters relevant to your structure are shown.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4 pb-4">
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Academic</h3>
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect label="Education level" value={filters.level} onChange={set("level")}
                options={structure.levels.map((l) => ({ value: l.id, label: l.name }))} />
              {structure.faculties.length > 0 && (
                <FilterSelect label="Faculty / department" value={filters.faculty} onChange={set("faculty")}
                  options={structure.faculties.map((f) => ({ value: f.id, label: f.name }))} />
              )}
              {options.showPrograms && (
                <FilterSelect label="Program" value={filters.program} onChange={set("program")}
                  options={options.programs.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))} />
              )}
              <FilterSelect label={usesSemesters ? "Class / semester" : "Class"} value={filters.class} onChange={set("class")}
                options={options.classes.map((c) => ({ value: c.id, label: c.name }))} />
              <FilterSelect label="Section" value={filters.section} onChange={set("section")}
                disabled={!filters.class} allLabel={filters.class ? "All" : "Choose a class first"}
                options={options.sections.map((s) => ({ value: s.id, label: s.name }))} />
              {structure.batches.length > 0 && (
                <FilterSelect label="Batch" value={filters.batch} onChange={set("batch")}
                  options={options.batches.map((b) => ({ value: b.id, label: b.name }))} />
              )}
              <FilterSelect label="Enrollment status" value={filters.enrollmentStatus[0]} onChange={set("enrollmentStatus")}
                options={entries(ENROLLMENT_STATUS_LABELS)} />
              <FilterSelect label="Enrollment type" value={filters.enrollmentType} onChange={set("enrollmentType")}
                options={entries(ENROLLMENT_TYPE_LABELS)} />
            </div>
          </section>
          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Student</h3>
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect label="Status" value={filters.status[0]} onChange={set("status")} options={entries(STUDENT_STATUS_LABELS)} />
              <FilterSelect label="Gender" value={filters.gender} onChange={set("gender")} options={entries(GENDER_LABELS)} />
              <FilterSelect label="Admission type" value={filters.admissionType} onChange={set("admissionType")}
                options={entries(ADMISSION_TYPE_LABELS)} />
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground" htmlFor="filter-nationality">Nationality</Label>
                <Input id="filter-nationality" key={`nationality-${filters.nationality ?? ""}`} defaultValue={filters.nationality ?? ""} className="h-8"
                  onBlur={(e) => setParams({ nationality: e.target.value.trim() || null })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground" htmlFor="filter-from">Admitted from</Label>
                <Input id="filter-from" type="date" value={filters.admittedFrom ?? ""} className="h-8"
                  onChange={(e) => setParams({ admittedFrom: e.target.value || null })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground" htmlFor="filter-to">Admitted to</Label>
                <Input id="filter-to" type="date" value={filters.admittedTo ?? ""} className="h-8"
                  onChange={(e) => setParams({ admittedTo: e.target.value || null })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground" htmlFor="filter-age-min">Age from</Label>
                <Input id="filter-age-min" type="number" min={0} max={100} key={`ageMin-${filters.ageMin ?? ""}`} defaultValue={filters.ageMin ?? ""} className="h-8"
                  onBlur={(e) => setParams({ ageMin: e.target.value || null })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground" htmlFor="filter-age-max">Age to</Label>
                <Input id="filter-age-max" type="number" min={0} max={100} key={`ageMax-${filters.ageMax ?? ""}`} defaultValue={filters.ageMax ?? ""} className="h-8"
                  onBlur={(e) => setParams({ ageMax: e.target.value || null })} />
              </div>
              <FilterSelect label="Province" value={filters.province} onChange={set("province")}
                options={PROVINCES.map((p) => ({ value: String(p.id), label: p.name }))} />
              <FilterSelect label="District" value={filters.district} onChange={set("district")}
                disabled={!filters.province} allLabel={filters.province ? "All" : "Choose a province first"}
                options={districtsOf(filters.province).map((d) => ({ value: d, label: d }))} />
              <div className="col-span-2 grid gap-1.5">
                <Label className="text-xs text-muted-foreground" htmlFor="filter-municipality">Municipality</Label>
                <Input id="filter-municipality" key={`municipality-${filters.municipality ?? ""}`} defaultValue={filters.municipality ?? ""} className="h-8" placeholder="Contains…"
                  onBlur={(e) => setParams({ municipality: e.target.value.trim() || null })} />
              </div>
              {canSeeSensitive && (
                <FilterSelect label="Blood group" value={filters.bloodGroup} onChange={set("bloodGroup")}
                  options={BLOOD_GROUPS.map((g) => ({ value: g, label: g }))} />
              )}
            </div>
          </section>
          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Data completeness</h3>
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect label="Guardian contact" value={filters.guardianContact} onChange={set("guardianContact")}
                options={[{ value: "has", label: "Has contact" }, { value: "missing", label: "Missing" }]} />
              <FilterSelect label="Email" value={filters.email} onChange={set("email")}
                options={[{ value: "has", label: "Has email" }, { value: "missing", label: "Missing" }]} />
              <FilterSelect label="Profile photo" value={filters.photo} onChange={set("photo")}
                options={[{ value: "has", label: "Has photo" }, { value: "missing", label: "Missing" }]} />
              <FilterSelect label="Required documents" value={filters.documents} onChange={set("documents")}
                options={[{ value: "complete", label: "Complete" }, { value: "missing", label: "Missing some" }]} />
              <FilterSelect label="Record" value={filters.incomplete} onChange={set("incomplete")}
                options={[{ value: "1", label: "Incomplete records" }]} allLabel="Any" />
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground" htmlFor="filter-created-from">Created from</Label>
                <Input id="filter-created-from" type="date" value={filters.createdFrom ?? ""} className="h-8"
                  onChange={(e) => setParams({ createdFrom: e.target.value || null })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground" htmlFor="filter-created-to">Created to</Label>
                <Input id="filter-created-to" type="date" value={filters.createdTo ?? ""} className="h-8"
                  onChange={(e) => setParams({ createdTo: e.target.value || null })} />
              </div>
            </div>
          </section>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}>
            Clear all filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// Human-readable label for an active filter chip.
function chipLabel(key: FilterKey, filters: StudentFilters, structure: EducationStructure): string | null {
  const name = (list: { id: string; name: string }[], id?: string) => list.find((x) => x.id === id)?.name ?? "Unknown"
  switch (key) {
    case "level": return filters.level ? `Level: ${name(structure.levels, filters.level)}` : null
    case "program": return filters.program ? `Program: ${name(structure.programs, filters.program)}` : null
    case "faculty": return filters.faculty ? `Faculty: ${name(structure.faculties, filters.faculty)}` : null
    case "class": return filters.class ? `Class: ${name(structure.classes, filters.class)}` : null
    case "section": return filters.section ? `Section: ${name(structure.sections, filters.section)}` : null
    case "batch": return filters.batch ? `Batch: ${name(structure.batches, filters.batch)}` : null
    case "enrollmentStatus": return filters.enrollmentStatus.length ? `Enrollment: ${filters.enrollmentStatus.map((s) => ENROLLMENT_STATUS_LABELS[s]).join(", ")}` : null
    case "enrollmentType": return filters.enrollmentType ? ENROLLMENT_TYPE_LABELS[filters.enrollmentType] : null
    case "status": return filters.status.length ? `Status: ${filters.status.map((s) => STUDENT_STATUS_LABELS[s]).join(", ")}` : null
    case "gender": return filters.gender ? GENDER_LABELS[filters.gender] : null
    case "admissionType": return filters.admissionType ? ADMISSION_TYPE_LABELS[filters.admissionType] : null
    case "admittedFrom": return filters.admittedFrom ? `Admitted from ${filters.admittedFrom}` : null
    case "admittedTo": return filters.admittedTo ? `Admitted to ${filters.admittedTo}` : null
    case "ageMin": return filters.ageMin !== undefined ? `Age ≥ ${filters.ageMin}` : null
    case "ageMax": return filters.ageMax !== undefined ? `Age ≤ ${filters.ageMax}` : null
    case "nationality": return filters.nationality ? `Nationality: ${filters.nationality}` : null
    case "province": return filters.province ? `Province: ${provinceName(filters.province)}` : null
    case "district": return filters.district ? `District: ${filters.district}` : null
    case "municipality": return filters.municipality ? `Municipality: ${filters.municipality}` : null
    case "guardianContact": return filters.guardianContact ? `Guardian contact: ${filters.guardianContact}` : null
    case "email": return filters.email ? `Email: ${filters.email}` : null
    case "photo": return filters.photo ? `Photo: ${filters.photo}` : null
    case "documents": return filters.documents ? `Documents: ${filters.documents}` : null
    case "incomplete": return filters.incomplete ? "Incomplete records" : null
    case "bloodGroup": return filters.bloodGroup ? `Blood group: ${filters.bloodGroup}` : null
    case "createdFrom": return filters.createdFrom ? `Created from ${filters.createdFrom}` : null
    case "createdTo": return filters.createdTo ? `Created to ${filters.createdTo}` : null
  }
}

export function StudentFilterToolbar({
  structure,
  filters,
  setParams,
}: {
  structure: EducationStructure
  filters: StudentFilters
  setParams: SetParams
}) {
  const [open, setOpen] = React.useState(false)
  const options = useAcademicOptions(structure, filters)
  const set = (key: string) => (value: string | null) => setParams({ [key]: value })
  const onSearch = React.useCallback((q: string | null) => setParams({ q }), [setParams])

  const chips = FILTER_KEYS.map((key) => ({ key, label: chipLabel(key, filters, structure) })).filter(
    (c): c is { key: FilterKey; label: string } => c.label !== null
  )

  return (
    <div className="flex flex-col gap-3 border-b p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <SearchBox
          value={filters.q ?? ""}
          onSearch={onSearch}
          placeholder="Name, admission no., phone, guardian…"
          label="Search students"
        />
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <FilterSelect label="Level" value={filters.level} onChange={set("level")} allLabel="All levels"
            options={structure.levels.filter((l) => l.isActive || l.id === filters.level).map((l) => ({ value: l.id, label: l.name }))} />
          {options.showPrograms && (
            <FilterSelect label="Program" value={filters.program} onChange={set("program")} allLabel="All programs"
              options={options.programs.map((p) => ({ value: p.id, label: p.code }))} />
          )}
          <FilterSelect label="Class" value={filters.class} onChange={set("class")} allLabel="All classes"
            options={options.classes.map((c) => ({ value: c.id, label: c.name }))} />
          {filters.class && options.sections.length > 0 && (
            <FilterSelect label="Section" value={filters.section} onChange={set("section")} allLabel="All sections"
              options={options.sections.map((s) => ({ value: s.id, label: s.name }))} />
          )}
          <FilterSelect label="Status" value={filters.status[0]} onChange={set("status")} allLabel="Any status"
            options={entries(STUDENT_STATUS_LABELS)} />
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
        onClear={() => setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
      />
      <AdvancedFilters open={open} onOpenChange={setOpen} structure={structure} filters={filters} setParams={setParams} />
    </div>
  )
}
