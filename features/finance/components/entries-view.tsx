"use client"

import * as React from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm } from "react-hook-form"
import { BanknoteIcon, MoreHorizontalIcon, PlusIcon, XCircleIcon } from "lucide-react"
import type { SortingState } from "@tanstack/react-table"
import type { z } from "zod"

import { createServerColumnHelper, ServerDataTable, type ServerColumns } from "@/components/server-data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { labelOptions } from "@/components/shared/filter-controls"
import { SelectField, TextField } from "@/components/shared/form-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { localDate } from "@/features/attendance/constants"
import { saveEntryAction, voidEntryAction } from "@/features/finance/actions"
import { FinanceToolbar, ReasonDialog, useFinanceFilters } from "@/features/finance/components/finance-ui"
import { PAYMENT_METHOD_LABELS } from "@/features/finance/constants"
import type { EntryFilters } from "@/features/finance/filters"
import { formatRs } from "@/features/finance/money"
import { entrySchema } from "@/features/finance/schemas"
import { formatDate } from "@/features/teaching/format"
import { useDialogSubmit } from "@/hooks/use-dialog-submit"
import type { EntryRow, listEntries } from "@/services/finance/ledger-service"

type List = Awaited<ReturnType<typeof listEntries>>
type FormInput = z.input<typeof entrySchema>
type FormOutput = z.output<typeof entrySchema>

