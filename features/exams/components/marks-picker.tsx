"use client"

import Link from "next/link"

import { FilterSelect } from "@/components/shared/filter-controls"
import { Card } from "@/components/ui/card"
import { SheetStatusBadge } from "@/features/exams/components/exams-nav"
import { EXAM_STATUS_LABELS } from "@/features/exams/constants"
import { useUrlFilters } from "@/hooks/use-url-filters"
import type { ExaminationStatus } from "@/lib/generated/prisma/enums"
import { cn } from "@/lib/utils"
import type { SheetProgress } from "@/services/exams/examination-service"

const DEPENDENTS = { exam: ["subject", "section"] } as const

// Examination and marks-sheet choice for the marks page (state in the URL).
export function MarksPicker({
  exams,
  examinationId,
  sheets,
  selected,
}: {
  exams: { id: string; name: string; status: ExaminationStatus; academicYear: { name: string } }[]
  examinationId: string | null
  sheets: SheetProgress[]
  selected: string | null
}) {
  const { setParams } = useUrlFilters(DEPENDENTS)
  const byClass = new Map<string, SheetProgress[]>()
  for (const s of sheets) byClass.set(s.className, [...(byClass.get(s.className) ?? []), s])
  return (
    <Card className="gap-4 p-4 print:hidden">
      <div className="max-w-md">
        <FilterSelect
          label="Examination"
          value={examinationId ?? undefined}
          allLabel="Choose an examination"
          onChange={(v) => setParams({ exam: v })}
          options={exams.map((e) => ({ value: e.id, label: `${e.name} · ${e.academicYear.name} (${EXAM_STATUS_LABELS[e.status].toLowerCase()})` }))}
        />
      </div>
      {examinationId && sheets.length === 0 && <p className="text-sm text-muted-foreground">No marks sheets for you in this examination.</p>}
      {[...byClass.entries()].map(([className, list]) => (
        <div key={className} className="grid gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{className}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((s) => {
              const key = `${s.examinationSubjectId}:${s.sectionId ?? "none"}`
              return (
                <Link
                  key={s.key}
                  href={`/dashboard/exams/marks?exam=${examinationId}&subject=${s.examinationSubjectId}&section=${s.sectionId ?? "none"}`}
                  aria-current={selected === key ? "page" : undefined}
                  className={cn("flex items-center justify-between gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50", selected === key && "border-primary/50 bg-primary/5")}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.subjectName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.sectionName ? `Section ${s.sectionName}` : "Whole class"} · {s.expected ? `${s.entered}/${s.expected}` : s.entered} entered{s.required ? "" : " · optional"}
                    </span>
                  </span>
                  <SheetStatusBadge status={s.status} />
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </Card>
  )
}
