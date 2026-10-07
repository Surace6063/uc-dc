"use client"

import * as React from "react"

import {
  admitCardTemplates,
  attempts,
  examCategories,
  examSubjects,
  examTypes,
  programs,
  terms,
  type Exam,
} from "@/components/exams/data"
import { RichTextEditor } from "@/components/exams/rich-text-editor"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"

export type ExamFormValues = Omit<Exam, "id" | "level" | "createdDate">

export const emptyExam: ExamFormValues = {
  name: "",
  program: "",
  term: "",
  subject: "",
  attempt: "Regular",
  category: "",
  description: "",
  type: "GPA",
  startDate: "",
  resultDate: "",
  status: "Active",
  admitCardTemplate: "None",
  admitCardReleased: false,
}

const BS_DATE = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[0-2])$/

type Errors = Partial<Record<keyof ExamFormValues, string>>

function validate(values: ExamFormValues): Errors {
  const errors: Errors = {}
  if (!values.name.trim()) errors.name = "Exam name is required."
  if (!values.program) errors.program = "Select a program."
  if (!values.term) errors.term = "Select a year or semester."
  if (!values.subject) errors.subject = "Select a subject."
  if (!BS_DATE.test(values.startDate))
    errors.startDate = "Enter a BS date as YYYY-MM-DD."
  if (values.resultDate && !BS_DATE.test(values.resultDate))
    errors.resultDate = "Enter a BS date as YYYY-MM-DD."
  return errors
}

