"use client"

import * as React from "react"
import Link from "next/link"

import { FieldError, FormAlert, PasswordInput, SubmitButton } from "@/components/shared/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { register } from "@/features/auth/actions"

export function RegisterForm({ next }: { next?: string }) {
  // Arriving from a parent-portal invitation rather than to set up a school.
  const invited = next?.startsWith("/invitations/") ?? false
  const [state, action, pending] = React.useActionState(register, undefined)
  const failed = state && !state.ok ? state : undefined

  if (state?.ok) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-4xl tracking-tight">Confirm your email</h1>
        <FormAlert tone="success">{state.message}</FormAlert>
        <p className="text-sm text-muted-foreground">
          {invited
            ? "The confirmation link brings you back to your invitation."
            : "After confirming, you’ll set up your organisation."}{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-foreground hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-2">
        <h1 className="font-display text-4xl tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          {invited
            ? "Use the email address your invitation was sent to."
            : "Set up your school or college in a few minutes."}
        </p>
      </div>

      <form action={action} className="mt-8 space-y-5" noValidate>
        {failed && <FormAlert tone="error">{failed.error}</FormAlert>}
        {next && <input type="hidden" name="next" value={next} />}

        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            key={`name-${failed?.values?.name}`}
            id="name"
            name="name"
            autoComplete="name"
            defaultValue={failed?.values?.name}
            aria-invalid={failed?.fieldErrors?.name ? true : undefined}
            aria-describedby="name-error"
            required
            className="h-11"
          />
          <FieldError id="name-error" errors={failed?.fieldErrors?.name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            key={`email-${failed?.values?.email}`}
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

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            aria-invalid={failed?.fieldErrors?.password ? true : undefined}
            aria-describedby="password-error"
            required
          />
          <FieldError id="password-error" errors={failed?.fieldErrors?.password} />
        </div>

        <SubmitButton pending={pending} pendingLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-foreground hover:underline hover:underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  )
}
