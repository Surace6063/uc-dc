"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowRightIcon,
  CameraIcon,
  DownloadIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
  UserCogIcon,
} from "lucide-react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { applyServerErrors, SelectField, SwitchField, TextAreaField, TextField } from "@/components/shared/form-fields"
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
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import {
  addEnrollmentAction,
  addGuardianAction,
  archiveStudentAction,
  changeEnrollmentStatusAction,
  changeStudentStatusAction,
  correctEnrollmentAction,
  deleteDocumentAction,
  deleteStudentAction,
  progressEnrollmentAction,
  removePhotoAction,
  restoreStudentAction,
  unlinkGuardianAction,
  updateGuardianAction,
} from "@/features/students/actions"
import { FormDialog } from "@/features/academics/components/structure-kit"
import { emptyGuardian, GuardianFields, PlacementFields } from "@/features/students/components/form-sections"
import { EnrollmentStatusBadge } from "@/features/students/components/status-badges"
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_TRANSITIONS,
  ENROLLMENT_TYPE_LABELS,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_TYPES,
  PROGRESSION_OUTCOMES_LABELS,
  RELATIONSHIP_LABELS,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_TRANSITIONS,
} from "@/features/students/constants"
import {
  correctEnrollmentSchema,
  enrollmentSchema,
  guardianEntrySchema,
  progressEnrollmentSchema,
  updateGuardianSchema,
} from "@/features/students/schemas"
import type { EnrollmentStatus, StudentStatus } from "@/lib/generated/prisma/enums"
import { fromDate } from "@/lib/validation"
import type { EducationStructure } from "@/services/academics/structure-service"
import type { StudentProfile } from "@/services/students/student-service"

const today = () => new Date().toISOString().slice(0, 10)
const formatDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"

