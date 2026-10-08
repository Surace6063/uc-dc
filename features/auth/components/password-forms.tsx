"use client"

import * as React from "react"
import Link from "next/link"

import { FieldError, FormAlert, PasswordInput, SubmitButton } from "@/components/shared/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestPasswordReset, updatePassword } from "@/features/auth/actions"

export function ForgotPasswordForm() {
  const [state, action, pending] = React.useActionState(requestPasswordReset, undefined)
  const failed = state && !state.ok ? state : undefined

  return (
    <div>
      <div className="space-y-2">
        <h1 className="font-display text-4xl tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a link to choose a new password.
        </p>
      </div>

      {state?.ok ? (
        <div className="mt-8">
          <FormAlert tone="success">{state.message}</FormAlert>
        </div>
      ) : (
        <form action={action} className="mt-8 space-y-5" noValidate>
          {failed && <FormAlert tone="error">{failed.error}</FormAlert>}
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              key={failed?.values?.email}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={failed?.values?.email}
              aria-invalid={failed?.fieldErrors?.email ? true : undefined}
              aria-describedby="email-error"
              required
              className="h-11"
            />
            <FieldError id="email-error" errors={failed?.fieldErrors?.email} />
          </div>
          <SubmitButton pending={pending} pendingLabel="Sending…">
            Send reset link
          </SubmitButton>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground hover:underline hover:underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}

export function ResetPasswordForm() {
  const [state, action, pending] = React.useActionState(updatePassword, undefined)
  const failed = state && !state.ok ? state : undefined

  return (
    <div>
      <div className="space-y-2">
        <h1 className="font-display text-4xl tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">You&apos;ll stay signed in afterwards.</p>
      </div>

      <form action={action} className="mt-8 space-y-5" noValidate>
        {failed && <FormAlert tone="error">{failed.error}</FormAlert>}
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            aria-invalid={failed?.fieldErrors?.password ? true : undefined}
            aria-describedby="password-error"
            required
          />
          <FieldError id="password-error" errors={failed?.fieldErrors?.password} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            aria-invalid={failed?.fieldErrors?.confirmPassword ? true : undefined}
            aria-describedby="confirm-error"
            required
          />
          <FieldError id="confirm-error" errors={failed?.fieldErrors?.confirmPassword} />
        </div>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save password
        </SubmitButton>
      </form>
    </div>
  )
}
