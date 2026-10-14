"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import type { z } from "zod"

import { ContentSection } from "@/components/shared/content-section"
import { applyServerErrors, TextField } from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { changePasswordAction } from "@/features/account/actions"
import { changePasswordSchema } from "@/features/auth/schemas"
import { cn } from "@/lib/utils"

type PasswordInput = z.input<typeof changePasswordSchema>

const noop = () => () => {}

const THEMES = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const

export function AccountSettings({ user, organization, role }: { user: { name: string; email: string }; organization: string; role: string }) {
  const { theme, setTheme } = useTheme()
  // The saved theme is only known in the browser.
  const mounted = React.useSyncExternalStore(noop, () => true, () => false)
  const form = useForm<PasswordInput>({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: "", password: "", confirmPassword: "" } })
  const [formError, setFormError] = React.useState<string | null>(null)

  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    const result = await changePasswordAction(values)
    if (!result.ok) {
      setFormError(applyServerErrors(form, result))
      return
    }
    form.reset()
    toast.add({ title: "Password changed", type: "success" })
  })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ContentSection title="Account" description="Your name and email are managed with your login.">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Name</dt><dd className="font-medium">{user.name}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="font-medium break-all">{user.email}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Organisation</dt><dd className="font-medium">{organization}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Role</dt><dd className="font-medium">{role}</dd></div>
        </dl>
      </ContentSection>

      <ContentSection title="Appearance" description="Saved on this device.">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => {
            const active = mounted && theme === t.value
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(t.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-3 text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "border-primary/50 bg-primary/5 font-medium"
                )}
              >
                <t.icon className="size-4" />
                {t.label}
              </button>
            )
          })}
        </div>
      </ContentSection>

      <ContentSection title="Change password" description="Use at least 8 characters. You stay signed in on this device." className="lg:col-span-2">
        <form onSubmit={submit} className="grid max-w-md gap-4" noValidate>
          {formError && <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{formError}</p>}
          <TextField control={form.control} name="currentPassword" label="Current password" type="password" autoComplete="current-password" required />
          <TextField control={form.control} name="password" label="New password" type="password" autoComplete="new-password" required />
          <TextField control={form.control} name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" required />
          <Button type="submit" className="justify-self-start" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            Change password
          </Button>
        </form>
      </ContentSection>
    </div>
  )
}
