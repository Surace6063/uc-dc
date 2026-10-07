import type { Metadata } from "next"

import { EventTable } from "@/components/events/event-table"

export const metadata: Metadata = {
  title: "Events · United College",
}

export default function EventsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Event List</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Programs, trainings and activities held by or with the college.
        </p>
      </div>
      <EventTable />
    </div>
  )
}
