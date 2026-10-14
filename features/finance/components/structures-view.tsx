"use client"

import * as React from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form"
import { LayersIcon, PencilIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { SelectField, SwitchField, TextField } from "@/components/shared/form-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { assignFeeStructureAction, saveFeeStructureAction } from "@/features/finance/actions"
import { formatRs, toPaisa } from "@/features/finance/money"
import { feeStructureSchema } from "@/features/finance/schemas"
import { formatDate } from "@/features/teaching/format"
import { useDialogSubmit } from "@/hooks/use-dialog-submit"
import { fromDate } from "@/lib/validation"
import type { FeeStructureRow } from "@/services/finance/fee-service"
import type { FinanceOptions } from "@/services/finance/options-service"

type FormInput = z.input<typeof feeStructureSchema>
type FormOutput = z.output<typeof feeStructureSchema>

const appliesTo = (s: FeeStructureRow) => s.class?.name ?? (s.program ? `${s.program.name} (${s.program.code})` : s.educationLevel?.name) ?? "All students"

export function StructuresView({ structures, options, yearId, canEdit, canAssign }: { structures: FeeStructureRow[]; options: FinanceOptions; yearId: string | null; canEdit: boolean; canAssign: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<FeeStructureRow | "new" | null>(null)
  const [assigning, setAssigning] = React.useState<FeeStructureRow | null>(null)
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(feeStructureSchema) })
  const installments = useFieldArray({ control: form.control, name: "installments" })
  const { error, setError, run } = useDialogSubmit(form, () => setEditing(null))
  const levelId = useWatch({ control: form.control, name: "educationLevelId" }) ?? ""
  const programId = useWatch({ control: form.control, name: "programId" }) ?? ""
  const locked = editing !== "new" && editing !== null && editing._count.studentFees > 0

  function open(s: FeeStructureRow | null) {
    setError(null)
    form.reset(
      s
        ? {
            academicYearId: s.academicYearId, categoryId: s.categoryId, name: s.name, description: s.description ?? "",
            educationLevelId: s.educationLevelId ?? "", programId: s.programId ?? "", classId: s.classId ?? "",
            amount: (toPaisa(s.amount) / 100).toFixed(2), isActive: s.isActive,
            installments: s.installments.map((i) => ({ label: i.label, dueDate: fromDate(i.dueDate), amount: (toPaisa(i.amount) / 100).toFixed(2) })),
          }
        : { academicYearId: yearId ?? options.currentYearId ?? "", categoryId: "", name: "", description: "", educationLevelId: "", programId: "", classId: "", amount: "", isActive: true, installments: [] }
    )
    setEditing(s ?? "new")
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{options.feeCategories.length === 0 ? <>Add fee heads under <Link href="/dashboard/finance/categories" className="underline">Categories</Link> first.</> : "Choose the academic year from the header."}</p>
          <Button size="sm" onClick={() => open(null)} disabled={options.feeCategories.length === 0}>
            <PlusIcon data-icon="inline-start" />
            New fee structure
          </Button>
        </div>
      )}
      {structures.length === 0 ? (
        <EmptyState icon={LayersIcon} title="No fee structures" description="A fee structure says what a group of students pays in a year, for example “BBS first year tuition: Rs. 60,000 in 3 installments”." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {structures.map((s) => (
            <Card key={s.id} className="gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                    {s.name}
                    {!s.isActive && <Badge variant="outline">Inactive</Badge>}
                  </h2>
                  <p className="text-sm text-muted-foreground">{s.category.name} · {appliesTo(s)} · {s.academicYear.name}</p>
                </div>
                <span className="text-lg font-semibold tabular-nums">{formatRs(toPaisa(s.amount))}</span>
              </div>
              {s.installments.length > 0 && (
                <ul className="grid gap-1 rounded-lg bg-muted/30 p-3 text-sm">
                  {s.installments.map((i) => (
                    <li key={i.sequence} className="flex justify-between gap-3">
                      <span>{i.label} <span className="text-muted-foreground">· due {formatDate(i.dueDate)}</span></span>
                      <span className="tabular-nums">{formatRs(toPaisa(i.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{s._count.studentFees ? `${s._count.studentFees} fee line${s._count.studentFees === 1 ? "" : "s"} assigned` : "Not assigned yet"}</span>
                <span className="flex gap-1">
                  {canEdit && <Button variant="ghost" size="sm" onClick={() => open(s)}><PencilIcon data-icon="inline-start" />Edit</Button>}
                  {canAssign && s.isActive && <Button variant="outline" size="sm" onClick={() => setAssigning(s)}><UsersIcon data-icon="inline-start" />Assign to students</Button>}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <FormProvider {...form}>
        <FormDialog
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          title={editing === "new" ? "New fee structure" : "Edit fee structure"}
          description={locked ? "Already assigned to students: only the name, description and active state can change." : undefined}
          pending={form.formState.isSubmitting}
          error={error}
          wide
          onSubmit={form.handleSubmit((values) => run(() => saveFeeStructureAction(editing === "new" || !editing ? null : editing.id, values)))}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="name" label="Name" required placeholder="BBS 1st year tuition" />
            <SelectField control={form.control} name="categoryId" label="Fee head" required placeholder="Choose" options={options.feeCategories.map((c) => ({ value: c.id, label: c.name }))} disabled={locked} />
            <SelectField control={form.control} name="academicYearId" label="Academic year" required placeholder="Choose" options={options.years.map((y) => ({ value: y.id, label: `${y.name}${y.isCurrent ? " (current)" : ""}` }))} disabled={locked} />
            <TextField control={form.control} name="amount" label="Total amount (Rs.)" required inputMode="decimal" disabled={locked} />
          </div>
          <fieldset className="grid gap-3 rounded-lg border p-3" disabled={locked}>
            <legend className="px-1 text-sm font-medium">Applies to</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField control={form.control} name="educationLevelId" label="Level" placeholder="All levels" options={options.levels.map((l) => ({ value: l.id, label: l.name }))} onValueChange={() => { form.setValue("programId", ""); form.setValue("classId", "") }} />
              <SelectField control={form.control} name="programId" label="Program" placeholder="All programs" options={options.programs.filter((p) => !levelId || p.educationLevelId === levelId).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))} onValueChange={() => form.setValue("classId", "")} />
              <SelectField control={form.control} name="classId" label="Class" placeholder="All classes" options={options.classes.filter((c) => (!levelId || c.educationLevelId === levelId) && (!programId || c.programId === programId)).map((c) => ({ value: c.id, label: c.name }))} />
            </div>
          </fieldset>
          <fieldset className="grid gap-3 rounded-lg border p-3" disabled={locked}>
            <legend className="px-1 text-sm font-medium">Installments</legend>
            <p className="text-xs text-muted-foreground">Leave empty to charge the full amount at once. Installment amounts must add up to the total.</p>
            {installments.fields.map((f, i) => (
              <div key={f.id} className="grid items-end gap-3 sm:grid-cols-[1fr_10rem_9rem_auto]">
                <TextField control={form.control} name={`installments.${i}.label`} label="Name" placeholder={`Installment ${i + 1}`} />
                <TextField control={form.control} name={`installments.${i}.dueDate`} label="Due date" type="date" />
                <TextField control={form.control} name={`installments.${i}.amount`} label="Amount (Rs.)" inputMode="decimal" />
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove installment" onClick={() => installments.remove(i)}><Trash2Icon /></Button>
              </div>
            ))}
            {form.formState.errors.installments?.root?.message && <p className="text-sm text-destructive">{form.formState.errors.installments.root.message}</p>}
            {form.formState.errors.installments?.message && <p className="text-sm text-destructive">{form.formState.errors.installments.message}</p>}
            {installments.fields.length < 12 && (
              <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => installments.append({ label: `Installment ${installments.fields.length + 1}`, dueDate: "", amount: "" })}>
                <PlusIcon data-icon="inline-start" />
                Add installment
              </Button>
            )}
          </fieldset>
          <TextField control={form.control} name="description" label="Description" />
          <SwitchField control={form.control} name="isActive" label="Active" description="Inactive structures can't be assigned to more students." />
        </FormDialog>
      </FormProvider>

      <ConfirmDialog
        open={assigning !== null}
        onOpenChange={(o) => !o && setAssigning(null)}
        title={`Assign “${assigning?.name ?? ""}”?`}
        description={assigning ? `Creates ${assigning.installments.length || 1} fee line${assigning.installments.length > 1 ? "s" : ""} for every student enrolled in ${appliesTo(assigning).toLowerCase() === "all students" ? "this academic year" : appliesTo(assigning)} (${assigning.academicYear.name}). Students who already have it are skipped.` : undefined}
        confirmLabel="Assign"
        onConfirm={async () => {
          if (!assigning) return false
          const result = await assignFeeStructureAction({ feeStructureId: assigning.id })
          if (!result.ok) {
            toast.add({ title: "Couldn't assign", description: result.error, type: "error" })
            return false
          }
          toast.add({ title: `Assigned to ${result.data.students} student${result.data.students === 1 ? "" : "s"}`, description: `${result.data.created} new fee line(s)${result.data.skipped ? `, ${result.data.skipped} already existed` : ""}.`, type: "success" })
          router.refresh()
          return true
        }}
      />
    </div>
  )
}