function FormField({
  id,
  label,
  required,
  error,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-2">
        <span>
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </span>
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function ExamFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, the dialog edits this exam; otherwise it creates one. */
  initial?: Exam
  onSubmit: (values: ExamFormValues) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-2xl">
        {/* Remount the form for each open so it starts from fresh values. */}
        {open && (
          <ExamForm
            initial={initial}
            onSubmit={(values) => {
              onSubmit(values)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ExamForm({
  initial,
  onSubmit,
}: {
  initial?: Exam
  onSubmit: (values: ExamFormValues) => void
}) {
  const [values, setValues] = React.useState<ExamFormValues>(
    initial ?? emptyExam
  )
  const [submitted, setSubmitted] = React.useState(false)
  const errors = submitted ? validate(values) : {}

  function set<K extends keyof ExamFormValues>(
    key: K,
    value: ExamFormValues[K]
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.keys(validate(values)).length === 0) onSubmit(values)
  }

  const fieldProps = (key: keyof ExamFormValues) => ({
    id: key,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${key}-error` : undefined,
  })

  const subjects = examSubjects.filter(
    (s) => !values.program || s.program === values.program
  )

  return (
    <form onSubmit={handleSubmit} noValidate className="contents">
      <DialogHeader className="border-b p-5">
        <DialogTitle>{initial ? "Edit exam" : "Add exam"}</DialogTitle>
        <DialogDescription>
          {initial
            ? "Update the exam details below."
            : "Fill in the details to create a new exam."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 overflow-y-auto p-5 sm:grid-cols-2">
        <FormField
          id="name"
          label="Exam name"
          required
          error={errors.name}
          className="sm:col-span-2"
        >
          <Input
            {...fieldProps("name")}
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Pre-Board Exam"
            className="h-9"
          />
        </FormField>

        <FormField id="program" label="Program" required error={errors.program}>
          <NativeSelect
            {...fieldProps("program")}
            value={values.program}
            onChange={(e) =>
              setValues((prev) => ({
                ...prev,
                program: e.target.value,
                term: "",
                subject: "",
              }))
            }
            className="w-full"
          >
            <NativeSelectOption value="" disabled>
              Select program
            </NativeSelectOption>
            {programs.map((p) => (
              <NativeSelectOption key={p} value={p}>
                {p}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>

        <FormField
          id="term"
          label="Year / Semester"
          required
          error={errors.term}
        >
          <NativeSelect
            {...fieldProps("term")}
            value={values.term}
            onChange={(e) => set("term", e.target.value)}
            disabled={!values.program}
            className="w-full"
          >
            <NativeSelectOption value="" disabled>
              {values.program
                ? "Select year or semester"
                : "Select a program first"}
            </NativeSelectOption>
            {(terms[values.program] ?? []).map((t) => (
              <NativeSelectOption key={t} value={t}>
                {t}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>

        <FormField id="subject" label="Subject" required error={errors.subject}>
          <NativeSelect
            {...fieldProps("subject")}
            value={values.subject}
            onChange={(e) => set("subject", e.target.value)}
            className="w-full"
          >
            <NativeSelectOption value="" disabled>
              Select subject
            </NativeSelectOption>
            {subjects.map((s) => (
              <NativeSelectOption key={s.name} value={s.name}>
                {s.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>

        <FormField id="attempt" label="Attempt">
          <NativeSelect
            id="attempt"
            value={values.attempt}
            onChange={(e) =>
              set("attempt", e.target.value as ExamFormValues["attempt"])
            }
            className="w-full"
          >
            {attempts.map((a) => (
              <NativeSelectOption key={a} value={a}>
                {a}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>

        <FormField id="category" label="Exam category">
          <NativeSelect
            id="category"
            value={values.category}
            onChange={(e) => set("category", e.target.value)}
            className="w-full"
          >
            <NativeSelectOption value="">Select category</NativeSelectOption>
            {examCategories.map((c) => (
              <NativeSelectOption key={c} value={c}>
                {c}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>

        <FormField id="type" label="Exam type" required>
          <NativeSelect
            id="type"
            value={values.type}
            onChange={(e) =>
              set("type", e.target.value as ExamFormValues["type"])
            }
            className="w-full"
          >
            {examTypes.map((t) => (
              <NativeSelectOption key={t} value={t}>
                {t}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>

        <FormField
          id="description"
          label="Description"
          className="sm:col-span-2"
        >
          <RichTextEditor
            id="description"
            value={values.description}
            onChange={(html) => set("description", html)}
          />
        </FormField>

        <FormField
          id="startDate"
          label="Start date (BS)"
          required
          error={errors.startDate}
        >
          <Input
            {...fieldProps("startDate")}
            value={values.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            placeholder="YYYY-MM-DD"
            inputMode="numeric"
            className="h-9 tabular-nums"
          />
        </FormField>

        <FormField
          id="resultDate"
          label="Result date (BS)"
          error={errors.resultDate}
        >
          <Input
            {...fieldProps("resultDate")}
            value={values.resultDate}
            onChange={(e) => set("resultDate", e.target.value)}
            placeholder="YYYY-MM-DD"
            inputMode="numeric"
            className="h-9 tabular-nums"
          />
        </FormField>

        <FormField id="admitCardTemplate" label="Admit card template">
          <NativeSelect
            id="admitCardTemplate"
            value={values.admitCardTemplate}
            onChange={(e) => set("admitCardTemplate", e.target.value)}
            className="w-full"
          >
            {admitCardTemplates.map((t) => (
              <NativeSelectOption key={t} value={t}>
                {t}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>

        <div className="self-end">
          <Label className="flex h-9 items-center gap-2.5 rounded-lg border px-3 font-normal">
            <Switch
              checked={values.admitCardReleased}
              onCheckedChange={(checked) => set("admitCardReleased", checked)}
            />
            Release admit card to students
          </Label>
        </div>
      </div>

      <DialogFooter className="mx-0 mb-0 rounded-b-xl px-5 sm:items-center">
        <Label className="mr-auto gap-2.5 font-normal">
          <Switch
            checked={values.status === "Active"}
            onCheckedChange={(checked) =>
              set("status", checked ? "Active" : "Inactive")
            }
          />
          {values.status === "Active" ? "Active" : "Inactive"}
        </Label>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit">{initial ? "Save changes" : "Add exam"}</Button>
      </DialogFooter>
    </form>
  )
}
