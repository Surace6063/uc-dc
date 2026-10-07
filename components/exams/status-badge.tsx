import { cn } from "@/lib/utils"

const styles: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  Upcoming: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  Ongoing: "bg-primary/10 text-primary",
  Completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Failed: "bg-destructive/10 text-destructive",
  Active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Inactive: "bg-muted text-muted-foreground",
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        styles[status] ?? styles.Draft
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}
