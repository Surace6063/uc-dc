"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BadgeCheckIcon,
  CameraIcon,
  DownloadIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { FormProvider, useForm, type FieldValues, type UseFormReturn } from "react-hook-form"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { applyServerErrors, TextAreaField, TextField } from "@/components/shared/form-fields"
import { useCan } from "@/components/shared/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_TYPES,
} from "@/features/students/constants"
import {
  addStaffAssignmentAction,
  archiveStaffAction,
  changeStaffEmploymentAction,
  deleteStaffAction,
  deleteStaffDocumentAction,
  deleteStaffQualificationAction,
  endStaffAssignmentAction,
  linkStaffUserAction,
  removeStaffPhotoAction,
  restoreStaffAction,
  saveStaffQualificationAction,
  updateStaffAssignmentAction,
  verifyStaffRecordAction,
} from "@/features/staff/actions"
import {
  DepartmentDesignationFields,
  emptyStaffAssignment,
  emptyStaffQualification,
  StaffAssignmentFields,
  StaffEmploymentFields,
  StaffQualificationFields,
} from "@/features/staff/components/form-sections"
import { AssignmentStatusBadge, StaffStatusBadge, VerificationBadge } from "@/features/staff/components/status-badges"
import {
  QUALIFICATION_KIND_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  STAFF_DOCUMENT_CATEGORY_LABELS,
  STAFF_EMPLOYMENT_STATUS_LABELS,
  STAFF_EMPLOYMENT_TYPE_LABELS,
  staffName,
} from "@/features/staff/constants"
import {
  endStaffAssignmentSchema,
  staffAssignmentSchema,
  staffEmploymentChangeSchema,
  staffQualificationSchema,
} from "@/features/staff/schemas"
import type { StaffDocumentCategory, StaffQualificationKind, VerificationStatus } from "@/lib/generated/prisma/enums"
import { fromDate } from "@/lib/validation"
import type { StaffFormOptions } from "@/services/staff/config-service"
import type { StaffProfile } from "@/services/staff/staff-service"

const today = () => new Date().toISOString().slice(0, 10)
export const formatDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"

type Result = { ok: boolean; error?: string; message?: string }

function useRun() {
  const router = useRouter()
  return async (fn: () => Promise<Result>) => {
    const result = await fn()
    if (!result.ok) {
      toast.add({ title: "Couldn't complete that", description: result.error, type: "error" })
      return false
    }
    toast.add({ title: result.message ?? "Saved", type: "success" })
    router.refresh()
    return true
  }
}

// Submits a dialog form and maps server field errors back onto it.
function useDialogSubmit<T extends FieldValues>(form: UseFormReturn<T, unknown, unknown>, onDone: () => void) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const run = async (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> }>) => {
    setError(null)
    const result = await fn()
    if (!result.ok) {
      setError(applyServerErrors(form as unknown as UseFormReturn<FieldValues>, result))
      return
    }
    toast.add({ title: result.message ?? "Saved", type: "success" })
    onDone()
    router.refresh()
  }
  return { error, setError, run }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

// ----------------------------------------------------------- header actions

