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
import { applyServerErrors, SelectField, TextAreaField, TextField } from "@/components/shared/form-fields"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_TYPES,
} from "@/features/students/constants"
import {
  addAssignmentAction,
  archiveTeacherAction,
  changeEmploymentAction,
  deleteCertificationAction,
  deleteQualificationAction,
  deleteTeacherAction,
  deleteTeacherDocumentAction,
  endAssignmentAction,
  linkUserAction,
  removeTeacherPhotoAction,
  restoreTeacherAction,
  saveCertificationAction,
  saveQualificationAction,
  updateAssignmentAction,
  verifyRecordAction,
} from "@/features/teachers/actions"
import {
  AssignmentFields,
  CertificationFields,
  emptyAssignment,
  emptyCertification,
  emptyQualification,
  EmploymentFields,
  QualificationFields,
} from "@/features/teachers/components/form-sections"
import {
  AssignmentStatusBadge,
  EmploymentStatusBadge,
  VerificationBadge,
} from "@/features/teachers/components/status-badges"
import {
  assignmentSummary,
  DOCUMENT_CATEGORY_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  TEACHING_ROLE_LABELS,
} from "@/features/teachers/constants"
import {
  assignmentSchema,
  assignmentUpdateSchema,
  certificationSchema,
  employmentChangeSchema,
  endAssignmentSchema,
  qualificationSchema,
} from "@/features/teachers/schemas"
import type { TeacherDocumentCategory, VerificationStatus } from "@/lib/generated/prisma/enums"
import { fromDate } from "@/lib/validation"
import type { EducationStructure } from "@/services/academics/structure-service"
import type { TeacherProfile } from "@/services/teachers/teacher-service"

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

// ----------------------------------------------------------- header actions

