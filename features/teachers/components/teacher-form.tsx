"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, FileIcon, PlusIcon, XIcon } from "lucide-react"
import { FormProvider, useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form"

import { FormAlert } from "@/components/shared/form"
import { applyServerErrors, SwitchField, TextField } from "@/components/shared/form-fields"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { emptyAddress } from "@/features/students/components/form-sections"
import { AddressFields } from "@/features/students/components/form-sections"
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_TYPES,
} from "@/features/students/constants"
import { checkEmployeeIdAction, createTeacherAction } from "@/features/teachers/actions"
import {
  AssignmentFields,
  CertificationFields,
  emptyAssignment,
  emptyCertification,
  emptyQualification,
  EmploymentFields,
  QualificationFields,
  TeacherContactFields,
  TeacherPersonalFields,
} from "@/features/teachers/components/form-sections"
import {
  DOCUMENT_CATEGORY_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  TEACHING_ROLE_LABELS,
} from "@/features/teachers/constants"
import { createTeacherSchema, type CreateTeacherInput, type CreateTeacherValues } from "@/features/teachers/schemas"
import type { TeacherDocumentCategory } from "@/lib/generated/prisma/enums"
import { cn } from "@/lib/utils"
import type { EducationStructure } from "@/services/academics/structure-service"

type PendingDocument = { file: File; title: string; category: TeacherDocumentCategory; requirementId: string }
type LinkableUser = { id: string; name: string; email: string; role: string }

function defaults(structure: EducationStructure): CreateTeacherInput {
  return {
    employeeId: "",
    personal: { firstName: "", middleName: "", lastName: "", nameNepali: "", dateOfBirth: "", gender: "", nationality: "Nepali" },
    contact: { email: "", phone: "", alternatePhone: "", emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelationship: "" },
    permanentAddress: { ...emptyAddress },
    sameAsPermanent: true,
    temporaryAddress: { ...emptyAddress },
    employment: {
      dateOfJoining: new Date().toISOString().slice(0, 10), employmentType: "FULL_TIME", employmentStatus: "ACTIVE",
      designationId: structure.designations.find((d) => d.isActive && d.scope !== "NON_TEACHING")?.id ?? "", departmentId: "", reportingToId: "",
      contractStartDate: "", contractEndDate: "", onProbation: false, probationEndDate: "", employmentNotes: "",
    },
    qualifications: [],
    certifications: [],
    assignments: [],
    userId: "",
  }
}

