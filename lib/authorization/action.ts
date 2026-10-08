import "server-only"

import { z } from "zod"

import { AppError, ValidationError } from "@/lib/authorization/errors"

// Result shape for form Server Actions used with useActionState.
export type ActionState<Values = Record<string, string>> =
  | {
      ok: false
      error: string
      fieldErrors?: Record<string, string[] | undefined>
      values?: Partial<Values>
    }
  | { ok: true; message: string }
  | undefined

// Converts an error into a safe ActionState. Next.js redirect()/notFound()
// errors must keep propagating, so only known errors are caught.
export function actionError<Values>(
  error: unknown,
  values?: Partial<Values>
): ActionState<Values> {
  if (error instanceof z.ZodError) {
    error = new ValidationError(z.flattenError(error).fieldErrors)
  }
  if (error instanceof ValidationError) {
    return { ok: false, error: error.message, fieldErrors: error.fieldErrors, values }
  }
  if (error instanceof AppError) {
    return { ok: false, error: error.message, values }
  }
  throw error
}

export function formValues(formData: FormData, keys: readonly string[]) {
  return Object.fromEntries(
    keys.map((key) => {
      const value = formData.get(key)
      return [key, typeof value === "string" ? value : ""]
    })
  )
}
