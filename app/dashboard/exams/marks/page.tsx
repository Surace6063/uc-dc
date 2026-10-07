import type { Metadata } from "next"
import { UploadIcon } from "lucide-react"

import { MarkEntry } from "@/components/exams/mark-entry"
import { PageHeader } from "@/components/exams/page-header"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Assign Mark · United College",
}

export default function AssignMarkPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assign Mark"
        description="Enter theory and practical marks for each student."
      >
        <Button variant="outline">
          <UploadIcon data-icon="inline-start" />
          Bulk upload
        </Button>
      </PageHeader>

      <MarkEntry />
    </div>
  )
}
