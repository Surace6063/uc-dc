"use server"

import { redirect } from "next/navigation"

import {
  forgotPasswordSchema,
  registerSchema,
  resetPasswordSchema,
  signInSchema,
} from "@/features/auth/schemas"
import { requireAuth } from "@/lib/auth/session"
import { actionError, formValues, type ActionState } from "@/lib/authorization/action"
import { homePathFor } from "@/lib/authorization/page"
import {
  clearCurrentOrganizationId,
  writeCurrentOrganizationId,
} from "@/lib/organizations/current-organization"
import { createClient } from "@/lib/supabase/server"
import { getSiteUrl, safeRedirectPath } from "@/lib/utils/site-url"
import { findMemberships } from "@/services/organizations/organization-service"
import { ensureAppUser } from "@/services/users/user-service"

type SignInValues = { email: string; next: string }

export async function signIn(
  _prev: ActionState<SignInValues>,
  formData: FormData
): Promise<ActionState<SignInValues>> {
  const values = formValues(formData, ["email", "next"]) as SignInValues
  let destination: string

  try {
    const input = signInSchema.parse(Object.fromEntries(formData))
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    })

    if (error || !data.user?.email) {
      const message =
        error?.code === "email_not_confirmed"
          ? "Confirm your email address first. Check your inbox for the link."
          : "Incorrect email or password."
      return { ok: false, error: message, values }
    }

    // Login → application user → memberships → where to go.
    const user = await ensureAppUser({
      authUserId: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name,
    })
    const memberships = await findMemberships(user.id, 2)

    if (memberships.length === 1) {
      await writeCurrentOrganizationId(memberships[0].organization.id)
      destination = safeRedirectPath(input.next, "/dashboard")
    } else {
      // With several organisations, always ask which one to open.
      await clearCurrentOrganizationId()
      destination = await homePathFor(user)
    }
  } catch (error) {
    return actionError(error, values)
  }

  redirect(destination)
}

type RegisterValues = { name: string; email: string }

export async function register(
  _prev: ActionState<RegisterValues>,
  formData: FormData
): Promise<ActionState<RegisterValues>> {
  const values = formValues(formData, ["name", "email"]) as RegisterValues
  let signedIn = false

  try {
    const input = registerSchema.parse(Object.fromEntries(formData))
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { name: input.name },
        emailRedirectTo: `${await getSiteUrl()}/auth/confirm?next=/onboarding`,
      },
    })

    if (error) {
      return {
        ok: false,
        error: error.code === "weak_password" ? error.message : "We couldn't create your account. Please try again.",
        values,
      }
    }

    // Supabase returns a user with no identities when the email is already
    // registered. Answer the same way as a new signup so emails can't be probed.
    if (data.user && data.user.identities?.length) {
      await ensureAppUser({ authUserId: data.user.id, email: input.email, name: input.name })
    }

    // A session means email confirmation is switched off in Supabase.
    signedIn = data.session !== null
  } catch (error) {
    return actionError(error, values)
  }

  if (signedIn) redirect("/onboarding")
  return {
    ok: true,
    message: "Check your inbox. We've sent a link to confirm your email address.",
  }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  await clearCurrentOrganizationId()
  redirect("/login")
}

export async function requestPasswordReset(
  _prev: ActionState<{ email: string }>,
  formData: FormData
): Promise<ActionState<{ email: string }>> {
  const values = formValues(formData, ["email"]) as { email: string }

  try {
    const input = forgotPasswordSchema.parse(Object.fromEntries(formData))
    const supabase = await createClient()
    // Errors are ignored on purpose: the reply is the same whether or not the
    // address has an account.
    await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${await getSiteUrl()}/auth/confirm?next=/reset-password`,
    })
  } catch (error) {
    return actionError(error, values)
  }

  return {
    ok: true,
    message: "If an account exists for that email, we've sent a link to reset the password.",
  }
}

export async function updatePassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    // The reset link signs the user in with a recovery session first.
    await requireAuth()
    const input = resetPasswordSchema.parse(Object.fromEntries(formData))
    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password: input.password })
    if (error) {
      return {
        ok: false,
        error: error.code === "same_password" ? "Choose a different password from your current one." : error.message,
      }
    }
  } catch (error) {
    return actionError(error)
  }

  redirect("/dashboard")
}
