"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"

import {
  exams,
  markSheet,
  subjects,
  type MarkRow,
} from "@/components/exams/data"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const THEORY_MAX = 60
const PRACTICAL_MAX = 20
const FULL_MARKS = THEORY_MAX + PRACTICAL_MAX
const PASS_PERCENT = 40

function grade(percent: number) {
  if (percent >= 90) return "A+"
  if (percent >= 80) return "A"
  if (percent >= 70) return "B+"
  if (percent >= 60) return "B"
  if (percent >= 50) return "C+"
  if (percent >= 40) return "C"
  return "F"
}

function MarkInput({
  value,
  max,
  label,
  onChange,
}: {
  value: number | null
  max: number
  label: string
  onChange: (value: number | null) => void
}) {
  const invalid = value !== null && (value < 0 || value > max)
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      aria-label={label}
      aria-invalid={invalid}
      value={value ?? ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? null : Number(e.target.value))
      }
      className="h-8 w-20 text-right tabular-nums"
    />
  )
}

export function MarkEntry() {
  const [rows, setRows] = React.useState<MarkRow[]>(markSheet)
  const [saved, setSaved] = React.useState(false)

  function update(roll: number, patch: Partial<MarkRow>) {
    setSaved(false)
    setRows((prev) =>
      prev.map((row) => (row.roll === roll ? { ...row, ...patch } : row))
    )
  }

  const entered = rows.filter(
    (r) => r.theory !== null && r.practical !== null
  ).length

  return (
    <div className="flex flex-col gap-4">
      <Card className="grid gap-4 p-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="exam">Exam</Label>
          <NativeSelect id="exam" className="w-full">
            {exams.map((exam) => (
              <NativeSelectOption key={exam.id} value={exam.id}>
                {exam.name} · {exam.program}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="section">Section</Label>
          <NativeSelect id="section" className="w-full">
            <NativeSelectOption>BCA · Semester II · A</NativeSelectOption>
            <NativeSelectOption>BCA · Semester II · B</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="subject">Subject</Label>
          <NativeSelect id="subject" className="w-full">
            {subjects.map((s) => (
              <NativeSelectOption key={s}>{s}</NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </Card>

      <Card className="gap-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-medium">Mark sheet</h2>
            <p className="text-xs text-muted-foreground">
              Theory {THEORY_MAX} + Practical {PRACTICAL_MAX} = {FULL_MARKS}{" "}
              full marks · Pass {PASS_PERCENT}%
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground tabular-nums">
              {entered}/{rows.length} entered
            </span>
            {/* TODO: save marks to the API. */}
            <Button onClick={() => setSaved(true)}>
              {saved && <CheckIcon data-icon="inline-start" />}
              {saved ? "Saved" : "Save marks"}
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-16 pl-4">Roll</TableHead>
              <TableHead>Student</TableHead>
              <TableHead className="text-right">
                Theory <span className="font-normal">/{THEORY_MAX}</span>
              </TableHead>
              <TableHead className="text-right">
                Practical <span className="font-normal">/{PRACTICAL_MAX}</span>
              </TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="pr-4 text-right">Grade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const complete = row.theory !== null && row.practical !== null
              const total = (row.theory ?? 0) + (row.practical ?? 0)
              const g = grade((total / FULL_MARKS) * 100)

              return (
                <TableRow key={row.roll}>
                  <TableCell className="pl-4 text-muted-foreground tabular-nums">
                    {String(row.roll).padStart(2, "0")}
                  </TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <MarkInput
                        value={row.theory}
                        max={THEORY_MAX}
                        label={`Theory marks for ${row.name}`}
                        onChange={(theory) => update(row.roll, { theory })}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <MarkInput
                        value={row.practical}
                        max={PRACTICAL_MAX}
                        label={`Practical marks for ${row.name}`}
                        onChange={(practical) =>
                          update(row.roll, { practical })
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {complete ? total : "—"}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {complete ? (
                      <span
                        className={cn(
                          "inline-flex min-w-9 justify-center rounded-full px-2 py-0.5 text-xs font-semibold",
                          g === "F"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-foreground"
                        )}
                      >
                        {g}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Pending
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
