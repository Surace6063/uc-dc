"use client"

import * as React from "react"
import {
  Controller,
  get,
  type Control,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { ActionResult } from "@/lib/authorization/action"
import { cn } from "@/lib/utils"

// React Hook Form bindings for the shadcn inputs used across module forms.

type FieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  description?: React.ReactNode
  className?: string
  required?: boolean
}

function FieldShell({
  id,
  label,
  description,
  error,
  className,
  required,
  children,
}: {
  id: string
  label: string
  description?: React.ReactNode
  error?: string
  className?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

const fieldId = (name: string) => `field-${name.replace(/\./g, "-")}`

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  required,
  ...input
}: FieldProps<T> & Omit<React.ComponentProps<typeof Input>, "name" | "form">) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell
          id={fieldId(name)}
          label={label}
          description={description}
          error={fieldState.error?.message}
          className={className}
          required={required}
        >
          <Input
            {...input}
            id={fieldId(name)}
            name={field.name}
            ref={field.ref}
            value={field.value ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            aria-invalid={fieldState.invalid || undefined}
            aria-describedby={fieldState.error ? `${fieldId(name)}-error` : undefined}
          />
        </FieldShell>
      )}
    />
  )
}

export function TextAreaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  required,
  ...input
}: FieldProps<T> & Omit<React.ComponentProps<typeof Textarea>, "name" | "form">) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell
          id={fieldId(name)}
          label={label}
          description={description}
          error={fieldState.error?.message}
          className={className}
          required={required}
        >
          <Textarea
            {...input}
            id={fieldId(name)}
            name={field.name}
            ref={field.ref}
            value={field.value ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            aria-invalid={fieldState.invalid || undefined}
          />
        </FieldShell>
      )}
    />
  )
}

export type Option = { value: string; label: string }

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  required,
  options,
  placeholder,
  disabled,
  onValueChange,
}: FieldProps<T> & {
  options: readonly Option[]
  placeholder?: string
  disabled?: boolean
  // Runs after the value changes (e.g. to reset dependent fields).
  onValueChange?: (value: string) => void
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell
          id={fieldId(name)}
          label={label}
          description={description}
          error={fieldState.error?.message}
          className={className}
          required={required}
        >
          <NativeSelect
            id={fieldId(name)}
            name={field.name}
            ref={field.ref}
            value={field.value === null || field.value === undefined ? "" : String(field.value)}
            onChange={(e) => {
              field.onChange(e.target.value)
              onValueChange?.(e.target.value)
            }}
            onBlur={field.onBlur}
            disabled={disabled}
            aria-invalid={fieldState.invalid || undefined}
            className="w-full"
          >
            {placeholder !== undefined && <NativeSelectOption value="">{placeholder}</NativeSelectOption>}
            {options.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FieldShell>
      )}
    />
  )
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
}: FieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label
          htmlFor={fieldId(name)}
          className={cn("flex items-start justify-between gap-4 rounded-lg border p-3", className)}
        >
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">{label}</span>
            {description && <span className="text-xs text-muted-foreground">{description}</span>}
          </span>
          <Switch id={fieldId(name)} checked={Boolean(field.value)} onCheckedChange={field.onChange} />
        </label>
      )}
    />
  )
}

// Puts server-side field errors (dotted paths) onto the matching inputs.
// Returns the general error message for errors that have no field.
export function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T, unknown, unknown> | UseFormReturn<T>,
  result: Extract<ActionResult<unknown>, { ok: false }>
) {
  let unplaced: string | null = null
  for (const [path, messages] of Object.entries(result.fieldErrors ?? {})) {
    const message = messages?.[0]
    if (!message) continue
    if (path in form.getValues() || get(form.getValues(), path) !== undefined) {
      form.setError(path as FieldPath<T>, { type: "server", message }, { shouldFocus: true })
    } else {
      unplaced ??= message
    }
  }
  return unplaced ?? result.error
}
