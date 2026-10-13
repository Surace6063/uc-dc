"use client"

import * as React from "react"
import { SlidersHorizontalIcon } from "lucide-react"

import { FilterChips, FilterSelect, labelOptions, SearchBox } from "@/components/shared/filter-controls"
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
  ACADEMIC_RANK_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  VERIFICATION_LABELS,
} from "@/features/teachers/constants"
import {
  TEACHER_FILTER_KEYS,
  type TeacherFilterKey,
  type TeacherFilters,
} from "@/features/teachers/filters"
import type { EducationStructure } from "@/services/academics/structure-service"

type SetParams = (updates: Record<string, string | null>, options?: { resetPage?: boolean }) => void

// Options narrowed by the choices above them (level → program → class → section;
// subjects that fit the chosen level/program).
function useAcademicOptions(structure: EducationStructure, f: TeacherFilters) {
  return React.useMemo(() => {
    const level = structure.levels.find((l) => l.id === f.level)
    const programs = structure.programs.filter((p) => !f.level || p.educationLevelId === f.level)
    const classes = structure.classes.filter(
      (c) => (!f.level || c.educationLevelId === f.level) && (!f.program || c.programId === f.program)
    )
    const sections = f.class ? structure.sections.filter((s) => s.classId === f.class) : []
    const subjects = structure.subjects.filter(
      (s) => (!f.level || !s.educationLevelId || s.educationLevelId === f.level) && (!f.program || !s.programId || s.programId === f.program)
    )
    const batches = structure.batches.filter((b) => !f.program || !b.programId || b.programId === f.program)
    const showPrograms = structure.levels.some((l) => l.usesPrograms) && (!level || level.usesPrograms)
    return { programs, classes, sections, subjects, batches, showPrograms }
  }, [structure, f.level, f.program, f.class])
}

function DateInput({ id, label, value, onChange }: { id: string; label: string; value?: string; onChange: (v: string | null) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground" htmlFor={id}>{label}</Label>
      <Input id={id} type="date" value={value ?? ""} className="h-8" onChange={(e) => onChange(e.target.value || null)} />
    </div>
  )
}

function chipLabel(key: TeacherFilterKey, f: TeacherFilters, s: EducationStructure): string | null {
  const name = (list: { id: string; name: string }[], id?: string) => list.find((x) => x.id === id)?.name ?? "Unknown"
  switch (key) {
    case "status": return f.status.length ? `Status: ${f.status.map((x) => EMPLOYMENT_STATUS_LABELS[x]).join(", ")}` : null
    case "type": return f.type.length ? `Type: ${f.type.map((x) => EMPLOYMENT_TYPE_LABELS[x]).join(", ")}` : null
    case "designation": return f.designation ? `Designation: ${name(s.designations, f.designation)}` : null
    case "rank": return f.rank ? `Rank: ${f.rank === "unrecorded" ? "Not recorded" : ACADEMIC_RANK_LABELS[f.rank]}` : null
    case "department": return f.department ? `Department: ${name(s.faculties, f.department)}` : null
    case "otherJob": return f.otherJob ? `Full-time job elsewhere: ${f.otherJob === "unrecorded" ? "not recorded" : f.otherJob}` : null
    case "joinedFrom": return f.joinedFrom ? `Joined from ${f.joinedFrom}` : null
    case "joinedTo": return f.joinedTo ? `Joined to ${f.joinedTo}` : null
    case "contractEndFrom": return f.contractEndFrom ? `Contract ends from ${f.contractEndFrom}` : null
    case "contractEndTo": return f.contractEndTo ? `Contract ends by ${f.contractEndTo}` : null
    case "level": return f.level ? `Level: ${name(s.levels, f.level)}` : null
    case "program": return f.program ? `Program: ${name(s.programs, f.program)}` : null
    case "class": return f.class ? `Class: ${name(s.classes, f.class)}` : null
    case "section": return f.section ? `Section: ${name(s.sections, f.section)}` : null
    case "subject": return f.subject ? `Subject: ${name(s.subjects, f.subject)}` : null
    case "batch": return f.batch ? `Batch: ${name(s.batches, f.batch)}` : null
    case "assigned": return f.assigned ? (f.assigned === "yes" ? "Has assignments" : "No assignments") : null
    case "qualLevel": return f.qualLevel ? `Qualification: ${QUALIFICATION_LEVEL_LABELS[f.qualLevel]}` : null
    case "specialization": return f.specialization ? `Specialization: ${f.specialization}` : null
    case "qualVerification": return f.qualVerification ? `Qualification ${VERIFICATION_LABELS[f.qualVerification].toLowerCase()}` : null
    case "certification": return f.certification ? (f.certification === "has" ? "Has certifications" : "No certifications") : null
    case "phone": return f.phone ? `Phone: ${f.phone}` : null
    case "email": return f.email ? `Email: ${f.email}` : null
    case "qualifications": return f.qualifications ? `Qualifications: ${f.qualifications}` : null
    case "documents": return f.documents ? `Required documents: ${f.documents}` : null
    case "pendingVerification": return f.pendingVerification ? "Pending verification" : null
    case "incomplete": return f.incomplete ? "Incomplete profiles" : null
  }
}

