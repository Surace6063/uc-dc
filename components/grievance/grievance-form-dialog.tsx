"use client"

import * as React from "react"

import { TODAY_BS } from "@/components/exams/data"
import {
  complaintBases,
  informTo,
  type ComplaintBasis,
} from "@/components/grievance/data"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Textarea } from "@/components/ui/textarea"

export type GrievanceFormValues = {
  date: string
  complaint: ComplaintBasis[]
  otherDetails: string
  location: string
  tormentorName: string
  phone: string
  informTo: string
}

const BS_DATE = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[0-2])$/
const PHONE = /^\+?\d{7,15}$/

type Errors = Partial<Record<keyof GrievanceFormValues, string>>

function validate(v: GrievanceFormValues): Errors {
  const errors: Errors = {}
  if (!BS_DATE.test(v.date)) errors.date = "Enter a BS date as YYYY-MM-DD."
  if (v.complaint.length === 0) errors.complaint = "Select at least one."
  if (v.complaint.includes("Others") && !v.otherDetails.trim())
    errors.otherDetails = "Describe the complaint."
  if (!v.location.trim()) errors.location = "Location is required."
  if (!v.tormentorName.trim())
    errors.tormentorName = "Tormentor name is required."
  if (!PHONE.test(v.phone.replace(/[\s-]/g, "")))
    errors.phone = "Enter a valid contact number."
  if (!v.informTo) errors.informTo = "Select who should be informed."
  return errors
}

function FormField({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string
  label: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-2">
        <span>
          {label}
          <span className="ml-0.5 text-destructive">*</span>
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

export function GrievanceFormDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: GrievanceFormValues) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-2xl">
        {/* Remount the form for each open so it starts empty. */}
        {open && (
          <GrievanceForm
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

function GrievanceForm({
  onSubmit,
}: {
  onSubmit: (values: GrievanceFormValues) => void
}) {
  const [values, setValues] = React.useState<GrievanceFormValues>({
    date: TODAY_BS,
    complaint: [],
    otherDetails: "",
    location: "",
    tormentorName: "",
    phone: "",
    informTo: "",
  })
  const [submitted, setSubmitted] = React.useState(false)
  const errors = submitted ? validate(values) : {}

  function set<K extends keyof GrievanceFormValues>(
    key: K,
    value: GrievanceFormValues[K]
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function toggleBasis(basis: ComplaintBasis, checked: boolean) {
    setValues((prev) => ({
      ...prev,
      complaint: checked
        ? complaintBases.filter(
            (b) => b === basis || prev.complaint.includes(b)
          )
        : prev.complaint.filter((b) => b !== basis),
    }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.keys(validate(values)).length > 0) return
    onSubmit({
      ...values,
      otherDetails: values.complaint.includes("Others")
        ? values.otherDetails.trim()
        : "",
    })
  }

  const fieldProps = (key: keyof GrievanceFormValues) => ({
    id: key,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${key}-error` : undefined,
  })

  return (
    <form onSubmit={handleSubmit} noValidate className="contents">
      <DialogHeader className="border-b p-5">
        <DialogTitle>Add grievance</DialogTitle>
        <DialogDescription>
          Your grievance is shared only with the people you choose to inform.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 overflow-y-auto p-5 sm:grid-cols-2">
        <FormField id="date" label="Date of grievance (BS)" error={errors.date}>
          <Input
            {...fieldProps("date")}
            value={values.date}
            onChange={(e) => set("date", e.target.value)}
            placeholder="YYYY-MM-DD"
            inputMode="numeric"
            className="h-9 tabular-nums"
          />
        </FormField>

        <FormField id="informTo" label="Inform to" error={errors.informTo}>
          <NativeSelect
            {...fieldProps("informTo")}
            value={values.informTo}
            onChange={(e) => set("informTo", e.target.value)}
            className="w-full"
          >
            <NativeSelectOption value="" disabled>
              Select who should be informed
            </NativeSelectOption>
            {informTo.map((name) => (
              <NativeSelectOption key={name} value={name}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>

        <fieldset
          className="sm:col-span-2"
          aria-invalid={errors.complaint ? true : undefined}
          aria-describedby={errors.complaint ? "complaint-error" : undefined}
        >
          <legend className="mb-2 text-sm font-medium">
            Basis of complaint
            <span className="ml-0.5 text-destructive">*</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {complaintBases.map((basis) => {
              const checked = values.complaint.includes(basis)
              return (
                <Label
                  key={basis}
                  className="h-9 rounded-lg border px-3 font-normal whitespace-nowrap transition-colors has-data-checked:border-primary/40 has-data-checked:bg-primary/5"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => toggleBasis(basis, next)}
                  />
                  {basis}
                </Label>
              )
            })}
          </div>
          {errors.complaint && (
            <p id="complaint-error" className="mt-1.5 text-xs text-destructive">
              {errors.complaint}
            </p>
          )}
          {values.complaint.includes("Others") && (
            <div className="mt-3 animate-in duration-200 fade-in slide-in-from-top-1">
              <Label htmlFor="otherDetails" className="mb-2">
                <span>
                  Please specify
                  <span className="ml-0.5 text-destructive">*</span>
                </span>
              </Label>
              <Textarea
                {...fieldProps("otherDetails")}
                autoFocus
                value={values.otherDetails}
                onChange={(e) => set("otherDetails", e.target.value)}
                placeholder="Describe the nature of the complaint"
                maxLength={500}
                rows={3}
              />
              <div className="mt-1.5 flex justify-between gap-2 text-xs">
                <span id="otherDetails-error" className="text-destructive">
                  {errors.otherDetails}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {values.otherDetails.length}/500
                </span>
              </div>
            </div>
          )}
        </fieldset>

        <FormField
          id="location"
          label="Location of incident"
          error={errors.location}
        >
          <Input
            {...fieldProps("location")}
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="e.g. Computer Lab 2"
            className="h-9"
          />
        </FormField>

        <FormField
          id="tormentorName"
          label="Tormentor name"
          error={errors.tormentorName}
        >
          <Input
            {...fieldProps("tormentorName")}
            value={values.tormentorName}
            onChange={(e) => set("tormentorName", e.target.value)}
            placeholder="Name, or “Unknown”"
            className="h-9"
          />
        </FormField>

        <FormField id="phone" label="Contact number" error={errors.phone}>
          <Input
            {...fieldProps("phone")}
            type="tel"
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="98XXXXXXXX"
            inputMode="tel"
            className="h-9 tabular-nums"
          />
        </FormField>
      </div>

      <DialogFooter className="mx-0 mb-0 rounded-b-xl px-5">
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit">Add grievance</Button>
      </DialogFooter>
    </form>
  )
}
