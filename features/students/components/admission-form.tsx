"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileIcon,
  PlusIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { FormProvider, useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form"

import { FormAlert } from "@/components/shared/form"
import { applyServerErrors, SwitchField } from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { checkDuplicatesAction, createStudentAction } from "@/features/students/actions"
import {
  AddressFields,
  AdmissionFields,
  emptyAddress,
  emptyGuardian,
  GuardianFields,
  PersonalFields,
  PlacementFields,
} from "@/features/students/components/form-sections"
import {
  ADMISSION_TYPE_LABELS,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  GENDER_LABELS,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_TYPES,
  RELATIONSHIP_LABELS,
} from "@/features/students/constants"
import { createStudentSchema, type CreateStudentInput, type CreateStudentValues } from "@/features/students/schemas"
import { districtsOf, provinceName } from "@/lib/nepal/locations"
import { useInitialLocalStorage, writeLocalStorage } from "@/hooks/use-local-storage"
import { cn } from "@/lib/utils"
import type { EducationStructure } from "@/services/academics/structure-service"

type FormInput = CreateStudentInput
type Duplicate = { id: string; name: string; admissionNumber: string; dateOfBirth: string | null; archived: boolean; sameAdmissionNumber: boolean }
type PendingDocument = { file: File; title: string; requirementId: string }

const STEPS = [
  { key: "personal", title: "Personal details", fields: ["personal"] },
  { key: "address", title: "Address", fields: ["permanentAddress", "temporaryAddress"] },
  { key: "guardians", title: "Guardians", fields: ["guardians"] },
  { key: "admission", title: "Admission & enrollment", fields: ["admission", "enrollment"] },
  { key: "files", title: "Photo & documents", fields: [] },
  { key: "review", title: "Review", fields: [] },
] as const

const DRAFT_KEY = "students.admission.draft"

function defaults(structure: EducationStructure): FormInput {
  const today = new Date().toISOString().slice(0, 10)
  const currentYear = structure.years.find((y) => y.isCurrent)
  return {
    personal: {
      firstName: "", middleName: "", lastName: "", dateOfBirth: "", gender: "", nationality: "Nepali",
      email: "", phone: "", alternatePhone: "", bloodGroup: "", motherTongue: "", medicalNotes: "",
      casteEthnicity: "", disabilityType: "", economicallyDisadvantaged: "", firstGenerationLearner: "", remoteArea: "",
    },
    admission: {
      admissionNumber: "", admissionDate: today, admissionType: "NEW", previousSchool: "",
      previousQualification: "", previousResult: "", entranceScore: "", scholarshipCategory: "",
    },
    permanentAddress: { ...emptyAddress },
    sameAsPermanent: true,
    temporaryAddress: { ...emptyAddress },
    guardians: [{ ...emptyGuardian, isPrimary: true }],
    enroll: structure.classes.length > 0,
    enrollment: {
      academicYearId: currentYear?.id ?? "", educationLevelId: "", programId: "", classId: "", sectionId: "",
      batchId: "", rollNumber: "", enrollmentDate: "", enrollmentType: "NEW_ADMISSION",
    },
  }
}

function Stepper({ step, onStep }: { step: number; onStep: (i: number) => void }) {
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex-1">
          <button
            type="button"
            onClick={() => i < step && onStep(i)}
            disabled={i > step}
            className={cn(
              "flex w-full min-w-28 flex-col gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
              i < step && "hover:bg-muted"
            )}
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
  )
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

// Uploads after the student exists. Failures don't undo the admission; the
// user is told which files to retry from the profile.
async function uploadFiles(studentId: string, photo: File | null, documents: PendingDocument[]) {
  const failed: string[] = []
  if (photo) {
    const body = new FormData()
    body.set("file", photo)
    const res = await fetch(`/api/students/${studentId}/photo`, { method: "POST", body }).catch(() => null)
    if (!res?.ok) failed.push("profile photo")
  }
  for (const doc of documents) {
    const body = new FormData()
    body.set("file", doc.file)
    body.set("title", doc.title || doc.file.name)
    body.set("requirementId", doc.requirementId)
    const res = await fetch(`/api/students/${studentId}/documents`, { method: "POST", body }).catch(() => null)
    if (!res?.ok) failed.push(doc.title || doc.file.name)
  }
  return failed
}

export function AdmissionForm({
  structure,
  showSensitive,
  canEnroll,
  canUploadDocuments,
}: {
  structure: EducationStructure
  showSensitive: boolean
  canEnroll: boolean
  canUploadDocuments: boolean
}) {
  const router = useRouter()
  const [step, setStep] = React.useState(0)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [duplicates, setDuplicates] = React.useState<Duplicate[] | null>(null)
  const [photo, setPhoto] = React.useState<File | null>(null)
  const [documents, setDocuments] = React.useState<PendingDocument[]>([])
  // A draft saved by an earlier visit: offered, never applied silently.
  const savedDraft = useInitialLocalStorage(DRAFT_KEY)
  const [draftDecided, setDraftDecided] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<FormInput, unknown, CreateStudentValues>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: defaults(structure),
    mode: "onTouched",
  })
  const guardians = useFieldArray({ control: form.control, name: "guardians" })
  const values = useWatch({ control: form.control }) as FormInput
  const automaticNumbering = structure.settings.admissionNumberMode === "AUTOMATIC"
  const automaticRoll = structure.settings.rollNumberMode === "AUTOMATIC"

  const draftPending = savedDraft !== null && !draftDecided

  // Autosave text fields (never files or medical notes). Paused while an
  // earlier draft is waiting for the user to restore or discard it.
  React.useEffect(() => {
    if (draftPending) return
    const id = setTimeout(() => {
      const { personal, ...rest } = values
      writeLocalStorage(DRAFT_KEY, JSON.stringify({ ...rest, personal: { ...personal, medicalNotes: "" } }))
    }, 800)
    return () => clearTimeout(id)
  }, [values, draftPending])

  function restoreDraft() {
    try {
      form.reset({ ...defaults(structure), ...JSON.parse(savedDraft ?? "{}") })
    } catch {}
    setDraftDecided(true)
  }

  // Warn before leaving with unsaved changes.
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (form.formState.isDirty && !submitting) e.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [form.formState.isDirty, submitting])

  function discardDraft() {
    writeLocalStorage(DRAFT_KEY, null)
    form.reset(defaults(structure))
    setDraftDecided(true)
    setStep(0)
  }

  async function next() {
    const fields = STEPS[step].fields as readonly FieldPath<FormInput>[]
    const relevant = fields.filter((f) => f !== "enrollment" || values.enroll)
    if (relevant.length && !(await form.trigger(relevant, { shouldFocus: true }))) return
    if (STEPS[step + 1]?.key === "review") {
      const p = values.personal
      const result = await checkDuplicatesAction({
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: p.dateOfBirth,
        phone: values.guardians[0]?.phone || p.phone,
        admissionNumber: values.admission.admissionNumber,
      })
      setDuplicates(result.ok ? result.data : [])
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const submit = form.handleSubmit(
    async (data) => {
      setFormError(null)
      setSubmitting(true)
      const result = await createStudentAction({ ...data, enroll: canEnroll && data.enroll })
      if (!result.ok) {
        setSubmitting(false)
        setFormError(applyServerErrors(form, result))
        // Jump to the first step that has a server error.
        const errorPaths = Object.keys(result.fieldErrors ?? {})
        const target = STEPS.findIndex((s) => (s.fields as readonly string[]).some((f) => errorPaths.some((p) => p.startsWith(f))))
        if (target >= 0) setStep(target)
        return
      }
      writeLocalStorage(DRAFT_KEY, null)
      const failed = await uploadFiles(result.data.id, photo, documents)
      toast.add({
        title: `Admitted with number ${result.data.admissionNumber}`,
        description: failed.length ? `Couldn't upload: ${failed.join(", ")}. Retry from the profile.` : undefined,
        type: failed.length ? "warning" : "success",
      })
      router.push(`/dashboard/students/${result.data.id}${failed.length ? "?tab=documents" : ""}`)
    },
    () => setFormError("Some details need attention. Go back to the highlighted step.")
  )

  function addDocument(file: File | undefined) {
    if (!file) return
    if (file.size > DOCUMENT_MAX_BYTES) {
      toast.add({ title: "File too large", description: "Documents must be 5 MB or smaller.", type: "error" })
      return
    }
    if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.add({ title: "Unsupported file", description: "Upload a PDF, JPG, PNG or WebP file.", type: "error" })
      return
    }
    setDocuments((d) => [...d, { file, title: file.name.replace(/\.[^.]+$/, ""), requirementId: "" }])
  }

  const level = structure.levels.find((l) => l.id === values.enrollment?.educationLevelId)
  const placementSummary = values.enroll && values.enrollment
    ? [
        structure.years.find((y) => y.id === values.enrollment?.academicYearId)?.name,
        level?.name,
        structure.programs.find((p) => p.id === values.enrollment?.programId)?.name,
        structure.classes.find((c) => c.id === values.enrollment?.classId)?.name,
        structure.sections.find((s) => s.id === values.enrollment?.sectionId)?.name && `Section ${structure.sections.find((s) => s.id === values.enrollment?.sectionId)?.name}`,
        values.enrollment.rollNumber ? `Roll ${values.enrollment.rollNumber}` : automaticRoll ? "Roll assigned automatically" : null,
      ].filter(Boolean).join(" · ")
    : "Not enrolled yet"
  const address = (a: FormInput["permanentAddress"]) =>
    [a.tole, a.wardNumber && `Ward ${a.wardNumber}`, a.municipality, a.district, provinceName(Number(a.province))].filter(Boolean).join(", ")
  const requirements = structure.requirements.filter(
    (r) => r.audience === "STUDENT" && r.isActive && (!r.educationLevelId || r.educationLevelId === level?.id)
  )

  return (
    <FormProvider {...form}>
      <form onSubmit={(e) => e.preventDefault()} noValidate className="flex flex-col gap-5">
        {draftPending && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm">
            <span>You have an unsaved admission draft from earlier. Files and medical notes aren&apos;t kept in drafts.</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" onClick={restoreDraft}>
                Restore draft
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={discardDraft}>
                Discard
              </Button>
            </div>
          </div>
        )}
        <Stepper step={step} onStep={setStep} />
        {formError && <FormAlert tone="error">{formError}</FormAlert>}

        <Card className="gap-5 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">{STEPS[step].title}</h2>
            <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
          </div>

          {step === 0 && <PersonalFields showSensitive={showSensitive} />}

          {step === 1 && (
            <div className="grid gap-6">
              <section className="grid gap-3">
                <h3 className="text-sm font-medium">Permanent address</h3>
                <AddressFields prefix="permanentAddress" />
              </section>
              <section className="grid gap-3">
                <SwitchField control={form.control} name="sameAsPermanent" label="Temporary address is the same as permanent" />
                {!values.sameAsPermanent && (
                  <>
                    <h3 className="text-sm font-medium">Temporary address</h3>
                    <AddressFields prefix="temporaryAddress" />
                  </>
                )}
              </section>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4">
              {form.formState.errors.guardians?.root?.message || form.formState.errors.guardians?.message ? (
                <FormAlert tone="error">{form.formState.errors.guardians?.root?.message ?? form.formState.errors.guardians?.message}</FormAlert>
              ) : null}
              {guardians.fields.map((field, i) => (
                <GuardianFields key={field.id} prefix={`guardians.${i}`} onRemove={() => guardians.remove(i)} />
              ))}
              {guardians.fields.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No guardians added. You can add them later, but the record will be marked incomplete.
                </p>
              )}
              {guardians.fields.length < 6 && (
                <Button type="button" variant="outline" className="justify-self-start" onClick={() => guardians.append({ ...emptyGuardian, relationship: "MOTHER" })}>
                  <PlusIcon data-icon="inline-start" />
                  Add guardian
                </Button>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-6">
              <section className="grid gap-3">
                <h3 className="text-sm font-medium">Admission</h3>
                <AdmissionFields automaticNumbering={automaticNumbering} />
              </section>
              <section className="grid gap-3">
                {canEnroll ? (
                  <SwitchField
                    control={form.control}
                    name="enroll"
                    label="Enroll now"
                    description="Place the student in an academic year and class. You can also do this later from the profile."
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">You can admit students; someone with enrollment access will place them in a class.</p>
                )}
                {canEnroll && values.enroll && (
                  <PlacementFields prefix="enrollment" structure={structure} rollNumberAutomatic={automaticRoll} showDate={false} />
                )}
              </section>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-6">
              <section className="grid gap-2">
                <Label htmlFor="photo">Profile photo</Label>
                <Input
                  id="photo"
                  type="file"
                  accept={PHOTO_MIME_TYPES.join(",")}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    if (file && file.size > PHOTO_MAX_BYTES) {
                      toast.add({ title: "Photo too large", description: "Photos must be 2 MB or smaller.", type: "error" })
                      e.target.value = ""
                      return
                    }
                    setPhoto(file)
                  }}
                />
                <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 2 MB. Stored privately.</p>
              </section>
              {canUploadDocuments ? (
                <section className="grid gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Documents</h3>
                    {requirements.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Requested: {requirements.map((r) => `${r.name}${r.isRequired ? "" : " (optional)"}`).join(", ")}
                      </p>
                    )}
                  </div>
                  {documents.map((doc, i) => (
                    <div key={i} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]">
                      <div className="grid gap-1">
                        <Label className="text-xs">Title</Label>
                        <Input value={doc.title} onChange={(e) => setDocuments((d) => d.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Type</Label>
                        <NativeSelect
                          value={doc.requirementId}
                          onChange={(e) => setDocuments((d) => d.map((x, j) => (j === i ? { ...x, requirementId: e.target.value } : x)))}
                          className="w-full"
                        >
                          <NativeSelectOption value="">Other</NativeSelectOption>
                          {requirements.map((r) => (
                            <NativeSelectOption key={r.id} value={r.id}>{r.name}</NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove document" onClick={() => setDocuments((d) => d.filter((_, j) => j !== i))}>
                        <XIcon />
                      </Button>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground sm:col-span-3">
                        <FileIcon className="size-3" />
                        {doc.file.name} · {(doc.file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  ))}
                  <Input
                    type="file"
                    accept={DOCUMENT_MIME_TYPES.join(",")}
                    aria-label="Add a document"
                    onChange={(e) => {
                      addDocument(e.target.files?.[0])
                      e.target.value = ""
                    }}
                  />
                  <p className="text-xs text-muted-foreground">PDF, JPG, PNG or WebP, up to 5 MB each.</p>
                </section>
              ) : (
                <p className="text-sm text-muted-foreground">Documents can be uploaded later by staff with document access.</p>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-5">
              {duplicates && duplicates.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <TriangleAlertIcon className="size-4" />
                    Possible duplicate{duplicates.length > 1 ? "s" : ""}
                  </p>
                  <ul className="mt-1 list-disc pl-6">
                    {duplicates.map((d) => (
                      <li key={d.id}>
                        <a href={`/dashboard/students/${d.id}`} target="_blank" rel="noreferrer" className="underline">
                          {d.name}
                        </a>{" "}
                        ({d.admissionNumber}{d.dateOfBirth ? `, born ${d.dateOfBirth}` : ""}{d.archived ? ", archived" : ""})
                        {d.sameAdmissionNumber && <strong> — same admission number; saving will fail.</strong>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <dl className="grid gap-x-8 lg:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-sm font-medium">Student</h3>
                  <ReviewRow label="Name" value={[values.personal.firstName, values.personal.middleName, values.personal.lastName].filter(Boolean).join(" ")} />
                  <ReviewRow label="Date of birth" value={values.personal.dateOfBirth} />
                  <ReviewRow label="Gender" value={values.personal.gender ? GENDER_LABELS[values.personal.gender as keyof typeof GENDER_LABELS] : ""} />
                  <ReviewRow label="Contact" value={[values.personal.phone, values.personal.email].filter(Boolean).join(" · ")} />
                  <ReviewRow label="Permanent address" value={address(values.permanentAddress)} />
                  <ReviewRow label="Temporary address" value={values.sameAsPermanent ? "Same as permanent" : address(values.temporaryAddress)} />
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-medium">Admission</h3>
                  <ReviewRow label="Admission no." value={values.admission.admissionNumber || (automaticNumbering ? "Generated on save" : "")} />
                  <ReviewRow label="Admission date" value={values.admission.admissionDate} />
                  <ReviewRow label="Type" value={ADMISSION_TYPE_LABELS[values.admission.admissionType as keyof typeof ADMISSION_TYPE_LABELS]} />
                  <ReviewRow label="Placement" value={placementSummary} />
                  <ReviewRow
                    label="Guardians"
                    value={values.guardians.map((g) => `${g.fullName} (${RELATIONSHIP_LABELS[g.relationship as keyof typeof RELATIONSHIP_LABELS]}${g.isPrimary ? ", primary" : ""})`).join("; ")}
                  />
                  <ReviewRow label="Files" value={[photo && "Photo", documents.length && `${documents.length} document(s)`].filter(Boolean).join(", ")} />
                </div>
              </dl>
              {values.permanentAddress.district && !districtsOf(Number(values.permanentAddress.province)).includes(values.permanentAddress.district) && (
                <FormAlert tone="error">The permanent district doesn&apos;t match the province.</FormAlert>
              )}
            </div>
          )}
        </Card>

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" onClick={() => (step === 0 ? router.push("/dashboard/students") : setStep(step - 1))} disabled={submitting}>
            <ChevronLeftIcon data-icon="inline-start" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next}>
              Continue
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting && <Spinner />}
              Admit student
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  )
}

