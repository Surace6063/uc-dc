"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { FieldValues, UseFormReturn } from "react-hook-form"

import { applyServerErrors } from "@/components/shared/form-fields"
import { toast } from "@/components/ui/toast"

type Result = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> }

// Submits a dialog form through a Server Action: maps server field errors
// back onto the form, toasts on success and refreshes the page's data.
export function useDialogSubmit<T extends FieldValues>(form: UseFormReturn<T, unknown, unknown>, onDone: () => void) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const run = async (fn: () => Promise<Result>) => {
    setError(null)
    const result = await fn()
    if (!result.ok) {
      setError(applyServerErrors(form as unknown as UseFormReturn<FieldValues>, result))
      return false
    }
    toast.add({ title: result.message ?? "Saved", type: "success" })
    onDone()
    router.refresh()
    return true
  }
  return { error, setError, run }
}

// Runs a one-off action (delete, publish…) with a toast either way.
export function useActionRunner() {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const run = (fn: () => Promise<Result>, onDone?: () => void) =>
    new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const result = await fn()
        if (!result.ok) {
          toast.add({ title: "Couldn't complete that", description: result.error, type: "error" })
          resolve(false)
          return
        }
        toast.add({ title: result.message ?? "Done", type: "success" })
        onDone?.()
        router.refresh()
        resolve(true)
      })
    })
  return { run, pending }
}
