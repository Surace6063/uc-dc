"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  CopyPlusIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react"
import { useForm } from "react-hook-form"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { applyServerErrors, SelectField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { useCan } from "@/components/shared/session-provider"
import { Pill, tone } from "@/components/shared/status-pill"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import {
  createCurriculumVersionAction,
  deleteCurriculumAction,
  deleteTopicAction,
  deleteUnitAction,
  reorderAction,
  saveTopicAction,
  saveUnitAction,
  setCurriculumStatusAction,
  updateCurriculumAction,
} from "@/features/subjects/actions"
import { CurriculumStatusPill } from "@/features/subjects/components/subject-detail"
import { COMPONENT_LABELS, componentOptions, nextVersionLabel } from "@/features/subjects/constants"
import { curriculumSchema, topicSchema, unitSchema } from "@/features/subjects/schemas"
import type { EducationStructure } from "@/services/academics/structure-service"
import type { CurriculumDetail } from "@/services/subjects/curriculum-service"

type Unit = CurriculumDetail["units"][number]
type Topic = Unit["topics"][number]

const formatDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"

export function CurriculumEditor({
  curriculum,
  structure,
}: {
  curriculum: CurriculumDetail
  structure: Pick<EducationStructure, "levels" | "programs">
}) {
  const router = useRouter()
  const canManage = useCan("subjects.manage") && !curriculum.subject.archivedAt
  const editable = canManage && curriculum.status === "DRAFT"
  const [dialog, setDialog] = React.useState<
    | { kind: "details" | "version" | "activate" | "retire" | "delete" }
    | { kind: "unit"; unit: Unit | null }
    | { kind: "topic"; unit: Unit; topic: Topic | null }
    | null
  >(null)
  const [uploading, setUploading] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement>(null)

  const totals = React.useMemo(() => {
    const byComponent = new Map<string, number>()
    for (const u of curriculum.units) byComponent.set(u.component, (byComponent.get(u.component) ?? 0) + (u.estimatedHours ?? 0))
    return {
      topics: curriculum.units.reduce((n, u) => n + u.topics.length, 0),
      hours: curriculum.units.reduce((n, u) => n + (u.estimatedHours ?? 0), 0),
      byComponent: [...byComponent].filter(([, h]) => h > 0),
    }
  }, [curriculum.units])

  async function move(list: { id: string }[], index: number, delta: number, parent: { curriculumId: string } | { unitId: string }) {
    const ids = list.map((x) => x.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    const result = await reorderAction(parent, ids)
    if (!result.ok) toast.add({ title: "Couldn't reorder", description: result.error, type: "error" })
    router.refresh()
  }

  async function remove(action: () => Promise<{ ok: boolean; error?: string }>) {
    const result = await action()
    if (!result.ok) toast.add({ title: "Couldn't delete", description: result.error, type: "error" })
    router.refresh()
  }

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    const body = new FormData()
    body.set("file", file)
    const response = await fetch(`/api/subjects/curricula/${curriculum.id}/document`, { method: "POST", body })
    setUploading(false)
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      const message = data?.error?.fieldErrors?.file?.[0] ?? data?.error?.message ?? "Upload failed."
      toast.add({ title: "Couldn't upload", description: message, type: "error" })
      return
    }
    toast.add({ title: "Syllabus file uploaded", type: "success" })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      {curriculum.status !== "DRAFT" && (
        <p className={`rounded-lg px-3 py-2 text-sm ${tone.blue}`}>
          This {curriculum.status === "ACTIVE" ? "active" : "retired"} version is read-only so classes that used it keep
          it unchanged. Create a new version to revise the syllabus.
        </p>
      )}

      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Version {curriculum.version}</h2>
            <CurriculumStatusPill status={curriculum.status} />
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "details" })}>
                <PencilIcon data-icon="inline-start" />
                Details
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "version" })}>
                <CopyPlusIcon data-icon="inline-start" />
                New version
              </Button>
              {curriculum.status === "DRAFT" && (
                <Button size="sm" onClick={() => setDialog({ kind: "activate" })}>
                  <CheckCircle2Icon data-icon="inline-start" />
                  Activate
                </Button>
              )}
              {curriculum.status === "ACTIVE" && (
                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "retire" })}>
                  <XCircleIcon data-icon="inline-start" />
                  Retire
                </Button>
              )}
              {curriculum.status === "DRAFT" && curriculum.offerings.length === 0 && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDialog({ kind: "delete" })}>
                  <Trash2Icon data-icon="inline-start" />
                  Delete draft
                </Button>
              )}
            </div>
          )}
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Applies to</dt>
            <dd>{[curriculum.educationLevel?.name, curriculum.program?.code].filter(Boolean).join(" · ") || "Any level"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Effective</dt>
            <dd>
              {curriculum.effectiveFrom
                ? `${formatDate(curriculum.effectiveFrom)}${curriculum.effectiveTo ? ` – ${formatDate(curriculum.effectiveTo)}` : " onwards"}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Content</dt>
            <dd>
              {curriculum.units.length} units · {totals.topics} topics · {totals.hours} h
              {totals.byComponent.length > 1 && (
                <span className="block text-xs text-muted-foreground">
                  {totals.byComponent.map(([c, h]) => `${COMPONENT_LABELS[c as keyof typeof COMPONENT_LABELS]} ${h} h`).join(" · ")}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Versions</dt>
            <dd className="flex flex-wrap gap-x-2">
              {curriculum.previousVersion ? (
                <Link
                  href={`/dashboard/subjects/${curriculum.subject.id}/curricula/${curriculum.previousVersion.id}`}
                  className="underline underline-offset-2"
                >
                  ← {curriculum.previousVersion.version}
                </Link>
              ) : null}
              {curriculum.nextVersions.map((v) => (
                <Link key={v.id} href={`/dashboard/subjects/${curriculum.subject.id}/curricula/${v.id}`} className="underline underline-offset-2">
                  {v.version} →
                </Link>
              ))}
              {!curriculum.previousVersion && curriculum.nextVersions.length === 0 && "First version"}
            </dd>
          </div>
        </dl>
        {curriculum.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{curriculum.description}</p>}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
          <span className="text-muted-foreground">Official syllabus file:</span>
          {curriculum.documentName ? (
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/subjects/curricula/${curriculum.id}/document`} target="_blank" rel="noreferrer" />}>
              <DownloadIcon data-icon="inline-start" />
              {curriculum.documentName}
            </Button>
          ) : (
            <span>None</span>
          )}
          {canManage && (curriculum.status === "DRAFT" || !curriculum.documentName) && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
              <Button size="sm" variant="ghost" disabled={uploading} onClick={() => fileInput.current?.click()}>
                <UploadIcon data-icon="inline-start" />
                {uploading ? "Uploading…" : curriculum.documentName ? "Replace" : "Upload PDF"}
              </Button>
            </>
          )}
        </div>
        {curriculum.offerings.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Used by: {curriculum.offerings.map((o) => `${o.class.name} (${o.academicYear.name})`).join(", ")}
          </p>
        )}
      </Card>

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Units and chapters</h2>
        {editable && (
          <Button size="sm" onClick={() => setDialog({ kind: "unit", unit: null })}>
            <PlusIcon data-icon="inline-start" />
            Add unit
          </Button>
        )}
      </div>

      {curriculum.units.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {editable ? "Add the first unit or chapter of this syllabus." : "No units."}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {curriculum.units.map((unit, index) => (
            <li key={unit.id}>
              <Card className="gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="mr-2 text-muted-foreground tabular-nums">{index + 1}.</span>
                      {unit.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Pill className={unit.component === "PRACTICAL" ? tone.amber : unit.component === "PROJECT" ? tone.primary : tone.muted}>
                        {COMPONENT_LABELS[unit.component]}
                      </Pill>
                      {unit.estimatedHours ? <span>{unit.estimatedHours} h</span> : null}
                      <span>{unit.topics.length} topics</span>
                    </p>
                  </div>
                  {editable && (
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => void move(curriculum.units, index, -1, { curriculumId: curriculum.id })}>
                        <ArrowUpIcon />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={index === curriculum.units.length - 1} onClick={() => void move(curriculum.units, index, 1, { curriculumId: curriculum.id })}>
                        <ArrowDownIcon />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${unit.title}`} onClick={() => setDialog({ kind: "unit", unit })}>
                        <PencilIcon />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete ${unit.title}`} onClick={() => void remove(() => deleteUnitAction(unit.id))}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  )}
                </div>
                {unit.description && <p className="text-sm text-muted-foreground">{unit.description}</p>}
                {unit.learningObjectives && (
                  <div className="text-sm">
                    <p className="text-xs font-medium text-muted-foreground">Learning objectives</p>
                    <p className="whitespace-pre-line">{unit.learningObjectives}</p>
                  </div>
                )}
                {(unit.topics.length > 0 || editable) && (
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {unit.topics.map((topic, ti) => (
                      <li key={topic.id} className="flex items-start gap-2 px-3 py-2">
                        <span className="pt-0.5 text-xs text-muted-foreground tabular-nums">
                          {index + 1}.{ti + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                          {topic.title}
                          {topic.estimatedHours ? <span className="ml-1.5 text-xs text-muted-foreground">{topic.estimatedHours} h</span> : null}
                          {topic.learningObjectives && (
                            <span className="block text-xs whitespace-pre-line text-muted-foreground">{topic.learningObjectives}</span>
                          )}
                        </span>
                        {editable && (
                          <span className="flex shrink-0 gap-0.5">
                            <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={ti === 0} onClick={() => void move(unit.topics, ti, -1, { unitId: unit.id })}>
                              <ArrowUpIcon />
                            </Button>
                            <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={ti === unit.topics.length - 1} onClick={() => void move(unit.topics, ti, 1, { unitId: unit.id })}>
                              <ArrowDownIcon />
                            </Button>
                            <Button size="icon-xs" variant="ghost" aria-label={`Edit ${topic.title}`} onClick={() => setDialog({ kind: "topic", unit, topic })}>
                              <PencilIcon />
                            </Button>
                            <Button size="icon-xs" variant="ghost" aria-label={`Delete ${topic.title}`} onClick={() => void remove(() => deleteTopicAction(topic.id))}>
                              <Trash2Icon />
                            </Button>
                          </span>
                        )}
                      </li>
                    ))}
                    {editable && (
                      <li className="px-2 py-1">
                        <Button size="xs" variant="ghost" onClick={() => setDialog({ kind: "topic", unit, topic: null })}>
                          <PlusIcon data-icon="inline-start" />
                          Topic
                        </Button>
                      </li>
                    )}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}

      {dialog?.kind === "details" && <DetailsDialog curriculum={curriculum} structure={structure} onClose={() => setDialog(null)} />}
      {dialog?.kind === "version" && <VersionDialog curriculum={curriculum} onClose={() => setDialog(null)} />}
      {dialog?.kind === "unit" && <UnitDialog curriculumId={curriculum.id} unit={dialog.unit} onClose={() => setDialog(null)} />}
      {dialog?.kind === "topic" && <TopicDialog unit={dialog.unit} topic={dialog.topic} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.kind === "activate" || dialog?.kind === "retire" || dialog?.kind === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={
          dialog?.kind === "activate"
            ? `Activate version ${curriculum.version}?`
            : dialog?.kind === "retire"
              ? `Retire version ${curriculum.version}?`
              : "Delete this draft?"
        }
        description={
          dialog?.kind === "activate"
            ? "It becomes read-only and the default for new class offerings. Any other active version of this curriculum is retired; classes already using it keep it."
            : dialog?.kind === "retire"
              ? "It stays attached to the classes that used it but is no longer offered for new ones."
              : "The draft and its units are deleted. This can't be undone."
        }
        confirmLabel={dialog?.kind === "activate" ? "Activate" : dialog?.kind === "retire" ? "Retire" : "Delete"}
        destructive={dialog?.kind === "delete"}
        onConfirm={async () => {
          const result =
            dialog?.kind === "delete"
              ? await deleteCurriculumAction(curriculum.id)
              : await setCurriculumStatusAction(curriculum.id, dialog?.kind === "activate" ? "ACTIVE" : "RETIRED")
          if (!result.ok) {
            toast.add({ title: "Couldn't update", description: result.error, type: "error" })
            return false
          }
          if (dialog?.kind === "delete") router.push(`/dashboard/subjects/${curriculum.subject.id}?tab=curriculum`)
          router.refresh()
        }}
      />
    </div>
  )
}

function DetailsDialog({
  curriculum,
  structure,
  onClose,
}: {
  curriculum: CurriculumDetail
  structure: Pick<EducationStructure, "levels" | "programs">
  onClose: () => void
}) {
  const router = useRouter()
  const draft = curriculum.status === "DRAFT"
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof curriculumSchema>, unknown, z.output<typeof curriculumSchema>>({
    resolver: zodResolver(curriculumSchema),
    defaultValues: {
      name: curriculum.name,
      code: curriculum.code ?? "",
      version: curriculum.version,
      description: curriculum.description ?? "",
      educationLevelId: curriculum.educationLevelId ?? "",
      programId: curriculum.programId ?? "",
      effectiveFrom: curriculum.effectiveFrom ?? "",
      effectiveTo: curriculum.effectiveTo ?? "",
    },
  })
  const submit = form.handleSubmit(async (values) => {
    const result = await updateCurriculumAction(curriculum.id, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    onClose()
    router.refresh()
  })
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Curriculum details"
      description={draft ? undefined : "Only the description and dates of an active or retired version can change."}
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
      wide
    >
      <fieldset disabled={!draft} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem_8rem]">
          <TextField control={form.control} name="name" label="Name" required />
          <TextField control={form.control} name="version" label="Version" required />
          <TextField control={form.control} name="code" label="Code" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="educationLevelId"
            label="Education level"
            placeholder="Any level"
            options={structure.levels.map((l) => ({ value: l.id, label: l.name }))}
          />
          <SelectField
            control={form.control}
            name="programId"
            label="Program"
            placeholder="Any program"
            options={structure.programs.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
          />
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="effectiveFrom" label="Effective from" type="date" />
        <TextField control={form.control} name="effectiveTo" label="Effective until" type="date" />
      </div>
      <TextAreaField control={form.control} name="description" label="Description" rows={3} />
    </FormDialog>
  )
}

function VersionDialog({ curriculum, onClose }: { curriculum: CurriculumDetail; onClose: () => void }) {
  const router = useRouter()
  const [version, setVersion] = React.useState(nextVersionLabel(curriculum.version))
  const [copy, setCopy] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const result = await createCurriculumVersionAction(curriculum.id, { version, copyContent: copy })
    setPending(false)
    if (!result.ok) {
      setError(result.fieldErrors?.version?.[0] ?? result.error)
      return
    }
    toast.add({ title: "New draft version created", type: "success" })
    router.push(`/dashboard/subjects/${curriculum.subject.id}/curricula/${result.data.id}`)
  }

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Create a new version"
      description={`A new draft of ${curriculum.name}. Version ${curriculum.version} stays as it is.`}
      pending={pending}
      error={error}
      onSubmit={submit}
      submitLabel="Create draft"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="new-version">Version</Label>
        <Input id="new-version" value={version} onChange={(e) => setVersion(e.target.value)} maxLength={40} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={copy} onCheckedChange={(checked) => setCopy(Boolean(checked))} />
        Copy all units and topics
      </label>
    </FormDialog>
  )
}

function UnitDialog({ curriculumId, unit, onClose }: { curriculumId: string; unit: Unit | null; onClose: () => void }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof unitSchema>, unknown, z.output<typeof unitSchema>>({
    resolver: zodResolver(unitSchema),
    defaultValues: {
      title: unit?.title ?? "",
      description: unit?.description ?? "",
      sequence: unit?.sequence ?? "",
      component: unit?.component ?? "THEORY",
      estimatedHours: unit?.estimatedHours ?? "",
      learningObjectives: unit?.learningObjectives ?? "",
    },
  })
  const submit = form.handleSubmit(async (values) => {
    const result = await saveUnitAction(curriculumId, unit?.id ?? null, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    onClose()
    router.refresh()
  })
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={unit ? "Edit unit" : "Add unit"}
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
      wide
    >
      <TextField control={form.control} name="title" label="Title" required placeholder="Unit 3: Algebraic expressions" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField control={form.control} name="component" label="Component" options={componentOptions} />
        <TextField control={form.control} name="estimatedHours" label="Estimated hours" type="number" min={0} />
      </div>
      <TextAreaField control={form.control} name="description" label="Description" rows={2} />
      <TextAreaField control={form.control} name="learningObjectives" label="Learning objectives" rows={4} description="One per line." />
    </FormDialog>
  )
}

function TopicDialog({ unit, topic, onClose }: { unit: Unit; topic: Topic | null; onClose: () => void }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof topicSchema>, unknown, z.output<typeof topicSchema>>({
    resolver: zodResolver(topicSchema),
    defaultValues: {
      title: topic?.title ?? "",
      description: topic?.description ?? "",
      sequence: topic?.sequence ?? "",
      estimatedHours: topic?.estimatedHours ?? "",
      learningObjectives: topic?.learningObjectives ?? "",
    },
  })
  const submit = form.handleSubmit(async (values) => {
    const result = await saveTopicAction(unit.id, topic?.id ?? null, values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    onClose()
    router.refresh()
  })
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={topic ? "Edit topic" : `Add a topic to ${unit.title}`}
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
    >
      <TextField control={form.control} name="title" label="Title" required />
      <TextField control={form.control} name="estimatedHours" label="Estimated hours" type="number" min={0} />
      <TextAreaField control={form.control} name="learningObjectives" label="Learning objectives" rows={3} />
      <TextAreaField control={form.control} name="description" label="Notes" rows={2} />
    </FormDialog>
  )
}
