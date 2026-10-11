"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react"

import { FormAlert } from "@/components/shared/form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ActionResult } from "@/lib/authorization/action"
import { csvLine, normalizeHeader, parseCsv } from "@/lib/csv"
import { cn } from "@/lib/utils"

export type ImportColumn = { key: string; required?: boolean; description: string; example: string }

type RowResult = {
  line: number
  name: string
  admissionNumber: string | null
  placement: string | null
  errors: string[]
  warnings: string[]
  created?: boolean
  createdAdmissionNumber?: string
  unknown?: boolean
}

const PREVIEW_CHUNK = 400
const MAX_BYTES = 5 * 1024 * 1024

// Splits the file into header + chunks of rows (re-serialised), keeping the
// original line number of each chunk's first row for error reports.
function chunk(table: string[][], size: number) {
  const [header, ...rows] = table
  const chunks: { csv: string; firstLine: number; count: number }[] = []
  for (let i = 0; i < rows.length; i += size) {
    const part = rows.slice(i, i + size)
    chunks.push({
      csv: [header, ...part].map((r) => csvLine(r, { raw: true })).join(""),
      firstLine: i + 2,
      count: part.length,
    })
  }
  return chunks
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

type ImportRequest = { csv: string; firstLine: number }

export type ImportWizardProps = {
  columns: readonly ImportColumn[]
  maxRows: number
  batchSize: number
  // A file download served by a route handler.
  templateUrl: string
  // Validate rows without writing; then import them. Both re-check
  // everything on the server.
  preview: (request: ImportRequest) => Promise<ActionResult<{ rows: RowResult[]; columns: string[] }>>
  commit: (request: ImportRequest) => Promise<ActionResult<{ rows: RowResult[] }>>
  listHref: string
  noun: { one: string; many: string }
  // Explains what names/codes must match (shown under "Prepare your file").
  matchingHelp: string
  reportName: string
  // Header for the identifier column (admission number, employee ID, ...).
  referenceLabel: string
  // Flag references repeated across chunks (default). Off when one value may
  // legitimately appear on several rows (a student with two guardians).
  uniqueReferences?: boolean
}

// CSV import flow shared by modules: template, client-side header check,
// chunked server validation, preview, batched import and an error report.
export function ImportWizard({
  columns: IMPORT_COLUMNS,
  maxRows: IMPORT_MAX_ROWS,
  batchSize: IMPORT_BATCH_SIZE,
  templateUrl,
  preview: previewImportAction,
  commit: commitImportAction,
  listHref,
  noun,
  matchingHelp,
  reportName,
  referenceLabel,
  uniqueReferences = true,
}: ImportWizardProps) {
  const router = useRouter()
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [table, setTable] = React.useState<string[][] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [rows, setRows] = React.useState<RowResult[] | null>(null)
  const [unknownColumns, setUnknownColumns] = React.useState<string[]>([])
  const [phase, setPhase] = React.useState<"idle" | "validating" | "preview" | "importing" | "done">("idle")
  const [progress, setProgress] = React.useState(0)
  const [nextBatch, setNextBatch] = React.useState(0)

  function reset() {
    setFileName(null)
    setTable(null)
    setRows(null)
    setError(null)
    setPhase("idle")
    setProgress(0)
    setNextBatch(0)
  }

  async function onFile(file: File | undefined) {
    reset()
    if (!file) return
    if (!/\.csv$/i.test(file.name)) {
      setError("Upload a .csv file. In Excel, use File → Save As → CSV UTF-8.")
      return
    }
    if (file.size > MAX_BYTES) {
      setError("The file is larger than 5 MB. Split it into smaller files.")
      return
    }
    const parsed = parseCsv(await file.text())
    if (parsed.length < 2) {
      setError("The file has no data rows.")
      return
    }
    if (parsed.length - 1 > IMPORT_MAX_ROWS) {
      setError(`Import at most ${IMPORT_MAX_ROWS} rows at a time.`)
      return
    }
    const headers = parsed[0].map(normalizeHeader)
    const missing = IMPORT_COLUMNS.filter((c) => c.required && !headers.includes(c.key))
    if (missing.length) {
      setError(`Missing required columns: ${missing.map((c) => c.key).join(", ")}. Download the template to see the expected headers.`)
      return
    }
    setFileName(file.name)
    setTable(parsed)
    await validate(parsed)
  }

  // Server-side validation in chunks; nothing is written.
  async function validate(parsed: string[][]) {
    setPhase("validating")
    const results: RowResult[] = []
    let unknown: string[] = []
    for (const part of chunk(parsed, PREVIEW_CHUNK)) {
      const result = await previewImportAction({ csv: part.csv, firstLine: part.firstLine })
      if (!result.ok) {
        setError(result.error === "Please check the form and try again." ? Object.values(result.fieldErrors ?? {}).flat()[0] ?? result.error : result.error)
        setPhase("idle")
        return
      }
      results.push(...result.data.rows)
      unknown = result.data.columns
    }
    // Admission numbers repeated across chunks.
    const seen = new Map<string, number>()
    for (const r of results) {
      if (!uniqueReferences || !r.admissionNumber) continue
      const key = r.admissionNumber.toLowerCase()
      const first = seen.get(key)
      if (first && first !== r.line && !r.errors.some((e) => e.startsWith("Admission number repeats"))) {
        r.errors.push(`Admission number repeats line ${first}.`)
      } else if (!first) seen.set(key, r.line)
    }
    setRows(results)
    setUnknownColumns(unknown)
    setPhase("preview")
  }

  // Imports in small batches. Each row is its own transaction on the server,
  // so a failed row never undoes others. A network failure stops the run and
  // marks that batch as unknown; retrying resumes from it.
  async function runImport(fromBatch = 0) {
    if (!table || !rows) return
    setPhase("importing")
    setError(null)
    const batches = chunk(table, IMPORT_BATCH_SIZE)
    const byLine = new Map(rows.map((r) => [r.line, r]))
    for (let i = fromBatch; i < batches.length; i++) {
      const batch = batches[i]
      const result = await commitImportAction({ csv: batch.csv, firstLine: batch.firstLine }).catch(() => null)
      if (!result || !result.ok) {
        for (let line = batch.firstLine; line < batch.firstLine + batch.count; line++) {
          const r = byLine.get(line)
          if (r) byLine.set(line, { ...r, unknown: true })
        }
        setRows([...byLine.values()])
        setNextBatch(i)
        setError(
          `${result && !result.ok ? result.error : "The connection was interrupted."} Rows ${batch.firstLine}–${batch.firstLine + batch.count - 1} may or may not have been imported. Check the student list before retrying; rows with admission numbers are protected from duplicates.`
        )
        setPhase("preview")
        return
      }
      for (const r of result.data.rows) byLine.set(r.line, { ...r, unknown: false })
      setRows([...byLine.values()])
      setProgress(Math.round(((i + 1) / batches.length) * 100))
    }
    setPhase("done")
    router.refresh()
  }

  function downloadReport() {
    if (!rows) return
    const failed = rows.filter((r) => !r.created)
    const lines = [csvLine(["line", "name", "reference", "status", "errors", "warnings"])]
    for (const r of failed) {
      lines.push(
        csvLine([r.line, r.name, r.admissionNumber, r.unknown ? "unknown" : r.errors.length ? "failed" : "not imported", r.errors.join(" | "), r.warnings.join(" | ")])
      )
    }
    download(reportName, lines.join(""))
  }

  const invalid = rows?.filter((r) => r.errors.length > 0 && !r.created).length ?? 0
  const valid = (rows?.length ?? 0) - invalid
  const created = rows?.filter((r) => r.created).length ?? 0
  const warnings = rows?.filter((r) => r.warnings.length > 0).length ?? 0

  return (
    <div className="grid gap-5">
      <Card className="gap-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold">1. Prepare your file</h2>
            <p className="text-sm text-muted-foreground">
              Use the CSV template. Columns are matched by header name. {matchingHelp} Dates use AD (YYYY-MM-DD).
            </p>
          </div>
          <Button variant="outline" nativeButton={false} render={<a href={templateUrl} />}>
            <DownloadIcon data-icon="inline-start" />
            Download template
          </Button>
        </div>
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Column reference</summary>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {IMPORT_COLUMNS.map((c) => (
              <div key={c.key}>
                <dt className="font-mono text-xs">
                  {c.key}
                  {c.required && <span className="text-destructive"> *</span>}
                </dt>
                <dd className="text-xs text-muted-foreground">{c.description}</dd>
              </div>
            ))}
          </dl>
        </details>
      </Card>

      <Card className="gap-4 p-5">
        <h2 className="font-semibold">2. Upload and check</h2>
        {phase === "idle" || phase === "validating" ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center hover:bg-muted/40">
            {phase === "validating" ? <Spinner className="size-6" /> : <FileSpreadsheetIcon className="size-8 text-muted-foreground" />}
            <span className="text-sm font-medium">{phase === "validating" ? "Checking every row…" : "Choose a CSV file"}</span>
            <span className="text-xs text-muted-foreground">Up to {IMPORT_MAX_ROWS} rows and 5 MB</span>
            <Input type="file" accept=".csv,text/csv" className="sr-only" disabled={phase === "validating"} onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm">
              <FileSpreadsheetIcon className="size-4 text-muted-foreground" />
              <span className="font-medium">{fileName}</span>
              <span className="text-muted-foreground">· {rows?.length ?? 0} rows</span>
            </p>
            {phase !== "importing" && (
              <Button variant="ghost" size="sm" onClick={reset}>
                Choose another file
              </Button>
            )}
          </div>
        )}
        {error && <FormAlert tone="error">{error}</FormAlert>}
        {unknownColumns.length > 0 && (
          <p className="text-xs text-muted-foreground">Ignored columns: {unknownColumns.join(", ")}</p>
        )}

        {rows && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary"><CheckCircle2Icon /> {valid} ready</Badge>
              {invalid > 0 && <Badge variant="destructive"><XCircleIcon /> {invalid} with errors</Badge>}
              {warnings > 0 && <Badge variant="outline"><TriangleAlertIcon /> {warnings} warnings</Badge>}
              {created > 0 && <Badge>{created} imported</Badge>}
            </div>
            <div className="max-h-[28rem] overflow-auto rounded-xl border">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur">
                  <TableRow>
                    <TableHead className="w-16 pl-4">Line</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>{referenceLabel}</TableHead>
                    <TableHead>Placement</TableHead>
                    <TableHead className="pr-4">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.line} className={cn(r.errors.length > 0 && !r.created && "bg-destructive/5")}>
                      <TableCell className="pl-4 tabular-nums text-muted-foreground">{r.line}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.createdAdmissionNumber ?? r.admissionNumber ?? "auto"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.placement ?? "—"}</TableCell>
                      <TableCell className="pr-4 text-sm">
                        {r.created ? (
                          <span className="text-emerald-700 dark:text-emerald-400">Imported</span>
                        ) : r.unknown ? (
                          <span className="text-amber-700 dark:text-amber-400">Unknown — check before retrying</span>
                        ) : r.errors.length ? (
                          <span className="text-destructive">{r.errors.join(" ")}</span>
                        ) : (
                          <span className="text-muted-foreground">Ready</span>
                        )}
                        {r.warnings.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{r.warnings.join(" ")}</p>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {rows && (
        <Card className="gap-4 p-5">
          <h2 className="font-semibold">3. Import</h2>
          {phase === "importing" && (
            <div className="grid gap-2">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground">Importing… {progress}%. Keep this page open.</p>
            </div>
          )}
          {phase === "done" ? (
            <div className="grid gap-3">
              <FormAlert tone="success">
                Imported {created} {created === 1 ? noun.one : noun.many}.
                {rows.length - created > 0 ? ` ${rows.length - created} row(s) were not imported.` : ""}
              </FormAlert>
              <div className="flex flex-wrap gap-2">
                <Button nativeButton={false} render={<Link href={listHref} />}>View {noun.many}</Button>
                {rows.length - created > 0 && (
                  <Button variant="outline" onClick={downloadReport}>
                    <DownloadIcon data-icon="inline-start" />
                    Download error report
                  </Button>
                )}
                <Button variant="ghost" onClick={reset}>Import another file</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {nextBatch > 0 ? (
                <Button onClick={() => runImport(nextBatch)} disabled={phase === "importing"}>
                  <RotateCcwIcon data-icon="inline-start" />
                  Resume import
                </Button>
              ) : (
                <Button onClick={() => runImport(0)} disabled={phase === "importing" || valid === 0}>
                  {phase === "importing" ? <Spinner /> : <UploadIcon data-icon="inline-start" />}
                  Import {valid} valid row{valid === 1 ? "" : "s"}
                </Button>
              )}
              {invalid > 0 && (
                <Button variant="outline" onClick={downloadReport}>
                  <DownloadIcon data-icon="inline-start" />
                  Download error report
                </Button>
              )}
              <p className="text-xs text-muted-foreground">Rows with errors are skipped. Every row is checked again on the server while importing.</p>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
