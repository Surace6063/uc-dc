"use client"

import * as React from "react"
import { CircleAlertIcon, CircleCheckIcon, EyeIcon, EyeOffIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

// Small building blocks shared by the auth and organisation forms.

export function FormAlert({
  tone,
  children,
}: {
  tone: "error" | "success"
  children: React.ReactNode
}) {
  const Icon = tone === "error" ? CircleAlertIcon : CircleCheckIcon
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
        tone === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null
  return (
    <p id={id} className="text-sm text-destructive">
      {errors[0]}
    </p>
  )
}

export function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("h-11 pr-11", props.className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  )
}

export function SubmitButton({
  pending,
  pendingLabel,
  children,
  className,
}: {
  pending: boolean
  pendingLabel: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Button type="submit" disabled={pending} className={cn("h-11 w-full text-base", className)}>
      {pending ? (
        <>
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
