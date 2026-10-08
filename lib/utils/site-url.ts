import "server-only"

import { headers } from "next/headers"

// Base URL for links in auth emails. Set SITE_URL in production; in
// development it falls back to the request's host. Supabase only follows
// redirect URLs on the project's allow-list, so a spoofed host can't be used.
export async function getSiteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "")
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

// Only allow redirects back into this site, never to another origin.
export function safeRedirectPath(value: unknown, fallback: string) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : fallback
}
