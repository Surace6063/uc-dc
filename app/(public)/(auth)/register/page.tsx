import type { Metadata } from "next"

import { RegisterForm } from "@/features/auth/components/register-form"

export const metadata: Metadata = {
  title: "Create account",
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams
  // Only same-site paths; anything else is ignored (validated again on submit).
  const safe = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : undefined
  return <RegisterForm next={safe} />
}