function useRunner() {
  const router = useRouter()
  return async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
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

// ------------------------------------------------------------ header actions

export function ProfileActions({ student }: { student: Pick<StudentProfile, "id" | "status" | "archivedAt" | "firstName" | "lastName"> }) {
  const router = useRouter()
  const run = useRunner()
  const canUpdate = useCan("students.update")
  const canEnroll = useCan("students.enroll")
  const canArchive = useCan("students.archive")
  const canDelete = useCan("students.delete")
  const [dialog, setDialog] = React.useState<"archive" | "restore" | "delete" | "status" | null>(null)
  const [reason, setReason] = React.useState("")
  const allowed = STUDENT_STATUS_TRANSITIONS[student.status]
  const [status, setStatus] = React.useState<StudentStatus>(allowed[0] ?? student.status)
  const archived = student.archivedAt !== null

  return (
    <>
      {canUpdate && !archived && (
        <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/students/${student.id}/edit`} />}>
          <PencilIcon data-icon="inline-start" />
          Edit
        </Button>
      )}
      {(canArchive || (canUpdate && canEnroll) || canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {canUpdate && canEnroll && !archived && allowed.length > 0 && (
              <DropdownMenuItem onClick={() => setDialog("status")}>
                <UserCogIcon />
                Change status
              </DropdownMenuItem>
            )}
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
        title={dialog === "archive" ? "Archive this student?" : "Restore this student?"}
        description={
          dialog === "archive"
            ? "Archiving hides the record from lists and blocks edits. It doesn't change their status (withdrawn, graduated, …) and keeps all history."
            : "The student will appear in lists again and can be edited."
        }
        confirmLabel={dialog === "archive" ? "Archive" : "Restore"}
        onConfirm={() =>
          run(() => (dialog === "archive" ? archiveStudentAction(student.id, reason) : restoreStudentAction(student.id)))
        }
      >
        {dialog === "archive" && (
          <Textarea placeholder="Reason (optional)" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "status"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Change student status"
        description={`Currently ${STUDENT_STATUS_LABELS[student.status].toLowerCase()}. Withdrawing, transferring or graduating closes open enrollments.`}
        confirmLabel="Change status"
        onConfirm={() => run(() => changeStudentStatusAction(student.id, { status, reason }))}
      >
        <div className="grid gap-3">
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as StudentStatus)} className="w-full" aria-label="New status">
            {allowed.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {STUDENT_STATUS_LABELS[s]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Textarea placeholder="Reason (optional)" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Permanently delete this student?"
        description="Only for records created by mistake. Students with academic history can't be deleted and must stay archived. This can't be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={async () => {
          const result = await deleteStudentAction(student.id)
          if (!result.ok) {
            toast.add({ title: "Couldn't delete", description: result.error, type: "error" })
            return false
          }
          toast.add({ title: "Student deleted", type: "success" })
          router.push("/dashboard/students")
        }}
      />
    </>
  )
}

export function PhotoControl({ studentId, hasPhoto, disabled }: { studentId: string; hasPhoto: boolean; disabled: boolean }) {
  const router = useRouter()
  const run = useRunner()
  const canUpdate = useCan("students.update")
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
    const res = await fetch(`/api/students/${studentId}/photo`, { method: "POST", body }).catch(() => null)
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
        <Button size="xs" variant="ghost" onClick={() => run(() => removePhotoAction(studentId))}>
          Remove
        </Button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ guardians

type GuardianLink = StudentProfile["guardians"][number]

export function GuardiansPanel({ student }: { student: Pick<StudentProfile, "id" | "archivedAt" | "guardians"> }) {
  const router = useRouter()
  const run = useRunner()
  const canUpdate = useCan("students.update") && !student.archivedAt
  const canOpenGuardians = useCan("parents.view")
  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<GuardianLink | null>(null)
  const [removing, setRemoving] = React.useState<GuardianLink | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const addForm = useForm<z.input<typeof guardianEntrySchema>, unknown, z.output<typeof guardianEntrySchema>>({
    resolver: zodResolver(guardianEntrySchema),
  })
  const editForm = useForm<z.input<typeof updateGuardianSchema>, unknown, z.output<typeof updateGuardianSchema>>({
    resolver: zodResolver(updateGuardianSchema),
  })

  const submitAdd = addForm.handleSubmit(async (values) => {
    setError(null)
    const result = await addGuardianAction(student.id, values)
    if (!result.ok) return setError(applyServerErrors(addForm, result))
    toast.add({ title: "Guardian added", type: "success" })
    setAdding(false)
    router.refresh()
  })

  const submitEdit = editForm.handleSubmit(async (values) => {
    if (!editing) return
    setError(null)
    const result = await updateGuardianAction(student.id, editing.guardianId, values)
    if (!result.ok) return setError(applyServerErrors(editForm, result))
    toast.add({ title: "Guardian updated", type: "success" })
    setEditing(null)
    router.refresh()
  })

  function startEdit(link: GuardianLink) {
    setError(null)
    editForm.reset({
      fullName: link.guardian.fullName,
      phone: link.guardian.phone ?? "",
      alternatePhone: link.guardian.alternatePhone ?? "",
      email: link.guardian.email ?? "",
      occupation: link.guardian.occupation ?? "",
      address: link.guardian.address ?? "",
      relationship: link.relationship,
      isPrimary: link.isPrimary,
      isEmergencyContact: link.isEmergencyContact,
      receivesAcademicNotifications: link.receivesAcademicNotifications,
      receivesBillingNotifications: link.receivesBillingNotifications,
    })
    setEditing(link)
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Guardians</h2>
        {canUpdate && (
          <Button
            size="sm"
            onClick={() => {
              setError(null)
              addForm.reset({ ...emptyGuardian, isPrimary: student.guardians.length === 0 })
              setAdding(true)
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Add guardian
          </Button>
        )}
      </div>
      {student.guardians.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No guardians linked yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {student.guardians.map((link) => (
            <Card key={link.guardianId} className="gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {link.guardian.fullName}
                    {link.guardian.guardianCode && <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{link.guardian.guardianCode}</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">{RELATIONSHIP_LABELS[link.relationship]}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {link.isPrimary && <Badge>Primary</Badge>}
                  {link.isEmergencyContact && <Badge variant="secondary">Emergency</Badge>}
                  {link.canAccessStudentPortalData && <Badge variant="outline">Portal</Badge>}
                </div>
              </div>
              <dl className="grid gap-1 text-sm">
                <div className="flex gap-2"><dt className="w-20 text-muted-foreground">Phone</dt><dd>{link.guardian.phone ?? "—"}{link.guardian.alternatePhone ? ` · ${link.guardian.alternatePhone}` : ""}</dd></div>
                <div className="flex gap-2"><dt className="w-20 text-muted-foreground">Email</dt><dd className="truncate">{link.guardian.email ?? "—"}</dd></div>
                <div className="flex gap-2"><dt className="w-20 text-muted-foreground">Occupation</dt><dd>{link.guardian.occupation ?? "—"}</dd></div>
                <div className="flex gap-2"><dt className="w-20 text-muted-foreground">Notices</dt><dd>{[link.receivesAcademicNotifications && "Academic", link.receivesBillingNotifications && "Billing"].filter(Boolean).join(", ") || "None"}</dd></div>
              </dl>
              {link.guardian._count.students > 1 && (
                <p className="text-xs text-muted-foreground">Also guardian of {link.guardian._count.students - 1} other student(s). Edits apply to all.</p>
              )}
              {(canUpdate || canOpenGuardians) && (
                <div className="flex gap-1">
                  {canOpenGuardians && (
                    <Button size="xs" variant="outline" nativeButton={false} render={<Link href={`/dashboard/parents/${link.guardianId}`} />}>
                      <ArrowRightIcon data-icon="inline-start" />
                      Guardian profile
                    </Button>
                  )}
                  {canUpdate && (
                    <>
                      <Button size="xs" variant="outline" onClick={() => startEdit(link)}>
                        <PencilIcon data-icon="inline-start" />
                        Edit
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setRemoving(link)}>
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <FormProvider {...addForm}>
        <FormDialog open={adding} onOpenChange={setAdding} title="Add guardian" pending={addForm.formState.isSubmitting} error={error} onSubmit={submitAdd} wide>
          <GuardianFields prefix="" />
        </FormDialog>
      </FormProvider>

      <FormDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title="Edit guardian" pending={editForm.formState.isSubmitting} error={error} onSubmit={submitEdit} wide>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={editForm.control} name="fullName" label="Full name" required />
          <SelectField control={editForm.control} name="relationship" label="Relationship" options={Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => ({ value, label }))} />
          <TextField control={editForm.control} name="phone" label="Phone" type="tel" />
          <TextField control={editForm.control} name="alternatePhone" label="Alternate phone" type="tel" />
          <TextField control={editForm.control} name="email" label="Email" type="email" />
          <TextField control={editForm.control} name="occupation" label="Occupation" />
        </div>
        <TextField control={editForm.control} name="address" label="Address" />
        <div className="grid gap-2 sm:grid-cols-2">
          <SwitchField control={editForm.control} name="isPrimary" label="Primary contact" />
          <SwitchField control={editForm.control} name="isEmergencyContact" label="Emergency contact" />
          <SwitchField control={editForm.control} name="receivesAcademicNotifications" label="Academic notifications" />
          <SwitchField control={editForm.control} name="receivesBillingNotifications" label="Billing notifications" />
        </div>
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.guardian.fullName ?? "guardian"}?`}
        description="Only the link to this student is removed. The guardian's profile, account and links to other students are kept."
        confirmLabel="Remove"
        destructive
        onConfirm={() => (removing ? run(() => unlinkGuardianAction(student.id, removing.guardianId)) : undefined)}
      />
    </div>
  )
}

// ----------------------------------------------------------------- enrollment

type Enrollment = StudentProfile["enrollments"][number]

function placementText(e: Enrollment) {
  return [e.class.name, e.section && `Section ${e.section.name}`, e.program?.name].filter(Boolean).join(" · ")
}

export function EnrollmentPanel({
  student,
  structure,
}: {
  student: Pick<StudentProfile, "id" | "archivedAt" | "status" | "enrollments">
  structure: EducationStructure
}) {
  const router = useRouter()
  const canEnroll = useCan("students.enroll") && !student.archivedAt
  const automaticRoll = structure.settings.rollNumberMode === "AUTOMATIC"
  const open = student.enrollments.filter((e) => e.status === "ACTIVE" || e.status === "ON_HOLD")
  const current = open[0] ?? null
  const history = student.enrollments.filter((e) => e !== current)

  const [dialog, setDialog] = React.useState<"add" | "correct" | "progress" | "status" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [newStatus, setNewStatus] = React.useState<EnrollmentStatus>("ON_HOLD")
  const [statusReason, setStatusReason] = React.useState("")

  const addForm = useForm<z.input<typeof enrollmentSchema>, unknown, z.output<typeof enrollmentSchema>>({ resolver: zodResolver(enrollmentSchema) })
  const correctForm = useForm<z.input<typeof correctEnrollmentSchema>, unknown, z.output<typeof correctEnrollmentSchema>>({ resolver: zodResolver(correctEnrollmentSchema) })
  const progressForm = useForm<z.input<typeof progressEnrollmentSchema>, unknown, z.output<typeof progressEnrollmentSchema>>({ resolver: zodResolver(progressEnrollmentSchema) })
  const createNext = useWatch({ control: progressForm.control, name: "createNext" })

  const done = (title: string) => {
    toast.add({ title, type: "success" })
    setDialog(null)
    router.refresh()
  }

  function openAdd() {
    const year = structure.years.find((y) => y.isCurrent)
    addForm.reset({
      academicYearId: year?.id ?? "", educationLevelId: "", programId: "", classId: "", sectionId: "",
      batchId: "", rollNumber: "", enrollmentDate: today(),
      enrollmentType: student.enrollments.length ? "READMISSION" : "NEW_ADMISSION",
    })
    setError(null)
    setDialog("add")
  }

  function openCorrect() {
    if (!current) return
    correctForm.reset({
      sectionId: current.sectionId ?? "",
      batchId: current.batchId ?? "",
      rollNumber: current.rollNumber ?? "",
      enrollmentDate: fromDate(current.enrollmentDate),
    })
    setError(null)
    setDialog("correct")
  }

  // Suggests the next class (by order) and the next academic year.
  function openProgress() {
    if (!current) return
    const siblings = structure.classes
      .filter((c) => c.isActive && c.educationLevelId === current.educationLevelId && c.programId === current.programId)
      .sort((a, b) => a.sequence - b.sequence)
    const nextClass = siblings.find((c) => c.sequence > current.class.sequence)
    const currentYear = structure.years.find((y) => y.id === current.academicYearId)
    const nextYear = structure.years
      .filter((y) => y.status !== "ARCHIVED" && currentYear && y.startDate > currentYear.startDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
    const semesterBased = current.class && siblings.find((c) => c.id === current.classId)?.kind === "SEMESTER"
    progressForm.reset({
      outcome: nextClass ? "PROMOTED" : "COMPLETED",
      endedOn: today(),
      reason: "",
      createNext: Boolean(nextClass),
      next: {
        // Semester programs often move to the next semester within the same year.
        academicYearId: semesterBased ? current.academicYearId : (nextYear?.id ?? ""),
        educationLevelId: current.educationLevelId,
        programId: current.programId ?? "",
        classId: nextClass?.id ?? "",
        sectionId: "",
        batchId: current.batchId ?? "",
        rollNumber: "",
        enrollmentDate: today(),
        enrollmentType: "PROMOTION",
      },
    })
    setError(null)
    setDialog("progress")
  }

  const submitAdd = addForm.handleSubmit(async (values) => {
    const result = await addEnrollmentAction(student.id, values)
    if (!result.ok) return setError(applyServerErrors(addForm, result))
    done("Student enrolled")
  })
  const submitCorrect = correctForm.handleSubmit(async (values) => {
    if (!current) return
    const result = await correctEnrollmentAction(student.id, current.id, values)
    if (!result.ok) return setError(applyServerErrors(correctForm, result))
    done("Enrollment corrected")
  })
  const submitProgress = progressForm.handleSubmit(async (values) => {
    if (!current) return
    const result = await progressEnrollmentAction(student.id, current.id, values)
    if (!result.ok) return setError(applyServerErrors(progressForm, result))
    done("Enrollment updated")
  })

  const correctSections = current ? structure.sections.filter((s) => s.isActive && s.classId === current.classId) : []
  const transitions = current ? ENROLLMENT_STATUS_TRANSITIONS[current.status].filter((s) => !["PROMOTED", "COMPLETED", "DETAINED"].includes(s)) : []

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Current enrollment</h2>
        {canEnroll && !current && student.status === "ACTIVE" && (
          <Button size="sm" onClick={openAdd}>
            <PlusIcon data-icon="inline-start" />
            Enroll
          </Button>
        )}
      </div>

      {current ? (
        <Card className="gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{placementText(current)}</p>
              <p className="text-sm text-muted-foreground">
                {current.educationLevel.name} · {current.academicYear.name}
                {current.batch ? ` · ${current.batch.name}` : ""}
              </p>
            </div>
            <EnrollmentStatusBadge status={current.status} />
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Roll number</dt><dd className="font-medium">{current.rollNumber ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Enrolled on</dt><dd>{formatDate(current.enrollmentDate)}</dd></div>
            <div><dt className="text-muted-foreground">Type</dt><dd>{ENROLLMENT_TYPE_LABELS[current.enrollmentType]}</dd></div>
            <div><dt className="text-muted-foreground">Year status</dt><dd>{current.academicYear.status.toLowerCase()}</dd></div>
          </dl>
          {canEnroll && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={openProgress}>
                <ArrowRightIcon data-icon="inline-start" />
                Promote / complete / transfer
              </Button>
              <Button size="sm" variant="outline" onClick={openCorrect}>
                <PencilIcon data-icon="inline-start" />
                Correct details
              </Button>
              {transitions.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => { setNewStatus(transitions[0]); setStatusReason(""); setDialog("status") }}>
                  <RefreshCwIcon data-icon="inline-start" />
                  Change status
                </Button>
              )}
            </div>
          )}
        </Card>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {student.status === "ACTIVE" ? "Not currently enrolled." : `No open enrollment (student is ${STUDENT_STATUS_LABELS[student.status].toLowerCase()}).`}
        </p>
      )}

      <div className="grid gap-3">
        <h2 className="text-base font-semibold">Academic history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No earlier enrollments.</p>
        ) : (
          <ol className="relative grid gap-3 border-l pl-5">
            {history.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-background bg-muted-foreground" />
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{placementText(e)}</p>
                  <EnrollmentStatusBadge status={e.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {e.educationLevel.name} · {e.academicYear.name} · {formatDate(e.enrollmentDate)}
                  {e.endedOn ? ` → ${formatDate(e.endedOn)}` : ""}
                  {e.rollNumber ? ` · Roll ${e.rollNumber}` : ""} · {ENROLLMENT_TYPE_LABELS[e.enrollmentType]}
                </p>
                {e.statusReason && <p className="text-xs text-muted-foreground">“{e.statusReason}”</p>}
              </li>
            ))}
          </ol>
        )}
      </div>

      <FormProvider {...addForm}>
        <FormDialog open={dialog === "add"} onOpenChange={(o) => !o && setDialog(null)} title="Enroll student" pending={addForm.formState.isSubmitting} error={error} onSubmit={submitAdd} wide>
          <PlacementFields prefix="" structure={structure} rollNumberAutomatic={automaticRoll} />
        </FormDialog>
      </FormProvider>

      <FormDialog open={dialog === "correct"} onOpenChange={(o) => !o && setDialog(null)} title="Correct enrollment details" description="Fix the section, roll number, batch or date. To move to another class or year, use Promote / complete / transfer so history is kept." pending={correctForm.formState.isSubmitting} error={error} onSubmit={submitCorrect}>
        <div className="grid gap-4 sm:grid-cols-2">
          {correctSections.length > 0 && (
            <SelectField control={correctForm.control} name="sectionId" label="Section" placeholder="No section" options={correctSections.map((s) => ({ value: s.id, label: s.name }))} />
          )}
          <TextField control={correctForm.control} name="rollNumber" label="Roll number" />
          {structure.batches.length > 0 && (
            <SelectField control={correctForm.control} name="batchId" label="Batch" placeholder="No batch" options={structure.batches.filter((b) => b.isActive).map((b) => ({ value: b.id, label: b.name }))} />
          )}
          <TextField control={correctForm.control} name="enrollmentDate" label="Enrollment date" type="date" />
        </div>
      </FormDialog>

      <FormProvider {...progressForm}>
        <FormDialog open={dialog === "progress"} onOpenChange={(o) => !o && setDialog(null)} title="Promote, complete or transfer" description="The current placement is closed with this outcome and kept in history." pending={progressForm.formState.isSubmitting} error={error} onSubmit={submitProgress} wide submitLabel="Save">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField control={progressForm.control} name="outcome" label="Outcome" options={Object.entries(PROGRESSION_OUTCOMES_LABELS).map(([value, label]) => ({ value, label }))} />
            <TextField control={progressForm.control} name="endedOn" label="Ended on" type="date" />
          </div>
          <TextAreaField control={progressForm.control} name="reason" label="Note" rows={2} />
          <SwitchField control={progressForm.control} name="createNext" label="Enroll in the next placement" description="E.g. the next grade or semester, a repeated class, or another program." />
          {createNext && <PlacementFields prefix="next" structure={structure} rollNumberAutomatic={automaticRoll} />}
        </FormDialog>
      </FormProvider>

      <ConfirmDialog
        open={dialog === "status"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Change enrollment status"
        confirmLabel="Change status"
        onConfirm={async () => {
          if (!current) return
          const result = await changeEnrollmentStatusAction(student.id, current.id, { status: newStatus, reason: statusReason })
          if (!result.ok) {
            toast.add({ title: "Couldn't change status", description: result.error, type: "error" })
            return false
          }
          done("Enrollment status updated")
        }}
      >
        <div className="grid gap-3">
          <NativeSelect value={newStatus} onChange={(e) => setNewStatus(e.target.value as EnrollmentStatus)} className="w-full" aria-label="New status">
            {transitions.map((s) => (
              <NativeSelectOption key={s} value={s}>{ENROLLMENT_STATUS_LABELS[s]}</NativeSelectOption>
            ))}
          </NativeSelect>
          <Textarea placeholder="Reason (optional)" rows={2} maxLength={300} value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
        </div>
      </ConfirmDialog>
    </div>
  )
}

