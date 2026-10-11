"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { FileTextIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { applyServerErrors, SelectField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { useCan } from "@/components/shared/session-provider"
import { Pill, tone } from "@/components/shared/status-pill"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { MEDIUM_LABELS } from "@/features/classes/constants"
import { addPrerequisiteAction, createCurriculumAction, removePrerequisiteAction } from "@/features/subjects/actions"
import { SubjectStatus } from "@/features/subjects/components/subjects-list"
import {
  CURRICULUM_STATUS_LABELS,
  formatCredits,
  OFFERING_STATUS_LABELS,
  PREREQUISITE_KIND_LABELS,
  prerequisiteKindOptions,
  REQUIREMENT_LABELS,
} from "@/features/subjects/constants"
import { curriculumSchema, prerequisiteSchema } from "@/features/subjects/schemas"
import { teacherName } from "@/features/teachers/constants"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { CurriculumStatus } from "@/lib/generated/prisma/enums"
import type { EducationStructure } from "@/services/academics/structure-service"
import type { SubjectDetail as Detail, SubjectOption } from "@/services/subjects/subject-service"

const TABS = ["overview", "curriculum", "offerings", "teachers", "prerequisites", "history"] as const

const formatDate = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"

export function CurriculumStatusPill({ status }: { status: CurriculumStatus }) {
  const cls = status === "ACTIVE" ? tone.green : status === "DRAFT" ? tone.blue : tone.muted
  return <Pill className={cls}>{CURRICULUM_STATUS_LABELS[status]}</Pill>
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

export function SubjectDetail({
  detail,
  subjects,
  structure,
}: {
  detail: Detail
  subjects: SubjectOption[]
  structure: Pick<EducationStructure, "levels" | "programs">
}) {
  const { searchParams, setParams } = useUrlFilters()
  const requested = searchParams.get("tab") ?? ""
  const tab = (TABS as readonly string[]).includes(requested) ? requested : "overview"
  const { subject, curricula, offerings, assignments, prerequisites, requiredFor, activity } = detail
  const activeOfferings = offerings.filter((o) => o.status === "ACTIVE" && o.academicYear.status !== "ARCHIVED" && o.academicYear.status !== "COMPLETED")
  const activeTeachers = assignments.filter((a) => a.status === "ACTIVE")

  return (
    <div className="flex flex-col gap-6">
      {subject.archivedAt && (
        <p className={`rounded-lg px-3 py-2 text-sm ${tone.muted}`}>
          This subject is archived. Its offerings, curricula and teaching history are kept, but it can&apos;t be added to classes.
        </p>
      )}
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "overview" ? null : String(v) })}>
        <div className="overflow-x-auto">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="curriculum">Curriculum ({curricula.length})</TabsTrigger>
            <TabsTrigger value="offerings">Offerings ({offerings.length})</TabsTrigger>
            <TabsTrigger value="teachers">Teachers ({activeTeachers.length})</TabsTrigger>
            <TabsTrigger value="prerequisites">Prerequisites ({prerequisites.length})</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-5 flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="gap-1 p-4">
              <p className="text-sm text-muted-foreground">Running class offerings</p>
              <p className="text-2xl font-semibold tabular-nums">{activeOfferings.length}</p>
              <p className="truncate text-xs text-muted-foreground">
                {activeOfferings.map((o) => o.class.name).join(", ") || "Not offered in a running year"}
              </p>
            </Card>
            <Card className="gap-1 p-4">
              <p className="text-sm text-muted-foreground">Teachers now</p>
              <p className="text-2xl font-semibold tabular-nums">{new Set(activeTeachers.map((a) => a.teacher.id)).size}</p>
              <p className="text-xs text-muted-foreground">{activeTeachers.length} active assignments</p>
            </Card>
            <Card className="gap-1 p-4">
              <p className="text-sm text-muted-foreground">Active curriculum</p>
              <p className="truncate text-lg font-semibold">
                {curricula.filter((c) => c.status === "ACTIVE").map((c) => `${c.name} ${c.version}`).join(", ") || "None"}
              </p>
              <p className="text-xs text-muted-foreground">{curricula.length} version{curricula.length === 1 ? "" : "s"} in total</p>
            </Card>
            <Card className="gap-1 p-4">
              <p className="text-sm text-muted-foreground">Teaching load</p>
              <p className="text-lg font-semibold">
                {[formatCredits(subject.creditHours), subject.weeklyPeriods ? `${subject.weeklyPeriods} periods/wk` : null]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {[subject.theoryHours ? `${subject.theoryHours} h theory` : null, subject.practicalHours ? `${subject.practicalHours} h practical` : null]
                  .filter(Boolean)
                  .join(" · ") || "No hours set"}
              </p>
            </Card>
          </div>
          <Card className="gap-4 p-5">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Details</h2>
              <SubjectStatus isActive={subject.isActive} archivedAt={subject.archivedAt} />
            </div>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Code" value={<span className="font-mono">{subject.code}</span>} />
              <Field label="Nepali name" value={subject.localName} />
              <Field label="Category" value={subject.category?.name} />
              <Field label="Default type" value={REQUIREMENT_LABELS[subject.requirement]} />
              <Field label="Education level" value={subject.educationLevel?.name ?? "Any level"} />
              <Field label="Program" value={subject.program ? `${subject.program.name} (${subject.program.code})` : null} />
              <Field label="Language of instruction" value={subject.medium ? MEDIUM_LABELS[subject.medium] : null} />
              <Field label="Last updated" value={formatDate(subject.updatedAt)} />
            </dl>
            {subject.description && <p className="text-sm whitespace-pre-line">{subject.description}</p>}
          </Card>
        </TabsContent>

        <TabsContent value="curriculum" className="mt-5">
          <CurriculaPanel detail={detail} structure={structure} />
        </TabsContent>

        <TabsContent value="offerings" className="mt-5">
          <OfferingsPanel offerings={offerings} />
        </TabsContent>

        <TabsContent value="teachers" className="mt-5">
          <TeachersPanel assignments={assignments} />
        </TabsContent>

        <TabsContent value="prerequisites" className="mt-5">
          <PrerequisitesPanel subjectId={subject.id} prerequisites={prerequisites} requiredFor={requiredFor} subjects={subjects} archived={!!subject.archivedAt} />
        </TabsContent>

        <TabsContent value="history" className="mt-5">
          <Card className="gap-0 overflow-hidden p-0">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">Change history</h2>
              <p className="text-xs text-muted-foreground">Edits, curriculum versions, offerings and prerequisites, newest first.</p>
            </div>
            {activity.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No changes recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {activity.map((a) => (
                  <li key={a.id} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:justify-between">
                    <span className="text-sm">{a.summary}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {a.actor?.name ?? a.actor?.email ?? "System"} ·{" "}
                      {new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------- curricula

function CurriculaPanel({ detail, structure }: { detail: Detail; structure: Pick<EducationStructure, "levels" | "programs"> }) {
  const canManage = useCan("subjects.manage") && !detail.subject.archivedAt
  const [open, setOpen] = React.useState(false)
  const { subject, curricula } = detail

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="font-semibold">Curricula and syllabus versions</h2>
          <p className="text-xs text-muted-foreground">
            What should be taught. Only drafts are edited; revising an active syllabus creates a new version and keeps the old one.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            New curriculum
          </Button>
        )}
      </div>
      {curricula.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No curriculum yet. Curricula are optional.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Curriculum</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Used by</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {curricula.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-4">
                    <Link href={`/dashboard/subjects/${subject.id}/curricula/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    {c.documentName && <FileTextIcon className="ml-1.5 inline size-3.5 text-muted-foreground" aria-label="Has a syllabus file" />}
                  </TableCell>
                  <TableCell>{c.version}</TableCell>
                  <TableCell className="text-sm">{[c.educationLevel?.name, c.program?.code].filter(Boolean).join(" · ") || "Any level"}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {c._count.units} units · {c.topics} topics{c.hours ? ` · ${c.hours} h` : ""}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {c.effectiveFrom ? `${formatDate(c.effectiveFrom)}${c.effectiveTo ? ` – ${formatDate(c.effectiveTo)}` : " onwards"}` : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">{c._count.offerings} offerings</TableCell>
                  <TableCell className="pr-4">
                    <CurriculumStatusPill status={c.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {open && <NewCurriculumDialog subjectId={subject.id} subject={subject} structure={structure} onClose={() => setOpen(false)} />}
    </Card>
  )
}

function NewCurriculumDialog({
  subjectId,
  subject,
  structure,
  onClose,
}: {
  subjectId: string
  subject: Detail["subject"]
  structure: Pick<EducationStructure, "levels" | "programs">
  onClose: () => void
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof curriculumSchema>, unknown, z.output<typeof curriculumSchema>>({
    resolver: zodResolver(curriculumSchema),
    defaultValues: {
      name: `${subject.name} curriculum`,
      version: String(new Date().getFullYear() + 57),
      code: "",
      description: "",
      educationLevelId: subject.educationLevelId ?? "",
      programId: subject.programId ?? "",
      effectiveFrom: "",
      effectiveTo: "",
    },
  })
  const levelId = useWatch({ control: form.control, name: "educationLevelId" })

  const submit = form.handleSubmit(async (values) => {
    const result = await createCurriculumAction(subjectId, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: "Draft curriculum created", type: "success" })
    router.push(`/dashboard/subjects/${subjectId}/curricula/${result.data.id}`)
  })

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New curriculum"
      description="Starts as a draft. Add units and topics, then activate it."
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
      submitLabel="Create draft"
      wide
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem_8rem]">
        <TextField control={form.control} name="name" label="Name" required placeholder="CDC Mathematics Grade 8" />
        <TextField control={form.control} name="version" label="Version" required placeholder="2078" description="e.g. year (BS) or v1" />
        <TextField control={form.control} name="code" label="Code" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="educationLevelId"
          label="Education level"
          placeholder="Any level"
          options={structure.levels.map((l) => ({ value: l.id, label: l.name }))}
          onValueChange={() => form.setValue("programId", "")}
        />
        <SelectField
          control={form.control}
          name="programId"
          label="Program"
          placeholder="Any program"
          options={structure.programs.filter((p) => !levelId || p.educationLevelId === levelId).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="effectiveFrom" label="Effective from" type="date" />
        <TextField control={form.control} name="effectiveTo" label="Effective until" type="date" />
      </div>
      <TextAreaField control={form.control} name="description" label="Description" rows={2} />
    </FormDialog>
  )
}

// ---------------------------------------------------------------- offerings

function OfferingsPanel({ offerings }: { offerings: Detail["offerings"] }) {
  if (offerings.length === 0) {
    return (
      <Empty className="rounded-xl border border-dashed py-12">
        <EmptyHeader>
          <EmptyTitle>Not offered to any class yet</EmptyTitle>
          <EmptyDescription>
            Add it to classes for an academic year under{" "}
            <Link href="/dashboard/subjects/class-subjects" className="underline underline-offset-2">
              Class subjects
            </Link>
            .
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">Offerings by academic year</h2>
        <p className="text-xs text-muted-foreground">Each year&apos;s offerings are kept as they were, even after later changes.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">Year</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Credits · periods</TableHead>
              <TableHead>Curriculum</TableHead>
              <TableHead>Sections</TableHead>
              <TableHead className="pr-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offerings.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="pl-4 whitespace-nowrap">
                  {o.academicYear.name}
                  {o.academicYear.isCurrent && <span className="ml-1 text-xs text-muted-foreground">(current)</span>}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/dashboard/subjects/class-subjects?year=${o.academicYear.id}&class=${o.class.id}`}
                    className="font-medium hover:underline"
                  >
                    {o.class.name}
                  </Link>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {o.class.educationLevel.name}
                    {o.class.program ? ` · ${o.class.program.code}` : ""}
                  </span>
                </TableCell>
                <TableCell>
                  {REQUIREMENT_LABELS[o.requirement]}
                  {o.electiveGroup && <span className="block text-xs text-muted-foreground">{o.electiveGroup.name}</span>}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {[formatCredits(o.creditHours), o.weeklyPeriods ? `${o.weeklyPeriods}/wk` : null].filter(Boolean).join(" · ") || "Subject default"}
                </TableCell>
                <TableCell className="text-sm">{o.curriculum ? `${o.curriculum.name} ${o.curriculum.version}` : "—"}</TableCell>
                <TableCell className="text-sm">{o.sections.length ? o.sections.map((s) => s.section.name).join(", ") : "All"}</TableCell>
                <TableCell className="pr-4">
                  <Pill className={o.status === "ACTIVE" ? tone.green : tone.muted}>{OFFERING_STATUS_LABELS[o.status]}</Pill>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- teachers

function TeachersPanel({ assignments }: { assignments: Detail["assignments"] }) {
  if (assignments.length === 0) {
    return (
      <Empty className="rounded-xl border border-dashed py-12">
        <EmptyHeader>
          <EmptyTitle>No teachers assigned</EmptyTitle>
          <EmptyDescription>Assign teachers per class and section under Class subjects.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">Teaching assignments</h2>
        <p className="text-xs text-muted-foreground">Current assignments first; ended ones stay as history.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">Teacher</TableHead>
              <TableHead>Class · section</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Periods/wk</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead className="pr-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.map((a) => (
              <TableRow key={a.id} className={a.status !== "ACTIVE" ? "text-muted-foreground" : undefined}>
                <TableCell className="pl-4">
                  <Link href={`/dashboard/teachers/${a.teacher.id}`} className="font-medium hover:underline">
                    {teacherName(a.teacher)}
                  </Link>
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">{a.teacher.employeeId}</span>
                </TableCell>
                <TableCell>
                  {a.class?.name ?? "—"}
                  {a.section ? ` · ${a.section.name}` : ""}
                </TableCell>
                <TableCell>{a.academicYear.name}</TableCell>
                <TableCell>{a.role === "CO_TEACHER" ? "Co-teacher" : a.role === "SUBJECT_TEACHER" ? "Subject teacher" : a.role.toLowerCase()}</TableCell>
                <TableCell className="tabular-nums">{a.weeklyPeriods ?? "—"}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatDate(a.startDate)}
                  {a.endDate ? ` – ${formatDate(a.endDate)}` : ""}
                </TableCell>
                <TableCell className="pr-4">
                  <Pill className={a.status === "ACTIVE" ? tone.green : tone.muted}>{a.status.toLowerCase()}</Pill>
                  {a.endReason && <span className="block text-xs">{a.endReason}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

// ------------------------------------------------------------ prerequisites

function PrerequisitesPanel({
  subjectId,
  prerequisites,
  requiredFor,
  subjects,
  archived,
}: {
  subjectId: string
  prerequisites: Detail["prerequisites"]
  requiredFor: Detail["requiredFor"]
  subjects: SubjectOption[]
  archived: boolean
}) {
  const router = useRouter()
  const canManage = useCan("subjects.manage") && !archived
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof prerequisiteSchema>, unknown, z.output<typeof prerequisiteSchema>>({
    resolver: zodResolver(prerequisiteSchema),
    defaultValues: { prerequisiteId: "", kind: "REQUIRED", minimumGrade: "", note: "" },
  })

  const submit = form.handleSubmit(async (values) => {
    const result = await addPrerequisiteAction(subjectId, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: "Prerequisite added", type: "success" })
    form.reset()
    setOpen(false)
    router.refresh()
  })

  async function remove(id: string) {
    const result = await removePrerequisiteAction(id)
    if (!result.ok) toast.add({ title: "Couldn't remove", description: result.error, type: "error" })
    else router.refresh()
  }

  const options = subjects.filter((s) => s.id !== subjectId && !prerequisites.some((p) => p.prerequisite.id === s.id))

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Prerequisites</h2>
            <p className="text-xs text-muted-foreground">Optional. Only for institutions that use them.</p>
          </div>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              Add
            </Button>
          )}
        </div>
        {prerequisites.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No prerequisites.</p>
        ) : (
          <ul className="divide-y">
            {prerequisites.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <Link href={`/dashboard/subjects/${p.prerequisite.id}`} className="font-medium hover:underline">
                    {p.prerequisite.name}
                  </Link>
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">{p.prerequisite.code}</span>
                  <span className="block text-xs text-muted-foreground">
                    {PREREQUISITE_KIND_LABELS[p.kind]}
                    {p.minimumGrade ? ` · at least ${p.minimumGrade}` : ""}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                </span>
                {canManage && (
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${p.prerequisite.name}`} onClick={() => void remove(p.id)}>
                    <Trash2Icon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="gap-0 overflow-hidden p-0">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">Required for</h2>
          <p className="text-xs text-muted-foreground">Subjects that list this one as a prerequisite.</p>
        </div>
        {requiredFor.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="divide-y">
            {requiredFor.map((r) => (
              <li key={r.id} className="px-4 py-2.5">
                <Link href={`/dashboard/subjects/${r.subject.id}`} className="font-medium hover:underline">
                  {r.subject.name}
                </Link>
                <span className="ml-1.5 text-xs text-muted-foreground">{PREREQUISITE_KIND_LABELS[r.kind].toLowerCase()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {open && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setOpen(false)}
          title="Add a prerequisite"
          description="Cycles (A needs B, B needs A) are refused."
          pending={form.formState.isSubmitting}
          error={error}
          onSubmit={submit}
          submitLabel="Add"
        >
          <SelectField
            control={form.control}
            name="prerequisiteId"
            label="Subject"
            required
            placeholder="Choose a subject"
            options={options.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField control={form.control} name="kind" label="Kind" options={prerequisiteKindOptions} />
            <TextField control={form.control} name="minimumGrade" label="Minimum grade" placeholder="e.g. C+" />
          </div>
          <TextField control={form.control} name="note" label="Note" />
        </FormDialog>
      )}
    </div>
  )
}
