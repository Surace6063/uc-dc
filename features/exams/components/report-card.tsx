import { formatGpa, formatGradePoint, formatMarks, formatPercent } from "@/features/exams/calculation"
import { COMPONENT_TYPE_LABELS, formatDateTime, formatDay, GPA_METHOD_LABELS, MARK_STATUS_CODES, RESULT_STATUS_LABELS } from "@/features/exams/constants"
import type { ResultCard } from "@/services/exams/result-service"
import { cn } from "@/lib/utils"

// A printable mark sheet / report card (A4). Rendered from a published
// result (official) or a provisional calculation (clearly marked as not
// official). Only information meant for the student is shown: never
// internal examiner notes. Print with the browser (Ctrl/Cmd+P → Save as PDF).

function cellMarks(c: ResultCard["breakdown"]["subjects"][number]["components"][number]) {
  if (c.status === "SCORED") return formatMarks(c.marks)
  if (c.status === "MISSING") return "—"
  return MARK_STATUS_CODES[c.status]
}

export function ReportCard({ card, photoUrl, showInternal }: { card: ResultCard; photoUrl?: string | null; showInternal?: boolean }) {
  const rules = card.breakdown.rules
  const subjects = card.breakdown.subjects.filter((s) => s.status !== "NOT_TAKEN")
  const withComponents = subjects.some((s) => s.components.length > 1)
  const gpa = rules.gpaMethod !== "NONE"
  return (
    <article className="report-card mx-auto w-full max-w-[210mm] rounded-xl border bg-card p-6 text-card-foreground shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {!card.official && (
        <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm font-semibold text-amber-800 dark:text-amber-300 print:text-black">
          {card.publication?.superseded ? `Superseded version ${card.publication.version} — replaced by a revised result` : "PROVISIONAL — not an official result"}
        </p>
      )}
      <header className="flex items-center gap-4 border-b pb-4">
        {card.organization.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.organization.logoUrl} alt="" className="size-16 object-contain" />
        )}
        <div className="flex-1 text-center">
          <p className="text-xl font-bold tracking-tight">{card.organization.name}</p>
          <p className="text-sm font-medium">{card.exam.name}</p>
          <p className="text-xs text-muted-foreground print:text-black">
            {card.exam.typeName} · Academic year {card.exam.yearName}{card.exam.term ? ` · ${card.exam.term}` : ""}
          </p>
          <p className="mt-1 text-sm font-semibold tracking-wider uppercase">{gpa ? "Grade sheet" : "Mark sheet"}</p>
        </div>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-20 w-16 rounded border object-cover" />
        ) : (
          <div className="size-16" />
        )}
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 border-b py-3 text-sm sm:grid-cols-3">
        <div><dt className="inline text-muted-foreground print:text-black">Name: </dt><dd className="inline font-medium">{card.student.name}</dd></div>
        <div><dt className="inline text-muted-foreground print:text-black">Admission no.: </dt><dd className="inline font-mono">{card.student.admissionNumber}</dd></div>
        <div><dt className="inline text-muted-foreground print:text-black">Roll no.: </dt><dd className="inline">{card.student.rollNumber ?? "—"}</dd></div>
        <div><dt className="inline text-muted-foreground print:text-black">Class: </dt><dd className="inline">{card.student.className}{card.student.sectionName ? ` · Section ${card.student.sectionName}` : ""}</dd></div>
        {card.student.programName && <div><dt className="inline text-muted-foreground print:text-black">Program: </dt><dd className="inline">{card.student.programName}</dd></div>}
        <div><dt className="inline text-muted-foreground print:text-black">Examination dates: </dt><dd className="inline">{formatDay(card.exam.startDate)} – {formatDay(card.exam.endDate)}</dd></div>
      </dl>

      {card.status === "WITHHELD" ? (
        <p className="py-10 text-center text-base font-semibold">Result withheld. Please contact the institution.</p>
      ) : (
        <>
          <div className="overflow-x-auto py-3">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-y bg-muted/60 text-left text-xs print:bg-transparent">
                  <th className="px-2 py-1.5">Subject</th>
                  {withComponents && <th className="px-2 py-1.5">Components</th>}
                  <th className="px-2 py-1.5 text-right">Full</th>
                  <th className="px-2 py-1.5 text-right">Pass</th>
                  <th className="px-2 py-1.5 text-right">Obtained</th>
                  {gpa && <th className="px-2 py-1.5 text-right">Credit</th>}
                  <th className="px-2 py-1.5 text-center">Grade</th>
                  {gpa && <th className="px-2 py-1.5 text-right">GP</th>}
                  <th className="px-2 py-1.5">Result</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.examinationSubjectId} className="border-b align-top">
                    <td className="px-2 py-1.5">
                      <span className="font-medium">{s.name}</span>
                      <span className="block text-xs text-muted-foreground print:text-black">{s.code}{s.isCompulsory ? "" : " · optional"}</span>
                      {s.remark && <span className="block text-xs italic">“{s.remark}”</span>}
                      {s.notes.length > 0 && <span className="block text-xs text-muted-foreground print:text-black">{s.notes.join(" ")}</span>}
                    </td>
                    {withComponents && (
                      <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                        {s.components.map((c) => (
                          <span key={c.componentId} className="block">
                            {c.name}: {cellMarks(c)}/{formatMarks(c.max)}
                            <span className="sr-only"> ({COMPONENT_TYPE_LABELS[c.type]})</span>
                          </span>
                        ))}
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatMarks(s.maximum)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatMarks(s.passMarks)}</td>
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">{s.status === "EXEMPT" ? "EX" : formatMarks(s.obtained)}</td>
                    {gpa && <td className="px-2 py-1.5 text-right tabular-nums">{formatMarks(s.credit)}</td>}
                    <td className="px-2 py-1.5 text-center font-semibold">{s.grade ?? "—"}</td>
                    {gpa && <td className="px-2 py-1.5 text-right tabular-nums">{formatGradePoint(s.gradePoint)}</td>}
                    <td className={cn("px-2 py-1.5", (s.status === "FAIL" || s.status === "ABSENT") && "font-medium text-destructive print:text-black")}>{RESULT_STATUS_LABELS[s.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div><dt className="text-xs text-muted-foreground print:text-black">Total</dt><dd className="font-semibold tabular-nums">{card.totalObtained !== null ? `${formatMarks(card.totalObtained)} / ${formatMarks(card.totalMaximum)}` : "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground print:text-black">Percentage</dt><dd className="font-semibold tabular-nums">{card.percentage !== null ? `${formatPercent(card.percentage, rules.percentageDecimals)}%` : "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground print:text-black">Grade</dt><dd className="font-semibold">{card.grade ?? "—"}</dd></div>
            {gpa && <div><dt className="text-xs text-muted-foreground print:text-black">GPA</dt><dd className="font-semibold tabular-nums">{card.gpa !== null ? formatGpa(card.gpa, rules.gpaDecimals) : "—"}</dd></div>}
            {card.rank !== null && <div><dt className="text-xs text-muted-foreground print:text-black">Position</dt><dd className="font-semibold tabular-nums">{card.rank}</dd></div>}
            <div><dt className="text-xs text-muted-foreground print:text-black">Result</dt><dd className="font-semibold">{RESULT_STATUS_LABELS[card.status]}</dd></div>
          </dl>

          {card.attendance && (
            <p className="mt-3 text-sm">
              Attendance: {card.attendance.attended} of {card.attendance.conducted} days{card.attendance.percentage !== null ? ` (${card.attendance.percentage.toFixed(1)}%)` : ""}
            </p>
          )}
          {card.breakdown.notes.length > 0 && <p className="mt-2 text-xs text-muted-foreground print:text-black">{card.breakdown.notes.join(" ")}</p>}
        </>
      )}

      <div className="mt-12 grid grid-cols-3 gap-6 text-center text-xs">
        {["Class teacher", "Examination officer", "Principal / Head"].map((role) => (
          <div key={role} className="border-t pt-1">{role}</div>
        ))}
      </div>

      <footer className="mt-6 flex flex-wrap justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground print:text-black">
        <span>
          {card.publication ? `Published ${formatDateTime(card.publication.publishedAt)} · version ${card.publication.version}` : `Preview generated ${formatDateTime(new Date())}`}
        </span>
        {(showInternal || card.official) && (
          <span>
            Rules: {rules.policy} · {rules.scale} v{rules.scaleVersion}{gpa ? ` · ${GPA_METHOD_LABELS[rules.gpaMethod as keyof typeof GPA_METHOD_LABELS]}` : ""}
          </span>
        )}
      </footer>
    </article>
  )
}
