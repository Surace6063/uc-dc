import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Refreshes the Supabase auth session and forwards updated cookies.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and getClaims():
  // it validates the token and triggers the cookie refresh.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)
  const { pathname, search } = request.nextUrl

  // Redirect while keeping any refreshed session cookies.
  function redirectTo(path: string, next?: string) {
    const url = request.nextUrl.clone()
    url.pathname = path
    url.search = next ? `?next=${encodeURIComponent(next)}` : ""
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  // Only session-based routing here. Organisation, membership and permission
  // checks need the database and run server-side (lib/authorization).
  if (!signedIn && matchesAny(pathname, protectedRoutes)) {
    return redirectTo("/login", pathname + search)
  }
  if (signedIn && matchesAny(pathname, signedOutOnlyRoutes)) {
    return redirectTo("/dashboard")
  }

  return response
}

const protectedRoutes = ["/dashboard", "/onboarding", "/organizations", "/platform"]
// /reset-password stays reachable while signed in: the reset link signs in first.
const signedOutOnlyRoutes = ["/login", "/register", "/forgot-password"]

function matchesAny(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}
