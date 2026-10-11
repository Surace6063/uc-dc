"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { TriangleAlertIcon, XIcon } from "lucide-react"
import { FormProvider, useFieldArray, useForm, type FieldValues, type UseFormReturn } from "react-hook-form"

import { FormAlert } from "@/components/shared/form"
import { applyServerErrors } from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { createGuardianAction, findGuardianDuplicatesAction, updateGuardianAction } from "@/features/guardians/actions"
import {
  defaultLinkSettings,
  emptyProfile,
  GuardianAddressFields,
  GuardianContactFields,
  GuardianPersonalFields,
  GuardianProfessionalFields,
  LinkSettingsFields,
  StudentPicker,
} from "@/features/guardians/components/form-sections"
import {
  createGuardianSchema,
  updateGuardianSchema,
  type CreateGuardianInput,
  type CreateGuardianValues,
  type GuardianProfileInput,
  type UpdateGuardianInput,
  type UpdateGuardianValues,
} from "@/features/guardians/schemas"
import { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from "@/features/students/constants"

type Duplicate = { id: string; guardianCode: string | null; fullName: string; phone: string | null; email: string | null; archived: boolean; children: number }

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-4 p-5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </Card>
  )
}

// Advisory: shows guardians with the same phone, email or name so staff can
// link an existing guardian instead of creating a duplicate.
function useDuplicates(form: UseFormReturn<FieldValues>, excludeId?: string) {
  const [duplicates, setDuplicates] = React.useState<Duplicate[]>([])
  const check = React.useCallback(async () => {
    const profile = form.getValues("profile") as GuardianProfileInput
    const result = await findGuardianDuplicatesAction({
      fullName: profile.fullName ?? "",
      phone: profile.phone || null,
      email: profile.email || null,
      excludeId: excludeId ?? null,
    })
    setDuplicates(result.ok ? result.data : [])
  }, [form, excludeId])
  return { duplicates, check }
}

