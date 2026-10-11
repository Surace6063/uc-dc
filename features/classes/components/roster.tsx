"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowRightLeftIcon,
  DownloadIcon,
  GraduationCapIcon,
  ListOrderedIcon,
  SearchIcon,
  UserPlusIcon,
} from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { FormAlert } from "@/components/shared/form"
import { applyServerErrors, SelectField, TextField } from "@/components/shared/form-fields"
import { useCan } from "@/components/shared/session-provider"
import { Pill, tone } from "@/components/shared/status-pill"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import {
  enrollStudentsAction,
  moveStudentsAction,
  previewPromotionAction,
  promoteStudentsAction,
  renumberRollsAction,
  searchEnrollableStudentsAction,
} from "@/features/classes/actions"
import { orderForRollNumbers, ROLL_ORDERS, rollOrderOptions } from "@/features/classes/constants"
import { promotionSchema, renumberRollsSchema } from "@/features/classes/schemas"
import { ENROLLMENT_TYPE_LABELS, fullName, GENDER_LABELS } from "@/features/students/constants"
import { useDebounced } from "@/hooks/use-url-filters"
import type { EducationStructure } from "@/services/academics/structure-service"
import type { AcademicYearOption, ClassDetailData, EnrollableStudent } from "@/services/classes/class-service"
import type { PromotionRow } from "@/services/classes/placement-service"

type Section = ClassDetailData["academicClass"]["sections"][number]
type Enrollment = ClassDetailData["enrollments"][number]
export type PromotionStructure = Pick<EducationStructure, "classes" | "sections">

// "" = whole class, a section id, or "none" for students without a section.
export type Scope = string

const today = () => new Date().toISOString().slice(0, 10)

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function bulkToast(title: string, failed: { name: string; reason: string }[], succeeded: number) {
  toast.add({
    title,
    description: failed.length
      ? `${failed.length} not changed: ${failed
          .slice(0, 3)
          .map((f) => `${f.name} (${f.reason})`)
          .join("; ")}${failed.length > 3 ? "…" : ""}`
      : undefined,
    type: failed.length ? (succeeded ? "warning" : "error") : "success",
  })
}

// Section order, then roll number (numerically), then name.
function sortRoster(rows: Enrollment[], sections: Section[]) {
  const sectionRank = new Map(sections.map((s, i) => [s.id, i]))
  const byRoll = orderForRollNumbers(
    rows.map((e) => ({ ...e.student, id: e.id, rollNumber: e.rollNumber })),
    "CURRENT"
  ).map((r) => r.id)
  const rollRank = new Map(byRoll.map((id, i) => [id, i]))
  return [...rows].sort(
    (a, b) =>
      (sectionRank.get(a.sectionId ?? "") ?? 999) - (sectionRank.get(b.sectionId ?? "") ?? 999) ||
      rollRank.get(a.id)! - rollRank.get(b.id)!
  )
}

