"use client"

import * as React from "react"

// Per-browser preferences (column choices, collapsed panels, ...). Reads go
// through useSyncExternalStore, so the server render and hydration use the
// fallback and the stored value appears right after, without a mismatch.
// Storage can be unavailable (private mode, blocked site data); every access
// is guarded and the fallback is used instead.

const EVENT = "local-storage-change"

function read(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocalStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }))
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(EVENT, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(EVENT, callback)
  }
}

export function useLocalStorage<T>(key: string, fallback: T) {
  const raw = React.useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null
  )
  const value = React.useMemo<T>(() => {
    if (raw === null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
    // fallback is treated as a constant default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw])
  const setValue = React.useCallback((next: T) => writeLocalStorage(key, JSON.stringify(next)), [key])
  return [value, setValue] as const
}

// The value stored under `key` when the page was first loaded, ignoring
// later writes (e.g. an autosaved draft written while the user types).
const initialReads = new Map<string, string | null>()

export function useInitialLocalStorage(key: string) {
  const getSnapshot = React.useCallback(() => {
    if (!initialReads.has(key)) initialReads.set(key, read(key))
    return initialReads.get(key) ?? null
  }, [key])
  // Forget the snapshot when the component goes away, so the next visit
  // reads fresh.
  React.useEffect(() => () => void initialReads.delete(key), [key])
  return React.useSyncExternalStore(subscribe, getSnapshot, () => null)
}
