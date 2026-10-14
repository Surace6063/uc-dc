"use client"

import * as React from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import { BadgePercentIcon, CheckCircle2Icon, MoreHorizontalIcon, PlusIcon, ReceiptIcon, Undo2Icon, XCircleIcon } from "lucide-react"
import type { z } from "zod"

import { ContentSection } from "@/components/shared/content-section"
import { SummaryCard, SummaryGrid } from "@/components/shared/summary-card"
import { applyServerErrors, SelectField, TextField } from "@/components/shared/form-fields"
import { labelOptions } from "@/components/shared/filter-controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { localDate } from "@/features/attendance/constants"
import { confirmPaymentAction, recordPaymentAction, reversePaymentAction } from "@/features/finance/actions"
import { CancelFeeDialog, ChargeDialog, ConcessionDialog, type FeeTarget } from "@/features/finance/components/finance-dialogs"
import { FeeStatusBadge, PaymentStateBadge, ReasonDialog } from "@/features/finance/components/finance-ui"
import { CONCESSION_KIND_LABELS, ONLINE_METHODS, PAYMENT_METHOD_LABELS, PENDABLE_METHODS, REFERENCE_METHODS } from "@/features/finance/constants"
import { formatRs } from "@/features/finance/money"
import { paymentSchema } from "@/features/finance/schemas"
import { formatDate } from "@/features/teaching/format"
import { useActionRunner } from "@/hooks/use-dialog-submit"
import type { FinanceOptions } from "@/services/finance/options-service"
import type { StudentAccount } from "@/services/finance/payment-service"

type Can = { create: boolean; adjust: boolean; update: boolean; reverse: boolean }
type FormInput = z.input<typeof paymentSchema>
type FormOutput = z.output<typeof paymentSchema>

