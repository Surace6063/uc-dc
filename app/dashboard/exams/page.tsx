import type { Metadata } from "next"

import { ExamDataTable } from "@/components/exams/exam-data-table"
import { PageHeader } from "@/components/exams/page-header"

export const metadata: Metadata = {
  title: "Exam List · United College",
}

export default function ExamListPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Exam List"
        description="Create and manage examinations across all programs."
      />
      <ExamDataTable />
    </div>
  )
}
