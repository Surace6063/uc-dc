import type { Metadata } from "next"
import { DownloadIcon } from "lucide-react"

import { imports } from "@/components/exams/data"
import { ImportDropzone } from "@/components/exams/import-dropzone"
import { formatDate, PageHeader } from "@/components/exams/page-header"
import { StatusBadge } from "@/components/exams/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const metadata: Metadata = {
  title: "Import Historical Exams · United College",
}

const steps = [
  "Download the results template.",
  "Fill in one row per student per subject.",
  "Upload the file and review the summary.",
  "Confirm to add the results to student records.",
]

export default function ImportHistoricalExamsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Import Historical Exams"
        description="Bring past exam results into the system from a spreadsheet."
      >
        <Button variant="outline">
          <DownloadIcon data-icon="inline-start" />
          Download template
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <ImportDropzone />

        <Card className="gap-4 p-5">
          <h2 className="font-medium">How it works</h2>
          <ol className="space-y-4">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card className="gap-0 p-0">
        <div className="border-b p-4">
          <h2 className="font-medium">Recent imports</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">File</TableHead>
              <TableHead>Exam</TableHead>
              <TableHead className="text-right">Records</TableHead>
              <TableHead>Imported</TableHead>
              <TableHead className="pr-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.map((item) => (
              <TableRow key={item.file}>
                <TableCell className="pl-4 font-medium">{item.file}</TableCell>
                <TableCell>{item.exam}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.records.toLocaleString()}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(item.date)}
                </TableCell>
                <TableCell className="pr-4">
                  <StatusBadge status={item.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
