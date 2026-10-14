"use client"

import * as React from "react"
import { DownloadIcon, PrinterIcon } from "lucide-react"

import { FilterChips, FilterSelect, SearchBox } from "@/components/shared/filter-controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { FEE_STATUS_LABELS } from "@/features/finance/constants"
import { FINANCE_DEPENDENTS } from "@/features/finance/filters"
import { useActionRunner } from "@/hooks/use-dialog-submit"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { StudentFeeStatus } from "@/lib/generated/prisma/enums"

// Shared finance UI: filters (in the URL, applied on the server), reason
// dialogs for reversals, voids and cancellations, print and status badges.

export function useFinanceFilters() {
  return useUrlFilters(FINANCE_DEPENDENTS)
}

export type SelectFilter = { key: string; label: string; value: string | undefined; options: { value: string; label: string }[]; allLabel?: string }

export function FinanceToolbar({
  q,
  searchPlaceholder,
  selects = [],
  dates,
  amounts,
  exportHref,
  actions,
}: {
  q?: string
  searchPlaceholder: string
  selects?: SelectFilter[]
  dates?: { from?: string; to?: string; fromLabel?: string; toLabel?: string }
  amounts?: { min?: number; max?: number }
  exportHref?: string
  actions?: React.ReactNode
}) {
  const { setParams } = useFinanceFilters()
  const rupees = (p?: number) => (p === undefined ? "" : String(p / 100))
  const chips = [
    q && { key: "q", label: `“${q}”` },
    ...selects.filter((s) => s.value).map((s) => ({ key: s.key, label: `${s.label}: ${s.options.find((o) => o.value === s.value)?.label ?? s.value}` })),
    dates?.from && { key: "from", label: `From ${dates.from}` },
    dates?.to && { key: "to", label: `To ${dates.to}` },
    amounts?.min !== undefined && { key: "min", label: `≥ Rs. ${rupees(amounts.min)}` },
    amounts?.max !== undefined && { key: "max", label: `≤ Rs. ${rupees(amounts.max)}` },
  ].filter((c): c is { key: string; label: string } => !!c)
  return (
    <div className="flex flex-col gap-3 border-b p-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchBox value={q ?? ""} onSearch={(v) => setParams({ q: v })} placeholder={searchPlaceholder} label={searchPlaceholder} />
        <div className="flex flex-wrap gap-2">
          {exportHref && (
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={exportHref} />}>
              <DownloadIcon data-icon="inline-start" />
              CSV
            </Button>
          )}
          {actions}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {selects.map((s) => (
          <FilterSelect key={s.key} label={s.label} value={s.value} allLabel={s.allLabel} onChange={(v) => setParams({ [s.key]: v })} options={s.options} />
        ))}
        {dates && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="ff-from" className="text-xs text-muted-foreground">{dates.fromLabel ?? "From"}</Label>
              <Input id="ff-from" type="date" value={dates.from ?? ""} onChange={(e) => setParams({ from: e.target.value || null })} className="h-8" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ff-to" className="text-xs text-muted-foreground">{dates.toLabel ?? "To"}</Label>
              <Input id="ff-to" type="date" value={dates.to ?? ""} onChange={(e) => setParams({ to: e.target.value || null })} className="h-8" />
            </div>
          </>
        )}
        {amounts && (
          <>
            <AmountInput id="ff-min" label="Min amount (Rs.)" value={rupees(amounts.min)} onCommit={(v) => setParams({ min: v })} />
            <AmountInput id="ff-max" label="Max amount (Rs.)" value={rupees(amounts.max)} onCommit={(v) => setParams({ max: v })} />
          </>
        )}
      </div>
      {chips.length > 0 && <FilterChips chips={chips} onRemove={(key) => setParams({ [key]: null })} onClear={() => setParams(Object.fromEntries(chips.map((c) => [c.key, null])))} />}
    </div>
  )
}

function AmountInput({ id, label, value, onCommit }: { id: string; label: string; value: string; onCommit: (v: string | null) => void }) {
  const [text, setText] = React.useState(value)
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input id={id} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== value && onCommit(text.trim() || null)} onKeyDown={(e) => e.key === "Enter" && onCommit(text.trim() || null)} className="h-8" />
    </div>
  )
}

// A destructive finance action that needs a recorded reason.
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  run,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  run: (reason: string) => Promise<{ ok: true; message?: string } | { ok: false; error: string }>
}) {
  const [reason, setReason] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const runner = useActionRunner()
  // Cleared on close, so the next opening starts empty.
  const change = (next: boolean) => {
    if (!next) {
      setReason("")
      setError(null)
    }
    onOpenChange(next)
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={change}
      title={title}
      description={description}
      pending={runner.pending}
      error={error}
      submitLabel={confirmLabel}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!reason.trim()) {
          setError("Give a reason. It's kept in the audit history.")
          return
        }
        if (await runner.run(() => run(reason.trim()))) change(false)
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="reason-text">Reason <span className="text-destructive">*</span></Label>
        <Textarea id="reason-text" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </FormDialog>
  )
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <PrinterIcon data-icon="inline-start" />
      {label}
    </Button>
  )
}

const FEE_VARIANT: Record<StudentFeeStatus, "default" | "secondary" | "outline" | "destructive"> = { UNPAID: "outline", PARTIAL: "default", PAID: "secondary", CANCELLED: "outline" }

export function FeeStatusBadge({ status, overdue }: { status: StudentFeeStatus; overdue?: boolean }) {
  if (overdue) return <Badge variant="destructive">Overdue</Badge>
  return <Badge variant={FEE_VARIANT[status]} className={status === "CANCELLED" ? "text-muted-foreground line-through" : undefined}>{FEE_STATUS_LABELS[status]}</Badge>
}

export function PaymentStateBadge({ status, verification }: { status: "COMPLETED" | "REVERSED"; verification: "VERIFIED" | "PENDING" }) {
  if (status === "REVERSED") return <Badge variant="destructive">Reversed</Badge>
  if (verification === "PENDING") return <Badge variant="outline">Awaiting clearance</Badge>
  return <Badge variant="secondary">Completed</Badge>
}