// Income or expense entries: record, filter, export and void.
export function EntriesView({
  kind,
  list,
  filters,
  categories,
  openNew,
  can,
}: {
  kind: "INCOME" | "EXPENSE"
  list: List
  filters: EntryFilters
  categories: { id: string; name: string }[]
  openNew: boolean
  can: { create: boolean; reverse: boolean; reports: boolean }
}) {
  const income = kind === "INCOME"
  const { setParams, pending, searchParams } = useFinanceFilters()
  const [adding, setAdding] = React.useState(false)
  const [voiding, setVoiding] = React.useState<EntryRow | null>(null)
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(entrySchema) })
  const { error, setError, run } = useDialogSubmit(form, () => setAdding(false))

  const open = React.useCallback(() => {
    setError(null)
    form.reset({ kind, categoryId: "", entryDate: localDate(), amount: "", description: "", party: "", method: "CASH", reference: "" })
    setAdding(true)
  }, [form, kind, setError])

  const opened = React.useRef(false)
  React.useEffect(() => {
    if (openNew && can.create && !opened.current) {
      opened.current = true
      open()
    }
  }, [openNew, can.create, open])

  const columns = React.useMemo<ServerColumns<EntryRow>>(() => {
    const h = createServerColumnHelper<EntryRow>()
    return [
      h.accessor("entryDate", { header: "Date", meta: { cellClassName: "whitespace-nowrap text-sm" }, cell: ({ row }) => formatDate(row.original.entryDate) }),
      h.display({
        id: "what",
        header: "Description",
        cell: ({ row }) => (
          <span className={row.original.status === "VOIDED" ? "block min-w-52 text-sm text-muted-foreground line-through" : "block min-w-52 text-sm"}>
            {row.original.description}
            <span className="block text-xs text-muted-foreground no-underline">{row.original.category.name}{row.original.party ? ` · ${income ? "from" : "to"} ${row.original.party}` : ""}</span>
          </span>
        ),
      }),
      h.display({ id: "method", header: "Method", cell: ({ row }) => <span className="text-sm">{PAYMENT_METHOD_LABELS[row.original.method]}{row.original.reference && <span className="block font-mono text-xs text-muted-foreground">{row.original.reference}</span>}</span> }),
      h.accessor("amount", { header: "Amount", meta: { cellClassName: "text-right font-semibold tabular-nums whitespace-nowrap", headerClassName: "text-right" }, cell: ({ row }) => formatRs(row.original.amount) }),
      h.display({ id: "state", header: "Status", cell: ({ row }) => (row.original.status === "VOIDED" ? <span className="text-sm"><Badge variant="destructive">Voided</Badge><span className="block text-xs text-muted-foreground">{row.original.voidReason}</span></span> : <span className="text-xs text-muted-foreground">by {row.original.createdBy ?? "—"}</span>) }),
      h.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { cellClassName: "w-12 text-right" },
        cell: ({ row }) =>
          can.reverse && row.original.status === "ACTIVE" ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.description}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onClick={() => setVoiding(row.original)}><XCircleIcon />Void entry</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      }),
    ]
  }, [can.reverse, income])

  const sorting: SortingState = [{ id: filters.sort, desc: filters.dir === "desc" }]

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {list.total.toLocaleString()} entr{list.total === 1 ? "y" : "ies"} · <span className="font-semibold text-foreground">{formatRs(list.sum)}</span> total (excluding voided)
      </p>
      <ServerDataTable
        data={list.rows}
        columns={columns}
        rowCount={list.total}
        getRowId={(r) => r.id}
        pagination={{ pageIndex: filters.page - 1, pageSize: filters.pageSize }}
        onPaginationChange={(p) => setParams({ page: p.pageIndex > 0 ? String(p.pageIndex + 1) : null, pageSize: String(p.pageSize) }, { resetPage: false })}
        sorting={sorting}
        onSortingChange={(next) => next[0] && ["entryDate", "amount"].includes(next[0].id) && setParams({ sort: next[0].id, dir: next[0].desc ? "desc" : "asc" })}
        loading={pending}
        toolbar={
          <FinanceToolbar
            q={filters.q}
            searchPlaceholder={`Search description, ${income ? "payer" : "payee"} or reference`}
            selects={[
              { key: "category", label: "Category", value: filters.category, options: categories.map((c) => ({ value: c.id, label: c.name })) },
              { key: "method", label: "Method", value: filters.method, options: labelOptions(PAYMENT_METHOD_LABELS) },
              { key: "view", label: "Show", value: filters.view === "active" ? undefined : filters.view, allLabel: "Active", options: [{ value: "voided", label: "Voided" }, { value: "all", label: "All" }] },
            ]}
            dates={{ from: filters.from, to: filters.to }}
            exportHref={can.reports ? `/api/finance/export/${income ? "income" : "expenses"}?${new URLSearchParams(searchParams.toString())}` : undefined}
            actions={can.create && <Button size="sm" onClick={open}><PlusIcon data-icon="inline-start" />Record {income ? "income" : "expense"}</Button>}
          />
        }
        empty={<EmptyState icon={BanknoteIcon} title={`No ${income ? "income" : "expenses"} recorded`} description={categories.length ? "Nothing matches these filters." : `Add ${income ? "income sources" : "expense heads"} under Categories first.`} className="border-0 bg-transparent py-6" />}
      />

      <FormProvider {...form}>
        <FormDialog open={adding} onOpenChange={setAdding} title={`Record ${income ? "income" : "an expense"}`} description="Entries can't be edited afterwards; a wrong entry is voided with a reason." pending={form.formState.isSubmitting} error={error} wide onSubmit={form.handleSubmit((values) => run(() => saveEntryAction(values)))}>
          {categories.length === 0 && <p className="text-sm text-muted-foreground">No {income ? "income sources" : "expense heads"} yet. <Link href="/dashboard/finance/categories" className="underline">Add categories</Link>.</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField control={form.control} name="categoryId" label="Category" required placeholder="Choose" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
            <TextField control={form.control} name="entryDate" label="Date" type="date" required />
            <TextField control={form.control} name="amount" label="Amount (Rs.)" required inputMode="decimal" />
          </div>
          <TextField control={form.control} name="description" label="Description" required placeholder={income ? "UGC infrastructure grant, 2nd tranche" : "Electricity bill, Kartik"} />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField control={form.control} name="party" label={income ? "Received from" : "Paid to"} />
            <SelectField control={form.control} name="method" label="Method" options={labelOptions(PAYMENT_METHOD_LABELS)} />
            <TextField control={form.control} name="reference" label="Reference / bill no." />
          </div>
        </FormDialog>
      </FormProvider>

      <ReasonDialog
        open={voiding !== null}
        onOpenChange={(o) => !o && setVoiding(null)}
        title="Void this entry?"
        description="It stays on record as voided and no longer counts in totals or reports."
        confirmLabel="Void entry"
        run={(reason) => voidEntryAction(voiding!.id, { reason })}
      />
    </div>
  )
}
