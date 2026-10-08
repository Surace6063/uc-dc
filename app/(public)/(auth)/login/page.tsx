import type { Metadata } from "next"

import { LoginForm } from "@/features/auth/components/login-form"

export const metadata: Metadata = {
  title: "Sign in",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>
}) {
  const { next, error } = await searchParams

  return (
    <LoginForm
      next={typeof next === "string" ? next : undefined}
      linkError={error === "link"}
    />
  )
}
