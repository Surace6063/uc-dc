"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { FieldError, FormAlert, PasswordInput, SubmitButton } from "@/components/shared/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signIn } from "@/features/auth/actions"

// One sign-in page for every kind of user; where they land afterwards depends
// on their organisation memberships and roles, not on this form.
export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action, pending] = React.useActionState(signIn, undefined)
  const failed = state && !state.ok ? state : undefined

  return (
    <div>
      <div className="space-y-2">
        <h1 className="font-display text-4xl tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your account to continue.</p>
      </div>

      <form action={action} className="mt-8 space-y-5" noValidate>
        {next && <input type="hidden" name="next" value={next} />}

        {failed && <FormAlert tone="error">{failed.error}</FormAlert>}
        {!state && linkError && (
          <FormAlert tone="error">That link is invalid or has expired. Please try again.</FormAlert>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            // Keyed so a new defaultValue remounts the uncontrolled field.
            key={failed?.values?.email}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@school.edu.np"
            defaultValue={failed?.values?.email}
            aria-invalid={failed ? true : undefined}
            aria-describedby="email-error"
            required
            className="h-11"
          />
          <FieldError id="email-error" errors={failed?.fieldErrors?.email} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline hover:underline-offset-4"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            aria-invalid={failed ? true : undefined}
            aria-describedby="password-error"
            required
          />
          <FieldError id="password-error" errors={failed?.fieldErrors?.password} />
        </div>

        <SubmitButton pending={pending} pendingLabel="Signing in…">
          Sign in
          <ArrowRightIcon data-icon="inline-end" />
        </SubmitButton>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/register" className="font-medium text-foreground hover:underline hover:underline-offset-4">
          Create an account
        </Link>
      </p>
    </div>
  )
}