export function Roster({
  detail,
  yearId,
  years,
  scope,
  onScopeChange,
  readOnly,
  structure,
}: {
  detail: ClassDetailData
  yearId: string
  years: AcademicYearOption[]
  scope: Scope
  // Absent on a section page, where the scope is fixed.
  onScopeChange?: (scope: Scope) => void
  readOnly: boolean
  structure: PromotionStructure
}) {
  const { academicClass } = detail
  const canEnroll = useCan("students.enroll") && !readOnly
  const canExport = useCan("classes.export")
  const sections = academicClass.sections
  const hasSections = sections.length > 0
  const [query, setQuery] = React.useState("")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [dialog, setDialog] = React.useState<"rolls" | "move" | "enroll" | "promote" | null>(null)

  const inScope = React.useMemo(
    () =>
      scope === ""
        ? detail.enrollments
        : detail.enrollments.filter((e) => (scope === "none" ? e.sectionId === null : e.sectionId === scope)),
    [detail.enrollments, scope]
  )
  const sectionName = (id: string | null) => (id ? (sections.find((s) => s.id === id)?.name ?? "") : "")
  const rows = React.useMemo(() => {
    const sorted = sortRoster(inScope, sections)
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(
      (e) =>
        fullName(e.student).toLowerCase().includes(q) ||
        e.student.admissionNumber.toLowerCase().includes(q) ||
        e.rollNumber === q
    )
  }, [inScope, sections, query])

  const selectedIds = [...selected].filter((id) => inScope.some((e) => e.id === id))
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const section = sections.find((s) => s.id === scope) ?? null
  const scopeLabel = section
    ? `section ${section.name}`
    : scope === "none"
      ? "students without a section"
      : hasSections
        ? "every section of this class"
        : "this class"
  const rosterHref = `/api/classes/${academicClass.id}/roster?year=${yearId}${scope ? `&section=${scope}` : ""}`
  const unsectioned = detail.enrollments.filter((e) => e.sectionId === null).length

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">
            Students <span className="font-normal text-muted-foreground tabular-nums">{inScope.length}</span>
          </h2>
          {onScopeChange && hasSections && (
            <NativeSelect size="sm" value={scope} onChange={(e) => onScopeChange(e.target.value)} aria-label="Section">
              <NativeSelectOption value="">All sections</NativeSelectOption>
              {sections
                .filter((s) => !s.archivedAt || detail.enrollments.some((e) => e.sectionId === s.id))
                .map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    Section {s.name}
                  </NativeSelectOption>
                ))}
              {unsectioned > 0 && <NativeSelectOption value="none">No section ({unsectioned})</NativeSelectOption>}
            </NativeSelect>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, admission or roll no."
              aria-label="Search students"
              className="h-8 w-56 pl-8"
            />
          </div>
          {canEnroll && !academicClass.archivedAt && (
            <Button size="sm" onClick={() => setDialog("enroll")}>
              <UserPlusIcon data-icon="inline-start" />
              Enroll
            </Button>
          )}
          {canEnroll && hasSections && (
            <Button size="sm" variant="outline" disabled={selectedIds.length === 0} onClick={() => setDialog("move")}>
              <ArrowRightLeftIcon data-icon="inline-start" />
              Move{selectedIds.length ? ` (${selectedIds.length})` : ""}
            </Button>
          )}
          {canEnroll && (
            <Button size="sm" variant="outline" disabled={selectedIds.length === 0} onClick={() => setDialog("promote")}>
              <GraduationCapIcon data-icon="inline-start" />
              Promote{selectedIds.length ? ` (${selectedIds.length})` : ""}
            </Button>
          )}
          {canEnroll && (
            <Button size="sm" variant="outline" disabled={inScope.length === 0} onClick={() => setDialog("rolls")}>
              <ListOrderedIcon data-icon="inline-start" />
              Roll numbers
            </Button>
          )}
          {canExport && (
            <Button size="sm" variant="outline" disabled={inScope.length === 0} nativeButton={false} render={<a href={rosterHref} />}>
              <DownloadIcon data-icon="inline-start" />
              CSV
            </Button>
          )}
        </div>
      </div>

      {inScope.length === 0 ? (
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyTitle>No students</EmptyTitle>
            <EmptyDescription>
              Nobody is placed here for this academic year.
              {canEnroll && !academicClass.archivedAt
                ? " Use Enroll to place existing students, or admit new ones from Students."
                : ""}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {canEnroll && (
                  <TableHead className="w-10 pl-4">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                  </TableHead>
                )}
                <TableHead className={canEnroll ? "w-16" : "w-16 pl-4"}>Roll</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Adm. no.</TableHead>
                <TableHead>Gender</TableHead>
                {scope === "" && hasSections && <TableHead>Section</TableHead>}
                <TableHead>Enrolled</TableHead>
                <TableHead className="pr-4">Contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id} data-state={selected.has(e.id) ? "selected" : undefined}>
                  {canEnroll && (
                    <TableCell className="pl-4">
                      <Checkbox
                        checked={selected.has(e.id)}
                        onCheckedChange={() => toggle(e.id)}
                        aria-label={`Select ${fullName(e.student)}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className={canEnroll ? "tabular-nums" : "pl-4 tabular-nums"}>
                    {e.rollNumber ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/students/${e.student.id}`} className="font-medium hover:underline">
                      {fullName(e.student)}
                    </Link>
                    {e.status === "ON_HOLD" && <Pill className={`ml-2 ${tone.amber}`}>On hold</Pill>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.student.admissionNumber}</TableCell>
                  <TableCell>{e.student.gender ? GENDER_LABELS[e.student.gender] : "—"}</TableCell>
                  {scope === "" && hasSections && (
                    <TableCell>{e.sectionId ? sectionName(e.sectionId) : <Pill className={tone.amber}>None</Pill>}</TableCell>
                  )}
                  <TableCell className="text-xs text-muted-foreground">{ENROLLMENT_TYPE_LABELS[e.enrollmentType]}</TableCell>
                  <TableCell className="pr-4 text-muted-foreground">{e.student.phone ?? "—"}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    No students match &ldquo;{query}&rdquo;.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog === "rolls" && (
        <RollNumbersDialog
          onClose={() => setDialog(null)}
          yearId={yearId}
          classId={academicClass.id}
          scope={scope}
          scopeLabel={scopeLabel}
          count={inScope.length}
        />
      )}
      {dialog === "move" && (
        <MoveDialog
          onClose={() => setDialog(null)}
          yearId={yearId}
          classId={academicClass.id}
          sections={sections}
          enrollmentIds={selectedIds}
          onDone={() => setSelected(new Set())}
        />
      )}
      {dialog === "enroll" && (
        <EnrollDialog
          onClose={() => setDialog(null)}
          yearId={yearId}
          classId={academicClass.id}
          className={academicClass.name}
          sections={sections}
          defaultSectionId={section?.id ?? ""}
        />
      )}
      {dialog === "promote" && (
        <PromoteDialog
          onClose={() => setDialog(null)}
          detail={detail}
          yearId={yearId}
          years={years}
          structure={structure}
          enrollmentIds={selectedIds}
          onDone={() => setSelected(new Set())}
        />
      )}
    </Card>
  )
}

// ------------------------------------------------------------ roll numbers

function RollNumbersDialog({
  onClose,
  yearId,
  classId,
  scope,
  scopeLabel,
  count,
}: {
  onClose: () => void
  yearId: string
  classId: string
  scope: Scope
  scopeLabel: string
  count: number
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof renumberRollsSchema>, unknown, z.output<typeof renumberRollsSchema>>({
    resolver: zodResolver(renumberRollsSchema),
    defaultValues: { academicYearId: yearId, classId, sectionId: scope || null, order: "FIRST_NAME" },
  })

  const submit = form.handleSubmit(async (values) => {
    const result = await renumberRollsAction(values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: `Roll numbers assigned to ${plural(result.data.renumbered, "student")}`, type: "success" })
    onClose()
    router.refresh()
  })

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Assign roll numbers"
      description={`Numbers ${plural(count, "student")} in ${scopeLabel} from 1. Each section is numbered separately. Numbers already printed on ID or admit cards will change.`}
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
      submitLabel="Assign numbers"
    >
      <SelectField control={form.control} name="order" label="Order" options={rollOrderOptions} />
      <p className="text-xs text-muted-foreground">
        Institutions that number by last year&apos;s exam rank can enter roll numbers on each student&apos;s enrollment;
        &ldquo;{ROLL_ORDERS.CURRENT}&rdquo; then keeps that order and only removes gaps.
      </p>
    </FormDialog>
  )
}

