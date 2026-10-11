import { Skeleton } from "@/components/ui/skeleton"

// Shown while attendance pages stream in.
export default function AttendanceLoading() {
  return (
    <div className="flex min-w-0 flex-col gap-5" aria-busy="true" aria-label="Loading attendance">
      <div className="grid gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-9 w-full max-w-2xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
      <div className="rounded-xl border">
        <div className="border-b p-4"><Skeleton className="h-9 w-full xl:w-96" /></div>
        <div className="divide-y">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-7 w-48 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
