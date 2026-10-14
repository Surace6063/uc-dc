import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// Skeletons matching the shared page building blocks, for loading.tsx
// files and Suspense fallbacks.

export function PageHeaderSkeleton({ actions = 2 }: { actions?: number }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="grid gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {actions > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-9 w-28" />
          ))}
        </div>
      )}
    </div>
  )
}

export function SummaryCardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[112px] rounded-xl" />
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("rounded-xl border", className)}>
      <div className="flex gap-3 border-b p-4">
        <Skeleton className="h-9 w-full max-w-72" />
        <Skeleton className="ml-auto h-9 w-24" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="hidden h-4 w-20 md:block" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SectionSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-4 rounded-xl border p-5", className)}>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}

// A generic page: header, a row of figures and a list.
export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-6" aria-busy="true" aria-label={label}>
      <PageHeaderSkeleton />
      <SummaryCardsSkeleton />
      <TableSkeleton />
    </div>
  )
}
