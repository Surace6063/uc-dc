import Link from "next/link"
import { z } from "zod"

import { ContentSection } from "@/components/shared/content-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AttendanceStatusBadge } from "@/features/attendance/components/attendance-nav"
import { ATTENDANCE_STATUS_LABELS, formatDay } from "@/features/attendance/constants"
import type { AuthContext } from "@/lib/authorization/context"
import { AttendanceStatus } from "@/lib/generated/prisma/enums"
import { myAttendanceHistory } from "@/services/student-portal/record-service"

// The student's own attendance records, filtered by date and status.
// Filters are a plain GET form, so they work without JavaScript.

const PAGE_SIZE = 25
const day = z.iso.date().optional().catch(undefined)
const schema = z.object({
  from: day,
  to: day,
  status: z.enum(AttendanceStatus).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
})

export async function StudentAttendanceHistory({ context, params }: { context: AuthContext; params: Record<string, string | undefined> }) {
  const f = schema.parse(params)
  const data = await myAttendanceHistory(context, { ...f, pageSize: PAGE_SIZE })
  if (!data) return null
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const href = (page: number) => `?${new URLSearchParams({ ...(f.from && { from: f.from }), ...(f.to && { to: f.to }), ...(f.status && { status: f.status }), ...(page > 1 && { page: String(page) }) })}#history`

  return (
    <ContentSection title="Attendance history" description="Every register you were marked in, newest first." className="scroll-mt-20">
      <form id="history" className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="h-from" className="text-xs text-muted-foreground">From</Label>
          <Input id="h-from" name="from" type="date" defaultValue={f.from ?? ""} className="h-9" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="h-to" className="text-xs text-muted-foreground">To</Label>
          <Input id="h-to" name="to" type="date" defaultValue={f.to ?? ""} className="h-9" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="h-status" className="text-xs text-muted-foreground">Status</Label>
          <NativeSelect id="h-status" name="status" defaultValue={f.status ?? ""} className="min-w-36">
            <NativeSelectOption value="">Any status</NativeSelectOption>
            {Object.entries(ATTENDANCE_STATUS_LABELS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" size="sm" variant="outline">Apply</Button>
        {(f.from || f.to || f.status) && <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="?#history" />}>Clear</Button>}
      </form>

      <p className="text-sm text-muted-foreground">
        {data.total.toLocaleString()} record{data.total === 1 ? "" : "s"}
        {Object.entries(data.counts).length > 0 && ": " + Object.entries(data.counts).map(([k, n]) => `${n} ${ATTENDANCE_STATUS_LABELS[k as keyof typeof ATTENDANCE_STATUS_LABELS].toLowerCase()}`).join(", ")}
      </p>

      {data.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No attendance records for these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>Register</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4">Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 whitespace-nowrap">{formatDay(r.date.toISOString().slice(0, 10))}</TableCell>
                  <TableCell>{r.session.subjectOffering?.subject.name ?? (r.sessionType === "DAILY" ? "Daily attendance" : `Period ${r.session.slot}`)}</TableCell>
                  <TableCell>
                    <AttendanceStatusBadge status={r.status} />
                    {r.status === "LATE" && r.lateMinutes ? <span className="ml-1 text-xs text-muted-foreground">{r.lateMinutes} min</span> : null}
                  </TableCell>
                  <TableCell className="pr-4 text-sm text-muted-foreground">{r.reason ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Attendance pages" className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Page {f.page} of {pages}</span>
          <span className="flex gap-2">
            <Button size="sm" variant="outline" disabled={f.page <= 1} nativeButton={false} render={<Link href={href(f.page - 1)} aria-disabled={f.page <= 1} />}>Previous</Button>
            <Button size="sm" variant="outline" disabled={f.page >= pages} nativeButton={false} render={<Link href={href(f.page + 1)} aria-disabled={f.page >= pages} />}>Next</Button>
          </span>
        </nav>
      )}
    </ContentSection>
  )
}