// ------------------------------------------------------------------ documents

export type DocumentRow = {
  id: string
  title: string
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: Date
  requirement: { id: string; name: string } | null
}

export function DocumentsPanel({
  studentId,
  archived,
  documents,
  requirements,
}: {
  studentId: string
  archived: boolean
  documents: DocumentRow[]
  requirements: { id: string; name: string; isRequired: boolean }[]
}) {
  const router = useRouter()
  const run = useRunner()
  const canManage = useCan("students.documents.manage") && !archived
  const [file, setFile] = React.useState<File | null>(null)
  const [title, setTitle] = React.useState("")
  const [requirementId, setRequirementId] = React.useState("")
  const [uploading, setUploading] = React.useState(false)
  const [deleting, setDeleting] = React.useState<DocumentRow | null>(null)
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
    body.set("requirementId", requirementId)
    const res = await fetch(`/api/students/${studentId}/documents`, { method: "POST", body }).catch(() => null)
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
      <h2 className="text-base font-semibold">Documents</h2>
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
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.requirement?.name ?? "Other"} · {d.fileName} · {(d.sizeBytes / 1024).toFixed(0)} KB · {formatDate(d.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={`Download ${d.title}`} nativeButton={false} render={<a href={`/api/students/${studentId}/documents/${d.id}`} />}>
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
          <form onSubmit={upload} className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="doc-file">File</Label>
              <Input id="doc-file" ref={fileInput} type="file" accept={DOCUMENT_MIME_TYPES.join(",")} onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""))
              }} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-title">Title</Label>
              <Input id="doc-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-type">Type</Label>
              <NativeSelect id="doc-type" value={requirementId} onChange={(e) => setRequirementId(e.target.value)} className="w-full">
                <NativeSelectOption value="">Other</NativeSelectOption>
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
        description="The file is removed permanently."
        confirmLabel="Delete"
        destructive
        onConfirm={() => (deleting ? run(() => deleteDocumentAction(studentId, deleting.id)) : undefined)}
      />
    </div>
  )
}
