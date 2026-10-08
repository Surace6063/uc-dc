import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { safeRedirectPath } from "@/lib/utils/site-url"

// Landing point for links in Supabase emails (sign-up confirmation, password
// recovery). Handles both the PKCE `code` flow and `token_hash` templates,
// then continues to `next` with a session cookie set.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard")
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  const supabase = await createClient()
  let ok = false

  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
  }

  const url = request.nextUrl.clone()
  url.search = ""
  if (ok) {
    url.pathname = next.split("?")[0]
  } else {
    url.pathname = "/login"
    url.searchParams.set("error", "link")
  }
  return NextResponse.redirect(url)
}
