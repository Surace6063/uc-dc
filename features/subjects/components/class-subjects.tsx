"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  CopyIcon,
  GroupIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserPlusIcon,
  XIcon,
} from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { applyServerErrors, SelectField, TextField } from "@/components/shared/form-fields"
import { useCan } from "@/components/shared/session-provider"
import { Pill, tone } from "@/components/shared/status-pill"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import {
  addOfferingsAction,
  assignOfferingTeacherAction,
  copyOfferingsAction,
  deleteElectiveGroupAction,
  endTeachingAction,
  removeOfferingAction,
  saveElectiveGroupAction,
  updateOfferingAction,
} from "@/features/subjects/actions"
import { formatCredits, REQUIREMENT_LABELS, requirementOptions } from "@/features/subjects/constants"
import { electiveGroupSchema, offeringSchema, offeringTeacherSchema } from "@/features/subjects/schemas"
import { teacherName } from "@/features/teachers/constants"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { EducationStructure } from "@/services/academics/structure-service"
import type { AcademicYearOption } from "@/services/classes/class-service"
import type { ClassSubjects as Data } from "@/services/subjects/offering-service"

type Offering = Data["offerings"][number]
type Teachers = { id: string; firstName: string; middleName: string | null; lastName: string; employeeId: string }[]
type Workload = Record<string, { periods: number; assignments: number }>

const today = () => new Date().toISOString().slice(0, 10)

// ------------------------------------------------------------------ picker

