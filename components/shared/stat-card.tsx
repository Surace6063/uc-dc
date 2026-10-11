"use client"

import { cn } from "@/lib/utils"

// Clickable summary card used above server-filtered lists.
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  value: number
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "border-primary/50 bg-primary/5"
      )}
    >
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
    </button>
  )
}
