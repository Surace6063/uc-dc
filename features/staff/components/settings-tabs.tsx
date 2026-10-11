"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowDownIcon, ArrowRightLeftIcon, ArrowUpIcon, SparklesIcon } from "lucide-react"
import { useForm, useWatch, type DefaultValues, type FieldValues, type UseFormReturn } from "react-hook-form"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { FormAlert } from "@/components/shared/form"
import { labelOptions } from "@/components/shared/filter-controls"
import { applyServerErrors, SelectField, SwitchField, TextAreaField, TextField } from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import {
  ActiveBadge,
  AddButton,
  FormDialog,
  RecordTable,
  SectionHeader,
} from "@/features/academics/components/structure-kit"
import {
  addSuggestedStaffStructureAction,
  deleteStaffConfigAction,
  reassignDepartmentAction,
  reorderStaffConfigAction,
  saveEmployeeIdSettingsAction,
  saveStaffConfigAction,
  type StaffConfigEntity,
} from "@/features/staff/actions"
import { DESIGNATION_SCOPE_LABELS, JOB_CATEGORY_LABELS } from "@/features/staff/constants"
import {
  departmentSchema,
  employeeIdSettingsSchema,
  staffDesignationSchema,
  staffDocumentTypeSchema,
} from "@/features/staff/schemas"
import type { StaffConfiguration } from "@/services/staff/config-service"

type Props = { config: StaffConfiguration; canManage: boolean }

// Form state + submission for one configuration record (create or edit).
function useConfigForm<Schema extends z.ZodType<FieldValues, FieldValues>>(kind: StaffConfigEntity, schema: Schema, onSaved: () => void) {
  const router = useRouter()
  const [recordId, setRecordId] = React.useState<string | null>(null)
  const [formError, setFormError] = React.useState<string | null>(null)
  const form = useForm<z.input<Schema>, unknown, z.output<Schema>>({ resolver: zodResolver(schema as never) })
  const open = (id: string | null, values: z.input<Schema>) => {
    setRecordId(id)
    setFormError(null)
    form.reset(values as DefaultValues<z.input<Schema>>)
  }
  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    const result = await saveStaffConfigAction(kind, recordId, values)
    if (!result.ok) {
      setFormError(applyServerErrors(form as unknown as UseFormReturn<FieldValues>, result))
      return
    }
    toast.add({ title: recordId ? "Changes saved" : "Added", type: "success" })
    onSaved()
    router.refresh()
  })
  return { form, recordId, open, submit, formError }
}

function useDeleteConfig(kind: StaffConfigEntity) {
  const router = useRouter()
  const [target, setTarget] = React.useState<{ id: string; name: string } | null>(null)
  const dialog = (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(o) => !o && setTarget(null)}
      title={`Delete ${target?.name ?? ""}?`}
      description="This can't be undone. Records that are in use can't be deleted; deactivate them instead."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        if (!target) return
        const result = await deleteStaffConfigAction(kind, target.id)
        if (!result.ok) {
          toast.add({ title: "Couldn't delete", description: result.error, type: "error" })
          return false
        }
        toast.add({ title: "Deleted", type: "success" })
        router.refresh()
      }}
    />
  )
  return { confirmDelete: setTarget, dialog }
}

// Up/down controls that save the new order of the whole list.
function useReorder(kind: "department" | "designation", ids: string[]) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  return {
    busy,
    move: async (id: string, delta: -1 | 1) => {
      const index = ids.indexOf(id)
      const target = index + delta
      if (index < 0 || target < 0 || target >= ids.length) return
      const next = [...ids]
      ;[next[index], next[target]] = [next[target], next[index]]
      setBusy(true)
      const result = await reorderStaffConfigAction(kind, next)
      setBusy(false)
      if (!result.ok) toast.add({ title: "Couldn't reorder", description: result.error, type: "error" })
      else router.refresh()
    },
  }
}

function OrderButtons({ onMove, first, last, disabled }: { onMove: (d: -1 | 1) => void; first: boolean; last: boolean; disabled: boolean }) {
  return (
    <div className="flex gap-0.5">
      <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={first || disabled} onClick={() => onMove(-1)}>
        <ArrowUpIcon />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={last || disabled} onClick={() => onMove(1)}>
        <ArrowDownIcon />
      </Button>
    </div>
  )
}

