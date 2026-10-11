import { occupancy } from "@/features/classes/constants"
import { cn } from "@/lib/utils"

// Seats taken against a section's capacity, as a small bar.
export function OccupancyBar({
  enrolled,
  capacity,
}: {
  enrolled: number
  capacity: number | null
}) {
  const percent = occupancy(enrolled, capacity)
  if (percent === null)
    return (
      <span className="text-xs text-muted-foreground">No capacity set</span>
    )
  return (
    <div
      className="flex items-center gap-2"
      title={`${enrolled} of ${capacity} seats`}
    >
      <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            percent > 100
              ? "bg-destructive"
              : percent >= 90
                ? "bg-amber-500"
                : "bg-primary"
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span
        className={cn(
          "text-xs tabular-nums",
          percent > 100 ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {enrolled}/{capacity}
      </span>
    </div>
  )
}
