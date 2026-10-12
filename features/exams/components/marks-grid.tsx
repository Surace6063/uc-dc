"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CheckCheckIcon, CheckIcon, CornerUpLeftIcon, InfoIcon, SaveIcon, SendIcon, ShieldCheckIcon } from "lucide-react"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { SearchBox } from "@/components/shared/filter-controls"
import { useCan } from "@/components/shared/session-provider"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { reviewSheetsAction, saveMarksAction } from "@/features/exams/actions"
import { calculateStudent, formatMarks, formatPercent, type MarkInput } from "@/features/exams/calculation"
import { ResultStatusBadge, SheetStatusBadge } from "@/features/exams/components/exams-nav"
import { markCellText, parseMarkCell, type ParsedCell } from "@/features/exams/constants"
import { cn } from "@/lib/utils"
import type { MarksSheetData } from "@/services/exams/marks-service"

type Row = { cells: Record<string, string>; remark: string; internalNote: string }

const rowOf = (s: MarksSheetData["students"][number], comps: MarksSheetData["subject"]["components"]): Row => ({
  cells: Object.fromEntries(comps.map((c) => [c.id, markCellText(s.marks[c.id])])),
  remark: s.remark ?? "",
  internalNote: s.internalNote ?? "",
})

const sameRow = (a: Row, b: Row) => a.remark === b.remark && a.internalNote === b.internalNote && Object.keys(a.cells).every((k) => a.cells[k].trim() === b.cells[k].trim())

