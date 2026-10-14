"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { labelOptions } from "@/components/shared/filter-controls"
import { SelectField, TextField } from "@/components/shared/form-fields"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { addConcessionAction, addStudentFeeAction, assignFeeStructureAction, cancelStudentFeeAction } from "@/features/finance/actions"
import { ReasonDialog } from "@/features/finance/components/finance-ui"
import { CONCESSION_KIND_LABELS } from "@/features/finance/constants"
import { formatRs } from "@/features/finance/money"
import { concessionSchema, studentFeeSchema } from "@/features/finance/schemas"
import { SCHOLARSHIP_LABELS } from "@/features/students/constants"
import { useDialogSubmit } from "@/hooks/use-dialog-submit"
import type { FinanceOptions } from "@/services/finance/options-service"

export type FeeTarget = { id: string; title: string; amount: number; balance: number; studentName: string }

// A discount, scholarship or waiver on one fee (finance.adjust).
export function ConcessionDialog({ fee, onOpenChange }: { fee: FeeTarget | null; onOpenChange: (open: boolean) => void }) {
  const form = useForm<z.input<typeof concessionSchema>, unknown, z.output<typeof concessionSchema>>({ resolver: zodResolver(concessionSchema) })
  const { error, setError, run } = useDialogSubmit(form, () => onOpenChange(false))
  const kind = useWatch({ control: form.control, name: "kind" })
  const [lastId, setLastId] = React.useState<string | null>(null)
  // Reset when a different fee is opened (adjusting state during render).
  if (fee && fee.id !== lastId) {
    setLastId(fee.id)
    setError(null)
    form.reset({ studentFeeId: fee.id, kind: "DISCOUNT", scholarshipCategory: "", title: "", amount: "", percent: "", reason: "" })
  }
  return (
    <FormProvider {...form}>
      <FormDialog
        open={fee !== null}
        onOpenChange={(o) => { if (!o) setLastId(null); onOpenChange(o) }}
        title="Discount or scholarship"
        description={fee ? `${fee.studentName} · ${fee.title} · ${formatRs(fee.balance)} unpaid of ${formatRs(fee.amount)}` : undefined}
        pending={form.formState.isSubmitting}
        error={error}
        onSubmit={form.handleSubmit((values) => run(() => addConcessionAction(values)))}
        submitLabel="Apply"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField control={form.control} name="kind" label="Type" options={labelOptions(CONCESSION_KIND_LABELS)} />
          {kind === "SCHOLARSHIP" && <SelectField control={form.control} name="scholarshipCategory" label="Scholarship type" placeholder="Not specified" options={labelOptions(SCHOLARSHIP_LABELS).filter((o) => o.value !== "NONE")} />}
        </div>
        <TextField control={form.control} name="title" label="Name" required placeholder="Sibling discount, Merit scholarship…" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="amount" label="Amount (Rs.)" inputMode="decimal" description="Or give a percentage" />
          <TextField control={form.control} name="percent" label="Percentage of the fee" inputMode="decimal" />
        </div>
        <TextField control={form.control} name="reason" label="Reason / approval note" />
      </FormDialog>
    </FormProvider>
  )
}

// Cancelling an unpaid fee (finance.adjust).
export function CancelFeeDialog({ fee, onOpenChange }: { fee: FeeTarget | null; onOpenChange: (open: boolean) => void }) {
  return (
    <ReasonDialog
      open={fee !== null}
      onOpenChange={onOpenChange}
      title={`Cancel “${fee?.title ?? ""}”?`}
      description="Only fees nobody has paid towards can be cancelled; reverse the payments first otherwise. The fee stays on record as cancelled."
      confirmLabel="Cancel fee"
      run={(reason) => cancelStudentFeeAction(fee!.id, { reason })}
    />
  )
}

// A one-off charge for one student (finance.create).
export function ChargeDialog({ studentId, studentName, options, open, onOpenChange }: { studentId: string; studentName: string; options: FinanceOptions; open: boolean; onOpenChange: (open: boolean) => void }) {
  const form = useForm<z.input<typeof studentFeeSchema>, unknown, z.output<typeof studentFeeSchema>>({ resolver: zodResolver(studentFeeSchema) })
  const { error, setError, run } = useDialogSubmit(form, () => onOpenChange(false))
  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setError(null)
      form.reset({ studentId, academicYearId: options.currentYearId ?? "", categoryId: "", title: "", amount: "", dueDate: "", note: "" })
    }
  }
  return (
    <FormProvider {...form}>
      <FormDialog open={open} onOpenChange={onOpenChange} title="Add a charge" description={`One-off fee for ${studentName} (fine, certificate, trip, …).`} pending={form.formState.isSubmitting} error={error} onSubmit={form.handleSubmit((values) => run(() => addStudentFeeAction(values)))} submitLabel="Add charge">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField control={form.control} name="categoryId" label="Fee head" required placeholder="Choose" options={options.feeCategories.map((c) => ({ value: c.id, label: c.name }))} />
          <SelectField control={form.control} name="academicYearId" label="Academic year" required options={options.years.map((y) => ({ value: y.id, label: y.name }))} />
        </div>
        <TextField control={form.control} name="title" label="Description" required placeholder="Character certificate" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="amount" label="Amount (Rs.)" required inputMode="decimal" />
          <TextField control={form.control} name="dueDate" label="Due date" type="date" />
        </div>
        <TextField control={form.control} name="note" label="Note" />
      </FormDialog>
    </FormProvider>
  )
}

// Assigning a fee structure to every eligible student (finance.create).
export function AssignStructureDialog({ structures, open, onOpenChange }: { structures: { id: string; name: string }[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [id, setId] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign a fee structure"
      description="Creates its fee lines for every student enrolled where it applies. Students who already have it are skipped."
      pending={pending}
      error={error}
      submitLabel="Assign"
      onSubmit={(e) => {
        e.preventDefault()
        if (!id) {
          setError("Choose a fee structure.")
          return
        }
        startTransition(async () => {
          const result = await assignFeeStructureAction({ feeStructureId: id })
          if (!result.ok) {
            setError(result.error)
            return
          }
          toast.add({ title: `Assigned to ${result.data.students} student${result.data.students === 1 ? "" : "s"}`, description: `${result.data.created} new fee line(s)${result.data.skipped ? `, ${result.data.skipped} already existed` : ""}.`, type: "success" })
          onOpenChange(false)
          router.refresh()
        })
      }}
    >
      {structures.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active fee structures for this year. Create one under Fee structures.</p>
      ) : (
        <div className="grid gap-1.5">
          <label htmlFor="assign-structure" className="text-sm font-medium">Fee structure</label>
          <select id="assign-structure" value={id} onChange={(e) => setId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Choose</option>
            {structures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
    </FormDialog>
  )
}
