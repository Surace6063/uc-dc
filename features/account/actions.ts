"use server"

import { changePasswordSchema } from "@/features/auth/schemas"
import { runAction } from "@/lib/authorization/action"
import { requireMembership } from "@/lib/authorization/context"
import { ValidationError } from "@/lib/authorization/errors"
import { createClient } from "@/lib/supabase/server"

// The signed-in member's own account. The current password is verified
// before it's changed, so an unattended session can't lock the owner out.
export async function changePasswordAction(values: unknown) {
  return runAction(async () => {
    const ctx = await requireMembership()
    const input = changePasswordSchema.parse(values)
    const supabase = await createClient()
    const check = await supabase.auth.signInWithPassword({ email: ctx.user.email, password: input.currentPassword })
    if (check.error) throw new ValidationError({ currentPassword: ["That isn't your current password."] })
    const { error } = await supabase.auth.updateUser({ password: input.password })
    if (error) {
      throw new ValidationError({ password: [error.code === "same_password" ? "Choose a different password from your current one." : error.message] })
    }
  }, "Password changed.")
}