// ------------------------------------------------------------- move

function MoveDialog({
  onClose,
  yearId,
  classId,
  sections,
  enrollmentIds,
  onDone,
}: {
  onClose: () => void
  yearId: string
  classId: string
  sections: Section[]
  enrollmentIds: string[]
  onDone: () => void
}) {
  const router = useRouter()
  const active = sections.filter((s) => s.isActive && !s.archivedAt)
  const [target, setTarget] = React.useState(() => active[0]?.id ?? "none")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const result = await moveStudentsAction({
      academicYearId: yearId,
      classId,
      enrollmentIds,
      targetSectionId: target === "none" ? null : target,
    })
    setPending(false)
    if (!result.ok) {
      setError(result.fieldErrors?.targetSectionId?.[0] ?? result.error)
      return
    }
    toast.add({ title: `${plural(result.data.moved, "student")} moved`, type: "success" })
    onDone()
    onClose()
    router.refresh()
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Move ${plural(enrollmentIds.length, "student")}`}
      description="Changes the section within this class and year. Moved students get the next free roll numbers in the new section when roll numbers are automatic."
      pending={pending}
      error={error}
      onSubmit={submit}
      submitLabel="Move"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="move-target">Move to</Label>
        <NativeSelect id="move-target" value={target} onChange={(e) => setTarget(e.target.value)} className="w-full">
          {active.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              Section {s.name}
              {s.capacity ? ` (capacity ${s.capacity})` : ""}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value="none">No section</NativeSelectOption>
        </NativeSelect>
      </div>
    </FormDialog>
  )
}

// ------------------------------------------------------------- enroll

const ENROLL_TYPE_OPTIONS = (["NEW_ADMISSION", "READMISSION", "TRANSFER", "LATERAL_ENTRY"] as const).map((value) => ({
  value,
  label: ENROLLMENT_TYPE_LABELS[value],
}))

// Finds active students who aren't placed anywhere this year and enrolls the
// chosen ones here. New students are admitted from the Students module.
function EnrollDialog({
  onClose,
  yearId,
  classId,
  className,
  sections,
  defaultSectionId,
}: {
  onClose: () => void
  yearId: string
  classId: string
  className: string
  sections: Section[]
  defaultSectionId: string
}) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const debounced = useDebounced(query)
  const [results, setResults] = React.useState<EnrollableStudent[]>([])
  const [searching, setSearching] = React.useState(false)
  const [chosen, setChosen] = React.useState<Map<string, EnrollableStudent>>(new Map())
  const [sectionId, setSectionId] = React.useState(defaultSectionId)
  const [type, setType] = React.useState<(typeof ENROLL_TYPE_OPTIONS)[number]["value"]>("NEW_ADMISSION")
  const [date, setDate] = React.useState(today())
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    searchEnrollableStudentsAction(yearId, debounced).then((result) => {
      if (cancelled) return
      setSearching(false)
      if (result.ok) setResults(result.data)
      else setError(result.error)
    })
    return () => {
      cancelled = true
    }
  }, [yearId, debounced])

  const toggle = (s: EnrollableStudent) =>
    setChosen((prev) => {
      const next = new Map(prev)
      if (next.has(s.id)) next.delete(s.id)
      else next.set(s.id, s)
      return next
    })

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await enrollStudentsAction({
      academicYearId: yearId,
      classId,
      sectionId,
      studentIds: [...chosen.keys()],
      enrollmentDate: date,
      enrollmentType: type,
    })
    setPending(false)
    if (!result.ok) {
      setError(Object.values(result.fieldErrors ?? {}).flat()[0] ?? result.error)
      return
    }
    const { succeeded, failed } = result.data
    bulkToast(`${plural(succeeded, "student")} enrolled in ${className}`, failed, succeeded)
    if (failed.length === 0) onClose()
    else setChosen(new Map([...chosen].filter(([id]) => failed.some((f) => f.id === id))))
    router.refresh()
  }

  const activeSections = sections.filter((s) => s.isActive && !s.archivedAt)

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Enroll students in ${className}`}
      description="Shows active students who aren't placed in any class this academic year. Admit new students from the Students page."
      pending={pending}
      error={error}
      onSubmit={submit}
      submitLabel={chosen.size ? `Enroll ${chosen.size}` : "Enroll"}
      wide
    >
      <div className="grid gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSearching(true)
            }}
            placeholder="Search by name or admission number"
            aria-label="Search students"
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border">
          {results.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {searching ? "Searching…" : "No unplaced active students match."}
            </p>
          ) : (
            <ul className="divide-y">
              {results.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                    <Checkbox checked={chosen.has(s.id)} onCheckedChange={() => toggle(s)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{fullName(s)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.admissionNumber}
                        {s.lastPlacement ? ` · last: ${s.lastPlacement}` : " · never enrolled"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {chosen.size > 0 && (
          <p className="text-xs text-muted-foreground">
            Selected: {[...chosen.values()].map((s) => fullName(s)).join(", ")}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {sections.length > 0 && (
          <div className="grid gap-1.5">
            <Label htmlFor="enroll-section">Section</Label>
            <NativeSelect id="enroll-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="w-full">
              <NativeSelectOption value="">No section</NativeSelectOption>
              {activeSections.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  Section {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="enroll-type">Type</Label>
          <NativeSelect
            id="enroll-type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="w-full"
          >
            {ENROLL_TYPE_OPTIONS.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="enroll-date">Enrollment date</Label>
          <Input id="enroll-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
    </FormDialog>
  )
}

// ------------------------------------------------------------- promote

const OUTCOME_OPTIONS = [
  { value: "PROMOTED", label: "Promote to the next class" },
  { value: "DETAINED", label: "Repeat this class (detained)" },
  { value: "TRANSFERRED", label: "Transfer to another class" },
  { value: "COMPLETED", label: "Completed / graduated (no new class)" },
]

// End-of-year progression for the selected students: choose the outcome and
// destination, preview every student's result, then confirm. Each student's
// current placement is closed and a linked new one opened; nothing is
// overwritten, and students with problems are skipped and reported.
function PromoteDialog({
  onClose,
  detail,
  yearId,
  years,
  structure,
  enrollmentIds,
  onDone,
}: {
  onClose: () => void
  detail: ClassDetailData
  yearId: string
  years: AcademicYearOption[]
  structure: PromotionStructure
  enrollmentIds: string[]
  onDone: () => void
}) {
  const router = useRouter()
  const { academicClass } = detail
  const fromYear = years.find((y) => y.id === yearId)
  // The next year after this one (years are sorted newest first).
  const nextYear = [...years].reverse().find((y) => fromYear && y.startDate > fromYear.startDate && y.status !== "ARCHIVED")
  const siblings = structure.classes.filter(
    (c) =>
      c.educationLevelId === academicClass.educationLevelId &&
      c.programId === academicClass.programId &&
      c.isActive &&
      !c.archivedAt
  )
  const nextClass = siblings
    .filter((c) => c.sequence > academicClass.sequence)
    .sort((a, b) => a.sequence - b.sequence)[0]

  const [error, setError] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<{ rows: PromotionRow[]; toClass: string | null; toYear: string | null } | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const form = useForm<z.input<typeof promotionSchema>, unknown, z.output<typeof promotionSchema>>({
    resolver: zodResolver(promotionSchema),
    defaultValues: {
      fromYearId: yearId,
      classId: academicClass.id,
      enrollmentIds,
      outcome: "PROMOTED",
      endedOn: today(),
      toYearId: nextYear?.id ?? "",
      toClassId: nextClass?.id ?? "",
      sectionMode: "same",
      toSectionId: "",
      enrollmentDate: "",
      reason: "",
    },
  })
  const outcome = useWatch({ control: form.control, name: "outcome" })
  const toClassId = useWatch({ control: form.control, name: "toClassId" })
  const sectionMode = useWatch({ control: form.control, name: "sectionMode" })
  const destinationId = outcome === "DETAINED" ? academicClass.id : toClassId
  const destinationSections = structure.sections.filter((s) => s.classId === destinationId && s.isActive && !s.archivedAt)
  const classOptions = structure.classes
    .filter((c) => c.isActive && !c.archivedAt && (outcome !== "PROMOTED" || c.id !== academicClass.id))
    .map((c) => ({ value: c.id, label: c.name + (c.programId === academicClass.programId && c.educationLevelId === academicClass.educationLevelId ? "" : " (other level/program)") }))

  const runPreview = form.handleSubmit(async (values) => {
    setError(null)
    const result = await previewPromotionAction(values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    setPreview(result.data)
  })

  async function confirm() {
    setConfirming(true)
    const result = await promoteStudentsAction(form.getValues())
    setConfirming(false)
    if (!result.ok) {
      setError(result.error)
      setPreview(null)
      return
    }
    const { succeeded, failed } = result.data
    bulkToast(`${plural(succeeded, "student")} updated`, failed, succeeded)
    onDone()
    onClose()
    router.refresh()
  }

  const ready = preview?.rows.filter((r) => r.problems.length === 0).length ?? 0

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Promote or progress ${plural(enrollmentIds.length, "student")}`}
      description={`From ${academicClass.name}${fromYear ? `, ${fromYear.name}` : ""}. Current placements are closed and kept in each student's history.`}
      pending={form.formState.isSubmitting || confirming}
      error={error}
      onSubmit={preview ? (e) => (e.preventDefault(), void confirm()) : runPreview}
      submitLabel={preview ? `Confirm for ${plural(ready, "student")}` : "Preview"}
      wide
    >
      {!preview ? (
        <>
          <SelectField control={form.control} name="outcome" label="Outcome" options={OUTCOME_OPTIONS} />
          {outcome !== "COMPLETED" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                control={form.control}
                name="toYearId"
                label="New academic year"
                required
                placeholder="Choose a year"
                options={years
                  .filter((y) => y.status !== "ARCHIVED")
                  .map((y) => ({ value: y.id, label: `${y.name}${y.isCurrent ? " (current)" : ""}` }))}
              />
              {outcome === "DETAINED" ? (
                <div className="grid content-start gap-1.5">
                  <Label>New class</Label>
                  <p className="py-1.5 text-sm">{academicClass.name} (same class)</p>
                </div>
              ) : (
                <SelectField
                  control={form.control}
                  name="toClassId"
                  label="New class"
                  required
                  placeholder="Choose a class"
                  options={classOptions}
                  onValueChange={() => form.setValue("toSectionId", "")}
                />
              )}
            </div>
          )}
          {outcome !== "COMPLETED" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                control={form.control}
                name="sectionMode"
                label="Section in the new class"
                options={[
                  { value: "same", label: "Same section name (A → A)" },
                  { value: "pick", label: "One section for everyone" },
                  { value: "none", label: "No section (place later)" },
                ]}
              />
              {sectionMode === "pick" && (
                <SelectField
                  control={form.control}
                  name="toSectionId"
                  label="Section"
                  required
                  placeholder={destinationSections.length ? "Choose a section" : "The class has no sections"}
                  options={destinationSections.map((s) => ({ value: s.id, label: `Section ${s.name}` }))}
                />
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="endedOn" label="Current placement ends on" type="date" required />
            {outcome !== "COMPLETED" && (
              <TextField
                control={form.control}
                name="enrollmentDate"
                label="New placement starts on"
                type="date"
                description="Default: the start of the new academic year."
              />
            )}
          </div>
          <TextField control={form.control} name="reason" label="Note" placeholder="e.g. Final exam 2082 results" />
        </>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm">
            {preview.toClass ? (
              <>
                To <strong>{preview.toClass}</strong>, {preview.toYear}.{" "}
              </>
            ) : null}
            <strong>{ready}</strong> ready, <strong>{preview.rows.length - ready}</strong> will be skipped.
          </p>
          {preview.rows.length - ready > 0 && (
            <FormAlert tone="error">Students with problems are skipped; nothing about them changes.</FormAlert>
          )}
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-3">Student</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To section</TableHead>
                  <TableHead className="pr-3">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((r) => (
                  <TableRow key={r.enrollmentId}>
                    <TableCell className="pl-3">
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">{r.admissionNumber}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.fromSection ? `Sec. ${r.fromSection}` : "—"}
                      {r.rollNumber ? ` · roll ${r.rollNumber}` : ""}
                    </TableCell>
                    <TableCell className="text-xs">{r.toSection ? `Sec. ${r.toSection}` : "—"}</TableCell>
                    <TableCell className="pr-3 text-xs">
                      {r.problems.length ? (
                        <span className="text-destructive">{r.problems.join(" ")}</span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400">Ready</span>
                      )}
                      {r.warnings.length > 0 && (
                        <span className="block text-amber-700 dark:text-amber-400">{r.warnings.join(" ")}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button type="button" variant="ghost" className="justify-self-start" onClick={() => setPreview(null)} disabled={confirming}>
            {confirming && <Spinner />}
            Back to options
          </Button>
        </div>
      )}
    </FormDialog>
  )
}
