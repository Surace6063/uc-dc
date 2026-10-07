import type { Metadata } from "next"
import { EyeIcon, PencilIcon, PlusIcon } from "lucide-react"

import { reportCardTemplates } from "@/components/exams/data"
import { formatDate, PageHeader } from "@/components/exams/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Report Card Templates · United College",
}

// A miniature, abstract report card used as the template thumbnail.
function TemplatePreview() {
  return (
    <div className="flex h-40 items-center justify-center border-b bg-muted/40">
      <div className="flex h-32 w-24 flex-col gap-1.5 rounded-md bg-card p-2.5 shadow-sm ring-1 ring-foreground/10">
        <div className="mx-auto h-2 w-10 rounded-full bg-primary/70" />
        <div className="mx-auto h-1 w-14 rounded-full bg-muted-foreground/30" />
        <div className="mt-1 grid gap-1">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-1">
              <div className="h-1 flex-1 rounded-full bg-muted-foreground/20" />
              <div className="h-1 w-3 rounded-full bg-muted-foreground/30" />
            </div>
          ))}
        </div>
        <div className="mt-auto flex justify-between">
          <div className="h-1 w-6 rounded-full bg-muted-foreground/30" />
          <div className="h-1 w-6 rounded-full bg-muted-foreground/30" />
        </div>
      </div>
    </div>
  )
}

export default function ReportCardTemplatesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Report Card Templates"
        description="Layouts used when generating report cards and mark sheets."
      >
        <Button>
          <PlusIcon data-icon="inline-start" />
          New template
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {reportCardTemplates.map((template) => (
          <Card
            key={template.name}
            className="gap-0 p-0 transition-shadow hover:shadow-md"
          >
            <TemplatePreview />
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-medium">{template.name}</h2>
                  {template.isDefault && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Default
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {template.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {template.usedBy.map((program) => (
                  <span
                    key={program}
                    className="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {program}
                  </span>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between border-t pt-3">
                <span className="text-xs text-muted-foreground">
                  Updated {formatDate(template.updated)}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Preview ${template.name}`}
                  >
                    <EyeIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${template.name}`}
                  >
                    <PencilIcon />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
