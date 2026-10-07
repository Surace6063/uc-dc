"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"

const roles = [
  { value: "staff", label: "Staff" },
  { value: "student", label: "Student" },
] as const

type Role = (typeof roles)[number]["value"]

export function LoginForm() {
  const [role, setRole] = React.useState<Role>("staff")
  const [showPassword, setShowPassword] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    // TODO: wire up to the authentication API.
    setTimeout(() => setPending(false), 1200)
  }

  return (
    <div>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
        <p className="text-sm text-muted-foreground">
          Sign in to your {role} account to continue.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Account type"
        className="mt-8 grid grid-cols-2 rounded-xl bg-muted p-1"
      >
        {roles.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={role === value}
            onClick={() => setRole(value)}
            className={cn(
              "h-9 rounded-lg text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              role === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">
            {role === "staff" ? "Email address" : "Email or student ID"}
          </Label>
          <div className="relative">
            <MailIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type={role === "staff" ? "email" : "text"}
              autoComplete="username"
              placeholder={
                role === "staff" ? "name@united.edu.np" : "e.g. UC2026001"
              }
              required
              className="h-11 pl-9"
            />
          </div>
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
          <div className="relative">
            <LockIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              className="h-11 pr-11 pl-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {showPassword ? (
                <EyeOffIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          </div>
        </div>

        <Label className="font-normal text-muted-foreground">
          <Checkbox name="remember" />
          Keep me signed in
        </Label>

        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full text-base"
        >
          {pending ? (
            <>
              <Spinner />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRightIcon data-icon="inline-end" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Having trouble signing in?{" "}
        <a
          href="mailto:info@united.edu.np"
          className="font-medium text-foreground hover:underline hover:underline-offset-4"
        >
          Contact support
        </a>
      </p>
    </div>
  )
}