export function TeacherProfileActions({ teacher }: { teacher: Pick<TeacherProfile, "id" | "archivedAt"> }) {
  const router = useRouter()
  const run = useRun()
  const canUpdate = useCan("teachers.update")
  const canArchive = useCan("teachers.archive")
  const canDelete = useCan("teachers.delete")
  const [dialog, setDialog] = React.useState<"archive" | "restore" | "delete" | null>(null)
  const archived = teacher.archivedAt !== null

  return (
    <>
      {canUpdate && !archived && (
        <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/teachers/${teacher.id}/edit`} />}>
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
        title={dialog === "archive" ? "Archive this teacher?" : "Restore this teacher?"}
        description={
          dialog === "archive"
            ? "The profile is hidden and active teaching assignments end. Employment status, history and the login account are kept. To record a resignation or retirement, change the employment status instead."
            : "The profile appears in lists again. Ended assignments stay ended."
        }
        confirmLabel={dialog === "archive" ? "Archive" : "Restore"}
        onConfirm={() => run(() => (dialog === "archive" ? archiveTeacherAction(teacher.id) : restoreTeacherAction(teacher.id)))}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Permanently delete this teacher?"
        description="Only for profiles created by mistake with no teaching history. The linked login account is not deleted. This can't be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={async () => {
          const result = await deleteTeacherAction(teacher.id)
          if (!result.ok) {
            toast.add({ title: "Couldn't delete", description: result.error, type: "error" })
            return false
          }
          toast.add({ title: "Teacher deleted", type: "success" })
          router.push("/dashboard/teachers")
        }}
      />
    </>
  )
}

export function TeacherPhotoControl({ teacherId, hasPhoto, disabled }: { teacherId: string; hasPhoto: boolean; disabled: boolean }) {
  const router = useRouter()
  const run = useRun()
  const canUpdate = useCan("teachers.update")
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
    const res = await fetch(`/api/teachers/${teacherId}/photo`, { method: "POST", body }).catch(() => null)
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
        <Button size="xs" variant="ghost" onClick={() => run(() => removeTeacherPhotoAction(teacherId))}>
          Remove
        </Button>
      )}
    </div>
  )
}

// Verify / reject menu for one record (never shown for one's own profile).
function VerifyMenu({
  teacherId,
  kind,
  recordId,
  status,
  isSelf,
}: {
  teacherId: string
  kind: "qualification" | "certification" | "document"
  recordId: string
  status: VerificationStatus
  isSelf: boolean
}) {
  const canVerify = useCan("teachers.verify")
  const run = useRun()
  if (!canVerify || isSelf) return null
  const set = (next: VerificationStatus) => run(() => verifyRecordAction(teacherId, kind, recordId, { status: next }))
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

export function EmploymentPanel({
  teacher,
  structure,
  managers,
}: {
  teacher: TeacherProfile
  structure: EducationStructure
  managers: { id: string; name: string }[]
}) {
  const canManage = useCan("teachers.employment.manage") && !teacher.archivedAt
  const [open, setOpen] = React.useState(false)
  const form = useForm<z.input<typeof employmentChangeSchema>, unknown, z.output<typeof employmentChangeSchema>>({
    resolver: zodResolver(employmentChangeSchema),
  })
  const { error, setError, run } = useDialogSubmit(form, () => setOpen(false))
  const e = teacher.employment

  function openChange() {
    form.reset({
      dateOfJoining: fromDate(teacher.dateOfJoining),
      employmentType: teacher.employmentType,
      employmentStatus: teacher.employmentStatus,
      designationId: teacher.designation?.id ?? "",
      departmentId: teacher.department?.id ?? "",
      reportingToId: e?.reportingTo?.id ?? "",
      contractStartDate: fromDate(e?.contractStartDate),
      contractEndDate: fromDate(e?.contractEndDate),
      onProbation: e?.onProbation ?? false,
      probationEndDate: fromDate(e?.probationEndDate),
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
          <h2 className="text-base font-semibold">Current employment</h2>
          {canManage && (
            <Button size="sm" onClick={openChange}>
              <PencilIcon data-icon="inline-start" />
              Change employment
            </Button>
          )}
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <Field label="Status" value={<EmploymentStatusBadge status={teacher.employmentStatus} />} />
          <Field label="Type" value={EMPLOYMENT_TYPE_LABELS[teacher.employmentType]} />
          <Field label="Date of joining" value={formatDate(teacher.dateOfJoining)} />
          <Field label="Designation" value={teacher.designation?.name} />
          <Field label="Department" value={teacher.department?.name} />
          {e && <Field label="Reports to" value={e.reportingTo ? `${e.reportingTo.firstName} ${e.reportingTo.lastName}` : null} />}
          {e && <Field label="Contract" value={e.contractStartDate || e.contractEndDate ? `${formatDate(e.contractStartDate)} – ${formatDate(e.contractEndDate)}` : null} />}
          {e && <Field label="Probation" value={e.onProbation ? `Yes, until ${formatDate(e.probationEndDate)}` : "No"} />}
          {e?.employmentNotes && <Field label="Notes" value={e.employmentNotes} />}
        </dl>
        {!e && <p className="text-xs text-muted-foreground">Contract, probation and history are visible to roles with employment access.</p>}
        <p className="text-xs text-muted-foreground">Salary and payroll are managed in the finance module.</p>
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
                  <TableHead>Designation</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="pr-4">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.employmentRecords.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4 whitespace-nowrap tabular-nums">{formatDate(r.effectiveDate)}</TableCell>
                    <TableCell>{EMPLOYMENT_STATUS_LABELS[r.employmentStatus]}</TableCell>
                    <TableCell>{EMPLOYMENT_TYPE_LABELS[r.employmentType]}</TableCell>
                    <TableCell>{r.designationName ?? "—"}</TableCell>
                    <TableCell>{r.departmentName ?? "—"}</TableCell>
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
          description="Updates the current details and adds a row to the employment history. Leaving (resigned, retired, …) ends active teaching assignments."
          pending={form.formState.isSubmitting}
          error={error}
          onSubmit={form.handleSubmit((values) => run(() => changeEmploymentAction(teacher.id, values)))}
          wide
        >
          <EmploymentFields prefix="" structure={structure} managers={managers.filter((m) => m.id !== teacher.id)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="effectiveDate" label="Effective from" type="date" required />
            <TextField control={form.control} name="changeNote" label="Reason / note" placeholder="Promoted, contract renewed…" />
          </div>
        </FormDialog>
      </FormProvider>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

// ---------------------------------------------- qualifications & certifications

type Qualification = TeacherProfile["qualifications"][number]
type Certification = TeacherProfile["certifications"][number]
type DocOption = { id: string; title: string }

function DocumentSelect({ value, onChange, documents }: { value: string; onChange: (v: string) => void; documents: DocOption[] }) {
  if (documents.length === 0) return null
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="linked-document">Supporting document</Label>
      <NativeSelect id="linked-document" className="w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        <NativeSelectOption value="">None</NativeSelectOption>
        {documents.map((d) => (
          <NativeSelectOption key={d.id} value={d.id}>{d.title}</NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}

export function QualificationsPanel({ teacher, documents }: { teacher: TeacherProfile; documents: DocOption[] }) {
  const canEdit = useCan("teachers.update") && !teacher.archivedAt
  const run = useRun()
  const [editing, setEditing] = React.useState<Qualification | "new" | null>(null)
  const [documentId, setDocumentId] = React.useState("")
  const [removing, setRemoving] = React.useState<Qualification | null>(null)
  const form = useForm<z.input<typeof qualificationSchema>, unknown, z.output<typeof qualificationSchema>>({ resolver: zodResolver(qualificationSchema) })
  const { error, setError, run: submit } = useDialogSubmit(form, () => setEditing(null))

  function open(q: Qualification | null) {
    form.reset(
      q
        ? {
            level: q.level, title: q.title, specialization: q.specialization ?? "", institutionName: q.institutionName ?? "",
            awardingBody: q.awardingBody ?? "", country: q.country ?? "", completionYear: q.completionYear ?? "", result: q.result ?? "",
          }
        : { ...emptyQualification }
    )
    setDocumentId(q?.documentId ?? "")
    setError(null)
    setEditing(q ?? "new")
  }

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Qualifications</h2>
        {canEdit && (
          <Button size="sm" onClick={() => open(null)}>
            <PlusIcon data-icon="inline-start" />
            Add
          </Button>
        )}
      </div>
      {teacher.qualifications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No qualifications recorded.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {teacher.qualifications.map((q) => (
            <li key={q.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{q.title}</p>
                <p className="text-sm text-muted-foreground">
                  {[QUALIFICATION_LEVEL_LABELS[q.level], q.specialization, q.institutionName, q.awardingBody, q.completionYear, q.result].filter(Boolean).join(" · ")}
                </p>
                {q.document && <p className="text-xs text-muted-foreground">Document: {q.document.title}</p>}
              </div>
              <div className="flex items-center gap-1">
                <VerificationBadge status={q.verificationStatus} />
                <VerifyMenu teacherId={teacher.id} kind="qualification" recordId={q.id} status={q.verificationStatus} isSelf={teacher.access.isSelf} />
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
      )}
      <FormProvider {...form}>
        <FormDialog
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          title={editing === "new" ? "Add qualification" : "Edit qualification"}
          description={editing !== "new" ? "Editing sends the qualification back for verification." : undefined}
          pending={form.formState.isSubmitting}
          error={error}
          wide
          onSubmit={form.handleSubmit((values) =>
            submit(() => saveQualificationAction(teacher.id, editing === "new" || !editing ? null : editing.id, { ...values, documentId }))
          )}
        >
          <QualificationFields prefix="" />
          <DocumentSelect value={documentId} onChange={setDocumentId} documents={documents} />
        </FormDialog>
      </FormProvider>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.title ?? "qualification"}?`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => (removing ? run(() => deleteQualificationAction(teacher.id, removing.id)) : undefined)}
      />
    </Card>
  )
}

export function CertificationsPanel({ teacher, documents }: { teacher: TeacherProfile; documents: DocOption[] }) {
  const canEdit = useCan("teachers.update") && !teacher.archivedAt
  const run = useRun()
  const [editing, setEditing] = React.useState<Certification | "new" | null>(null)
  const [documentId, setDocumentId] = React.useState("")
  const [removing, setRemoving] = React.useState<Certification | null>(null)
  const form = useForm<z.input<typeof certificationSchema>, unknown, z.output<typeof certificationSchema>>({ resolver: zodResolver(certificationSchema) })
  const { error, setError, run: submit } = useDialogSubmit(form, () => setEditing(null))

  function open(c: Certification | null) {
    form.reset(
      c
        ? { name: c.name, issuingOrganization: c.issuingOrganization ?? "", issueDate: fromDate(c.issueDate), expiryDate: fromDate(c.expiryDate), reference: c.reference ?? "" }
        : { ...emptyCertification }
    )
    setDocumentId(c?.documentId ?? "")
    setError(null)
    setEditing(c ?? "new")
  }

  const expired = (c: Certification) => c.expiryDate && new Date(c.expiryDate) < new Date()

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Certifications and training</h2>
        {canEdit && (
          <Button size="sm" onClick={() => open(null)}>
            <PlusIcon data-icon="inline-start" />
            Add
          </Button>
        )}
      </div>
      {teacher.certifications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No certifications recorded.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {teacher.certifications.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted-foreground">
                  {[c.issuingOrganization, c.issueDate && `Issued ${formatDate(c.issueDate)}`, c.expiryDate && `Expires ${formatDate(c.expiryDate)}`, c.reference].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {expired(c) && <Badge variant="destructive">Expired</Badge>}
                <VerificationBadge status={c.verificationStatus} />
                <VerifyMenu teacherId={teacher.id} kind="certification" recordId={c.id} status={c.verificationStatus} isSelf={teacher.access.isSelf} />
                {canEdit && (
                  <>
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => open(c)}><PencilIcon /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${c.name}`} onClick={() => setRemoving(c)}><Trash2Icon /></Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <FormProvider {...form}>
        <FormDialog
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          title={editing === "new" ? "Add certification" : "Edit certification"}
          pending={form.formState.isSubmitting}
          error={error}
          wide
          onSubmit={form.handleSubmit((values) =>
            submit(() => saveCertificationAction(teacher.id, editing === "new" || !editing ? null : editing.id, { ...values, documentId }))
          )}
        >
          <CertificationFields prefix="" />
          <DocumentSelect value={documentId} onChange={setDocumentId} documents={documents} />
        </FormDialog>
      </FormProvider>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? "certification"}?`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => (removing ? run(() => deleteCertificationAction(teacher.id, removing.id)) : undefined)}
      />
    </Card>
  )
}

// ---------------------------------------------------------------- assignments

type Assignment = TeacherProfile["assignments"][number]

export function AssignmentsPanel({
  teacher,
  structure,
  canManage,
}: {
  teacher: TeacherProfile
  structure: EducationStructure
  // Decided on the server (full manager, or department head for this teacher).
  canManage: boolean
}) {
  const manage = canManage && !teacher.archivedAt
  const [dialog, setDialog] = React.useState<{ kind: "add" } | { kind: "edit" | "end" | "cancel"; assignment: Assignment } | null>(null)
  const addForm = useForm<z.input<typeof assignmentSchema>, unknown, z.output<typeof assignmentSchema>>({ resolver: zodResolver(assignmentSchema) })
  const editForm = useForm<z.input<typeof assignmentUpdateSchema>, unknown, z.output<typeof assignmentUpdateSchema>>({ resolver: zodResolver(assignmentUpdateSchema) })
  const endForm = useForm<z.input<typeof endAssignmentSchema>, unknown, z.output<typeof endAssignmentSchema>>({ resolver: zodResolver(endAssignmentSchema) })
  const close = () => setDialog(null)
  const add = useDialogSubmit(addForm, close)
  const edit = useDialogSubmit(editForm, close)
  const end = useDialogSubmit(endForm, close)

  const current = teacher.assignments.filter((a) => a.status === "ACTIVE")
  const history = teacher.assignments.filter((a) => a.status !== "ACTIVE")
  const byYear = current.reduce((map, a) => map.set(a.academicYear.name, [...(map.get(a.academicYear.name) ?? []), a]), new Map<string, Assignment[]>())
  const totalPeriods = current.reduce((n, a) => n + (a.weeklyPeriods ?? 0), 0)

  function openAdd(from?: Assignment) {
    addForm.reset(
      from
        ? {
            ...emptyAssignment(structure),
            academicYearId: from.academicYearId, educationLevelId: from.educationLevelId ?? "", programId: from.programId ?? "",
            classId: from.classId ?? "", sectionId: from.sectionId ?? "", subjectId: from.subjectId ?? "", batchId: from.batchId ?? "",
            role: from.role, weeklyPeriods: from.weeklyPeriods ?? "",
          }
        : emptyAssignment(structure)
    )
    add.setError(null)
    setDialog({ kind: "add" })
  }

  return (
    <div className="grid gap-4">
      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Current teaching assignments</h2>
            <p className="text-sm text-muted-foreground">
              {current.length} active{totalPeriods ? ` · ${totalPeriods} periods/hours per week` : ""}
            </p>
          </div>
          {manage && (
            <Button size="sm" onClick={() => openAdd()}>
              <PlusIcon data-icon="inline-start" />
              Add assignment
            </Button>
          )}
        </div>
        {current.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No active assignments.</p>
        ) : (
          [...byYear.entries()].map(([year, items]) => (
            <div key={year} className="grid gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{year}</p>
              <ul className="divide-y rounded-lg border">
                {items.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{assignmentSummary(a) || "Whole organisation"}</p>
                      <p className="text-sm text-muted-foreground">
                        {[TEACHING_ROLE_LABELS[a.role], a.educationLevel?.name, a.program?.name, a.batch?.name, a.weeklyPeriods != null && `${a.weeklyPeriods}/week`, `since ${formatDate(a.startDate)}`]
                          .filter(Boolean).join(" · ")}
                      </p>
                      {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                    </div>
                    {manage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Assignment actions" />}>
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => {
                            editForm.reset({ role: a.role, startDate: fromDate(a.startDate), weeklyPeriods: a.weeklyPeriods ?? "", notes: a.notes ?? "" })
                            edit.setError(null)
                            setDialog({ kind: "edit", assignment: a })
                          }}>
                            <PencilIcon />
                            Edit periods / role
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openAdd(a)}>
                            <PlusIcon />
                            Duplicate for another class
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            endForm.reset({ endDate: today(), endReason: "" })
                            end.setError(null)
                            setDialog({ kind: "end", assignment: a })
                          }}>
                            <SquareIcon />
                            End assignment
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
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground">
          To move a teacher to another class or subject, end the current assignment and add a new one so the history stays accurate.
        </p>
      </Card>

      <Card className="gap-3 p-5">
        <h2 className="text-base font-semibold">Assignment history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No past assignments.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {history.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">{assignmentSummary(a)}</p>
                  <p className="text-sm text-muted-foreground">
                    {a.academicYear.name} · {TEACHING_ROLE_LABELS[a.role]} · {formatDate(a.startDate)} – {formatDate(a.endDate)}
                    {a.endReason ? ` · ${a.endReason}` : ""}
                  </p>
                </div>
                <AssignmentStatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <FormProvider {...addForm}>
        <FormDialog
          open={dialog?.kind === "add"}
          onOpenChange={(o) => !o && close()}
          title="Add teaching assignment"
          description="Choose what applies: a class and section, a whole program, or a subject across groups."
          pending={addForm.formState.isSubmitting}
          error={add.error}
          wide
          onSubmit={addForm.handleSubmit((values) => add.run(() => addAssignmentAction(teacher.id, values)))}
        >
          <AssignmentFields prefix="" structure={structure} />
        </FormDialog>
      </FormProvider>

      <FormDialog
        open={dialog?.kind === "edit"}
        onOpenChange={(o) => !o && close()}
        title="Edit assignment"
        description="Change the role, periods or notes. What is taught can't change here."
        pending={editForm.formState.isSubmitting}
        error={edit.error}
        onSubmit={editForm.handleSubmit((values) =>
          dialog && dialog.kind !== "add" ? edit.run(() => updateAssignmentAction(teacher.id, dialog.assignment.id, values)) : undefined
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField control={editForm.control} name="role" label="Role" options={Object.entries(TEACHING_ROLE_LABELS).map(([value, label]) => ({ value, label }))} />
          <TextField control={editForm.control} name="weeklyPeriods" label="Periods / hours per week" type="number" min={0} />
          <TextField control={editForm.control} name="startDate" label="Start date" type="date" />
        </div>
        <TextField control={editForm.control} name="notes" label="Notes" />
      </FormDialog>

      <FormDialog
        open={dialog?.kind === "end" || dialog?.kind === "cancel"}
        onOpenChange={(o) => !o && close()}
        title={dialog?.kind === "cancel" ? "Cancel assignment" : "End assignment"}
        description={
          dialog?.kind === "cancel"
            ? "Marks the assignment as created by mistake. It stays visible in history as cancelled."
            : "The assignment moves to history with its end date."
        }
        submitLabel={dialog?.kind === "cancel" ? "Cancel assignment" : "End assignment"}
        pending={endForm.formState.isSubmitting}
        error={end.error}
        onSubmit={endForm.handleSubmit((values) =>
          dialog && dialog.kind !== "add" ? end.run(() => endAssignmentAction(teacher.id, dialog.assignment.id, values, dialog.kind === "cancel")) : undefined
        )}
      >
        <TextField control={endForm.control} name="endDate" label="End date" type="date" required />
        <TextAreaField control={endForm.control} name="endReason" label="Reason" rows={2} />
      </FormDialog>
    </div>
  )
}

// ------------------------------------------------------------------ documents

export type TeacherDocumentRow = {
  id: string
  title: string
  category: TeacherDocumentCategory
  fileName: string
  sizeBytes: number
  verificationStatus: VerificationStatus
  createdAt: Date
  requirement: { id: string; name: string } | null
}

export function TeacherDocumentsPanel({
  teacher,
  documents,
  requirements,
}: {
  teacher: TeacherProfile
  documents: TeacherDocumentRow[]
  requirements: { id: string; name: string; isRequired: boolean }[]
}) {
  const router = useRouter()
  const run = useRun()
  const canManage = useCan("teachers.documents.manage") && !teacher.archivedAt
  const [file, setFile] = React.useState<File | null>(null)
  const [title, setTitle] = React.useState("")
  const [category, setCategory] = React.useState<TeacherDocumentCategory>("CV")
  const [requirementId, setRequirementId] = React.useState("")
  const [uploading, setUploading] = React.useState(false)
  const [deleting, setDeleting] = React.useState<TeacherDocumentRow | null>(null)
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
    const res = await fetch(`/api/teachers/${teacher.id}/documents`, { method: "POST", body }).catch(() => null)
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
                    {DOCUMENT_CATEGORY_LABELS[d.category]}
                    {d.requirement ? ` · ${d.requirement.name}` : ""} · {d.fileName} · {(d.sizeBytes / 1024).toFixed(0)} KB · {formatDate(d.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <VerificationBadge status={d.verificationStatus} />
                <VerifyMenu teacherId={teacher.id} kind="document" recordId={d.id} status={d.verificationStatus} isSelf={teacher.access.isSelf} />
                <Button size="icon-sm" variant="ghost" aria-label={`Download ${d.title}`} nativeButton={false} render={<a href={`/api/teachers/${teacher.id}/documents/${d.id}`} />}>
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
              <Label htmlFor="tdoc-file">File</Label>
              <Input id="tdoc-file" ref={fileInput} type="file" accept={DOCUMENT_MIME_TYPES.join(",")} onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""))
              }} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tdoc-title">Title</Label>
              <Input id="tdoc-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tdoc-category">Category</Label>
              <NativeSelect id="tdoc-category" className="w-full" value={category} onChange={(e) => setCategory(e.target.value as TeacherDocumentCategory)}>
                {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tdoc-req">Fulfils</Label>
              <NativeSelect id="tdoc-req" className="w-full" value={requirementId} onChange={(e) => setRequirementId(e.target.value)}>
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
        onConfirm={() => (deleting ? run(() => deleteTeacherDocumentAction(teacher.id, deleting.id)) : undefined)}
      />
    </div>
  )
}

// -------------------------------------------------------------------- account

export function AccountPanel({
  teacher,
  linkableUsers,
}: {
  teacher: TeacherProfile
  // Null when the viewer can't manage account links.
  linkableUsers: { id: string; name: string; email: string; role: string }[] | null
}) {
  const run = useRun()
  const [userId, setUserId] = React.useState(teacher.user?.id ?? "")
  const [saving, setSaving] = React.useState(false)

  return (
    <Card className="gap-3 p-5">
      <h2 className="text-base font-semibold">Login account</h2>
      <p className="text-sm">
        {teacher.user ? (
          <>Linked to <span className="font-medium">{teacher.user.name ?? teacher.user.email}</span> ({teacher.user.email}).</>
        ) : (
          "Not linked. The teacher can't sign in to see their own record yet."
        )}
      </p>
      {linkableUsers && !teacher.archivedAt && (
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
            disabled={saving || userId === (teacher.user?.id ?? "")}
            onClick={async () => {
              setSaving(true)
              await run(() => linkUserAction(teacher.id, { userId }))
              setSaving(false)
            }}
          >
            {saving && <Spinner />}
            Save
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Only existing members of your organisation can be linked. Invite new people from Users &amp; Access. Linking doesn&apos;t grant extra
        permissions; access comes from the member&apos;s role.
      </p>
    </Card>
  )
}