export function StaffProfileActions({ staff }: { staff: Pick<StaffProfile, "id" | "archivedAt"> }) {
  const router = useRouter()
  const run = useRun()
  const canUpdate = useCan("staff.update")
  const canArchive = useCan("staff.archive")
  const canDelete = useCan("staff.delete")
  const [dialog, setDialog] = React.useState<"archive" | "restore" | "delete" | null>(null)
  const archived = staff.archivedAt !== null

  return (
    <>
      {canUpdate && !archived && (
        <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/staff/${staff.id}/edit`} />}>
          <PencilIcon data-icon="inline-start" />
          Edit
        </Button>
      )}
      {(canArchive || canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {canArchive && (
              <DropdownMenuItem onClick={() => setDialog(archived ? "restore" : "archive")}>
                {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                {archived ? "Restore" : "Archive"}
              </DropdownMenuItem>
            )}
            {canDelete && archived && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
                  <Trash2Icon />
                  Delete permanently
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ConfirmDialog
        open={dialog === "archive" || dialog === "restore"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog === "archive" ? "Archive this staff member?" : "Restore this staff member?"}
        description={
          dialog === "archive"
            ? "The profile is hidden and active responsibilities end. Employment status, history and the login account are kept. To record a resignation, retirement or termination, change the employment status instead."
            : "The profile appears in lists again. Ended responsibilities stay ended."
        }
        confirmLabel={dialog === "archive" ? "Archive" : "Restore"}
        onConfirm={() => run(() => (dialog === "archive" ? archiveStaffAction(staff.id) : restoreStaffAction(staff.id)))}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Permanently delete this staff member?"
        description="Only for profiles created by mistake, with no employment history, responsibilities or verified records. The linked login account is not deleted. This can't be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={async () => {
          const result = await deleteStaffAction(staff.id)
          if (!result.ok) {
            toast.add({ title: "Couldn't delete", description: result.error, type: "error" })
            return false
          }
          toast.add({ title: "Staff member deleted", type: "success" })
          router.push("/dashboard/staff")
        }}
      />
    </>
  )
}

export function StaffPhotoControl({ staffId, hasPhoto, disabled }: { staffId: string; hasPhoto: boolean; disabled: boolean }) {
  const router = useRouter()
  const run = useRun()
  const canUpdate = useCan("staff.update")
  const input = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  if (!canUpdate || disabled) return null

  async function upload(file: File | undefined) {
    if (!file) return
    if (file.size > PHOTO_MAX_BYTES || !(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.add({ title: "Use a JPG, PNG or WebP image up to 2 MB", type: "error" })
      return
    }
    setUploading(true)
    const body = new FormData()
    body.set("file", file)
    const res = await fetch(`/api/staff/${staffId}/photo`, { method: "POST", body }).catch(() => null)
    setUploading(false)
    if (!res?.ok) {
      const message = await res?.json().then((j) => j.error?.message).catch(() => null)
      toast.add({ title: "Upload failed", description: message ?? "Please try again.", type: "error" })
      return
    }
    toast.add({ title: "Photo updated", type: "success" })
    router.refresh()
  }

  return (
    <div className="flex gap-1">
      <input ref={input} type="file" accept={PHOTO_MIME_TYPES.join(",")} className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      <Button size="xs" variant="ghost" onClick={() => input.current?.click()} disabled={uploading}>
        {uploading ? <Spinner /> : <CameraIcon data-icon="inline-start" />}
        {hasPhoto ? "Change" : "Add photo"}
      </Button>
      {hasPhoto && (
        <Button size="xs" variant="ghost" onClick={() => run(() => removeStaffPhotoAction(staffId))}>
          Remove
        </Button>
      )}
    </div>
  )
}

// Verify / reject menu for one record (never shown for one's own profile).
function VerifyMenu({ staffId, kind, recordId, status, isSelf }: { staffId: string; kind: "qualification" | "document"; recordId: string; status: VerificationStatus; isSelf: boolean }) {
  const canVerify = useCan("staff.verify")
  const run = useRun()
  if (!canVerify || isSelf) return null
  const set = (next: VerificationStatus) => run(() => verifyStaffRecordAction(staffId, kind, recordId, { status: next }))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="xs" variant="ghost" />}>
        <BadgeCheckIcon data-icon="inline-start" />
        Verify
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {status !== "VERIFIED" && <DropdownMenuItem onClick={() => set("VERIFIED")}>Mark verified</DropdownMenuItem>}
        {status !== "REJECTED" && <DropdownMenuItem onClick={() => set("REJECTED")}>Mark rejected</DropdownMenuItem>}
        {status !== "PENDING" && <DropdownMenuItem onClick={() => set("PENDING")}>Reset to pending</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------- employment

export function StaffEmploymentPanel({
  staff,
  options,
  managers,
}: {
  staff: StaffProfile
  options: StaffFormOptions
  managers: { id: string; name: string }[]
}) {
  const canManage = useCan("staff.employment.manage") && !staff.archivedAt
  const [open, setOpen] = React.useState(false)
  const form = useForm<z.input<typeof staffEmploymentChangeSchema>, unknown, z.output<typeof staffEmploymentChangeSchema>>({
    resolver: zodResolver(staffEmploymentChangeSchema),
  })
  const { error, setError, run } = useDialogSubmit(form, () => setOpen(false))
  const e = staff.employment

  function openChange() {
    form.reset({
      dateOfJoining: fromDate(staff.dateOfJoining),
      employmentType: staff.employmentType,
      employmentStatus: staff.employmentStatus,
      designationId: staff.designation?.id ?? "",
      departmentId: staff.department?.id ?? "",
      reportingToId: e?.reportingTo?.id ?? "",
      contractStartDate: fromDate(e?.contractStartDate),
      contractEndDate: fromDate(e?.contractEndDate),
      onProbation: e?.onProbation ?? false,
      probationStartDate: fromDate(e?.probationStartDate),
      probationEndDate: fromDate(e?.probationEndDate),
      resignationDate: fromDate(e?.resignationDate),
      lastWorkingDate: fromDate(e?.lastWorkingDate),
      terminationDate: fromDate(e?.terminationDate),
      leavingReason: e?.leavingReason ?? "",
      employmentNotes: e?.employmentNotes ?? "",
      effectiveDate: today(),
      changeNote: "",
    })
    setError(null)
    setOpen(true)
  }

  return (
    <div className="grid gap-4">
      <Card className="gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Current employment</h2>
            <p className="text-xs text-muted-foreground">Employment status is separate from system access, which comes from the login account&apos;s role.</p>
          </div>
          {canManage && (
            <Button size="sm" onClick={openChange}>
              <PencilIcon data-icon="inline-start" />
              Change employment
            </Button>
          )}
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <Field label="Status" value={<StaffStatusBadge status={staff.employmentStatus} />} />
          <Field label="Type" value={STAFF_EMPLOYMENT_TYPE_LABELS[staff.employmentType]} />
          <Field label="Date of joining" value={formatDate(staff.dateOfJoining)} />
          <Field label="Department" value={staff.department?.name} />
          <Field label="Designation" value={staff.designation?.name} />
          {e && <Field label="Reports to" value={e.reportingTo ? `${staffName(e.reportingTo)} (${e.reportingTo.employeeId})` : null} />}
          {e && <Field label="Contract" value={e.contractStartDate || e.contractEndDate ? `${formatDate(e.contractStartDate)} – ${formatDate(e.contractEndDate)}` : null} />}
          {e && (
            <Field
              label="Probation"
              value={e.onProbation ? `Yes${e.probationStartDate ? `, from ${formatDate(e.probationStartDate)}` : ""}${e.probationEndDate ? ` until ${formatDate(e.probationEndDate)}` : ""}` : "No"}
            />
          )}
          {e?.resignationDate && <Field label="Resignation date" value={formatDate(e.resignationDate)} />}
          {e?.terminationDate && <Field label="Termination date" value={formatDate(e.terminationDate)} />}
          {e?.lastWorkingDate && <Field label="Last working date" value={formatDate(e.lastWorkingDate)} />}
          {e?.leavingReason && <Field label="Reason for leaving" value={e.leavingReason} />}
          {e?.employmentNotes && <Field label="Notes" value={e.employmentNotes} />}
        </dl>
        {!e && <p className="text-xs text-muted-foreground">Contract, probation and history are visible to roles with employment access.</p>}
        <p className="text-xs text-muted-foreground">Salary, bank and tax details are managed in the payroll (finance) module, not here.</p>
      </Card>

      {e && (
        <Card className="gap-3 p-5">
          <h2 className="text-base font-semibold">Employment history</h2>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Effective</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Contract ends</TableHead>
                  <TableHead className="pr-4">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.employmentRecords.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4 whitespace-nowrap tabular-nums">{formatDate(r.effectiveDate)}</TableCell>
                    <TableCell>{STAFF_EMPLOYMENT_STATUS_LABELS[r.employmentStatus]}</TableCell>
                    <TableCell>{STAFF_EMPLOYMENT_TYPE_LABELS[r.employmentType]}</TableCell>
                    <TableCell>{r.departmentName ?? "—"}</TableCell>
                    <TableCell>{r.designationName ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{r.contractEndDate ? formatDate(r.contractEndDate) : "—"}</TableCell>
                    <TableCell className="pr-4 text-muted-foreground">{r.note ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <FormProvider {...form}>
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Change employment"
          description="Updates the current details and adds a row to the employment history. Leaving (resigned, terminated, …) ends active responsibilities."
          pending={form.formState.isSubmitting}
          error={error}
          onSubmit={form.handleSubmit((values) => run(() => changeStaffEmploymentAction(staff.id, values)))}
          wide
        >
          <DepartmentDesignationFields
            prefix=""
            options={options}
            managers={managers.filter((m) => m.id !== staff.id)}
            current={{ departmentId: staff.department?.id, designationId: staff.designation?.id }}
          />
          <StaffEmploymentFields prefix="" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="effectiveDate" label="Effective from" type="date" required />
            <TextField control={form.control} name="changeNote" label="Reason / note" placeholder="Promoted, contract renewed, transferred…" />
          </div>
        </FormDialog>
      </FormProvider>
    </div>
  )
}

// ------------------------------------------------------------ qualifications

type Qualification = StaffProfile["qualifications"][number]
type DocOption = { id: string; title: string }

export function StaffQualificationsPanel({ staff, documents }: { staff: StaffProfile; documents: DocOption[] }) {
  const canEdit = useCan("staff.update") && !staff.archivedAt
  const run = useRun()
  const [editing, setEditing] = React.useState<Qualification | StaffQualificationKind | null>(null)
  const [documentId, setDocumentId] = React.useState("")
  const [removing, setRemoving] = React.useState<Qualification | null>(null)
  const form = useForm<z.input<typeof staffQualificationSchema>, unknown, z.output<typeof staffQualificationSchema>>({ resolver: zodResolver(staffQualificationSchema) })
  const { error, setError, run: submit } = useDialogSubmit(form, () => setEditing(null))
  const isNew = typeof editing === "string"

  function open(q: Qualification | null, kind: StaffQualificationKind = "ACADEMIC") {
    form.reset(
      q
        ? {
            kind: q.kind, level: q.level ?? "", title: q.title, specialization: q.specialization ?? "", institutionName: q.institutionName ?? "",
            awardingBody: q.awardingBody ?? "", country: q.country ?? "", completionYear: q.completionYear ?? "",
            expiryDate: fromDate(q.expiryDate), result: q.result ?? "",
          }
        : { ...emptyStaffQualification, kind, level: kind === "ACADEMIC" ? "BACHELOR" : "" }
    )
    setDocumentId(q?.documentId ?? "")
    setError(null)
    setEditing(q ?? kind)
  }

  const groups: StaffQualificationKind[] = ["ACADEMIC", "CERTIFICATION", "TRAINING"]
  const expired = (q: Qualification) => q.expiryDate && new Date(q.expiryDate) < new Date()

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Qualifications, certifications and training</h2>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => open(null, "ACADEMIC")}>
              <PlusIcon data-icon="inline-start" />
              Qualification
            </Button>
            <Button size="sm" variant="outline" onClick={() => open(null, "CERTIFICATION")}>
              <PlusIcon data-icon="inline-start" />
              Certification
            </Button>
          </div>
        )}
      </div>
      {staff.qualifications.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        groups.map((kind) => {
          const items = staff.qualifications.filter((q) => q.kind === kind)
          if (items.length === 0) return null
          return (
            <div key={kind} className="grid gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{QUALIFICATION_KIND_LABELS[kind]}</p>
              <ul className="divide-y rounded-lg border">
                {items.map((q) => (
                  <li key={q.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{q.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {[q.level && QUALIFICATION_LEVEL_LABELS[q.level], q.specialization, q.institutionName, q.awardingBody, q.country, q.completionYear, q.result, q.expiryDate && `valid until ${formatDate(q.expiryDate)}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {q.document && <p className="text-xs text-muted-foreground">Document: {q.document.title}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      {expired(q) && <Badge variant="destructive">Expired</Badge>}
                      <VerificationBadge status={q.verificationStatus} />
                      <VerifyMenu staffId={staff.id} kind="qualification" recordId={q.id} status={q.verificationStatus} isSelf={staff.access.isSelf} />
                      {canEdit && (
                        <>
                          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${q.title}`} onClick={() => open(q)}><PencilIcon /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${q.title}`} onClick={() => setRemoving(q)}><Trash2Icon /></Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })
      )}
      <FormProvider {...form}>
        <FormDialog
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          title={isNew ? "Add record" : "Edit record"}
          description={!isNew ? "Editing sends the record back for verification." : undefined}
          pending={form.formState.isSubmitting}
          error={error}
          wide
          onSubmit={form.handleSubmit((values) =>
            submit(() => saveStaffQualificationAction(staff.id, isNew || !editing ? null : editing.id, { ...values, documentId }))
          )}
        >
          <StaffQualificationFields prefix="" />
          {documents.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="linked-document">Supporting document</Label>
              <NativeSelect id="linked-document" className="w-full" value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
                <NativeSelectOption value="">None</NativeSelectOption>
                {documents.map((d) => (
                  <NativeSelectOption key={d.id} value={d.id}>{d.title}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
        </FormDialog>
      </FormProvider>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.title ?? "record"}?`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => (removing ? run(() => deleteStaffQualificationAction(staff.id, removing.id)) : undefined)}
      />
    </Card>
  )
}

// ---------------------------------------------------------- responsibilities

type Assignment = StaffProfile["assignments"][number]

export function StaffResponsibilitiesPanel({ staff, options }: { staff: StaffProfile; options: StaffFormOptions }) {
  const manage = useCan("staff.assignments.manage") && !staff.archivedAt
  const [dialog, setDialog] = React.useState<{ kind: "add" } | { kind: "edit" | "end" | "cancel"; assignment: Assignment } | null>(null)
  const editForm = useForm<z.input<typeof staffAssignmentSchema>, unknown, z.output<typeof staffAssignmentSchema>>({ resolver: zodResolver(staffAssignmentSchema) })
  const endForm = useForm<z.input<typeof endStaffAssignmentSchema>, unknown, z.output<typeof endStaffAssignmentSchema>>({ resolver: zodResolver(endStaffAssignmentSchema) })
  const close = () => setDialog(null)
  const edit = useDialogSubmit(editForm, close)
  const end = useDialogSubmit(endForm, close)
  const current = staff.assignments.filter((a) => a.status === "ACTIVE")
  const history = staff.assignments.filter((a) => a.status !== "ACTIVE")

  return (
    <div className="grid gap-4">
      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Current responsibilities</h2>
            <p className="text-sm text-muted-foreground">Additional duties. They don&apos;t change employment status or system permissions.</p>
          </div>
          {manage && (
            <Button size="sm" onClick={() => {
              editForm.reset(emptyStaffAssignment())
              edit.setError(null)
              setDialog({ kind: "add" })
            }}>
              <PlusIcon data-icon="inline-start" />
              Add responsibility
            </Button>
          )}
        </div>
        {current.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No active responsibilities.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {current.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-sm text-muted-foreground">{[a.department?.name, `since ${formatDate(a.startDate)}`].filter(Boolean).join(" · ")}</p>
                  {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                </div>
                {manage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Responsibility actions" />}>
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => {
                        editForm.reset({ title: a.title, departmentId: a.departmentId ?? "", startDate: fromDate(a.startDate), notes: a.notes ?? "" })
                        edit.setError(null)
                        setDialog({ kind: "edit", assignment: a })
                      }}>
                        <PencilIcon />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        endForm.reset({ endDate: today(), endReason: "" })
                        end.setError(null)
                        setDialog({ kind: "end", assignment: a })
                      }}>
                        <SquareIcon />
                        End responsibility
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => {
                        endForm.reset({ endDate: today(), endReason: "Created by mistake" })
                        end.setError(null)
                        setDialog({ kind: "cancel", assignment: a })
                      }}>
                        <Trash2Icon />
                        Cancel (created by mistake)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="gap-3 p-5">
        <h2 className="text-base font-semibold">Past responsibilities</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {history.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {[a.department?.name, `${formatDate(a.startDate)} – ${formatDate(a.endDate)}`, a.endReason].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <AssignmentStatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <FormProvider {...editForm}>
        <FormDialog
          open={dialog?.kind === "add" || dialog?.kind === "edit"}
          onOpenChange={(o) => !o && close()}
          title={dialog?.kind === "edit" ? "Edit responsibility" : "Add responsibility"}
          pending={editForm.formState.isSubmitting}
          error={edit.error}
          wide
          onSubmit={editForm.handleSubmit((values) =>
            edit.run(() =>
              dialog?.kind === "edit" ? updateStaffAssignmentAction(staff.id, dialog.assignment.id, values) : addStaffAssignmentAction(staff.id, values)
            )
          )}
        >
          <StaffAssignmentFields prefix="" options={options} />
        </FormDialog>
      </FormProvider>

      <FormDialog
        open={dialog?.kind === "end" || dialog?.kind === "cancel"}
        onOpenChange={(o) => !o && close()}
        title={dialog?.kind === "cancel" ? "Cancel responsibility" : "End responsibility"}
        description={dialog?.kind === "cancel" ? "Marks it as created by mistake. It stays visible in history as cancelled." : "It moves to history with its end date."}
        submitLabel={dialog?.kind === "cancel" ? "Cancel responsibility" : "End responsibility"}
        pending={endForm.formState.isSubmitting}
        error={end.error}
        onSubmit={endForm.handleSubmit((values) =>
          dialog && dialog.kind !== "add" ? end.run(() => endStaffAssignmentAction(staff.id, dialog.assignment.id, values, dialog.kind === "cancel")) : undefined
        )}
      >
        <TextField control={endForm.control} name="endDate" label="End date" type="date" required />
        <TextAreaField control={endForm.control} name="endReason" label="Reason" rows={2} />
      </FormDialog>
    </div>
  )
}

// ------------------------------------------------------------------ documents

export type StaffDocumentRow = {
  id: string
  title: string
  category: StaffDocumentCategory
  fileName: string
  sizeBytes: number
  verificationStatus: VerificationStatus
  createdAt: Date
  requirement: { id: string; name: string } | null
}

export function StaffDocumentsPanel({
  staff,
  documents,
  requirements,
}: {
  staff: StaffProfile
  documents: StaffDocumentRow[]
  requirements: { id: string; name: string; isRequired: boolean }[]
}) {
  const router = useRouter()
  const run = useRun()
  const canManage = useCan("staff.documents.manage") && !staff.archivedAt
  const [file, setFile] = React.useState<File | null>(null)
  const [title, setTitle] = React.useState("")
  const [category, setCategory] = React.useState<StaffDocumentCategory>("CV")
  const [requirementId, setRequirementId] = React.useState("")
  const [uploading, setUploading] = React.useState(false)
  const [deleting, setDeleting] = React.useState<StaffDocumentRow | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const submitted = new Set(documents.map((d) => d.requirement?.id).filter(Boolean))

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    if (file.size > DOCUMENT_MAX_BYTES || !(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.add({ title: "Use a PDF, JPG, PNG or WebP file up to 5 MB", type: "error" })
      return
    }
    setUploading(true)
    const body = new FormData()
    body.set("file", file)
    body.set("title", title || file.name)
    body.set("category", category)
    body.set("requirementId", requirementId)
    const res = await fetch(`/api/staff/${staff.id}/documents`, { method: "POST", body }).catch(() => null)
    setUploading(false)
    if (!res?.ok) {
      const message = await res?.json().then((j) => j.error?.message).catch(() => null)
      toast.add({ title: "Upload failed", description: message ?? "Please try again.", type: "error" })
      return
    }
    toast.add({ title: "Document uploaded", type: "success" })
    setFile(null)
    setTitle("")
    setRequirementId("")
    if (fileInput.current) fileInput.current.value = ""
    router.refresh()
  }

  return (
    <div className="grid gap-4">
      {requirements.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {requirements.map((r) => (
            <Badge key={r.id} variant={submitted.has(r.id) ? "secondary" : r.isRequired ? "destructive" : "outline"}>
              {submitted.has(r.id) ? "✓ " : ""}
              {r.name}
              {!submitted.has(r.id) && r.isRequired ? " (missing)" : ""}
            </Badge>
          ))}
        </div>
      )}
      {documents.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No documents uploaded.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {STAFF_DOCUMENT_CATEGORY_LABELS[d.category]}
                    {d.requirement ? ` · ${d.requirement.name}` : ""} · {d.fileName} · {(d.sizeBytes / 1024).toFixed(0)} KB · {formatDate(d.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <VerificationBadge status={d.verificationStatus} />
                <VerifyMenu staffId={staff.id} kind="document" recordId={d.id} status={d.verificationStatus} isSelf={staff.access.isSelf} />
                <Button size="icon-sm" variant="ghost" aria-label={`Download ${d.title}`} nativeButton={false} render={<a href={`/api/staff/${staff.id}/documents/${d.id}`} />}>
                  <DownloadIcon />
                </Button>
                {canManage && (
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${d.title}`} onClick={() => setDeleting(d)}>
                    <Trash2Icon />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <Card className="p-4">
          <form onSubmit={upload} className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="sdoc-file">File</Label>
              <Input id="sdoc-file" ref={fileInput} type="file" accept={DOCUMENT_MIME_TYPES.join(",")} onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""))
              }} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sdoc-title">Title</Label>
              <Input id="sdoc-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sdoc-category">Category</Label>
              <NativeSelect id="sdoc-category" className="w-full" value={category} onChange={(e) => setCategory(e.target.value as StaffDocumentCategory)}>
                {Object.entries(STAFF_DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sdoc-req">Fulfils</Label>
              <NativeSelect id="sdoc-req" className="w-full" value={requirementId} onChange={(e) => setRequirementId(e.target.value)}>
                <NativeSelectOption value="">—</NativeSelectOption>
                {requirements.map((r) => (
                  <NativeSelectOption key={r.id} value={r.id}>{r.name}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit" disabled={!file || uploading}>
              {uploading ? <Spinner /> : <UploadIcon data-icon="inline-start" />}
              Upload
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">PDF, JPG, PNG or WebP up to 5 MB. Files are private and opened through short-lived links.</p>
        </Card>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.title ?? ""}”?`}
        description="The file is removed permanently. Qualifications linked to it keep their details."
        confirmLabel="Delete"
        destructive
        onConfirm={() => (deleting ? run(() => deleteStaffDocumentAction(staff.id, deleting.id)) : undefined)}
      />
    </div>
  )
}

// -------------------------------------------------------------------- account

export function StaffAccountPanel({
  staff,
  linkableUsers,
}: {
  staff: StaffProfile
  // Null when the viewer can't manage account links.
  linkableUsers: { id: string; name: string; email: string; role: string }[] | null
}) {
  const run = useRun()
  const [userId, setUserId] = React.useState(staff.user?.id ?? "")
  const [saving, setSaving] = React.useState(false)

  return (
    <Card className="gap-3 p-5">
      <h2 className="text-base font-semibold">Login account</h2>
      <p className="text-sm">
        {staff.user ? (
          <>Linked to <span className="font-medium">{staff.user.name ?? staff.user.email}</span> ({staff.user.email}).</>
        ) : (
          "Not linked. This person can't sign in to see their own record yet."
        )}
      </p>
      {linkableUsers && !staff.archivedAt && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid max-w-md flex-1 gap-1.5">
            <Label htmlFor="account-link">Link to a member</Label>
            <NativeSelect id="account-link" className="w-full" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <NativeSelectOption value="">Not linked</NativeSelectOption>
              {linkableUsers.map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>{u.name} · {u.email} ({u.role})</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button
            variant="outline"
            disabled={saving || userId === (staff.user?.id ?? "")}
            onClick={async () => {
              setSaving(true)
              await run(() => linkStaffUserAction(staff.id, { userId }))
              setSaving(false)
            }}
          >
            {saving && <Spinner />}
            Save
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Only existing members of your organisation can be linked; invite new people from Users &amp; Access. Archiving or deleting this
        profile never removes the account, and the job title grants no permissions: access comes from the member&apos;s role.
      </p>
    </Card>
  )
}
