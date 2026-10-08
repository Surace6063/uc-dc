import type { Metadata } from "next"

import { GrievanceTable } from "@/components/grievance/grievance-table"

export const metadata: Metadata = {
  title: "Grievance",
}

export default function GrievancePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Grievance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Raise a grievance and track the ones already submitted.
        </p>
      </div>
      <GrievanceTable />
    </div>
  )
}
