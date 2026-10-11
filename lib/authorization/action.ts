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

// Result shape for Server Actions called directly from client code (forms
// built with React Hook Form, dialogs, bulk actions) rather than <form action>.
export type ActionResult<Data = undefined> =
  | { ok: true; data: Data; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> }

// Runs a mutation and converts known errors into a safe ActionResult. Unknown
// errors are logged and reported generically so internals never leak.
export async function runAction<Data>(
  fn: () => Promise<Data>,
  message?: string
): Promise<ActionResult<Data>> {
  try {
    return { ok: true, data: await fn(), message }
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Dotted paths ("enrollment.classId") so nested form fields get their errors.
      const fieldErrors: Record<string, string[]> = {}
      for (const issue of error.issues) {
        const key = issue.path.join(".") || "_form"
        ;(fieldErrors[key] ??= []).push(issue.message)
      }
      error = new ValidationError(fieldErrors)
    }
    if (error instanceof ValidationError) {
      return { ok: false, error: error.message, fieldErrors: error.fieldErrors }
    }
    if (error instanceof AppError) return { ok: false, error: error.message }
    console.error(error)
    return { ok: false, error: "Something went wrong. Please try again." }
  }
}

export function formValues(formData: FormData, keys: readonly string[]) {
  return Object.fromEntries(
    keys.map((key) => {
      const value = formData.get(key)
      return [key, typeof value === "string" ? value : ""]
    })
  )
}