function AdvancedFilters({
  open,
  onOpenChange,
  structure,
  filters: f,
  setParams,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  structure: EducationStructure
  filters: TeacherFilters
  setParams: SetParams
}) {
  const o = useAcademicOptions(structure, f)
  const set = (key: string) => (value: string | null) => setParams({ [key]: value })
  const presence = (has: string, missing: string) => [{ value: "has", label: has }, { value: "missing", label: missing }]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Changes apply immediately. Assignment filters use the selected academic year.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4 pb-4">
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Employment</h3>
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect label="Status" value={f.status[0]} onChange={set("status")} options={labelOptions(EMPLOYMENT_STATUS_LABELS)} />
              <FilterSelect label="Type" value={f.type[0]} onChange={set("type")} options={labelOptions(EMPLOYMENT_TYPE_LABELS)} />
              <FilterSelect label="Designation" value={f.designation} onChange={set("designation")}
                options={structure.designations.map((d) => ({ value: d.id, label: d.name }))} />
              <FilterSelect label="Department" value={f.department} onChange={set("department")}
                options={structure.faculties.map((d) => ({ value: d.id, label: d.name }))} />
              <FilterSelect label="Academic rank" value={f.rank} onChange={set("rank")}
                options={[...labelOptions(ACADEMIC_RANK_LABELS), { value: "unrecorded", label: "Not recorded" }]} />
              <FilterSelect label="Full-time job elsewhere" value={f.otherJob} onChange={set("otherJob")}
                options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unrecorded", label: "Not recorded" }]} />
              <DateInput id="tf-joined-from" label="Joined from" value={f.joinedFrom} onChange={set("joinedFrom")} />
              <DateInput id="tf-joined-to" label="Joined to" value={f.joinedTo} onChange={set("joinedTo")} />
              <DateInput id="tf-contract-from" label="Contract ends from" value={f.contractEndFrom} onChange={set("contractEndFrom")} />
              <DateInput id="tf-contract-to" label="Contract ends by" value={f.contractEndTo} onChange={set("contractEndTo")} />
            </div>
          </section>
          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Teaching</h3>
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect label="Assignments" value={f.assigned} onChange={set("assigned")} allLabel="Any"
                options={[{ value: "yes", label: "Has active" }, { value: "no", label: "None active" }]} />
              <FilterSelect label="Education level" value={f.level} onChange={set("level")}
                options={structure.levels.map((l) => ({ value: l.id, label: l.name }))} />
              {o.showPrograms && (
                <FilterSelect label="Program" value={f.program} onChange={set("program")}
                  options={o.programs.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))} />
              )}
              <FilterSelect label="Class / semester" value={f.class} onChange={set("class")}
                options={o.classes.map((c) => ({ value: c.id, label: c.name }))} />
              <FilterSelect label="Section" value={f.section} onChange={set("section")} disabled={!f.class}
                allLabel={f.class ? "All" : "Choose a class first"} options={o.sections.map((s) => ({ value: s.id, label: s.name }))} />
              {structure.subjects.length > 0 && (
                <FilterSelect label="Subject" value={f.subject} onChange={set("subject")}
                  options={o.subjects.map((s) => ({ value: s.id, label: s.name }))} />
              )}
              {structure.batches.length > 0 && (
                <FilterSelect label="Batch" value={f.batch} onChange={set("batch")}
                  options={o.batches.map((b) => ({ value: b.id, label: b.name }))} />
              )}
            </div>
          </section>
          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Qualifications</h3>
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect label="Level" value={f.qualLevel} onChange={set("qualLevel")} options={labelOptions(QUALIFICATION_LEVEL_LABELS)} />
              <FilterSelect label="Verification" value={f.qualVerification} onChange={set("qualVerification")} options={labelOptions(VERIFICATION_LABELS)} />
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground" htmlFor="tf-specialization">Specialization</Label>
                <Input id="tf-specialization" key={`spec-${f.specialization ?? ""}`} defaultValue={f.specialization ?? ""} className="h-8"
                  placeholder="e.g. Mathematics" onBlur={(e) => setParams({ specialization: e.target.value.trim() || null })} />
              </div>
              <FilterSelect label="Certifications" value={f.certification} onChange={set("certification")} options={presence("Has some", "None")} />
            </div>
          </section>
          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Profile completeness</h3>
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect label="Phone" value={f.phone} onChange={set("phone")} options={presence("Has phone", "Missing")} />
              <FilterSelect label="Email" value={f.email} onChange={set("email")} options={presence("Has email", "Missing")} />
              <FilterSelect label="Qualifications" value={f.qualifications} onChange={set("qualifications")} options={presence("Recorded", "Missing")} />
              <FilterSelect label="Required documents" value={f.documents} onChange={set("documents")}
                options={[{ value: "complete", label: "Complete" }, { value: "missing", label: "Missing some" }]} />
              <FilterSelect label="Verification" value={f.pendingVerification} onChange={set("pendingVerification")} allLabel="Any"
                options={[{ value: "1", label: "Pending verification" }]} />
              <FilterSelect label="Profile" value={f.incomplete} onChange={set("incomplete")} allLabel="Any"
                options={[{ value: "1", label: "Incomplete" }]} />
            </div>
          </section>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => setParams(Object.fromEntries(TEACHER_FILTER_KEYS.map((k) => [k, null])))}>
            Clear all filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function TeacherFilterToolbar({
  structure,
  filters,
  setParams,
}: {
  structure: EducationStructure
  filters: TeacherFilters
  setParams: SetParams
}) {
  const [open, setOpen] = React.useState(false)
  const o = useAcademicOptions(structure, filters)
  const set = (key: string) => (value: string | null) => setParams({ [key]: value })
  const onSearch = React.useCallback((q: string | null) => setParams({ q }), [setParams])
  const chips = TEACHER_FILTER_KEYS.map((key) => ({ key, label: chipLabel(key, filters, structure) })).filter(
    (c): c is { key: TeacherFilterKey; label: string } => c.label !== null
  )

  return (
    <div className="flex flex-col gap-3 border-b p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <SearchBox
          value={filters.q ?? ""}
          onSearch={onSearch}
          placeholder="Name, employee ID, email, phone, designation…"
          label="Search teachers"
        />
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <FilterSelect label="Status" value={filters.status[0]} onChange={set("status")} allLabel="Any status"
            options={labelOptions(EMPLOYMENT_STATUS_LABELS)} />
          {structure.faculties.length > 0 && (
            <FilterSelect label="Department" value={filters.department} onChange={set("department")} allLabel="All departments"
              options={structure.faculties.map((d) => ({ value: d.id, label: d.name }))} />
          )}
          {structure.designations.length > 0 && (
            <FilterSelect label="Designation" value={filters.designation} onChange={set("designation")} allLabel="All designations"
              options={structure.designations.map((d) => ({ value: d.id, label: d.name }))} />
          )}
          <FilterSelect label="Class" value={filters.class} onChange={set("class")} allLabel="Any class"
            options={o.classes.map((c) => ({ value: c.id, label: c.name }))} />
          {structure.subjects.length > 0 && (
            <FilterSelect label="Subject" value={filters.subject} onChange={set("subject")} allLabel="Any subject"
              options={o.subjects.map((s) => ({ value: s.id, label: s.name }))} />
          )}
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
        onClear={() => setParams(Object.fromEntries(TEACHER_FILTER_KEYS.map((k) => [k, null])))}
      />
      <AdvancedFilters open={open} onOpenChange={setOpen} structure={structure} filters={filters} setParams={setParams} />
    </div>
  )
}