// --------------------------------------------------------------- departments

type Department = StaffConfiguration["departments"][number]

export function DepartmentsTab({ config, canManage }: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const { form, recordId, open: load, submit, formError } = useConfigForm("department", departmentSchema, () => setOpen(false))
  const { confirmDelete, dialog } = useDeleteConfig("department")
  const reorder = useReorder("department", config.departments.map((d) => d.id))
  const [moving, setMoving] = React.useState<Department | null>(null)
  const [moveTo, setMoveTo] = React.useState("")
  const [moveDate, setMoveDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [suggesting, setSuggesting] = React.useState(false)

  function edit(d: Department | null) {
    load(d?.id ?? null, {
      name: d?.name ?? "", code: d?.code ?? "", description: d?.description ?? "",
      isActive: d?.isActive ?? true, sortOrder: d?.sortOrder ?? (config.departments.length + 1) * 10,
    })
    setOpen(true)
  }

  async function addSuggested() {
    setSuggesting(true)
    const result = await addSuggestedStaffStructureAction()
    setSuggesting(false)
    if (!result.ok) {
      toast.add({ title: "Couldn't add suggestions", description: result.error, type: "error" })
      return
    }
    toast.add({ title: `Added ${result.data.departments} department(s) and ${result.data.designations} designation(s)`, type: "success" })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Departments"
        description="Administrative and support units for non-teaching staff: Administration, Finance, Library, Transport… Academic faculties are configured under Education structure."
        action={
          canManage && (
            <>
              <Button size="sm" variant="outline" onClick={addSuggested} disabled={suggesting}>
                {suggesting ? <Spinner /> : <SparklesIcon data-icon="inline-start" />}
                Add common departments
              </Button>
              <AddButton onClick={() => edit(null)}>Add department</AddButton>
            </>
          )
        }
      />
      <RecordTable
        rows={config.departments}
        canManage={canManage}
        onEdit={edit}
        onDelete={(d) => confirmDelete({ id: d.id, name: d.name })}
        extraActions={(d) =>
          d._count.staff > 0 ? (
            <DropdownMenuItem onClick={() => { setMoveTo(""); setMoving(d) }}>
              <ArrowRightLeftIcon />
              Move staff to…
            </DropdownMenuItem>
          ) : null
        }
        emptyTitle="No departments yet"
        emptyDescription="Add your departments, or start from the common list and edit it."
        columns={[
          ...(canManage
            ? [{
                header: "Order",
                cell: (d: Department) => (
                  <OrderButtons
                    onMove={(delta) => reorder.move(d.id, delta)}
                    first={config.departments[0]?.id === d.id}
                    last={config.departments.at(-1)?.id === d.id}
                    disabled={reorder.busy}
                  />
                ),
                className: "w-20",
              }]
            : []),
          { header: "Department", cell: (d) => <span className="font-medium">{d.name}</span> },
          { header: "Code", cell: (d) => <code className="text-xs">{d.code}</code> },
          { header: "Current staff", cell: (d) => d._count.staff, className: "tabular-nums" },
          { header: "Designations", cell: (d) => d._count.designations, className: "tabular-nums" },
          { header: "Status", cell: (d) => <ActiveBadge active={d.isActive} /> },
        ]}
      />
      <FormDialog open={open} onOpenChange={setOpen} title={recordId ? "Edit department" : "Add department"} pending={form.formState.isSubmitting} error={formError} onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <TextField control={form.control} name="name" label="Name" required placeholder="Finance and Accounts" />
          <TextField control={form.control} name="code" label="Code" required placeholder="FIN" />
        </div>
        <TextAreaField control={form.control} name="description" label="Description" rows={2} />
        <SwitchField control={form.control} name="isActive" label="Active" description="Inactive departments can't be chosen for new placements. Move current staff out first." />
      </FormDialog>
      <ConfirmDialog
        open={moving !== null}
        onOpenChange={(o) => !o && setMoving(null)}
        title={`Move staff out of ${moving?.name ?? ""}`}
        description={`Moves ${moving?._count.staff ?? 0} current staff member(s). Each move is recorded in their employment history.`}
        confirmLabel="Move staff"
        onConfirm={async () => {
          if (!moving) return
          const result = await reassignDepartmentAction(moving.id, { toDepartmentId: moveTo, effectiveDate: moveDate })
          if (!result.ok) {
            toast.add({ title: "Couldn't move staff", description: result.error, type: "error" })
            return false
          }
          toast.add({ title: `Moved ${result.data.moved} staff member(s)`, type: "success" })
          router.refresh()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="move-to">To department</Label>
            <NativeSelect id="move-to" className="w-full" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <NativeSelectOption value="">Choose</NativeSelectOption>
              {config.departments.filter((d) => d.isActive && d.id !== moving?.id).map((d) => (
                <NativeSelectOption key={d.id} value={d.id}>{d.name}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="move-date">Effective from</Label>
            <Input id="move-date" type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
          </div>
        </div>
      </ConfirmDialog>
      {dialog}
    </div>
  )
}

// -------------------------------------------------------------- designations

type Designation = StaffConfiguration["designations"][number]

export function DesignationsTab({ config, canManage }: Props) {
  const [open, setOpen] = React.useState(false)
  const { form, recordId, open: load, submit, formError } = useConfigForm("designation", staffDesignationSchema, () => setOpen(false))
  const { confirmDelete, dialog } = useDeleteConfig("designation")
  const reorder = useReorder("designation", config.designations.map((d) => d.id))
  const departmentName = (id: string | null) => config.departments.find((d) => d.id === id)?.name

  function edit(d: Designation | null) {
    load(d?.id ?? null, {
      name: d?.name ?? "", scope: d?.scope ?? "NON_TEACHING", category: d?.category ?? "", departmentId: d?.departmentId ?? "",
      isActive: d?.isActive ?? true, sortOrder: d?.sortOrder ?? (config.designations.length + 1) * 10,
    })
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Designations"
        description="Job titles shared by teachers and staff. A designation describes a job; it never grants access to the system."
        action={canManage && <AddButton onClick={() => edit(null)}>Add designation</AddButton>}
      />
      <RecordTable
        rows={config.designations}
        canManage={canManage}
        onEdit={edit}
        onDelete={(d) => confirmDelete({ id: d.id, name: d.name })}
        emptyTitle="No designations"
        emptyDescription="Add the job titles your institution uses."
        columns={[
          ...(canManage
            ? [{
                header: "Order",
                cell: (d: Designation) => (
                  <OrderButtons
                    onMove={(delta) => reorder.move(d.id, delta)}
                    first={config.designations[0]?.id === d.id}
                    last={config.designations.at(-1)?.id === d.id}
                    disabled={reorder.busy}
                  />
                ),
                className: "w-20",
              }]
            : []),
          { header: "Designation", cell: (d) => <span className="font-medium">{d.name}</span> },
          { header: "Used for", cell: (d) => DESIGNATION_SCOPE_LABELS[d.scope] },
          { header: "Category", cell: (d) => (d.category ? JOB_CATEGORY_LABELS[d.category] : "—") },
          { header: "Usual department", cell: (d) => departmentName(d.departmentId) ?? "—" },
          { header: "Staff", cell: (d) => d._count.staff, className: "tabular-nums" },
          { header: "Teachers", cell: (d) => d._count.teachers, className: "tabular-nums" },
          { header: "Status", cell: (d) => <ActiveBadge active={d.isActive} /> },
        ]}
      />
      <FormDialog open={open} onOpenChange={setOpen} title={recordId ? "Edit designation" : "Add designation"} pending={form.formState.isSubmitting} error={formError} onSubmit={submit}>
        <TextField control={form.control} name="name" label="Name" required placeholder="Accountant" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField control={form.control} name="scope" label="Used for" options={labelOptions(DESIGNATION_SCOPE_LABELS)} />
          <SelectField control={form.control} name="category" label="Job category" placeholder="None" options={labelOptions(JOB_CATEGORY_LABELS)} />
        </div>
        <SelectField
          control={form.control}
          name="departmentId"
          label="Usual department"
          placeholder="Any"
          description="Optional. Suggested first when this department is chosen."
          options={config.departments.filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name }))}
        />
        <SwitchField control={form.control} name="isActive" label="Active" />
      </FormDialog>
      {dialog}
    </div>
  )
}

// ------------------------------------------------------------- document types

type DocumentType = StaffConfiguration["documentTypes"][number]

export function DocumentTypesTab({ config, canManage }: Props) {
  const [open, setOpen] = React.useState(false)
  const { form, recordId, open: load, submit, formError } = useConfigForm("documentType", staffDocumentTypeSchema, () => setOpen(false))
  const { confirmDelete, dialog } = useDeleteConfig("documentType")

  function edit(d: DocumentType | null) {
    load(d?.id ?? null, {
      name: d?.name ?? "", description: d?.description ?? "", isRequired: d?.isRequired ?? true,
      isActive: d?.isActive ?? true, sortOrder: d?.sortOrder ?? (config.documentTypes.length + 1) * 10,
    })
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Staff document types"
        description="Documents you ask staff to provide, such as a CV, appointment letter or contract. Required ones are tracked in the “Missing required documents” filter."
        action={canManage && <AddButton onClick={() => edit(null)}>Add document type</AddButton>}
      />
      <RecordTable
        rows={config.documentTypes}
        canManage={canManage}
        onEdit={edit}
        onDelete={(d) => confirmDelete({ id: d.id, name: d.name })}
        emptyTitle="No document types"
        emptyDescription="Optional. Add the documents your institution collects from staff."
        columns={[
          { header: "Document", cell: (d) => <span className="font-medium">{d.name}</span> },
          { header: "Required", cell: (d) => (d.isRequired ? "Required" : "Optional") },
          { header: "Uploaded", cell: (d) => d._count.staffDocuments, className: "tabular-nums" },
          { header: "Status", cell: (d) => <ActiveBadge active={d.isActive} /> },
        ]}
      />
      <FormDialog open={open} onOpenChange={setOpen} title={recordId ? "Edit document type" : "Add document type"} pending={form.formState.isSubmitting} error={formError} onSubmit={submit}>
        <TextField control={form.control} name="name" label="Name" required placeholder="Appointment letter" />
        <TextAreaField control={form.control} name="description" label="Description" rows={2} />
        <SwitchField control={form.control} name="isRequired" label="Required" />
        <SwitchField control={form.control} name="isActive" label="Active" />
      </FormDialog>
      {dialog}
    </div>
  )
}

// ------------------------------------------------------------- employee IDs

export function EmployeeIdTab({
  settings,
  canManage,
}: {
  settings: { employeeIdMode: "AUTOMATIC" | "MANUAL"; employeeIdPrefix: string; employeeIdPadding: number; nextEmployeeSequence: number }
  canManage: boolean
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof employeeIdSettingsSchema>, unknown, z.output<typeof employeeIdSettingsSchema>>({
    resolver: zodResolver(employeeIdSettingsSchema),
    defaultValues: settings,
  })
  const values = useWatch({ control: form.control })
  const preview = `${values.employeeIdPrefix ?? ""}${String(values.nextEmployeeSequence ?? 1).padStart(Number(values.employeeIdPadding) || 1, "0")}`

  const submit = form.handleSubmit(async (data) => {
    setError(null)
    const result = await saveEmployeeIdSettingsAction(data)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: "Settings saved", type: "success" })
    router.refresh()
  })

  return (
    <Card className="max-w-2xl gap-4 p-5">
      <div>
        <h3 className="font-medium">Employee IDs</h3>
        <p className="text-sm text-muted-foreground">
          One numbering sequence for teachers and staff. IDs are unique across both within your organisation, and generated safely when
          several people add records at once.
        </p>
      </div>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error && <FormAlert tone="error">{error}</FormAlert>}
        <fieldset disabled={!canManage} className="grid gap-4">
          <SelectField
            control={form.control}
            name="employeeIdMode"
            label="Employee IDs"
            options={[
              { value: "AUTOMATIC", label: "Automatic (can be overridden)" },
              { value: "MANUAL", label: "Manual (always entered)" },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField control={form.control} name="employeeIdPrefix" label="Prefix" placeholder="EMP-" />
            <TextField control={form.control} name="employeeIdPadding" label="Digits" type="number" min={1} max={10} />
            <TextField control={form.control} name="nextEmployeeSequence" label="Next number" type="number" min={1} />
          </div>
          <p className="text-sm text-muted-foreground">
            Next employee ID: <span className="font-mono font-medium text-foreground">{preview}</span>
          </p>
        </fieldset>
        {canManage && (
          <Button type="submit" className="justify-self-start" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            Save settings
          </Button>
        )}
      </form>
    </Card>
  )
}
