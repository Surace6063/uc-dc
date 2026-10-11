import { Skeleton } from "@/components/ui/skeleton"

export default function ClassLoading() {
  return (
    <div className="flex min-w-0 flex-col gap-6" aria-busy="true" aria-label="Loading class">
      <div className="grid gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-9 w-96 max-w-full" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
