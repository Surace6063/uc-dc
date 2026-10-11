import { Skeleton } from "@/components/ui/skeleton"

// Shown while the classes list streams in on first navigation.
export default function ClassesLoading() {
  return (
    <div className="flex min-w-0 flex-col gap-6" aria-busy="true" aria-label="Loading classes">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-8 w-48" />
      <div className="rounded-xl border">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row">
          <Skeleton className="h-9 w-full xl:w-72" />
          <Skeleton className="h-9 flex-1" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="hidden h-4 w-16 md:block" />
              <Skeleton className="hidden h-4 w-28 md:block" />
              <Skeleton className="h-2 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
