import type { Metadata } from "next"
import Link from "next/link"

import { FormAlert } from "@/components/shared/form"
import { ResetPasswordForm } from "@/features/auth/components/password-forms"
import { getCurrentUser } from "@/lib/auth/session"

export const metadata: Metadata = {
  title: "Choose a new password",
}

// Reached from the reset email via /auth/confirm, which signs the user in
// with a short-lived recovery session first.
export default async function ResetPasswordPage() {
  const user = await getCurrentUser()

  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-4xl tracking-tight">Link expired</h1>
        <FormAlert tone="error">
          This password reset link is invalid or has expired.
        </FormAlert>
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          Request a new link
        </Link>
      </div>
    )
  }

  return <ResetPasswordForm />
}
