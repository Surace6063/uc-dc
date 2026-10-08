import type { Metadata } from "next"
import { PlusIcon, PrinterIcon } from "lucide-react"

import { PageHeader } from "@/components/exams/page-header"
import { ScheduleView } from "@/components/exams/schedule-view"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Exam Schedule",
}

export default function ExamSchedulePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Exam Schedule"
        description="Dates, times and rooms for each paper."
      >
        <Button variant="outline">
          <PrinterIcon data-icon="inline-start" />
          Print
        </Button>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Add paper
        </Button>
      </PageHeader>

      <ScheduleView />
    </div>
  )
}