export function MarksGrid({ data }: { data: MarksSheetData }) {
  const router = useRouter()
  const comps = data.subject.components
  const editable = data.canEdit
  const saved = React.useMemo(() => new Map(data.students.map((s) => [s.studentId, rowOf(s, comps)])), [data.students, comps])
  const [rows, setRows] = React.useState(saved)
  const [query, setQuery] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [pending, setPending] = React.useState<"draft" | "submit" | null>(null)
  const [confirmSubmit, setConfirmSubmit] = React.useState(false)
  const [showErrors, setShowErrors] = React.useState(false)
  const [serverErrors, setServerErrors] = React.useState<Record<string, string>>({})
  const [review, setReview] = React.useState<null | "verify" | "approve" | "return">(null)
  const [note, setNote] = React.useState("")
  const canReview = useCan("exams.review")
  const canApprove = useCan("exams.approve")
  const gridRef = React.useRef<HTMLTableElement>(null)

  const dirtyIds = data.students.filter((s) => !sameRow(rows.get(s.studentId)!, saved.get(s.studentId)!)).map((s) => s.studentId)
  const dirty = editable && dirtyIds.length > 0

  React.useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  // Parse every cell once per render; previews use the shared calculation.
  const parsed = new Map<string, Record<string, ParsedCell>>()
  for (const s of data.students) {
    const row = rows.get(s.studentId)!
    parsed.set(s.studentId, Object.fromEntries(comps.map((c) => [c.id, parseMarkCell(row.cells[c.id], c.max)])))
  }
  const errorCount = [...parsed.values()].reduce((n, cells) => n + Object.values(cells).filter((c) => c.kind === "error").length, 0)
  const missingCount = data.students.filter((s) => s.eligible).reduce((n, s) => {
    const cells = Object.values(parsed.get(s.studentId)!)
    const empty = cells.filter((c) => c.kind === "empty").length
    return n + (data.subject.isCompulsory ? empty : empty > 0 && empty < cells.length ? empty : 0)
  }, 0)

  function preview(studentId: string) {
    const cells = parsed.get(studentId)!
    if (Object.values(cells).some((c) => c.kind === "error")) return null
    const marks = new Map<string, MarkInput>()
    for (const [id, c] of Object.entries(cells)) if (c.kind === "mark") marks.set(id, { status: c.status, marks: c.marks })
    const result = calculateStudent([data.config], { marks: new Map([[data.config.id, marks]]), held: false }, data.previewRules)
    return result.subjects[0]
  }

  function update(studentId: string, patch: Partial<Row> & { cell?: [string, string] }) {
    setRows((prev) => {
      const next = new Map(prev)
      const row = next.get(studentId)!
      next.set(studentId, {
        ...row,
        ...(patch.remark !== undefined && { remark: patch.remark }),
        ...(patch.internalNote !== undefined && { internalNote: patch.internalNote }),
        cells: patch.cell ? { ...row.cells, [patch.cell[0]]: patch.cell[1] } : row.cells,
      })
      return next
    })
  }

  const q = query.trim().toLowerCase()
  const visible = data.students.filter((s) => !q || s.name.toLowerCase().includes(q) || s.admissionNumber.toLowerCase().includes(q) || (s.rollNumber ?? "").toLowerCase() === q)

  // Arrow keys and Enter move between cells like a spreadsheet.
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const el = e.currentTarget
    const r = Number(el.dataset.row)
    const c = Number(el.dataset.col)
    const move = (dr: number, dc: number) => {
      const target = gridRef.current?.querySelector<HTMLInputElement>(`input[data-row="${r + dr}"][data-col="${c + dc}"]`)
      if (target) {
        e.preventDefault()
        target.focus()
        target.select()
      }
    }
    if (e.key === "Enter" || e.key === "ArrowDown") move(1, 0)
    else if (e.key === "ArrowUp") move(-1, 0)
    else if (e.key === "ArrowRight" && el.selectionStart === el.value.length) move(0, 1)
    else if (e.key === "ArrowLeft" && el.selectionStart === 0) move(0, -1)
  }

  // Pasting a block from a spreadsheet fills cells right and down from here.
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    const text = e.clipboardData.getData("text/plain")
    if (!/[\t\n]/.test(text.trim())) return
    e.preventDefault()
    const lines = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"))
    setRows((prev) => {
      const next = new Map(prev)
      lines.forEach((values, i) => {
        const student = visible[rowIndex + i]
        if (!student) return
        const row = { ...next.get(student.studentId)!, cells: { ...next.get(student.studentId)!.cells } }
        values.forEach((v, j) => {
          const comp = comps[colIndex + j]
          if (comp) row.cells[comp.id] = v.trim()
        })
        next.set(student.studentId, row)
      })
      return next
    })
    toast.add({ title: `Pasted ${lines.length} row${lines.length === 1 ? "" : "s"}`, description: "Check the values, then save.", type: "info" })
  }

  async function save(submit: boolean) {
    setShowErrors(true)
    if (errorCount > 0) {
      toast.add({ title: `${errorCount} cell${errorCount === 1 ? " needs" : "s need"} attention`, type: "error" })
      return false
    }
    if (data.needsReason && dirty && !reason.trim()) {
      toast.add({ title: "Give a reason for changing submitted marks", type: "error" })
      return false
    }
    setPending(submit ? "submit" : "draft")
    // Only changed rows are sent; submission checks completeness on the server.
    const entries = dirtyIds.map((id) => {
      const row = rows.get(id)!
      const cells = parsed.get(id)!
      return {
        studentId: id,
        remark: row.remark,
        internalNote: row.internalNote,
        marks: comps.map((c) => {
          const cell = cells[c.id]
          return cell.kind === "mark" ? { componentId: c.id, status: cell.status, marks: cell.marks === null ? null : cell.marks / 100 } : { componentId: c.id, status: null, marks: null }
        }),
      }
    })
    const result = await saveMarksAction({
      scope: data.scope,
      sheetId: data.sheet?.id ?? null,
      expectedUpdatedAt: data.sheet?.updatedAt ?? null,
      reason,
      submit,
      entries,
    })
    setPending(null)
    if (!result.ok) {
      // Map "entries.<i>.marks.<j>" back to cells.
      const cellErrors: Record<string, string> = {}
      for (const [path, messages] of Object.entries(result.fieldErrors ?? {})) {
        const m = /^entries\.(\d+)\.marks\.(\d+)$/.exec(path)
        if (m && messages?.[0]) cellErrors[`${entries[Number(m[1])]?.studentId}:${comps[Number(m[2])]?.id}`] = messages[0]
      }
      setServerErrors(cellErrors)
      toast.add({ title: submit ? "Couldn't submit" : "Couldn't save", description: result.fieldErrors?.entries?.[0] ?? result.fieldErrors?.reason?.[0] ?? result.error, type: "error" })
      return false
    }
    setServerErrors({})
    toast.add({ title: submit ? "Marks submitted for review" : "Draft saved", description: `${result.data.created} added, ${result.data.updated} changed, ${result.data.cleared} cleared.`, type: "success" })
    router.refresh()
  }

  async function runReview() {
    const result = await reviewSheetsAction(review!, { sheetIds: [data.sheet!.id], note })
    if (!result.ok) {
      toast.add({ title: "Couldn't update the sheet", description: result.fieldErrors?.note?.[0] ?? result.error, type: "error" })
      return false
    }
    if (result.data.skipped.length) {
      toast.add({ title: "Nothing changed", description: result.data.skipped[0].reason, type: "error" })
      return false
    }
    toast.add({ title: { verify: "Marks verified", approve: "Marks approved", return: "Returned to the teacher" }[review!], type: "success" })
    setNote("")
    router.refresh()
  }

  const status = data.sheet?.status ?? "NOT_STARTED"
  const examOpen = data.exam.status === "SCHEDULED" || data.exam.status === "REVISION"
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{data.title}</h2>
            <p className="text-sm text-muted-foreground">
              {data.exam.name} · Full marks {data.subject.maxText}{data.subject.passText ? ` · pass ${data.subject.passText}` : ""} ·{" "}
              {comps.map((c) => `${c.name} ${formatMarks(c.max)}${c.pass !== null ? ` (pass ${formatMarks(c.pass)})` : ""}${c.weight !== null ? ` · ${formatMarks(c.weight)}%` : ""}`).join(", ")}
            </p>
          </div>
          <SheetStatusBadge status={status} />
        </div>
        {data.sheet?.status === "RETURNED" && data.sheet.returnNote && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">Returned for correction: {data.sheet.returnNote}</p>
        )}
        {data.readOnlyReason && <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"><InfoIcon className="size-4" />{data.readOnlyReason}</p>}
        {editable && (
          <p className="text-xs text-muted-foreground">
            Type marks, or AB (absent), EX (exempt), INC (incomplete), WH (withheld). Empty cells are “not entered” — never zero. Enter/arrow keys move between cells; paste a block from a spreadsheet into the first cell.
          </p>
        )}
      </Card>

      <Card className="gap-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
          <SearchBox value={query} onSearch={(v) => setQuery(v ?? "")} placeholder="Search name, admission or roll no." label="Search students" />
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{data.students.filter((s) => s.eligible).length} students</span>
            {editable && <span className={cn(errorCount && "text-destructive")}>{errorCount} error{errorCount === 1 ? "" : "s"}</span>}
            {editable && <span>{missingCount} cell{missingCount === 1 ? "" : "s"} not entered</span>}
            {dirty && <span className="font-medium text-amber-700 dark:text-amber-400">{dirtyIds.length} unsaved</span>}
          </div>
        </div>
        <div className="max-h-[65vh] overflow-auto">
          <table ref={gridRef} className="w-full min-w-[900px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
              <tr className="text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <th className="px-3 py-2">Roll</th>
                <th className="px-3 py-2">Student</th>
                {comps.map((c) => (
                  <th key={c.id} className="px-2 py-2 text-center">
                    {c.name}
                    <span className="block font-normal normal-case">/ {formatMarks(c.max)}</span>
                  </th>
                ))}
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-right">%</th>
                <th className="px-2 py-2">Grade</th>
                <th className="px-2 py-2">Result</th>
                <th className="px-2 py-2">Remark</th>
                <th className="px-2 py-2">Internal note</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s, rowIndex) => {
                const row = rows.get(s.studentId)!
                const cells = parsed.get(s.studentId)!
                const p = preview(s.studentId)
                const changed = dirtyIds.includes(s.studentId)
                return (
                  <tr key={s.studentId} className={cn("border-b last:border-0", changed && "bg-amber-500/5", !s.eligible && "opacity-70")}>
                    <td className="px-3 py-1.5 tabular-nums">{s.rollNumber ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{s.name}</span>
                      <span className="block text-xs text-muted-foreground">{s.admissionNumber}{!s.eligible ? " · no longer placed here" : ""}</span>
                    </td>
                    {comps.map((c, colIndex) => {
                      const cell = cells[c.id]
                      const error = cell.kind === "error" ? cell.message : serverErrors[`${s.studentId}:${c.id}`]
                      const show = (showErrors || row.cells[c.id] !== saved.get(s.studentId)!.cells[c.id]) && error
                      return (
                        <td key={c.id} className="px-1 py-1">
                          <Input
                            value={row.cells[c.id]}
                            onChange={(e) => update(s.studentId, { cell: [c.id, e.target.value] })}
                            onKeyDown={onKeyDown}
                            onPaste={(e) => onPaste(e, rowIndex, colIndex)}
                            onFocus={(e) => e.target.select()}
                            data-row={rowIndex}
                            data-col={colIndex}
                            disabled={!editable || (!s.eligible && row.cells[c.id] === "")}
                            inputMode="decimal"
                            aria-label={`${c.name} for ${s.name}`}
                            aria-invalid={show ? true : undefined}
                            title={show || undefined}
                            className={cn("h-8 w-20 text-center tabular-nums", cell.kind === "mark" && cell.status !== "SCORED" && "font-medium text-amber-700 dark:text-amber-400")}
                          />
                          {show && <span className="block max-w-28 text-[11px] leading-tight text-destructive">{show}</span>}
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-right tabular-nums">{p && p.obtained !== null ? formatMarks(p.obtained) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p && p.percentage !== null ? formatPercent(p.percentage, data.previewRules.policy.percentageDecimals) : "—"}</td>
                    <td className="px-2 py-1.5 font-medium">{p?.grade ?? "—"}</td>
                    <td className="px-2 py-1.5">{p ? <ResultStatusBadge status={p.status} /> : "—"}</td>
                    <td className="px-1 py-1">
                      <Input value={row.remark} onChange={(e) => update(s.studentId, { remark: e.target.value })} disabled={!editable || !s.eligible} maxLength={300} aria-label={`Remark for ${s.name}`} className="h-8 min-w-36" placeholder="Shown on report card" />
                    </td>
                    <td className="px-1 py-1">
                      <Input value={row.internalNote} onChange={(e) => update(s.studentId, { internalNote: e.target.value })} disabled={!editable || !s.eligible} maxLength={500} aria-label={`Internal note for ${s.name}`} className="h-8 min-w-36" placeholder="Staff only" />
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr><td colSpan={comps.length + 8} className="h-24 text-center text-muted-foreground">{data.students.length ? "No students match the search." : "No students are placed in this class or section during the examination."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editable && (
        <Card className="gap-3 p-4 print:hidden">
          {data.needsReason && (
            <div className="grid gap-1.5">
              <Label htmlFor="marks-reason">Reason for changes</Label>
              <Textarea id="marks-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="These marks were submitted before; every change is recorded with this reason." />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => { setShowErrors(true); toast.add({ title: errorCount ? `${errorCount} cell${errorCount === 1 ? " needs" : "s need"} attention` : missingCount ? `All values valid; ${missingCount} not entered yet` : "All marks entered and valid", type: errorCount ? "error" : "success" }) }}>
              <CheckCheckIcon data-icon="inline-start" />
              Validate
            </Button>
            {dirty && <Button variant="outline" onClick={() => { setRows(saved); setShowErrors(false); setServerErrors({}) }}>Discard changes</Button>}
            <Button variant="outline" onClick={() => save(false)} disabled={pending !== null || !dirty}>
              {pending === "draft" ? <Spinner /> : <SaveIcon data-icon="inline-start" />}
              Save draft
            </Button>
            <Button onClick={() => (errorCount ? save(true) : setConfirmSubmit(true))} disabled={pending !== null}>
              {pending === "submit" ? <Spinner /> : <SendIcon data-icon="inline-start" />}
              Submit for review
            </Button>
          </div>
        </Card>
      )}

      {data.sheet && examOpen && !editable && (canReview || canApprove) && ["SUBMITTED", "VERIFIED", "APPROVED"].includes(status) && (
        <Card className="flex-row flex-wrap items-center justify-end gap-2 p-4 print:hidden">
          <span className="mr-auto text-sm text-muted-foreground">Review these marks</span>
          {(canReview || canApprove) && status !== "APPROVED" && (
            <Button variant="outline" onClick={() => setReview("return")}><CornerUpLeftIcon data-icon="inline-start" />Return for correction</Button>
          )}
          {canApprove && status === "APPROVED" && (
            <Button variant="outline" onClick={() => setReview("return")}><CornerUpLeftIcon data-icon="inline-start" />Return</Button>
          )}
          {canReview && status === "SUBMITTED" && <Button variant="outline" onClick={() => setReview("verify")}><CheckIcon data-icon="inline-start" />Verify</Button>}
          {canApprove && (status === "VERIFIED" || status === "SUBMITTED") && <Button onClick={() => setReview("approve")}><ShieldCheckIcon data-icon="inline-start" />Approve</Button>}
        </Card>
      )}

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Submit these marks for review?"
        description={`After submitting, the marks can't change unless a reviewer returns them.${missingCount ? ` ${missingCount} cell${missingCount === 1 ? " is" : "s are"} still empty — submission needs a mark or status for every component.` : ""}`}
        confirmLabel="Submit"
        onConfirm={() => save(true)}
      />
      <ConfirmDialog
        open={review !== null}
        onOpenChange={(open) => !open && setReview(null)}
        title={review === "verify" ? "Verify these marks?" : review === "approve" ? "Approve these marks?" : "Return these marks for correction?"}
        description={review === "return" ? "The teacher can edit them again; every change after the first submission is recorded with a reason." : "This is recorded with your name and the time."}
        confirmLabel={review === "verify" ? "Verify" : review === "approve" ? "Approve" : "Return"}
        onConfirm={runReview}
      >
        {review === "return" && (
          <div className="grid gap-1.5">
            <Label htmlFor="return-note">What needs correcting?</Label>
            <Textarea id="return-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}