export function StudentAccountView({ account, options, can }: { account: StudentAccount; options: FinanceOptions; can: Can }) {
  const s = account.student
  const e = s.enrollment
  const runner = useActionRunner()
  const [concession, setConcession] = React.useState<FeeTarget | null>(null)
  const [cancelling, setCancelling] = React.useState<FeeTarget | null>(null)
  const [reversing, setReversing] = React.useState<StudentAccount["payments"][number] | null>(null)
  const [charging, setCharging] = React.useState(false)
  const openFees = account.fees.filter((f) => f.status === "UNPAID" || f.status === "PARTIAL")
  const target = (f: StudentAccount["fees"][number]): FeeTarget => ({ id: f.id, title: f.title, amount: f.amount, balance: f.balance, studentName: s.name })

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{s.name}</h2>
          <p className="text-sm text-muted-foreground">{s.admissionNumber}{e ? ` · ${[e.class.name, e.section?.name, e.rollNumber && `Roll ${e.rollNumber}`].filter(Boolean).join(" · ")} · ${e.academicYear.name}` : " · not enrolled"}{s.phone ? ` · ${s.phone}` : ""}</p>
        </div>
        {can.create && <Button variant="outline" size="sm" onClick={() => setCharging(true)}><PlusIcon data-icon="inline-start" />Add a charge</Button>}
      </div>

      <SummaryGrid columns={4}>
        <SummaryCard label="Fees" value={formatRs(account.totals.assessed)} hint={account.totals.discount ? `${formatRs(account.totals.discount)} discounted` : undefined} />
        <SummaryCard label="Paid" value={formatRs(account.totals.paid)} hint={account.totals.pending ? `${formatRs(account.totals.pending)} awaiting clearance` : "Verified payments"} />
        <SummaryCard label="Balance" value={formatRs(account.totals.balance)} />
        <SummaryCard label="Overdue" value={formatRs(account.totals.overdue)} />
      </SummaryGrid>

      {can.create && openFees.length > 0 && <PaymentForm account={account} />}

      <ContentSection title="Fees" variant="plain">
        {account.fees.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No fees have been assigned to this student.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Fee</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {account.fees.map((f) => (
                  <TableRow key={f.id} className={f.status === "CANCELLED" ? "text-muted-foreground" : undefined}>
                    <TableCell className="pl-4">
                      {f.title}
                      <span className="block text-xs text-muted-foreground">{f.category.name} · {f.academicYear.name}{f.status === "CANCELLED" && f.cancelReason ? ` · cancelled: ${f.cancelReason}` : ""}</span>
                      {f.concessions.filter((c) => !c.revokedAt).map((c) => (
                        <span key={c.id} className="mt-0.5 block text-xs text-emerald-700 dark:text-emerald-400">{CONCESSION_KIND_LABELS[c.kind]}: {c.title} ({formatRs(c.amount)})</span>
                      ))}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(f.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRs(f.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.discount ? formatRs(f.discount) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRs(f.paid)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatRs(f.balance)}</TableCell>
                    <TableCell><FeeStatusBadge status={f.status} overdue={f.overdue} /></TableCell>
                    <TableCell className="pr-4 text-right">
                      {can.adjust && (f.status === "UNPAID" || f.status === "PARTIAL") && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${f.title}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => setConcession(target(f))}><BadgePercentIcon />Discount / scholarship</DropdownMenuItem>
                            {f.paid === 0 && <DropdownMenuItem variant="destructive" onClick={() => setCancelling(target(f))}><XCircleIcon />Cancel fee</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ContentSection>

      <ContentSection title="Payments" variant="plain">
        {account.payments.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No payments recorded.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {account.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <Link href={`/dashboard/finance/payments/${p.id}`} className="font-medium hover:underline">{p.receiptNumber}</Link>
                  <span className="block text-xs text-muted-foreground">{formatDate(p.receivedOn)} · {PAYMENT_METHOD_LABELS[p.method]}{p.reference ? ` · ${p.reference}` : ""}{p.reversalReason ? ` · reversed: ${p.reversalReason}` : ""}</span>
                </span>
                <span className="flex items-center gap-2">
                  <PaymentStateBadge status={p.status} verification={p.verificationStatus} />
                  <span className="font-semibold tabular-nums">{formatRs(p.amount)}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.receiptNumber}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem render={<Link href={`/dashboard/finance/payments/${p.id}`} />}><ReceiptIcon />Receipt</DropdownMenuItem>
                      {can.update && p.status === "COMPLETED" && p.verificationStatus === "PENDING" && (
                        <DropdownMenuItem onClick={() => runner.run(() => confirmPaymentAction(p.id))}><CheckCircle2Icon />Confirm cleared</DropdownMenuItem>
                      )}
                      {can.reverse && p.status === "COMPLETED" && (
                        <DropdownMenuItem variant="destructive" onClick={() => setReversing(p)}><Undo2Icon />Reverse payment</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </li>
            ))}
          </ul>
        )}
      </ContentSection>

      <ConcessionDialog fee={concession} onOpenChange={(o) => !o && setConcession(null)} />
      <CancelFeeDialog fee={cancelling} onOpenChange={(o) => !o && setCancelling(null)} />
      <ChargeDialog studentId={s.id} studentName={s.name} options={options} open={charging} onOpenChange={setCharging} />
      <ReasonDialog
        open={reversing !== null}
        onOpenChange={(o) => !o && setReversing(null)}
        title={`Reverse ${reversing?.receiptNumber ?? ""}?`}
        description="For a bounced cheque, a wrong entry or a refund. The receipt stays on record as reversed and the fees are reopened."
        confirmLabel="Reverse payment"
        run={(reason) => reversePaymentAction(reversing!.id, { reason })}
      />
    </div>
  )
}

function PaymentForm({ account }: { account: StudentAccount }) {
  const router = useRouter()
  const open = account.fees.filter((f) => f.status === "UNPAID" || f.status === "PARTIAL")
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(open.map((f) => f.id)))
  const due = open.filter((f) => selected.has(f.id)).reduce((n, f) => n + f.balance, 0)
  const [formError, setFormError] = React.useState<string | null>(null)
  // One key per form: if the same submission reaches the server twice
  // (double-click, retry), only one payment is recorded.
  const [requestId] = React.useState(() => crypto.randomUUID())
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { studentId: account.student.id, amount: (due / 100).toFixed(2), receivedOn: localDate(), method: "CASH", reference: "", payerName: "", note: "", studentFeeIds: [], pending: false, confirmedOnline: false },
  })
  const method = useWatch({ control: form.control, name: "method" })

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    form.setValue("amount", (open.filter((f) => next.has(f.id)).reduce((n, f) => n + f.balance, 0) / 100).toFixed(2))
  }

  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    if (selected.size === 0) {
      setFormError("Choose at least one fee to pay.")
      return
    }
    const result = await recordPaymentAction({ ...values, studentFeeIds: [...selected], requestId })
    if (!result.ok) {
      setFormError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: `Receipt ${result.data.receiptNumber} issued`, type: "success" })
    router.push(`/dashboard/finance/payments/${result.data.id}`)
  })

  return (
    <ContentSection title="Record a payment" description="Paid towards the chosen fees, earliest due first. Part payments are fine.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {formError && <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{formError}</p>}
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Fees to pay</legend>
          {open.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm has-checked:border-primary/40 has-checked:bg-primary/5">
              <span className="flex items-center gap-2.5">
                <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} />
                <span>{f.title}<span className="block text-xs text-muted-foreground">due {formatDate(f.dueDate)}{f.overdue ? " · overdue" : ""}</span></span>
              </span>
              <span className="font-semibold tabular-nums">{formatRs(f.balance)}</span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">Selected balance: {formatRs(due)}</p>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField control={form.control} name="amount" label="Amount received (Rs.)" required inputMode="decimal" />
          <TextField control={form.control} name="receivedOn" label="Date" type="date" required max={localDate()} />
          <SelectField control={form.control} name="method" label="Method" options={labelOptions(PAYMENT_METHOD_LABELS)} onValueChange={() => { form.setValue("pending", false); form.setValue("confirmedOnline", false) }} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {REFERENCE_METHODS.includes(method) && (
            <TextField control={form.control} name="reference" label={ONLINE_METHODS.includes(method) ? "Transaction ID" : method === "CHEQUE" ? "Cheque number" : "Reference"} required />
          )}
          <TextField control={form.control} name="payerName" label="Paid by" placeholder="If not the student (e.g. father)" />
        </div>
        {ONLINE_METHODS.includes(method) && (
          <Controller
            control={form.control}
            name="confirmedOnline"
            render={({ field, fieldState }) => (
              <label className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" />
                <span>
                  I found this transaction in the {PAYMENT_METHOD_LABELS[method]} merchant dashboard and it shows as successful.
                  <span className="block text-xs text-muted-foreground">There is no live {PAYMENT_METHOD_LABELS[method]} connection; the payment is recorded as verified by you.</span>
                  {fieldState.error && <span className="block text-xs text-destructive">{fieldState.error.message}</span>}
                </span>
              </label>
            )}
          />
        )}
        {PENDABLE_METHODS.includes(method) && (
          <Controller
            control={form.control}
            name="pending"
            render={({ field }) => (
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" />
                <span>Not cleared yet<span className="block text-xs text-muted-foreground">Recorded as awaiting clearance; it counts as paid only once confirmed.</span></span>
              </label>
            )}
          />
        )}
        <TextField control={form.control} name="note" label="Note" />
        <Button type="submit" className="justify-self-start" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner />}
          Record payment & issue receipt
        </Button>
        {account.totals.pending > 0 && <Badge variant="outline" className="justify-self-start">{formatRs(account.totals.pending)} already awaiting clearance</Badge>}
      </form>
    </ContentSection>
  )
}
