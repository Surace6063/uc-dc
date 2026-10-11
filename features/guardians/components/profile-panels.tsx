"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CameraIcon,
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  LinkIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldOffIcon,
  Trash2Icon,
  UnlinkIcon,
  XIcon,
} from "lucide-react"
import { FormProvider, useFieldArray, useForm } from "react-hook-form"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { applyServerErrors, TextField } from "@/components/shared/form-fields"
import { useCan } from "@/components/shared/session-provider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import {
  archiveGuardianAction,
  deleteGuardianAction,
  inviteGuardianAction,
  linkStudentsAction,
  removeGuardianPhotoAction,
  restoreGuardianAction,
  revokeInvitationAction,
  setPortalAccessAction,
  unlinkGuardianAccountAction,
  unlinkStudentAction,
  updateStudentLinkAction,
} from "@/features/guardians/actions"
import { defaultLinkSettings, LinkSettingsFields, StudentPicker } from "@/features/guardians/components/form-sections"
import { InvitationBadge, PortalStatusBadge } from "@/features/guardians/components/status-badges"
import { invitationState, LINK_FLAGS, RELATIONSHIP_LABELS } from "@/features/guardians/constants"
import {
  inviteGuardianSchema,
  linkSettingsSchema,
  linkStudentsSchema,
} from "@/features/guardians/schemas"
import { EnrollmentStatusBadge, StudentStatusBadge } from "@/features/students/components/status-badges"
import { initials, PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from "@/features/students/constants"
import type { GuardianProfile } from "@/services/guardians/guardian-service"

const formatDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"
const formatDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

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

type Guardian = Pick<GuardianProfile, "id" | "fullName" | "archivedAt" | "userId" | "childCount">

// ------------------------------------------------------------ header actions

export function GuardianProfileActions({ guardian }: { guardian: Guardian }) {
  const router = useRouter()
  const canUpdate = useCan("parents.update")
  const canArchive = useCan("parents.archive")
  const canDelete = useCan("parents.delete")
  const [confirm, setConfirm] = React.useState<"archive" | "restore" | "delete" | null>(null)
  const archived = guardian.archivedAt !== null

  async function run() {
    const result =
      confirm === "archive"
        ? await archiveGuardianAction(guardian.id)
        : confirm === "restore"
          ? await restoreGuardianAction(guardian.id)
          : await deleteGuardianAction(guardian.id)
    if (!result.ok) {
      toast.add({ title: "Couldn't complete that", description: result.error, type: "error" })
      return false
    }
    toast.add({ title: result.message ?? "Done", type: "success" })
    if (confirm === "delete") router.push("/dashboard/parents")
    else router.refresh()
  }

  return (
    <>
      {canUpdate && !archived && (
        <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/parents/${guardian.id}/edit`} />}>
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
              <DropdownMenuItem onClick={() => setConfirm(archived ? "restore" : "archive")}>
                {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                {archived ? "Restore" : "Archive"}
              </DropdownMenuItem>
            )}
            {canDelete && archived && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setConfirm("delete")}>
                  <Trash2Icon />
                  Delete permanently
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "archive" ? `Archive ${guardian.fullName}?` : confirm === "restore" ? `Restore ${guardian.fullName}?` : `Permanently delete ${guardian.fullName}?`}
        description={
          confirm === "archive"
            ? "The guardian is hidden from lists, can't use the parent portal, stops receiving notices and any open invitation is cancelled. Student links and the login account are kept."
            : confirm === "restore"
              ? "The guardian appears in lists again. Portal access returns if their account is still linked and enabled."
              : guardian.childCount > 0 || guardian.userId
                ? "This guardian still has linked students or an account, so deletion will be refused. Remove those first, or keep the record archived."
                : "Only for records created by mistake. This can't be undone. The person's login account (if any) is never deleted."
        }
        confirmLabel={confirm === "archive" ? "Archive" : confirm === "restore" ? "Restore" : "Delete permanently"}
        destructive={confirm === "delete"}
        onConfirm={run}
      />
    </>
  )
}

export function GuardianPhotoControl({ guardianId, hasPhoto, disabled }: { guardianId: string; hasPhoto: boolean; disabled: boolean }) {
  const router = useRouter()
  const run = useRunner()
  const canUpdate = useCan("parents.update")
  const input = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  if (!canUpdate || disabled) return null

  async function upload(file: File | undefined) {
    if (!file) return
    if (file.size > PHOTO_MAX_BYTES) return toast.add({ title: "The photo must be 2 MB or smaller.", type: "error" })
    setUploading(true)
    const body = new FormData()
    body.set("file", file)
    const res = await fetch(`/api/parents/${guardianId}/photo`, { method: "POST", body }).catch(() => null)
    setUploading(false)
    if (!res?.ok) {
      const message = await res?.json().then((j: { error?: { message?: string } }) => j.error?.message).catch(() => null)
      return toast.add({ title: "Couldn't upload the photo", description: message ?? undefined, type: "error" })
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
        <Button size="xs" variant="ghost" onClick={() => run(() => removeGuardianPhotoAction(guardianId))}>
          Remove
        </Button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ children

type LinkRow = GuardianProfile["students"][number]
export type ChildLink = Omit<LinkRow, "student"> & {
  student: Omit<LinkRow["student"], "profileImagePath"> & { photoUrl: string | null }
}

function placement(e: ChildLink["student"]["enrollments"][number] | undefined) {
  if (!e) return null
  return [e.educationLevel.name, e.program?.name, e.class.name, e.section && `Section ${e.section.name}`, e.batch?.name].filter(Boolean).join(" · ")
}

type LinkSettings = z.input<typeof linkSettingsSchema>
type LinkMany = z.input<typeof linkStudentsSchema>

export function ChildrenPanel({ guardian, links }: { guardian: Guardian; links: ChildLink[] }) {
  const router = useRouter()
  const run = useRunner()
  const canManage = useCan("parents.update") && guardian.archivedAt === null
  const [editing, setEditing] = React.useState<ChildLink | null>(null)
  const [removing, setRemoving] = React.useState<ChildLink | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [picked, setPicked] = React.useState<{ id: string; name: string; admissionNumber: string }[]>([])
  const [error, setError] = React.useState<string | null>(null)

  const editForm = useForm<LinkSettings, unknown, z.output<typeof linkSettingsSchema>>({ resolver: zodResolver(linkSettingsSchema) })
  const addForm = useForm<LinkMany, unknown, z.output<typeof linkStudentsSchema>>({ resolver: zodResolver(linkStudentsSchema), defaultValues: { links: [] } })
  const addLinks = useFieldArray({ control: addForm.control, name: "links" })

  function startEdit(link: ChildLink) {
    setError(null)
    editForm.reset({
      relationship: link.relationship,
      isPrimary: link.isPrimary,
      isEmergencyContact: link.isEmergencyContact,
      canPickupStudent: link.canPickupStudent,
      receivesAcademicNotifications: link.receivesAcademicNotifications,
      receivesAttendanceNotifications: link.receivesAttendanceNotifications,
      receivesBillingNotifications: link.receivesBillingNotifications,
      receivesGeneralAnnouncements: link.receivesGeneralAnnouncements,
      canAccessStudentPortalData: link.canAccessStudentPortalData,
      notes: link.notes ?? "",
    })
    setEditing(link)
  }

  const submitEdit = editForm.handleSubmit(async (values) => {
    if (!editing) return
    setError(null)
    const result = await updateStudentLinkAction(guardian.id, editing.studentId, values)
    if (!result.ok) return setError(applyServerErrors(editForm, result))
    toast.add({ title: "Link updated", type: "success" })
    setEditing(null)
    router.refresh()
  })

  const submitAdd = addForm.handleSubmit(async (values) => {
    setError(null)
    const result = await linkStudentsAction(guardian.id, values)
    if (!result.ok) return setError(applyServerErrors(addForm, result))
    toast.add({ title: result.message ?? "Students linked", type: "success" })
    setAdding(false)
    router.refresh()
  })

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Linked students</h2>
          <p className="text-sm text-muted-foreground">Each link has its own relationship, notices and portal permission.</p>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => {
              setError(null)
              setPicked([])
              addForm.reset({ links: [] })
              setAdding(true)
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Link students
          </Button>
        )}
      </div>

      {links.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Not linked to any student.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {links.map((link) => {
            const s = link.student
            const enrollment = s.enrollments[0]
            return (
              <Card key={link.studentId} className="gap-3 p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="size-11">
                    {s.photoUrl && <AvatarImage src={s.photoUrl} alt="" />}
                    <AvatarFallback>{initials(s)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/students/${s.id}`} className="font-medium hover:underline">
                      {[s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{s.admissionNumber}</span> · {RELATIONSHIP_LABELS[link.relationship]}
                    </p>
                  </div>
                  <StudentStatusBadge status={s.status} archived={s.archivedAt !== null} />
                </div>
                <dl className="grid gap-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">Placement</dt>
                    <dd className="min-w-0">{placement(enrollment) ?? <span className="text-muted-foreground">Not enrolled</span>}</dd>
                  </div>
                  {enrollment && (
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-muted-foreground">Year</dt>
                      <dd className="flex flex-wrap items-center gap-2">
                        {enrollment.academicYear.name}
                        <EnrollmentStatusBadge status={enrollment.status} />
                        {enrollment.rollNumber && <span className="text-xs text-muted-foreground">Roll {enrollment.rollNumber}</span>}
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="flex flex-wrap gap-1">
                  {LINK_FLAGS.filter((f) => link[f.key]).map((f) => (
                    <Badge key={f.key} variant={f.key === "isPrimary" || f.key === "canAccessStudentPortalData" ? "default" : "secondary"}>
                      {f.label}
                    </Badge>
                  ))}
                </div>
                {link.notes && <p className="text-xs text-muted-foreground">{link.notes}</p>}
                {canManage && (
                  <div className="flex gap-1">
                    <Button size="xs" variant="outline" onClick={() => startEdit(link)}>
                      <PencilIcon data-icon="inline-start" />
                      Edit link
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setRemoving(link)}>
                      <UnlinkIcon data-icon="inline-start" />
                      Remove link
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <FormProvider {...editForm}>
        <FormDialog
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          title={`Link to ${editing ? editing.student.firstName : "student"}`}
          description="Changes to portal access and contact roles are recorded in the activity log."
          pending={editForm.formState.isSubmitting}
          error={error}
          onSubmit={submitEdit}
          wide
        >
          <LinkSettingsFields prefix="" />
        </FormDialog>
      </FormProvider>

      <FormProvider {...addForm}>
        <FormDialog open={adding} onOpenChange={setAdding} title="Link students" pending={addForm.formState.isSubmitting} error={error} onSubmit={submitAdd} submitLabel="Link" wide>
          <StudentPicker
            guardianId={guardian.id}
            excludeIds={picked.map((p) => p.id)}
            onPick={(s) => {
              setPicked((list) => [...list, { id: s.id, name: s.name, admissionNumber: s.admissionNumber }])
              addLinks.append({ studentId: s.id, ...defaultLinkSettings({ isPrimary: s.guardianCount === 0 }) })
            }}
          />
          {addLinks.fields.map((field, i) => {
            const student = picked.find((p) => p.id === field.studentId)
            return (
              <div key={field.id} className="grid gap-3 rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <p className="font-medium">
                    {student?.name} <span className="font-normal text-muted-foreground">· {student?.admissionNumber}</span>
                  </p>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove"
                    onClick={() => {
                      addLinks.remove(i)
                      setPicked((list) => list.filter((p) => p.id !== field.studentId))
                    }}
                  >
                    <XIcon />
                  </Button>
                </div>
                <LinkSettingsFields prefix={`links.${i}`} />
              </div>
            )
          })}
          {addForm.formState.errors.links?.message && <p className="text-xs text-destructive">{addForm.formState.errors.links.message}</p>}
        </FormDialog>
      </FormProvider>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove the link to ${removing?.student.firstName ?? "this student"}?`}
        description="Only the link is removed: the guardian and the student are both kept, with their history. The guardian loses portal access to this student and stops receiving notices about them."
        confirmLabel="Remove link"
        destructive
        onConfirm={() => (removing ? run(() => unlinkStudentAction(guardian.id, removing.studentId)) : undefined)}
      />
    </div>
  )
}

// ------------------------------------------------------------- portal access

type Invitation = GuardianProfile["invitations"][number]

export function PortalPanel({
  guardian,
}: {
  guardian: Pick<GuardianProfile, "id" | "fullName" | "email" | "archivedAt" | "portalStatus" | "invitations"> & {
    user: GuardianProfile["user"]
    portalChildren: number
  }
}) {
  const run = useRunner()
  const router = useRouter()
  const canManage = useCan("parents.portal.manage")
  const [inviting, setInviting] = React.useState(false)
  const [link, setLink] = React.useState<{ url: string; email: string; expiresAt: string } | null>(null)
  const [confirm, setConfirm] = React.useState<"revoke" | "disable" | "enable" | "unlink" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const latest: Invitation | undefined = guardian.invitations[0]
  const state = invitationState(latest)
  const archived = guardian.archivedAt !== null

  const form = useForm<z.input<typeof inviteGuardianSchema>, unknown, z.output<typeof inviteGuardianSchema>>({
    resolver: zodResolver(inviteGuardianSchema),
  })

  function openInvite(email: string) {
    setError(null)
    form.reset({ email })
    setInviting(true)
  }

  const submitInvite = form.handleSubmit(async (values) => {
    setError(null)
    const result = await inviteGuardianAction(guardian.id, values)
    if (!result.ok) return setError(applyServerErrors(form, result))
    setInviting(false)
    setCopied(false)
    setLink(result.data)
    router.refresh()
  })

  async function confirmAction() {
    if (confirm === "revoke") return run(() => revokeInvitationAction(guardian.id))
    if (confirm === "disable") return run(() => setPortalAccessAction(guardian.id, { enabled: false }))
    if (confirm === "enable") return run(() => setPortalAccessAction(guardian.id, { enabled: true }))
    if (confirm === "unlink") return run(() => unlinkGuardianAccountAction(guardian.id))
  }

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Parent portal</h2>
          <p className="text-sm text-muted-foreground">
            The guardian signs in with their own account and sees only students whose link allows portal access
            ({guardian.portalChildren} of them now).
          </p>
        </div>
        <PortalStatusBadge status={guardian.portalStatus} />
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">Linked account</dt>
          <dd className="text-sm">{guardian.user ? guardian.user.email : <span className="text-muted-foreground">None</span>}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">Latest invitation</dt>
          <dd className="flex flex-wrap items-center gap-2 text-sm">
            <InvitationBadge state={state} />
            {latest && <span className="text-xs text-muted-foreground">{latest.email}</span>}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">{state === "pending" || state === "expired" ? "Expires" : "Sent"}</dt>
          <dd className="text-sm">{latest ? formatDateTime(state === "pending" || state === "expired" ? latest.expiresAt : latest.createdAt) : "—"}</dd>
        </div>
      </dl>

      {canManage && !archived && (
        <div className="flex flex-wrap gap-2">
          {!guardian.user && state !== "pending" && (
            <Button size="sm" onClick={() => openInvite(latest?.email ?? guardian.email ?? "")} disabled={guardian.portalChildren === 0}>
              <MailIcon data-icon="inline-start" />
              {latest ? "Invite again" : "Invite to portal"}
            </Button>
          )}
          {!guardian.user && state === "pending" && (
            <>
              <Button size="sm" variant="outline" onClick={() => openInvite(latest!.email)}>
                <RefreshCwIcon data-icon="inline-start" />
                Resend (new link)
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm("revoke")}>
                <XIcon data-icon="inline-start" />
                Revoke
              </Button>
            </>
          )}
          {guardian.user && guardian.portalStatus === "ACTIVE" && (
            <Button size="sm" variant="outline" onClick={() => setConfirm("disable")}>
              <ShieldOffIcon data-icon="inline-start" />
              Disable access
            </Button>
          )}
          {guardian.user && guardian.portalStatus !== "ACTIVE" && (
            <Button size="sm" variant="outline" onClick={() => setConfirm("enable")}>
              <KeyRoundIcon data-icon="inline-start" />
              Enable access
            </Button>
          )}
          {guardian.user && (
            <Button size="sm" variant="ghost" onClick={() => setConfirm("unlink")}>
              <UnlinkIcon data-icon="inline-start" />
              Unlink account
            </Button>
          )}
        </div>
      )}
      {canManage && !archived && !guardian.user && guardian.portalChildren === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">Turn on “Parent portal access” for at least one linked student before inviting.</p>
      )}
      {archived && <p className="text-xs text-muted-foreground">Archived guardians can&apos;t use the portal. Restore the guardian to manage access.</p>}

      {guardian.invitations.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Invitation history ({guardian.invitations.length})</summary>
          <ul className="mt-2 grid gap-1">
            {guardian.invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-2">
                <InvitationBadge state={invitationState(inv)} />
                <span>{inv.email}</span>
                <span className="text-xs text-muted-foreground">
                  sent {formatDate(inv.createdAt)}
                  {inv.acceptedAt && `, accepted ${formatDate(inv.acceptedAt)}`}
                  {inv.revokedAt && `, revoked ${formatDate(inv.revokedAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <FormProvider {...form}>
        <FormDialog
          open={inviting}
          onOpenChange={setInviting}
          title={`Invite ${guardian.fullName} to the parent portal`}
          description="You'll get a one-time link to share by SMS, Viber, WhatsApp, email or in person. The guardian must sign in (or create an account) with this email address to accept. Any earlier link stops working."
          pending={form.formState.isSubmitting}
          error={error}
          onSubmit={submitInvite}
          submitLabel="Create invitation link"
        >
          <TextField control={form.control} name="email" label="Email address for the account" type="email" required />
        </FormDialog>
      </FormProvider>

      <Dialog open={link !== null} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invitation link</DialogTitle>
            <DialogDescription>
              Share this link with {guardian.fullName}. It works once, for {link?.email}, until {link ? formatDateTime(link.expiresAt) : ""}.
              It won&apos;t be shown again; use “Resend” to make a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={link?.url ?? ""} onFocus={(e) => e.target.select()} aria-label="Invitation link" className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!link) return
                await navigator.clipboard.writeText(link.url).catch(() => null)
                setCopied(true)
              }}
            >
              {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <LinkIcon className="mt-0.5 size-3.5 shrink-0" />
            Automatic email or SMS delivery isn&apos;t configured for this school yet, so share the link yourself.
          </p>
          <DialogFooter>
            <Button onClick={() => setLink(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm === "revoke" ? "Revoke the invitation?" : confirm === "disable" ? "Disable portal access?" : confirm === "enable" ? "Enable portal access?" : "Unlink the account?"
        }
        description={
          confirm === "revoke"
            ? "The link stops working immediately. You can invite again later."
            : confirm === "disable"
              ? "The guardian can still sign in but sees no student information until access is enabled again. Their account isn't deleted."
              : confirm === "enable"
                ? "The guardian can see students whose link allows portal access."
                : "The account is detached from this guardian and loses portal access. The person's login and organisation membership are not deleted; remove the membership from Users & Access if needed."
        }
        confirmLabel={confirm === "revoke" ? "Revoke" : confirm === "disable" ? "Disable" : confirm === "enable" ? "Enable" : "Unlink"}
        destructive={confirm === "unlink" || confirm === "disable"}
        onConfirm={confirmAction}
      />
    </Card>
  )
}
