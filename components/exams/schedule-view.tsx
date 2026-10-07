"use client"

import * as React from "react"
import { ClockIcon, MapPinIcon } from "lucide-react"

import { programs, schedule } from "@/components/exams/data"
import { formatDate } from "@/components/exams/page-header"
import { Card } from "@/components/ui/card"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

export function ScheduleView() {
  const [program, setProgram] = React.useState("all")

  const entries = schedule.filter(
    (entry) => program === "all" || entry.program === program
  )
  const days = Object.entries(
    Object.groupBy(entries, (entry) => entry.date)
  ).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          First Terminal Examination · {entries.length} papers
        </p>
        <NativeSelect
          value={program}
          onChange={(e) => setProgram(e.target.value)}
          aria-label="Filter by program"
        >
          <NativeSelectOption value="all">All programs</NativeSelectOption>
          {programs.map((p) => (
            <NativeSelectOption key={p} value={p}>
              {p}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {days.map(([date, items]) => (
        <Card key={date} className="flex-row gap-0 p-0">
          <div className="flex w-24 shrink-0 flex-col items-center justify-center border-r bg-muted/40 py-4 sm:w-28">
            <span className="text-xs font-medium text-primary uppercase">
              {formatDate(date, { weekday: "short" })}
            </span>
            <span className="text-3xl font-semibold tracking-tight">
              {formatDate(date, { day: "numeric" })}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDate(date, { month: "short", year: "numeric" })}
            </span>
          </div>
          <ul className="flex-1 divide-y">
            {items?.map((item) => (
              <li
                key={item.code}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.code} · {item.program}
                  </p>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <ClockIcon className="size-4" />
                    {item.time}
                  </span>
                  <span className="inline-flex w-24 items-center gap-1.5">
                    <MapPinIcon className="size-4" />
                    {item.room}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {days.length === 0 && (
        <Card className="items-center p-10 text-sm text-muted-foreground">
          No papers scheduled for this program.
        </Card>
      )}
    </div>
  )
}