export function ClassPicker({
  structure,
  years,
  yearId,
  classId,
  counts,
}: {
  structure: Pick<EducationStructure, "levels" | "programs" | "classes">
  years: AcademicYearOption[]
  yearId: string | null
  classId: string | null
  counts: Record<string, { offerings: number; withoutTeacher: number }>
}) {
  const { setParams } = useUrlFilters({ year: [] })
  const [levelId, setLevelId] = React.useState(
    () => structure.classes.find((c) => c.id === classId)?.educationLevelId ?? ""
  )
  const classes = structure.classes.filter((c) => !c.archivedAt && (!levelId || c.educationLevelId === levelId))
  const programCode = (id: string | null) => structure.programs.find((p) => p.id === id)?.code

  return (
    <Card className="gap-4 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cs-year">1. Academic year</Label>
          <NativeSelect id="cs-year" value={yearId ?? ""} onChange={(e) => setParams({ year: e.target.value })} className="w-full">
            {years.map((y) => (
              <NativeSelectOption key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? " (current)" : ""}
                {y.status === "COMPLETED" || y.status === "ARCHIVED" ? ` (${y.status.toLowerCase()})` : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cs-level">2. Level</Label>
          <NativeSelect id="cs-level" value={levelId} onChange={(e) => setLevelId(e.target.value)} className="w-full">
            <NativeSelectOption value="">All levels</NativeSelectOption>
            {structure.levels.map((l) => (
              <NativeSelectOption key={l.id} value={l.id}>
                {l.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cs-class">3. Class / cohort</Label>
          <NativeSelect id="cs-class" value={classId ?? ""} onChange={(e) => setParams({ class: e.target.value })} className="w-full">
            <NativeSelectOption value="">Choose a class</NativeSelectOption>
            {classes.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
                {programCode(c.programId) ? ` (${programCode(c.programId)})` : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      {!classId && classes.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {classes.map((c) => {
            const n = counts[c.id]
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setParams({ class: c.id })}
                className="rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
              >
                <p className="font-medium">
                  {c.name}
                  {programCode(c.programId) ? <span className="ml-1 text-xs text-muted-foreground">{programCode(c.programId)}</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {n?.offerings ? `${n.offerings} subjects` : "No subjects yet"}
                  {n?.withoutTeacher ? <span className="text-amber-700 dark:text-amber-400"> · {n.withoutTeacher} without teacher</span> : null}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- the class

export function ClassSubjects({
  data,
  year,
  years,
  teachers,
  workload,
  canAssign,
}: {
  data: Data
  year: AcademicYearOption
  years: AcademicYearOption[]
  teachers: Teachers | null
  workload: Workload
  canAssign: boolean
}) {
  const router = useRouter()
  const { academicClass, offerings, groups, assignments } = data
  const writable = year.status !== "COMPLETED" && year.status !== "ARCHIVED" && !academicClass.archivedAt
  const canOffer = useCan("subjects.offerings.manage") && writable
  const canTeach = canAssign && writable && !!teachers
  const [dialog, setDialog] = React.useState<
    | { kind: "add" | "copy" | "groups" }
    | { kind: "edit" | "remove"; offering: Offering }
    | { kind: "teacher"; offering: Offering }
    | null
  >(null)
  const [ending, setEnding] = React.useState<{ id: string; title: string } | null>(null)

  const sectionsOf = (o: Offering) =>
    o.sections.length ? academicClass.sections.filter((s) => o.sections.some((x) => x.sectionId === s.id)) : academicClass.sections
  const teachersOf = (o: Offering) => assignments.filter((a) => a.subjectId === o.subject.id)
  const active = offerings.filter((o) => o.status === "ACTIVE")
  const credits = (o: Offering) => o.creditHours ?? o.subject.creditHours
  const periods = (o: Offering) => o.weeklyPeriods ?? o.subject.weeklyPeriods

  const totals = {
    compulsoryCredits: active.filter((o) => o.requirement === "COMPULSORY").reduce((n, o) => n + (credits(o) ?? 0), 0),
    compulsoryPeriods: active.filter((o) => o.requirement === "COMPULSORY").reduce((n, o) => n + (periods(o) ?? 0), 0),
    withoutTeacher: active.filter((o) => teachersOf(o).length === 0).length,
  }

  async function confirmEnd() {
    if (!ending) return
    const result = await endTeachingAction(ending.id, { endDate: today(), endReason: "Changed from class subjects" })
    if (!result.ok) {
      toast.add({ title: "Couldn't end the assignment", description: result.error, type: "error" })
      return false
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      {!writable && (
        <p className={`rounded-lg px-3 py-2 text-sm ${tone.muted}`}>
          {academicClass.archivedAt
            ? "This class is archived."
            : `${year.name} is ${year.status.toLowerCase()}; its subjects are kept as history and can't change.`}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="gap-1 p-4">
          <p className="text-sm text-muted-foreground">Subjects</p>
          <p className="text-2xl font-semibold tabular-nums">{active.length}</p>
          <p className="text-xs text-muted-foreground">
            {(["COMPULSORY", "ELECTIVE", "OPTIONAL", "ADDITIONAL"] as const)
              .map((r) => [r, active.filter((o) => o.requirement === r).length] as const)
              .filter(([, n]) => n)
              .map(([r, n]) => `${n} ${REQUIREMENT_LABELS[r].toLowerCase()}`)
              .join(" · ") || "None yet"}
          </p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-sm text-muted-foreground">Compulsory load</p>
          <p className="text-2xl font-semibold tabular-nums">{totals.compulsoryPeriods || "—"}</p>
          <p className="text-xs text-muted-foreground">
            periods/week{totals.compulsoryCredits ? ` · ${formatCredits(totals.compulsoryCredits)}` : ""}
          </p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-sm text-muted-foreground">Elective groups</p>
          <p className="text-2xl font-semibold tabular-nums">{groups.length}</p>
          <p className="truncate text-xs text-muted-foreground">
            {groups.map((g) => `${g.name} (choose ${g.minChoices === g.maxChoices ? g.minChoices : `${g.minChoices}–${g.maxChoices}`})`).join(", ") || "None"}
          </p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-sm text-muted-foreground">Without a teacher</p>
          <p className={`text-2xl font-semibold tabular-nums ${totals.withoutTeacher ? "text-amber-700 dark:text-amber-400" : ""}`}>
            {totals.withoutTeacher}
          </p>
          <p className="text-xs text-muted-foreground">of {active.length} subjects</p>
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">
              Subjects of {academicClass.name} · {year.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {academicClass.sections.length
                ? `Sections: ${academicClass.sections.map((s) => s.name).join(", ")}. A subject is taught in every section unless limited.`
                : "This class has no sections."}
            </p>
          </div>
          {canOffer && (
            <div className="flex flex-wrap gap-2">
              {data.copyFrom.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "copy" })}>
                  <CopyIcon data-icon="inline-start" />
                  Copy from year
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "groups" })}>
                <GroupIcon data-icon="inline-start" />
                Elective groups
              </Button>
              <Button size="sm" onClick={() => setDialog({ kind: "add" })} disabled={data.available.length === 0}>
                <PlusIcon data-icon="inline-start" />
                Add subjects
              </Button>
            </div>
          )}
        </div>
        {offerings.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyTitle>No subjects for this class yet</EmptyTitle>
              <EmptyDescription>
                {canOffer
                  ? data.copyFrom.length
                    ? "Add subjects, or copy last year's list and adjust it."
                    : "Add the subjects this class studies this year."
                  : "Nothing has been set up for this year."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Credits · periods</TableHead>
                  <TableHead>Curriculum</TableHead>
                  <TableHead>Teachers by section</TableHead>
                  {(canOffer || canTeach) && <TableHead className="w-12 pr-4" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {offerings.map((o) => {
                  const taught = teachersOf(o)
                  const units = academicClass.sections.length ? sectionsOf(o) : []
                  return (
                    <TableRow key={o.id} className={o.status !== "ACTIVE" ? "opacity-60" : undefined}>
                      <TableCell className="pl-4 align-top">
                        <Link href={`/dashboard/subjects/${o.subject.id}`} className="font-medium hover:underline">
                          {o.subject.name}
                        </Link>
                        <span className="ml-1.5 font-mono text-xs text-muted-foreground">{o.code ?? o.subject.code}</span>
                        {o.status !== "ACTIVE" && <Pill className={`ml-2 ${tone.muted}`}>Discontinued</Pill>}
                      </TableCell>
                      <TableCell className="align-top">
                        {REQUIREMENT_LABELS[o.requirement]}
                        {o.electiveGroupId && (
                          <span className="block text-xs text-muted-foreground">{groups.find((g) => g.id === o.electiveGroupId)?.name}</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-sm whitespace-nowrap">
                        {[formatCredits(credits(o)), periods(o) ? `${periods(o)}/wk` : null].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        {o.curriculum ? (
                          <>
                            {o.curriculum.name} {o.curriculum.version}
                            {o.curriculum.status === "RETIRED" && <span className="block text-xs text-muted-foreground">retired version</span>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-1">
                          {(units.length ? units : [null]).map((s) => {
                            const here = taught.filter((a) => (s ? a.sectionId === s.id || a.sectionId === null : true))
                            return (
                              <div key={s?.id ?? "class"} className="flex flex-wrap items-center gap-1 text-sm">
                                {s && <span className="w-6 shrink-0 text-xs text-muted-foreground">{s.name}</span>}
                                {here.length === 0 ? (
                                  <span className="text-xs text-amber-700 dark:text-amber-400">No teacher</span>
                                ) : (
                                  here.map((a) => (
                                    <span key={a.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs">
                                      {teacherName(a.teacher)}
                                      {a.sectionId === null && units.length > 1 && <span className="text-muted-foreground">(all)</span>}
                                      {a.role === "CO_TEACHER" && <span className="text-muted-foreground">(co)</span>}
                                      {a.weeklyPeriods ? <span className="text-muted-foreground">{a.weeklyPeriods}/wk</span> : null}
                                      {canTeach && (
                                        <button
                                          type="button"
                                          aria-label={`End ${teacherName(a.teacher)}'s assignment`}
                                          className="rounded hover:bg-foreground/10"
                                          onClick={() => setEnding({ id: a.id, title: `End ${teacherName(a.teacher)}'s ${o.subject.name} assignment?` })}
                                        >
                                          <XIcon className="size-3" />
                                        </button>
                                      )}
                                    </span>
                                  ))
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </TableCell>
                      {(canOffer || canTeach) && (
                        <TableCell className="pr-4 text-right align-top">
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${o.subject.name}`} />}>
                              <MoreHorizontalIcon />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {canTeach && o.status === "ACTIVE" && (
                                <DropdownMenuItem onClick={() => setDialog({ kind: "teacher", offering: o })}>
                                  <UserPlusIcon />
                                  Assign teacher
                                </DropdownMenuItem>
                              )}
                              {canOffer && (
                                <DropdownMenuItem onClick={() => setDialog({ kind: "edit", offering: o })}>
                                  <PencilIcon />
                                  Edit for this class
                                </DropdownMenuItem>
                              )}
                              {canOffer && o.status === "ACTIVE" && (
                                <DropdownMenuItem variant="destructive" onClick={() => setDialog({ kind: "remove", offering: o })}>
                                  <Trash2Icon />
                                  Remove
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {dialog?.kind === "add" && <AddSubjectsDialog data={data} yearId={year.id} onClose={() => setDialog(null)} />}
      {dialog?.kind === "copy" && <CopyDialog data={data} years={years} year={year} onClose={() => setDialog(null)} />}
      {dialog?.kind === "groups" && <GroupsDialog data={data} yearId={year.id} onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <OfferingDialog data={data} offering={dialog.offering} onClose={() => setDialog(null)} />}
      {dialog?.kind === "teacher" && teachers && (
        <TeacherDialog
          offering={dialog.offering}
          sections={sectionsOf(dialog.offering)}
          hasSections={academicClass.sections.length > 0}
          teachers={teachers}
          workload={workload}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={dialog?.kind === "remove"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.kind === "remove" ? `Remove ${dialog.offering.subject.name} from ${academicClass.name}?` : ""}
        description="If teachers were ever assigned, the subject is discontinued for this class (and their active assignments end) instead of deleted, so the history stays."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (dialog?.kind !== "remove") return
          const result = await removeOfferingAction(dialog.offering.id)
          if (!result.ok) {
            toast.add({ title: "Couldn't remove", description: result.error, type: "error" })
            return false
          }
          toast.add({ title: result.data.removed ? "Subject removed" : "Subject discontinued for this class", type: "success" })
          router.refresh()
        }}
      />
      <ConfirmDialog
        open={ending !== null}
        onOpenChange={(open) => !open && setEnding(null)}
        title={ending?.title ?? ""}
        description="The assignment ends today and stays in the teacher's history."
        confirmLabel="End assignment"
        destructive
        onConfirm={confirmEnd}
      />
    </div>
  )
}

// ------------------------------------------------------------- add subjects

function AddSubjectsDialog({ data, yearId, onClose }: { data: Data; yearId: string; onClose: () => void }) {
  const router = useRouter()
  const [chosen, setChosen] = React.useState<Set<string>>(new Set())
  const [query, setQuery] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const q = query.trim().toLowerCase()
  const list = data.available.filter((s) => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const result = await addOfferingsAction({ academicYearId: yearId, classId: data.academicClass.id, subjectIds: [...chosen] })
    setPending(false)
    if (!result.ok) {
      setError(Object.values(result.fieldErrors ?? {}).flat()[0] ?? result.error)
      return
    }
    toast.add({ title: `${result.data.created} subject${result.data.created === 1 ? "" : "s"} added`, type: "success" })
    onClose()
    router.refresh()
  }

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Add subjects to ${data.academicClass.name}`}
      description="Only subjects for this class's level or program (or for any level) are listed. Each starts with the subject's default type and its active curriculum."
      pending={pending}
      error={error}
      onSubmit={submit}
      submitLabel={chosen.size ? `Add ${chosen.size}` : "Add"}
      wide
    >
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search subjects" aria-label="Search subjects" />
      <div className="max-h-80 overflow-y-auto rounded-lg border">
        {list.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">No more subjects fit this class.</p>
        ) : (
          <ul className="divide-y">
            {list.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                  <Checkbox
                    checked={chosen.has(s.id)}
                    onCheckedChange={() =>
                      setChosen((prev) => {
                        const next = new Set(prev)
                        if (next.has(s.id)) next.delete(s.id)
                        else next.add(s.id)
                        return next
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">{s.code}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[REQUIREMENT_LABELS[s.requirement], s.category?.name, formatCredits(s.creditHours)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="justify-self-start"
        onClick={() => setChosen(new Set(list.filter((s) => s.requirement === "COMPULSORY").map((s) => s.id)))}
      >
        Select all compulsory
      </Button>
    </FormDialog>
  )
}

// -------------------------------------------------------------- copy year

function CopyDialog({ data, years, year, onClose }: { data: Data; years: AcademicYearOption[]; year: AcademicYearOption; onClose: () => void }) {
  const router = useRouter()
  const options = data.copyFrom
    .map((c) => ({ ...c, year: years.find((y) => y.id === c.yearId) }))
    .filter((c) => c.year)
    .sort((a, b) => (b.year!.startDate > a.year!.startDate ? 1 : -1))
  const [from, setFrom] = React.useState(options[0]?.yearId ?? "")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const result = await copyOfferingsAction({ fromYearId: from, toYearId: year.id, classId: data.academicClass.id })
    setPending(false)
    if (!result.ok) {
      setError(Object.values(result.fieldErrors ?? {}).flat()[0] ?? result.error)
      return
    }
    toast.add({
      title: `${result.data.created} subjects copied`,
      description: result.data.skipped ? `${result.data.skipped} skipped (already here, archived or inactive).` : undefined,
      type: "success",
    })
    onClose()
    router.refresh()
  }

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Copy subjects into ${year.name}`}
      description="Copies type, credits, periods, sections and elective groups. Teachers aren't copied. The other year isn't changed."
      pending={pending}
      error={error}
      onSubmit={submit}
      submitLabel="Copy"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="copy-from">Copy from</Label>
        <NativeSelect id="copy-from" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full">
          {options.map((o) => (
            <NativeSelectOption key={o.yearId} value={o.yearId}>
              {o.year!.name} ({o.count} subjects)
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </FormDialog>
  )
}

// ---------------------------------------------------------- elective groups

function GroupsDialog({ data, yearId, onClose }: { data: Data; yearId: string; onClose: () => void }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof electiveGroupSchema>, unknown, z.output<typeof electiveGroupSchema>>({
    resolver: zodResolver(electiveGroupSchema),
    defaultValues: { academicYearId: yearId, classId: data.academicClass.id, name: "", description: "", minChoices: 1, maxChoices: 1 },
  })

  const submit = form.handleSubmit(async (values) => {
    const result = await saveElectiveGroupAction(null, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    form.reset({ ...values, name: "", description: "" })
    router.refresh()
  })

  async function remove(id: string) {
    const result = await deleteElectiveGroupAction(id)
    if (!result.ok) toast.add({ title: "Couldn't delete", description: result.error, type: "error" })
    router.refresh()
  }

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Elective groups"
      description="Groups such as “Optional I” from which students choose. Put elective subjects in a group via “Edit for this class”."
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
      submitLabel="Add group"
    >
      {data.groups.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {data.groups.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1">
                <span className="font-medium">{g.name}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  choose {g.minChoices === g.maxChoices ? g.minChoices : `${g.minChoices}–${g.maxChoices}`} ·{" "}
                  {data.offerings.filter((o) => o.electiveGroupId === g.id).length} subjects
                </span>
              </span>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${g.name}`} onClick={() => void remove(g.id)}>
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_6rem_6rem]">
        <TextField control={form.control} name="name" label="New group" placeholder="Optional I" />
        <TextField control={form.control} name="minChoices" label="Min" type="number" min={0} />
        <TextField control={form.control} name="maxChoices" label="Max" type="number" min={1} />
      </div>
    </FormDialog>
  )
}

// --------------------------------------------------------- edit offering

function OfferingDialog({ data, offering, onClose }: { data: Data; offering: Offering; onClose: () => void }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof offeringSchema>, unknown, z.output<typeof offeringSchema>>({
    resolver: zodResolver(offeringSchema),
    defaultValues: {
      requirement: offering.requirement,
      creditHours: offering.creditHours ?? "",
      weeklyPeriods: offering.weeklyPeriods ?? "",
      curriculumId: offering.curriculumId ?? "",
      electiveGroupId: offering.electiveGroupId ?? "",
      code: offering.code ?? "",
      notes: offering.notes ?? "",
      status: offering.status,
      sectionIds: offering.sections.map((s) => s.sectionId),
    },
  })
  const requirement = useWatch({ control: form.control, name: "requirement" })
  const sectionIds = useWatch({ control: form.control, name: "sectionIds" }) ?? []
  const curricula = data.curricula.filter((c) => c.subjectId === offering.subject.id)

  const submit = form.handleSubmit(async (values) => {
    const result = await updateOfferingAction(offering.id, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: "Saved", type: "success" })
    onClose()
    router.refresh()
  })

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${offering.subject.name} in ${data.academicClass.name}`}
      description="Applies to this class and year only. Leave credits and periods empty to use the subject's defaults."
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          control={form.control}
          name="requirement"
          label="Type"
          options={requirementOptions}
          onValueChange={(v) => v === "COMPULSORY" && form.setValue("electiveGroupId", "")}
        />
        <TextField
          control={form.control}
          name="creditHours"
          label="Credit hours"
          type="number"
          step="0.25"
          min={0}
          placeholder={offering.subject.creditHours ? String(offering.subject.creditHours) : "—"}
        />
        <TextField
          control={form.control}
          name="weeklyPeriods"
          label="Periods / week"
          type="number"
          min={0}
          placeholder={offering.subject.weeklyPeriods ? String(offering.subject.weeklyPeriods) : "—"}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="curriculumId"
          label="Curriculum"
          placeholder={curricula.length ? "None" : "No active curriculum"}
          options={curricula.map((c) => ({ value: c.id, label: `${c.name} ${c.version}${c.status === "RETIRED" ? " (retired)" : ""}` }))}
        />
        {requirement !== "COMPULSORY" && (
          <SelectField
            control={form.control}
            name="electiveGroupId"
            label="Elective group"
            placeholder={data.groups.length ? "None" : "No groups yet"}
            options={data.groups.map((g) => ({ value: g.id, label: g.name }))}
          />
        )}
      </div>
      {data.academicClass.sections.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Sections</legend>
          <p className="text-xs text-muted-foreground">Leave all unticked if every section takes this subject.</p>
          <div className="flex flex-wrap gap-3">
            {data.academicClass.sections.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={sectionIds.includes(s.id)}
                  onCheckedChange={(checked) =>
                    form.setValue(
                      "sectionIds",
                      checked ? [...sectionIds, s.id] : sectionIds.filter((id) => id !== s.id),
                      { shouldDirty: true }
                    )
                  }
                />
                Section {s.name}
              </label>
            ))}
          </div>
          {form.formState.errors.sectionIds?.message && (
            <p className="text-xs text-destructive">{form.formState.errors.sectionIds.message}</p>
          )}
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <TextField control={form.control} name="code" label="Offering code" placeholder={offering.subject.code} />
        <TextField control={form.control} name="notes" label="Notes" />
      </div>
      <SelectField
        control={form.control}
        name="status"
        label="Status"
        options={[
          { value: "ACTIVE", label: "Active" },
          { value: "DISCONTINUED", label: "Discontinued (ends its teaching assignments)" },
        ]}
      />
    </FormDialog>
  )
}

// ---------------------------------------------------------- assign teacher

function TeacherDialog({
  offering,
  sections,
  hasSections,
  teachers,
  workload,
  onClose,
}: {
  offering: Offering
  sections: { id: string; name: string }[]
  hasSections: boolean
  teachers: Teachers
  workload: Workload
  onClose: () => void
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof offeringTeacherSchema>, unknown, z.output<typeof offeringTeacherSchema>>({
    resolver: zodResolver(offeringTeacherSchema),
    defaultValues: {
      offeringId: offering.id,
      sectionId: sections.length === 1 ? sections[0].id : "",
      teacherId: "",
      role: "SUBJECT_TEACHER",
      weeklyPeriods: offering.weeklyPeriods ?? offering.subject.weeklyPeriods ?? "",
      startDate: today(),
    },
  })

  const submit = form.handleSubmit(async (values) => {
    const result = await assignOfferingTeacherAction(values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: "Teacher assigned", type: "success" })
    onClose()
    router.refresh()
  })

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Assign a teacher for ${offering.subject.name}`}
      description="Recorded as a teaching assignment for this year; it also appears on the teacher's profile. Numbers show each teacher's current weekly periods."
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
    >
      <SelectField
        control={form.control}
        name="teacherId"
        label="Teacher"
        required
        placeholder="Choose a teacher"
        options={teachers.map((t) => {
          const load = workload[t.id]
          return {
            value: t.id,
            label: `${teacherName(t)} (${t.employeeId})${load ? ` · ${load.periods} periods/wk` : ""}`,
          }
        })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {hasSections && (
          <SelectField
            control={form.control}
            name="sectionId"
            label="Section"
            placeholder={offering.sections.length ? "All its sections" : "Whole class"}
            options={sections.map((s) => ({ value: s.id, label: `Section ${s.name}` }))}
          />
        )}
        <SelectField
          control={form.control}
          name="role"
          label="Role"
          options={[
            { value: "SUBJECT_TEACHER", label: "Subject teacher" },
            { value: "CO_TEACHER", label: "Co-teacher / assistant" },
          ]}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="weeklyPeriods" label="Periods / week" type="number" min={0} max={60} />
        <TextField control={form.control} name="startDate" label="Start date" type="date" required />
      </div>
    </FormDialog>
  )
}
