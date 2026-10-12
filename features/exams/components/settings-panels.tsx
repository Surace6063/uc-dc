"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { MoreHorizontalIcon, PencilIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { labelOptions } from "@/components/shared/filter-controls"
import { applyServerErrors, SelectField, SwitchField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import {
  createSampleSetupAction,
  deleteAssessmentTypeAction,
  gradingScaleStateAction,
  resultPolicyStateAction,
  saveAssessmentTypeAction,
  saveGradingScaleAction,
  saveResultPolicyAction,
} from "@/features/exams/actions"
import { validateScaleRules } from "@/features/exams/calculation"
import { ScaleStatusBadge } from "@/features/exams/components/exams-nav"
import {
  ABSENT_TREATMENT_LABELS,
  ASSESSMENT_CATEGORY_LABELS,
  GPA_METHOD_LABELS,
  GRADING_TYPE_LABELS,
  PASS_RULE_LABELS,
  RANK_BASIS_LABELS,
  RANK_SCOPE_LABELS,
  RANK_TIE_LABELS,
} from "@/features/exams/constants"
import { assessmentTypeSchema, gradingScaleSchema, resultPolicySchema } from "@/features/exams/schemas"
import type { ExamSettings } from "@/services/exams/settings-service"

const toUnits = (v: unknown) => Math.round(Number(v) * 10_000)

// ---------------------------------------------------------- assessment types

function AssessmentTypes({ types }: { types: ExamSettings["types"] }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<ExamSettings["types"][number] | "new" | null>(null)
  const [deleting, setDeleting] = React.useState<ExamSettings["types"][number] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof assessmentTypeSchema>, unknown, z.output<typeof assessmentTypeSchema>>({ resolver: zodResolver(assessmentTypeSchema) })
  function open(t: ExamSettings["types"][number] | "new") {
    setError(null)
    form.reset(t === "new" ? { name: "", code: "", category: "TERMINAL", description: "", isActive: true, sortOrder: types.length } : { name: t.name, code: t.code ?? "", category: t.category, description: t.description ?? "", isActive: t.isActive, sortOrder: t.sortOrder })
    setEditing(t)
  }
  const submit = form.handleSubmit(async (values) => {
    const result = await saveAssessmentTypeAction(editing === "new" || !editing ? null : editing.id, values)
    if (!result.ok) return setError(applyServerErrors(form, result))
    toast.add({ title: "Assessment type saved", type: "success" })
    setEditing(null)
    router.refresh()
  })
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Names your institution uses for assessments. The category is only for filters and reports.</p>
        <Button size="sm" onClick={() => open("new")}><PlusIcon data-icon="inline-start" />Add type</Button>
      </div>
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead className="pl-4">Name</TableHead><TableHead>Category</TableHead><TableHead>Used by</TableHead><TableHead>Status</TableHead><TableHead className="pr-4" /></TableRow></TableHeader>
          <TableBody>
            {types.length === 0 && <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No assessment types yet.</TableCell></TableRow>}
            {types.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="pl-4"><span className="font-medium">{t.name}</span>{t.code && <span className="block text-xs text-muted-foreground">{t.code}</span>}</TableCell>
                <TableCell>{ASSESSMENT_CATEGORY_LABELS[t.category]}</TableCell>
                <TableCell className="tabular-nums">{t.used} exam{t.used === 1 ? "" : "s"}</TableCell>
                <TableCell>{t.isActive ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                <TableCell className="pr-4 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`} onClick={() => open(t)}><PencilIcon /></Button>
                  {t.used === 0 && <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}><Trash2Icon /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <FormDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Add assessment type" : "Edit assessment type"} pending={form.formState.isSubmitting} error={error} onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <TextField control={form.control} name="name" label="Name" required placeholder="First Terminal Examination" />
          <TextField control={form.control} name="code" label="Code" />
        </div>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <SelectField control={form.control} name="category" label="Category" options={labelOptions(ASSESSMENT_CATEGORY_LABELS)} />
          <TextField control={form.control} name="sortOrder" label="Order" type="number" min={0} />
        </div>
        <TextAreaField control={form.control} name="description" label="Description" rows={2} />
        <SwitchField control={form.control} name="isActive" label="Active" description="Inactive types can't be chosen for new examinations." />
      </FormDialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ""}?`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const result = await deleteAssessmentTypeAction(deleting!.id)
          if (!result.ok) {
            toast.add({ title: "Couldn't delete", description: result.error, type: "error" })
            return false
          }
          router.refresh()
        }}
      />
    </div>
  )
}

// ------------------------------------------------------------ grading scales

type ScaleValues = z.input<typeof gradingScaleSchema>

function ScaleDialog({ scale, onClose }: { scale: ExamSettings["scales"][number] | null; onClose: () => void }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<ScaleValues, unknown, z.output<typeof gradingScaleSchema>>({
    resolver: zodResolver(gradingScaleSchema),
    defaultValues: scale
      ? {
          name: scale.name, code: scale.code ?? "", description: scale.description ?? "", gradingType: scale.gradingType, effectiveFrom: scale.effectiveFrom ?? "", effectiveTo: scale.effectiveTo ?? "",
          rules: scale.rules.map((r) => ({ grade: r.grade, minimumPercentage: r.minimumPercentage, maximumPercentage: r.maximumPercentage, gradePoint: r.gradePoint ?? "", description: r.description ?? "", isFailing: r.isFailing })),
        }
      : { name: "", code: "", description: "", gradingType: "GRADE_POINT", effectiveFrom: "", effectiveTo: "", rules: [{ grade: "", minimumPercentage: "", maximumPercentage: "100", gradePoint: "", description: "", isFailing: false }] },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "rules" })
  const rules = useWatch({ control: form.control, name: "rules" }) ?? []
  const type = useWatch({ control: form.control, name: "gradingType" })
  // The same validation the server applies, live.
  const problems = rules.every((r) => r.grade && r.minimumPercentage !== "" && r.maximumPercentage !== "")
    ? validateScaleRules(rules.map((r) => ({ grade: String(r.grade), min: toUnits(r.minimumPercentage), max: toUnits(r.maximumPercentage), gradePoint: r.gradePoint === "" || r.gradePoint === null || r.gradePoint === undefined ? null : Math.round(Number(r.gradePoint) * 100), isFailing: !!r.isFailing, description: null })), type ?? "LETTER")
    : []
  const submit = form.handleSubmit(async (values) => {
    const result = await saveGradingScaleAction(scale?.id ?? null, values)
    if (!result.ok) return setError(applyServerErrors(form, result))
    toast.add({ title: "Saved as a draft", description: "Check the bands, then activate the scale to use it.", type: "success" })
    onClose()
    router.refresh()
  })
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={scale ? `Edit ${scale.name} v${scale.version}` : "New grading scale"} description="Bands include their minimum and exclude their maximum; a band ending at 100 includes 100. Bands must cover 0–100 without gaps or overlaps." pending={form.formState.isSubmitting} error={error} onSubmit={submit} wide>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1.5fr]">
        <TextField control={form.control} name="name" label="Name" required disabled={!!scale && scale.version > 1} />
        <TextField control={form.control} name="code" label="Code" />
        <SelectField control={form.control} name="gradingType" label="Type" options={labelOptions(GRADING_TYPE_LABELS)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <TextAreaField control={form.control} name="description" label="Description / source of these rules" rows={2} />
        <TextField control={form.control} name="effectiveFrom" label="Effective from" type="date" />
        <TextField control={form.control} name="effectiveTo" label="Effective to" type="date" />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Bands</p>
          <Button type="button" size="xs" variant="outline" onClick={() => append({ grade: "", minimumPercentage: "", maximumPercentage: "", gradePoint: "", description: "", isFailing: false })} disabled={fields.length >= 30}>
            <PlusIcon data-icon="inline-start" />
            Add band
          </Button>
        </div>
        {fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-3 items-end gap-2 rounded-lg border p-2 sm:grid-cols-[0.8fr_0.8fr_0.8fr_0.8fr_1.6fr_auto_auto]">
            <TextField control={form.control} name={`rules.${i}.grade`} label="Grade" />
            <TextField control={form.control} name={`rules.${i}.minimumPercentage`} label="From %" inputMode="decimal" />
            <TextField control={form.control} name={`rules.${i}.maximumPercentage`} label="Below %" inputMode="decimal" />
            <TextField control={form.control} name={`rules.${i}.gradePoint`} label="Grade point" inputMode="decimal" />
            <TextField control={form.control} name={`rules.${i}.description`} label="Description" placeholder="Outstanding" />
            <SwitchField control={form.control} name={`rules.${i}.isFailing`} label="Fail" className="border-0 p-1" />
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove band" onClick={() => remove(i)} disabled={fields.length <= 1}><Trash2Icon /></Button>
          </div>
        ))}
        {problems.length > 0 && <ul className="list-disc pl-6 text-sm text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      </div>
    </FormDialog>
  )
}

function GradingScales({ scales }: { scales: ExamSettings["scales"] }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<ExamSettings["scales"][number] | "new" | null>(null)
  const [confirm, setConfirm] = React.useState<{ scale: ExamSettings["scales"][number]; change: "activate" | "version" | "retire" | "default" | "delete" } | null>(null)
  const copy = {
    activate: ["Activate", "Examinations can use it once it's active. If it revises an earlier version, that one is retired and result policies move to this version. Results already approved or published keep the rules they were calculated with."],
    version: ["Draft a new version", "A draft copy you can edit. The current version stays in use until the new one is activated."],
    retire: ["Retire", "It can no longer be chosen for new examinations. Existing examinations and results are unaffected."],
    default: ["Make default", "Suggested for new result policies and examinations."],
    delete: ["Delete draft", "This draft is removed."],
  } as const
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Bands turn percentages into grades. Only drafts are edited; changing an active scale means drafting a new version, so graded results never change.</p>
        <Button size="sm" onClick={() => setEditing("new")}><PlusIcon data-icon="inline-start" />New scale</Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {scales.length === 0 && <p className="text-sm text-muted-foreground">No grading scales yet.</p>}
        {scales.map((s) => (
          <Card key={s.id} className="gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{s.name} <span className="text-muted-foreground">v{s.version}</span></p>
                <p className="text-xs text-muted-foreground">{GRADING_TYPE_LABELS[s.gradingType]}{s.used ? ` · used by ${s.used}` : ""}</p>
              </div>
              <div className="flex items-center gap-1">
                {s.isDefault && <Badge>Default</Badge>}
                <ScaleStatusBadge status={s.status} />
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.name}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {s.status === "DRAFT" && <DropdownMenuItem onClick={() => setEditing(s)}>Edit</DropdownMenuItem>}
                    {s.status === "DRAFT" && <DropdownMenuItem onClick={() => setConfirm({ scale: s, change: "activate" })}>Activate</DropdownMenuItem>}
                    {s.status !== "DRAFT" && <DropdownMenuItem onClick={() => setConfirm({ scale: s, change: "version" })}>Draft new version</DropdownMenuItem>}
                    {s.status === "ACTIVE" && !s.isDefault && <DropdownMenuItem onClick={() => setConfirm({ scale: s, change: "default" })}>Make default</DropdownMenuItem>}
                    {s.status === "ACTIVE" && <DropdownMenuItem onClick={() => setConfirm({ scale: s, change: "retire" })}>Retire</DropdownMenuItem>}
                    {s.status === "DRAFT" && s.used === 0 && <DropdownMenuItem onClick={() => setConfirm({ scale: s, change: "delete" })}>Delete</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
            <div className="flex flex-wrap gap-1.5">
              {s.rules.map((r) => (
                <span key={r.grade} className={`rounded-md border px-2 py-1 text-xs tabular-nums ${r.isFailing ? "border-destructive/40" : ""}`} title={r.description ?? undefined}>
                  <span className="font-semibold">{r.grade}</span> {r.minimumPercentage}–{r.maximumPercentage}%{r.gradePoint !== null ? ` · ${r.gradePoint}` : ""}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {editing && <ScaleDialog scale={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? `${copy[confirm.change][0]}: ${confirm.scale.name} v${confirm.scale.version}?` : ""}
        description={confirm ? copy[confirm.change][1] : ""}
        confirmLabel={confirm ? copy[confirm.change][0] : "Confirm"}
        destructive={confirm?.change === "delete"}
        onConfirm={async () => {
          const result = await gradingScaleStateAction(confirm!.scale.id, confirm!.change)
          if (!result.ok) {
            toast.add({ title: "Couldn't update the scale", description: result.fieldErrors?.rules?.[0] ?? result.error, type: "error" })
            return false
          }
          toast.add({ title: "Grading scale updated", type: "success" })
          router.refresh()
        }}
      />
    </div>
  )
}

// ----------------------------------------------------------- result policies

type PolicyValues = z.input<typeof resultPolicySchema>

function PolicyDialog({ policy, scales, levels, onClose }: { policy: ExamSettings["policies"][number] | null; scales: ExamSettings["scales"]; levels: ExamSettings["levels"]; onClose: () => void }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<PolicyValues, unknown, z.output<typeof resultPolicySchema>>({
    resolver: zodResolver(resultPolicySchema),
    defaultValues: policy
      ? { ...policy, description: policy.description ?? "", educationLevelId: policy.educationLevelId ?? "", gradingScaleId: policy.gradingScaleId ?? "", graceMarksPerSubject: policy.graceMarksPerSubject ?? "" }
      : {
          name: "", description: "", educationLevelId: "", gradingScaleId: scales.find((s) => s.isDefault)?.id ?? "", isActive: true, subjectPassRule: "MARKS", componentPassRequired: false,
          absentTreatment: "RESULT_ABSENT", optionalInAggregate: false, gpaMethod: "NONE", percentageDecimals: 2, gpaDecimals: 2, graceMarksPerSubject: "", graceMaxSubjects: 0,
          rankingEnabled: false, rankBasis: "PERCENTAGE", rankScope: "SECTION", rankTieMode: "SHARED", requireVerification: true, separateReviewer: true,
        },
  })
  const ranking = useWatch({ control: form.control, name: "rankingEnabled" })
  const submit = form.handleSubmit(async (values) => {
    const result = await saveResultPolicyAction(policy?.id ?? null, values)
    if (!result.ok) return setError(applyServerErrors(form, result))
    toast.add({ title: "Result policy saved", description: "Examinations already approved keep their snapshot of the rules.", type: "success" })
    onClose()
    router.refresh()
  })
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={policy ? `Edit ${policy.name}` : "New result policy"} description="Configure and verify your institution's own rules; nothing here is a national default." pending={form.formState.isSubmitting} error={error} onSubmit={submit} wide>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField control={form.control} name="name" label="Name" required className="sm:col-span-1" />
        <SelectField control={form.control} name="educationLevelId" label="Suggested for level" options={levels.map((l) => ({ value: l.id, label: l.name }))} placeholder="Any level" />
        <SelectField control={form.control} name="gradingScaleId" label="Default grading scale" options={scales.filter((s) => s.status !== "RETIRED").map((s) => ({ value: s.id, label: `${s.name} v${s.version}${s.status === "DRAFT" ? " (draft)" : ""}` }))} placeholder="None" />
      </div>
      <TextAreaField control={form.control} name="description" label="Description" rows={2} />
      <p className="text-sm font-medium">Passing</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField control={form.control} name="subjectPassRule" label="A subject is passed with" options={labelOptions(PASS_RULE_LABELS)} />
        <SelectField control={form.control} name="absentTreatment" label="An absent component" options={labelOptions(ABSENT_TREATMENT_LABELS)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SwitchField control={form.control} name="componentPassRequired" label="Enforce component pass marks" description="E.g. theory and practical must each be passed." />
        <SwitchField control={form.control} name="optionalInAggregate" label="Optional subjects count in totals" description="When the student took them." />
      </div>
      <p className="text-sm font-medium">Totals, GPA and rounding</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField control={form.control} name="gpaMethod" label="GPA" options={labelOptions(GPA_METHOD_LABELS)} className="sm:col-span-3" />
        <TextField control={form.control} name="percentageDecimals" label="Percentage decimals" type="number" min={0} max={4} />
        <TextField control={form.control} name="gpaDecimals" label="GPA decimals" type="number" min={0} max={4} />
      </div>
      <p className="text-sm font-medium">Grace marks</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="graceMarksPerSubject" label="Up to (marks per subject)" inputMode="decimal" description="Leave empty for none. Applied only if it makes the student pass every compulsory subject." />
        <TextField control={form.control} name="graceMaxSubjects" label="In at most (subjects)" type="number" min={0} max={20} />
      </div>
      <p className="text-sm font-medium">Ranking</p>
      <SwitchField control={form.control} name="rankingEnabled" label="Show positions" description="Ranks only passed students, only in published results." />
      {ranking && (
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField control={form.control} name="rankBasis" label="Rank by" options={labelOptions(RANK_BASIS_LABELS)} />
          <SelectField control={form.control} name="rankScope" label="Among" options={labelOptions(RANK_SCOPE_LABELS)} />
          <SelectField control={form.control} name="rankTieMode" label="Ties" options={labelOptions(RANK_TIE_LABELS)} />
        </div>
      )}
      <p className="text-sm font-medium">Review workflow</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SwitchField control={form.control} name="requireVerification" label="Verify before approval" description="A reviewer verifies submitted marks before an approver approves them." />
        <SwitchField control={form.control} name="separateReviewer" label="Separate duties" description="Whoever submitted marks can't verify or approve them." />
      </div>
      <SwitchField control={form.control} name="isActive" label="Active" />
    </FormDialog>
  )
}

function ResultPolicies({ policies, scales, levels }: { policies: ExamSettings["policies"]; scales: ExamSettings["scales"]; levels: ExamSettings["levels"] }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<ExamSettings["policies"][number] | "new" | null>(null)
  const [confirm, setConfirm] = React.useState<{ policy: ExamSettings["policies"][number]; change: "default" | "delete" } | null>(null)
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">How results are decided. Each examination uses one policy; its rules are snapshotted when results are approved.</p>
        <Button size="sm" onClick={() => setEditing("new")}><PlusIcon data-icon="inline-start" />New policy</Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {policies.length === 0 && <p className="text-sm text-muted-foreground">No result policies yet.</p>}
        {policies.map((p) => (
          <Card key={p.id} className="gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{[p.educationLevelName, p.gradingScaleName].filter(Boolean).join(" · ") || "Any level"}{p.used ? ` · used by ${p.used}` : ""}</p>
              </div>
              <div className="flex items-center gap-1">
                {p.isDefault && <Badge>Default</Badge>}
                {!p.isActive && <Badge variant="outline">Inactive</Badge>}
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setEditing(p)}>Edit</DropdownMenuItem>
                    {!p.isDefault && p.isActive && <DropdownMenuItem onClick={() => setConfirm({ policy: p, change: "default" })}>Make default</DropdownMenuItem>}
                    {p.used === 0 && <DropdownMenuItem onClick={() => setConfirm({ policy: p, change: "delete" })}>Delete</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <ul className="grid gap-0.5 text-sm text-muted-foreground">
              <li>Pass: {PASS_RULE_LABELS[p.subjectPassRule].toLowerCase()}{p.componentPassRequired ? ", every component" : ""}</li>
              <li>Absent: {ABSENT_TREATMENT_LABELS[p.absentTreatment].toLowerCase()}</li>
              <li>GPA: {GPA_METHOD_LABELS[p.gpaMethod]}</li>
              <li>Ranking: {p.rankingEnabled ? `${RANK_BASIS_LABELS[p.rankBasis].toLowerCase()}, ${RANK_SCOPE_LABELS[p.rankScope].toLowerCase()}` : "off"}</li>
              <li>Review: {p.requireVerification ? "verify, then approve" : "approve directly"}{p.separateReviewer ? "; separate duties" : ""}</li>
            </ul>
          </Card>
        ))}
      </div>
      {editing && <PolicyDialog policy={editing === "new" ? null : editing} scales={scales} levels={levels} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.change === "delete" ? `Delete ${confirm.policy.name}?` : `Make ${confirm?.policy.name ?? ""} the default?`}
        confirmLabel={confirm?.change === "delete" ? "Delete" : "Make default"}
        destructive={confirm?.change === "delete"}
        onConfirm={async () => {
          const result = await resultPolicyStateAction(confirm!.policy.id, confirm!.change)
          if (!result.ok) {
            toast.add({ title: "Couldn't update the policy", description: result.error, type: "error" })
            return false
          }
          router.refresh()
        }}
      />
    </div>
  )
}

export function ExamSettingsView({ settings }: { settings: ExamSettings }) {
  const router = useRouter()
  const empty = settings.types.length === 0 && settings.scales.length === 0 && settings.policies.length === 0
  return (
    <div className="grid gap-4">
      {empty && (
        <Card className="flex-row flex-wrap items-center justify-between gap-3 border-dashed p-4">
          <div>
            <p className="font-medium">Start from a sample?</p>
            <p className="text-sm text-muted-foreground">Adds common assessment types, a <em>draft</em> sample grading scale and a result policy. Check every band and rule against your institution&apos;s policy before activating — it isn&apos;t an official scale.</p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              const result = await createSampleSetupAction()
              toast.add(result.ok ? { title: "Sample settings added", description: result.data.created.join(", "), type: "success" } : { title: "Couldn't add the sample", description: result.error, type: "error" })
              router.refresh()
            }}
          >
            <SparklesIcon data-icon="inline-start" />
            Add sample settings
          </Button>
        </Card>
      )}
      <Tabs defaultValue="scales">
        <TabsList variant="line">
          <TabsTrigger value="scales">Grading scales</TabsTrigger>
          <TabsTrigger value="policies">Result policies</TabsTrigger>
          <TabsTrigger value="types">Assessment types</TabsTrigger>
        </TabsList>
        <TabsContent value="scales" className="pt-3"><GradingScales scales={settings.scales} /></TabsContent>
        <TabsContent value="policies" className="pt-3"><ResultPolicies policies={settings.policies} scales={settings.scales} levels={settings.levels} /></TabsContent>
        <TabsContent value="types" className="pt-3"><AssessmentTypes types={settings.types} /></TabsContent>
      </Tabs>
    </div>
  )
}
