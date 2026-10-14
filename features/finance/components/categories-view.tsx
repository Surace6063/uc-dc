"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm } from "react-hook-form"
import { PencilIcon, PlusIcon, SparklesIcon, TagsIcon } from "lucide-react"
import type { z } from "zod"

import { ContentSection } from "@/components/shared/content-section"
import { EmptyState } from "@/components/shared/empty-state"
import { labelOptions } from "@/components/shared/filter-controls"
import { SelectField, SwitchField, TextField } from "@/components/shared/form-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { addDefaultCategoriesAction, saveCategoryAction } from "@/features/finance/actions"
import { CATEGORY_KIND_LABELS } from "@/features/finance/constants"
import { categorySchema } from "@/features/finance/schemas"
import { useActionRunner, useDialogSubmit } from "@/hooks/use-dialog-submit"
import type { FinanceCategoryKind } from "@/lib/generated/prisma/enums"
import type { CategoryRow } from "@/services/finance/fee-service"

type FormInput = z.input<typeof categorySchema>
type FormOutput = z.output<typeof categorySchema>

const GROUPS: { kind: FinanceCategoryKind; title: string; description: string }[] = [
  { kind: "FEE", title: "Fee heads", description: "What students are charged for: admission, tuition, examination, …" },
  { kind: "INCOME", title: "Income sources", description: "Money received other than student fees: grants, donations, interest." },
  { kind: "EXPENSE", title: "Expense heads", description: "What the institution spends on: salaries, utilities, rent, …" },
]

export function CategoriesView({ categories, canEdit }: { categories: CategoryRow[]; canEdit: boolean }) {
  const [editing, setEditing] = React.useState<CategoryRow | FinanceCategoryKind | null>(null)
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(categorySchema) })
  const { error, setError, run } = useDialogSubmit(form, () => setEditing(null))
  const runner = useActionRunner()

  function open(target: CategoryRow | FinanceCategoryKind) {
    setError(null)
    form.reset(typeof target === "string" ? { kind: target, name: "", code: "", description: "", isActive: true } : { kind: target.kind, name: target.name, code: target.code ?? "", description: target.description ?? "", isActive: target.isActive })
    setEditing(target)
  }

  return (
    <div className="flex flex-col gap-4">
      {categories.length === 0 && (
        <EmptyState icon={TagsIcon} title="No categories yet" description="Categories organise fees, income and expenses. Start with the suggested set and edit it to match your institution.">
          {canEdit && (
            <Button size="sm" disabled={runner.pending} onClick={() => runner.run(addDefaultCategoriesAction)}>
              <SparklesIcon data-icon="inline-start" />
              Add suggested categories
            </Button>
          )}
        </EmptyState>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {GROUPS.map((g) => {
          const rows = categories.filter((c) => c.kind === g.kind)
          return (
            <ContentSection
              key={g.kind}
              title={g.title}
              description={g.description}
              actions={canEdit && <Button size="sm" variant="outline" onClick={() => open(g.kind)}><PlusIcon data-icon="inline-start" />Add</Button>}
            >
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {rows.map((c) => {
                    const used = c._count.feeStructures + c._count.studentFees + c._count.entries
                    return (
                      <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <span className="truncate">{c.name}</span>
                            {c.code && <span className="font-mono text-xs text-muted-foreground">{c.code}</span>}
                            {!c.isActive && <Badge variant="outline">Inactive</Badge>}
                          </span>
                          <span className="block text-xs text-muted-foreground">{used ? `Used ${used} time${used === 1 ? "" : "s"}` : "Not used yet"}</span>
                        </span>
                        {canEdit && <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => open(c)}><PencilIcon /></Button>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </ContentSection>
          )
        })}
      </div>
      {categories.length > 0 && canEdit && (
        <Button variant="ghost" size="sm" className="self-start" disabled={runner.pending} onClick={() => runner.run(addDefaultCategoriesAction)}>
          <SparklesIcon data-icon="inline-start" />
          Add any missing suggested categories
        </Button>
      )}

      <FormProvider {...form}>
        <FormDialog
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          title={typeof editing === "string" ? `New ${CATEGORY_KIND_LABELS[editing].toLowerCase()}` : "Edit category"}
          description={typeof editing === "object" && editing && editing._count.feeStructures + editing._count.studentFees + editing._count.entries > 0 ? "This category is in use; its type can't change. Make it inactive to stop using it." : undefined}
          pending={form.formState.isSubmitting}
          error={error}
          onSubmit={form.handleSubmit((values) => run(() => saveCategoryAction(typeof editing === "object" && editing ? editing.id : null, values)))}
        >
          <SelectField control={form.control} name="kind" label="Type" options={labelOptions(CATEGORY_KIND_LABELS)} />
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <TextField control={form.control} name="name" label="Name" required />
            <TextField control={form.control} name="code" label="Code" placeholder="Optional" />
          </div>
          <TextField control={form.control} name="description" label="Description" />
          <SwitchField control={form.control} name="isActive" label="Active" description="Inactive categories stay on old records but can't be chosen for new ones." />
        </FormDialog>
      </FormProvider>
    </div>
  )
}