function DuplicateNotice({ duplicates }: { duplicates: Duplicate[] }) {
  if (duplicates.length === 0) return null
  return (
    <div role="status" className="grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlertIcon className="size-4 text-amber-600" />
        Possible existing guardian{duplicates.length > 1 ? "s" : ""}
      </p>
      <ul className="grid gap-1">
        {duplicates.map((d) => (
          <li key={d.id}>
            <Link href={`/dashboard/parents/${d.id}`} target="_blank" className="font-medium underline-offset-2 hover:underline">
              {d.fullName}
            </Link>{" "}
            <span className="text-muted-foreground">
              {[d.guardianCode, d.phone, d.email, `${d.children} student${d.children === 1 ? "" : "s"}`, d.archived && "archived"].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">If it&apos;s the same person, open their profile and link the student there instead. Families sharing a phone can be saved separately.</p>
    </div>
  )
}

async function uploadPhoto(guardianId: string, file: File) {
  const body = new FormData()
  body.set("file", file)
  const res = await fetch(`/api/parents/${guardianId}/photo`, { method: "POST", body }).catch(() => null)
  return Boolean(res?.ok)
}

export function CreateGuardianForm({
  permissions,
  initialStudent,
}: {
  permissions: { sensitive: boolean; link: boolean }
  // Pre-selected when coming from a student's profile.
  initialStudent?: { id: string; name: string; admissionNumber: string } | null
}) {
  const router = useRouter()
  const [formError, setFormError] = React.useState<string | null>(null)
  const [photo, setPhoto] = React.useState<File | null>(null)
  const [students, setStudents] = React.useState<{ id: string; name: string; admissionNumber: string }[]>(initialStudent ? [initialStudent] : [])
  const form = useForm<CreateGuardianInput, unknown, CreateGuardianValues>({
    resolver: zodResolver(createGuardianSchema),
    defaultValues: {
      profile: { ...emptyProfile },
      links: initialStudent ? [{ studentId: initialStudent.id, ...defaultLinkSettings({ isPrimary: false }) }] : [],
    },
    mode: "onTouched",
  })
  const links = useFieldArray({ control: form.control, name: "links" })
  const { duplicates, check } = useDuplicates(form as unknown as UseFormReturn<FieldValues>)

  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (form.formState.isDirty && !form.formState.isSubmitting) e.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [form.formState.isDirty, form.formState.isSubmitting])

  const submit = form.handleSubmit(
    async (values) => {
      setFormError(null)
      const result = await createGuardianAction(values)
      if (!result.ok) {
        setFormError(applyServerErrors(form, result))
        return
      }
      const photoFailed = photo ? !(await uploadPhoto(result.data.id, photo)) : false
      toast.add({
        title: `Guardian added with ID ${result.data.guardianCode}`,
        description: photoFailed ? "The photo couldn't be uploaded. Try again from the profile." : undefined,
        type: photoFailed ? "warning" : "success",
      })
      router.push(`/dashboard/parents/${result.data.id}`)
    },
    () => setFormError("Some details need attention. Check the highlighted fields.")
  )

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} className="grid gap-5" noValidate onBlur={(e) => {
        const name = (e.target as Element).getAttribute("name")
        if (name === "profile.phone" || name === "profile.email" || name === "profile.fullName") void check()
      }}>
        {formError && <FormAlert tone="error">{formError}</FormAlert>}
        <DuplicateNotice duplicates={duplicates} />

        <Section title="Personal information">
          <GuardianPersonalFields showSensitive={permissions.sensitive} />
          <div className="grid gap-1.5 sm:max-w-sm">
            <Label htmlFor="guardian-photo">Profile photo</Label>
            <Input
              id="guardian-photo"
              type="file"
              accept={PHOTO_MIME_TYPES.join(",")}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                if (file && file.size > PHOTO_MAX_BYTES) {
                  toast.add({ title: "The photo must be 2 MB or smaller.", type: "error" })
                  e.target.value = ""
                  return
                }
                setPhoto(file)
              }}
            />
            <p className="text-xs text-muted-foreground">Optional. JPEG, PNG or WebP, up to 2 MB.</p>
          </div>
        </Section>

        <Section title="Contact information" description="Many guardians rarely use email; a phone number is enough.">
          <GuardianContactFields />
        </Section>

        {permissions.sensitive && (
          <Section title="Address" description="All address fields are optional.">
            <GuardianAddressFields />
          </Section>
        )}

        <Section title="Professional information">
          <GuardianProfessionalFields />
        </Section>

        {permissions.link && (
          <Section
            title="Student relationships"
            description="Link the students this person is a guardian of. Each link has its own relationship, contact roles, notices and portal permission."
          >
            <StudentPicker
              excludeIds={students.map((s) => s.id)}
              onPick={(s) => {
                setStudents((list) => [...list, { id: s.id, name: s.name, admissionNumber: s.admissionNumber }])
                links.append({ studentId: s.id, ...defaultLinkSettings({ isPrimary: s.guardianCount === 0 }) })
              }}
            />
            {links.fields.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No students linked yet. You can also link students later from the guardian&apos;s profile.
              </p>
            ) : (
              <div className="grid gap-3">
                {links.fields.map((field, i) => {
                  const student = students.find((s) => s.id === field.studentId)
                  return (
                    <div key={field.id} className="grid gap-3 rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">
                          {student?.name ?? "Student"} <span className="font-normal text-muted-foreground">· {student?.admissionNumber}</span>
                        </p>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove ${student?.name ?? "student"}`}
                          onClick={() => {
                            links.remove(i)
                            setStudents((list) => list.filter((s) => s.id !== field.studentId))
                          }}
                        >
                          <XIcon />
                        </Button>
                      </div>
                      <LinkSettingsFields prefix={`links.${i}`} />
                    </div>
                  )
                })}
              </div>
            )}
            {form.formState.errors.links?.root?.message && <p className="text-xs text-destructive">{form.formState.errors.links.root.message}</p>}
          </Section>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" nativeButton={false} render={<Link href="/dashboard/parents" />}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            Save guardian
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}

export function EditGuardianForm({
  guardianId,
  initial,
  permissions,
}: {
  guardianId: string
  initial: UpdateGuardianInput
  permissions: { sensitive: boolean }
}) {
  const router = useRouter()
  const [formError, setFormError] = React.useState<string | null>(null)
  const form = useForm<UpdateGuardianInput, unknown, UpdateGuardianValues>({
    resolver: zodResolver(updateGuardianSchema),
    defaultValues: initial,
    mode: "onTouched",
  })
  const { duplicates, check } = useDuplicates(form as unknown as UseFormReturn<FieldValues>, guardianId)

  const submit = form.handleSubmit(
    async (values) => {
      setFormError(null)
      const result = await updateGuardianAction(guardianId, values)
      if (!result.ok) {
        setFormError(applyServerErrors(form, result))
        return
      }
      toast.add({ title: "Guardian updated", type: "success" })
      router.push(`/dashboard/parents/${guardianId}`)
      router.refresh()
    },
    () => setFormError("Some details need attention. Check the highlighted fields.")
  )

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} className="grid gap-5" noValidate onBlur={(e) => {
        const name = (e.target as Element).getAttribute("name")
        if (name === "profile.phone" || name === "profile.email") void check()
      }}>
        {formError && <FormAlert tone="error">{formError}</FormAlert>}
        <DuplicateNotice duplicates={duplicates} />
        <Section title="Personal information">
          <GuardianPersonalFields showSensitive={permissions.sensitive} />
        </Section>
        <Section title="Contact information">
          <GuardianContactFields />
        </Section>
        {permissions.sensitive && (
          <Section title="Address" description="All address fields are optional.">
            <GuardianAddressFields />
          </Section>
        )}
        <Section title="Professional information">
          <GuardianProfessionalFields />
        </Section>
        <p className="text-sm text-muted-foreground">Student links, notices and portal access are managed from the guardian&apos;s profile.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" nativeButton={false} render={<Link href={`/dashboard/parents/${guardianId}`} />}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            Save changes
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
