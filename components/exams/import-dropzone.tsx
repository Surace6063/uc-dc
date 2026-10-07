"use client"

import * as React from "react"
import { FileSpreadsheetIcon, UploadCloudIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

const ACCEPT = ".xlsx,.xls,.csv"

export function ImportDropzone() {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)

  function pick(files: FileList | null) {
    const next = files?.[0]
    if (next) setFile(next)
  }

  return (
    <Card className="gap-4 p-5">
      <div>
        <h2 className="font-medium">Upload results file</h2>
        <p className="text-sm text-muted-foreground">
          Excel or CSV, up to 10 MB. Use the template so columns match.
        </p>
      </div>

      {file ? (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-4">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileSpreadsheetIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB · Ready to import
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove file"
            onClick={() => setFile(null)}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            pick(e.dataTransfer.files)
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            dragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40"
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UploadCloudIcon className="size-6" />
          </span>
          <span className="text-sm">
            <span className="font-medium text-primary">Click to upload</span> or
            drag and drop
          </span>
          <span className="text-xs text-muted-foreground">
            XLSX, XLS or CSV
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => pick(e.target.files)}
      />

      <div className="flex justify-end">
        {/* TODO: send the file to the import API. */}
        <Button disabled={!file}>Import results</Button>
      </div>
    </Card>
  )
}
