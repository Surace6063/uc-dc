"use client"

import * as React from "react"
import { CalendarDaysIcon, ClockIcon } from "lucide-react"

function greeting(hour: number) {
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

// The clock is client-only (server snapshot is null) to avoid a hydration
// mismatch. Snapshots are rounded to the minute so they stay stable.
function subscribeToClock(callback: () => void) {
  const id = setInterval(callback, 1_000)
  return () => clearInterval(id)
}

function currentMinute() {
  return Math.floor(Date.now() / 60_000) * 60_000
}

export function WelcomeBanner({ name }: { name: string }) {
  const time = React.useSyncExternalStore(
    subscribeToClock,
    currentMinute,
    () => null
  )
  const now = time === null ? null : new Date(time)

  return (
    <section className="relative overflow-hidden rounded-2xl bg-primary px-6 py-8 text-primary-foreground md:px-10 md:py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] mask-[linear-gradient(to_left,black,transparent_70%)] bg-size-[36px_36px] opacity-[0.08]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-3xl"
      />

      <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-white/80">
            {now ? greeting(now.getHours()) : "Welcome"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
            Welcome back, {name}
          </h1>
          <p className="mt-2 text-sm text-white/80">
            Here&apos;s what&apos;s happening at United College today.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <span className="inline-flex h-9 items-center gap-2 rounded-full bg-white/15 px-4 ring-1 ring-white/20 backdrop-blur">
            <CalendarDaysIcon className="size-4" />
            {now
              ? now.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "—"}
          </span>
          <span className="inline-flex h-9 items-center gap-2 rounded-full bg-white/15 px-4 tabular-nums ring-1 ring-white/20 backdrop-blur">
            <ClockIcon className="size-4" />
            {now
              ? now.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "—"}
          </span>
        </div>
      </div>
    </section>
  )
}