async function upload(teacherId: string, photo: File | null, documents: PendingDocument[]) {
  const failed: string[] = []
  if (photo) {
    const body = new FormData()
    body.set("file", photo)
    const res = await fetch(`/api/teachers/${teacherId}/photo`, { method: "POST", body }).catch(() => null)
    if (!res?.ok) failed.push("profile photo")
  }
  for (const doc of documents) {
    const body = new FormData()
    body.set("file", doc.file)
    body.set("title", doc.title || doc.file.name)
    body.set("category", doc.category)
    body.set("requirementId", doc.requirementId)
    const res = await fetch(`/api/teachers/${teacherId}/documents`, { method: "POST", body }).catch(() => null)
    if (!res?.ok) failed.push(doc.title || doc.file.name)
  }
  return failed
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

export function TeacherForm({
  structure,
  managers,
  linkableUsers,
  permissions,
}: {
  structure: EducationStructure
  managers: { id: string; name: string }[]
  // Null when the user may not see organisation members.
  linkableUsers: LinkableUser[] | null
  permissions: { sensitive: boolean; assignments: boolean; documents: boolean }
}) {
  const router = useRouter()
  const steps = React.useMemo(
    () =>
      [
        { key: "personal", title: "Personal", fields: ["employeeId", "personal"] },
        { key: "contact", title: "Contact & address", fields: ["contact", "permanentAddress", "temporaryAddress"] },
        { key: "employment", title: "Employment", fields: ["employment"] },
        { key: "qualifications", title: "Qualifications", fields: ["qualifications", "certifications"] },
        ...(permissions.assignments ? [{ key: "assignments", title: "Teaching", fields: ["assignments"] }] : []),
        { key: "files", title: "Photo & documents", fields: [] },
        ...(linkableUsers ? [{ key: "account", title: "Account", fields: ["userId"] }] : []),
        { key: "review", title: "Review", fields: [] },
      ] as const satisfies readonly { key: string; title: string; fields: readonly string[] }[],
    [permissions.assignments, linkableUsers]
  )
  const [step, setStep] = React.useState(0)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [photo, setPhoto] = React.useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null)
  const [documents, setDocuments] = React.useState<PendingDocument[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<CreateTeacherInput, unknown, CreateTeacherValues>({
    resolver: zodResolver(createTeacherSchema),
    defaultValues: defaults(structure),
    mode: "onTouched",
  })
  const qualifications = useFieldArray({ control: form.control, name: "qualifications" })
  const certifications = useFieldArray({ control: form.control, name: "certifications" })
  const assignments = useFieldArray({ control: form.control, name: "assignments" })
  const values = useWatch({ control: form.control }) as CreateTeacherInput
  const automaticIds = structure.staffSettings.employeeIdMode === "AUTOMATIC"
  const current = steps[step]
  const requirements = structure.requirements.filter((r) => r.audience === "TEACHER" && r.isActive)

  React.useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (form.formState.isDirty && !submitting) e.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [form.formState.isDirty, submitting])

  // Flags a taken employee ID as soon as it's typed (the server re-checks).
  async function checkEmployeeId() {
    const value = form.getValues("employeeId")?.trim()
    if (!value) return
    const result = await checkEmployeeIdAction(value)
    if (result.ok && !result.data.available) {
      form.setError("employeeId", { type: "server", message: "This employee ID is already used in your organisation." })
    }
  }

  async function next() {
    const fields = current.fields as readonly FieldPath<CreateTeacherInput>[]
    if (fields.length && !(await form.trigger(fields, { shouldFocus: true }))) return
    if (form.getFieldState("employeeId").error) return
    setStep((s) => Math.min(s + 1, steps.length - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const submit = form.handleSubmit(
    async (data) => {
      setFormError(null)
      setSubmitting(true)
      const result = await createTeacherAction(data)
      if (!result.ok) {
        setSubmitting(false)
        setFormError(applyServerErrors(form, result))
        const paths = Object.keys(result.fieldErrors ?? {})
        const target = steps.findIndex((s) => (s.fields as readonly string[]).some((f) => paths.some((p) => p.startsWith(f))))
        if (target >= 0) setStep(target)
        return
      }
      const failed = await upload(result.data.id, photo, documents)
      toast.add({
        title: `Teacher added with ID ${result.data.employeeId}`,
        description: failed.length ? `Couldn't upload: ${failed.join(", ")}. Retry from the profile.` : undefined,
        type: failed.length ? "warning" : "success",
      })
      router.push(`/dashboard/teachers/${result.data.id}${failed.length ? "?tab=documents" : ""}`)
    },
    () => setFormError("Some details need attention. Go back to the highlighted step.")
  )

  function addDocument(file: File | undefined) {
    if (!file) return
    if (file.size > DOCUMENT_MAX_BYTES || !(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.add({ title: "Use a PDF, JPG, PNG or WebP file up to 5 MB", type: "error" })
      return
    }
    setDocuments((d) => [...d, { file, title: file.name.replace(/\.[^.]+$/, ""), category: "CV", requirementId: "" }])
  }

  const name = [values.personal.firstName, values.personal.middleName, values.personal.lastName].filter(Boolean).join(" ")
  const lookup = (list: { id: string; name: string }[], id?: string | null) => list.find((x) => x.id === id)?.name

  return (
    <FormProvider {...form}>
      <form onSubmit={(e) => e.preventDefault()} noValidate className="flex flex-col gap-5">
        <ol className="flex gap-1 overflow-x-auto pb-1">
          {steps.map((s, i) => (
            <li key={s.key} className="flex-1">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={cn("flex w-full min-w-24 flex-col gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs", i < step && "hover:bg-muted")}
              >
                <span className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
                <span className={cn("flex items-center gap-1 font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>
                  {i < step && <CheckIcon className="size-3" />}
                  {s.title}
                </span>
              </button>
            </li>
          ))}
        </ol>
        {formError && <FormAlert tone="error">{formError}</FormAlert>}

        <Card className="gap-5 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">{current.title}</h2>
            <p className="text-sm text-muted-foreground">Step {step + 1} of {steps.length}. Fields marked * are required.</p>
          </div>

          {current.key === "personal" && (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  control={form.control}
                  name="employeeId"
                  label="Employee ID"
                  required={!automaticIds}
                  placeholder={automaticIds ? "Generated automatically" : ""}
                  description={automaticIds ? "Leave blank for the next ID." : "Unique within your organisation."}
                  onBlur={checkEmployeeId}
                />
              </div>
              <TeacherPersonalFields showSensitive={permissions.sensitive} />
            </div>
          )}

          {current.key === "contact" && (
            <div className="grid gap-6">
              <TeacherContactFields showSensitive={permissions.sensitive} />
              {permissions.sensitive && (
                <>
                  <section className="grid gap-3">
                    <h3 className="text-sm font-medium">Permanent address</h3>
                    <AddressFields prefix="permanentAddress" />
                  </section>
                  <SwitchField control={form.control} name="sameAsPermanent" label="Temporary address is the same as permanent" />
                  {!values.sameAsPermanent && (
                    <section className="grid gap-3">
                      <h3 className="text-sm font-medium">Temporary address</h3>
                      <AddressFields prefix="temporaryAddress" />
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {current.key === "employment" && <EmploymentFields structure={structure} managers={managers} />}

          {current.key === "qualifications" && (
            <div className="grid gap-6">
              <section className="grid gap-3">
                <h3 className="text-sm font-medium">Academic qualifications</h3>
                {qualifications.fields.map((field, i) => (
                  <div key={field.id} className="relative rounded-xl border p-4">
                    <Button type="button" size="icon-sm" variant="ghost" className="absolute top-2 right-2" aria-label="Remove qualification" onClick={() => qualifications.remove(i)}>
                      <XIcon />
                    </Button>
                    <QualificationFields prefix={`qualifications.${i}`} />
                  </div>
                ))}
                <Button type="button" variant="outline" className="justify-self-start" onClick={() => qualifications.append({ ...emptyQualification })}>
                  <PlusIcon data-icon="inline-start" />
                  Add qualification
                </Button>
              </section>
              <section className="grid gap-3">
                <h3 className="text-sm font-medium">Certifications and training</h3>
                {certifications.fields.map((field, i) => (
                  <div key={field.id} className="relative rounded-xl border p-4">
                    <Button type="button" size="icon-sm" variant="ghost" className="absolute top-2 right-2" aria-label="Remove certification" onClick={() => certifications.remove(i)}>
                      <XIcon />
                    </Button>
                    <CertificationFields prefix={`certifications.${i}`} />
                  </div>
                ))}
                <Button type="button" variant="outline" className="justify-self-start" onClick={() => certifications.append({ ...emptyCertification })}>
                  <PlusIcon data-icon="inline-start" />
                  Add certification
                </Button>
              </section>
            </div>
          )}

          {current.key === "assignments" && (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                Optional. Describe what applies: a class and section, a whole program, or just a subject. You can add more later from the profile.
              </p>
              {assignments.fields.map((field, i) => (
                <div key={field.id} className="relative rounded-xl border p-4">
                  <Button type="button" size="icon-sm" variant="ghost" className="absolute top-2 right-2" aria-label="Remove assignment" onClick={() => assignments.remove(i)}>
                    <XIcon />
                  </Button>
                  <AssignmentFields prefix={`assignments.${i}`} structure={structure} />
                </div>
              ))}
              <Button type="button" variant="outline" className="justify-self-start" onClick={() => assignments.append(emptyAssignment(structure))} disabled={structure.years.length === 0}>
                <PlusIcon data-icon="inline-start" />
                Add teaching assignment
              </Button>
              {structure.years.length === 0 && <p className="text-sm text-muted-foreground">Add an academic year in Education structure first.</p>}
            </div>
          )}

          {current.key === "files" && (
            <div className="grid gap-6">
              <section className="flex items-center gap-4">
                <Avatar className="size-20">
                  {photoPreview && <AvatarImage src={photoPreview} alt="Selected photo preview" />}
                  <AvatarFallback>{`${values.personal.firstName[0] ?? ""}${values.personal.lastName[0] ?? ""}`.toUpperCase() || "?"}</AvatarFallback>
                </Avatar>
                <div className="grid gap-1.5">
                  <Label htmlFor="teacher-photo">Profile photo</Label>
                  <Input
                    id="teacher-photo"
                    type="file"
                    accept={PHOTO_MIME_TYPES.join(",")}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null
                      if (file && (file.size > PHOTO_MAX_BYTES || !(PHOTO_MIME_TYPES as readonly string[]).includes(file.type))) {
                        toast.add({ title: "Use a JPG, PNG or WebP image up to 2 MB", type: "error" })
                        e.target.value = ""
                        return
                      }
                      setPhoto(file)
                      setPhotoPreview(file ? URL.createObjectURL(file) : null)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Stored privately.</p>
                </div>
              </section>
              {permissions.documents ? (
                <section className="grid gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Documents</h3>
                    {requirements.length > 0 && (
                      <p className="text-xs text-muted-foreground">Requested: {requirements.map((r) => `${r.name}${r.isRequired ? "" : " (optional)"}`).join(", ")}</p>
                    )}
                  </div>
                  {documents.map((doc, i) => (
                    <div key={i} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                      <div className="grid gap-1">
                        <Label className="text-xs">Title</Label>
                        <Input value={doc.title} onChange={(e) => setDocuments((d) => d.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Category</Label>
                        <NativeSelect value={doc.category} className="w-full" onChange={(e) => setDocuments((d) => d.map((x, j) => (j === i ? { ...x, category: e.target.value as TeacherDocumentCategory } : x)))}>
                          {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                            <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Fulfils</Label>
                        <NativeSelect value={doc.requirementId} className="w-full" onChange={(e) => setDocuments((d) => d.map((x, j) => (j === i ? { ...x, requirementId: e.target.value } : x)))}>
                          <NativeSelectOption value="">—</NativeSelectOption>
                          {requirements.map((r) => (
                            <NativeSelectOption key={r.id} value={r.id}>{r.name}</NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove document" onClick={() => setDocuments((d) => d.filter((_, j) => j !== i))}>
                        <XIcon />
                      </Button>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground sm:col-span-4">
                        <FileIcon className="size-3" />
                        {doc.file.name} · {(doc.file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  ))}
                  <Input type="file" accept={DOCUMENT_MIME_TYPES.join(",")} aria-label="Add a document" onChange={(e) => { addDocument(e.target.files?.[0]); e.target.value = "" }} />
                  <p className="text-xs text-muted-foreground">CV, certificates, appointment letter, contract… PDF, JPG, PNG or WebP up to 5 MB.</p>
                </section>
              ) : (
                <p className="text-sm text-muted-foreground">Documents can be uploaded later by staff with document access.</p>
              )}
            </div>
          )}

          {current.key === "account" && linkableUsers && (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                Optionally link this profile to an existing member of your organisation so they can sign in and see their own record and classes.
                New accounts are created through Users &amp; Access invitations, never here.
              </p>
              <div className="grid max-w-md gap-1.5">
                <Label htmlFor="teacher-user">Login account</Label>
                <NativeSelect id="teacher-user" className="w-full" value={values.userId ?? ""} onChange={(e) => form.setValue("userId", e.target.value, { shouldDirty: true })}>
                  <NativeSelectOption value="">Not linked</NativeSelectOption>
                  {linkableUsers.map((u) => (
                    <NativeSelectOption key={u.id} value={u.id}>{u.name} · {u.email} ({u.role})</NativeSelectOption>
                  ))}
                </NativeSelect>
                {form.formState.errors.userId && <p className="text-xs text-destructive">{form.formState.errors.userId.message}</p>}
              </div>
            </div>
          )}

          {current.key === "review" && (
            <dl className="grid gap-x-8 lg:grid-cols-2">
              <div>
                <h3 className="mb-1 text-sm font-medium">Profile</h3>
                <Row label="Name" value={name} />
                <Row label="Name (Nepali)" value={values.personal.nameNepali} />
                <Row label="Employee ID" value={values.employeeId || (automaticIds ? "Generated on save" : "")} />
                <Row label="Contact" value={[values.contact.phone, values.contact.email].filter(Boolean).join(" · ")} />
                <Row label="Qualifications" value={values.qualifications.map((q) => `${q.title} (${QUALIFICATION_LEVEL_LABELS[q.level as keyof typeof QUALIFICATION_LEVEL_LABELS]})`).join("; ")} />
                <Row label="Certifications" value={values.certifications.map((c) => c.name).join("; ")} />
              </div>
              <div>
                <h3 className="mb-1 text-sm font-medium">Employment</h3>
                <Row label="Joined" value={values.employment.dateOfJoining} />
                <Row label="Type / status" value={`${EMPLOYMENT_TYPE_LABELS[values.employment.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS]} · ${EMPLOYMENT_STATUS_LABELS[values.employment.employmentStatus as keyof typeof EMPLOYMENT_STATUS_LABELS]}`} />
                <Row label="Designation" value={lookup(structure.designations, values.employment.designationId)} />
                <Row label="Department" value={lookup(structure.faculties, values.employment.departmentId)} />
                <Row
                  label="Assignments"
                  value={values.assignments.map((a) =>
                    [lookup(structure.classes, a.classId) ?? lookup(structure.programs, a.programId) ?? lookup(structure.levels, a.educationLevelId), lookup(structure.subjects, a.subjectId), TEACHING_ROLE_LABELS[a.role as keyof typeof TEACHING_ROLE_LABELS]]
                      .filter(Boolean).join(" · ")
                  ).join("; ")}
                />
                <Row label="Files" value={[photo && "Photo", documents.length && `${documents.length} document(s)`].filter(Boolean).join(", ")} />
                {linkableUsers && <Row label="Login account" value={linkableUsers.find((u) => u.id === values.userId)?.email ?? "Not linked"} />}
              </div>
            </dl>
          )}
        </Card>

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" onClick={() => (step === 0 ? router.push("/dashboard/teachers") : setStep(step - 1))} disabled={submitting}>
            <ChevronLeftIcon data-icon="inline-start" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < steps.length - 1 ? (
            <Button type="button" onClick={next}>
              Continue
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting && <Spinner />}
              Save teacher
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  )
}
