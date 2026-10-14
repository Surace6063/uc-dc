import { PageSkeleton } from "@/components/shared/loading-states"

// Shown while a dashboard page without its own loading state streams in.
export default function DashboardLoading() {
  return <PageSkeleton label="Loading page" />
}
