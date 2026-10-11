"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

// List state lives in the URL (shared by the students and teachers lists). Updates replace the URL inside a transition,
// so the server component re-renders with new data while `pending` lets the
// table show a loading state.
// `dependents` maps a filter to the filters that must be cleared when it
// changes (e.g. level → program, class, section).
export function useUrlFilters(dependents: Record<string, readonly string[]> = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = React.useTransition()

  const setParams = React.useCallback(
    (updates: Record<string, string | null | undefined>, options: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") next.delete(key)
        else next.set(key, value)
        // A changed parent clears children that may no longer be compatible.
        for (const child of dependents[key] ?? []) {
          if (!(child in updates)) next.delete(child)
        }
      }
      if (options.resetPage !== false) next.delete("page")
      const query = next.toString()
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
      })
    },
    [pathname, router, searchParams, dependents]
  )

  const refresh = React.useCallback(() => startTransition(() => router.refresh()), [router])

  return { searchParams, setParams, pending, refresh }
}

// Debounces a value (used for the search box).
export function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
