import "server-only"

import { addCounts, summarize, type AttendanceSummary, type StatusCounts } from "@/features/attendance/calculation"
import type { AuthContext } from "@/lib/authorization/context"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { getPolicy, type Policy } from "@/services/attendance/policy-service"
import { countedSessionWhere } from "@/services/attendance/session-service"

// The single place attendance figures come from. Records are counted by
// status in the database (aggregation, never by loading history), then
// features/attendance/calculation.ts turns counts into percentages with the
// organisation's policy. Only submitted and locked registers count; drafts
// are work in progress.
type Ctx = Pick<AuthContext, "organization">

type StudentKey = "studentId" | "classId" | "sectionId" | "subjectOfferingId" | "academicYearId" | "date"

// Status counts grouped by one or more keys, as a map from the joined key to
// counts. `where` is always narrowed to the organisation and counted
// registers here, whatever the caller passes.
export async function countStudentStatuses<K extends StudentKey>(
  ctx: Ctx,
  where: Prisma.StudentAttendanceWhereInput,
  by: K[]
): Promise<Map<string, { key: Record<K, unknown>; counts: StatusCounts }>> {
  const rows = await prisma.studentAttendance.groupBy({
    by: [...by, "status"] as Prisma.StudentAttendanceScalarFieldEnum[],
    where: { AND: [{ organizationId: ctx.organization.id, session: countedSessionWhere }, where] },
    _count: { _all: true },
  })
  const out = new Map<string, { key: Record<K, unknown>; counts: StatusCounts }>()
  for (const row of rows as unknown as (Record<K, unknown> & { status: Prisma.StudentAttendanceGroupByOutputType["status"]; _count: { _all: number } })[]) {
    const key = Object.fromEntries(by.map((k) => [k, row[k] instanceof Date ? (row[k] as Date).toISOString().slice(0, 10) : row[k]])) as Record<K, unknown>
    const id = by.map((k) => String(key[k] ?? "")).join("|")
    const entry = out.get(id) ?? { key, counts: {} }
    addCounts(entry.counts, row.status, row._count._all)
    out.set(id, entry)
  }
  return out
}

export async function summarizeStudents(ctx: Ctx, where: Prisma.StudentAttendanceWhereInput, policy?: Policy): Promise<AttendanceSummary> {
  const p = policy ?? (await getPolicy(ctx))
  const counts = await countStudentStatuses(ctx, where, [])
  return summarize(counts.get("")?.counts ?? {}, p)
}

type EmployeeKey = "employeeType" | "teacherId" | "staffId" | "date"

export async function countEmployeeStatuses<K extends EmployeeKey>(
  ctx: Ctx,
  where: Prisma.EmployeeAttendanceWhereInput,
  by: K[]
): Promise<Map<string, { key: Record<K, unknown>; counts: StatusCounts }>> {
  const rows = await prisma.employeeAttendance.groupBy({
    by: [...by, "status"] as Prisma.EmployeeAttendanceScalarFieldEnum[],
    where: { AND: [{ organizationId: ctx.organization.id }, where] },
    _count: { _all: true },
  })
  const out = new Map<string, { key: Record<K, unknown>; counts: StatusCounts }>()
  for (const row of rows as unknown as (Record<K, unknown> & { status: Prisma.EmployeeAttendanceGroupByOutputType["status"]; _count: { _all: number } })[]) {
    const key = Object.fromEntries(by.map((k) => [k, row[k] instanceof Date ? (row[k] as Date).toISOString().slice(0, 10) : row[k]])) as Record<K, unknown>
    const id = by.map((k) => String(key[k] ?? "")).join("|")
    const entry = out.get(id) ?? { key, counts: {} }
    addCounts(entry.counts, row.status, row._count._all)
    out.set(id, entry)
  }
  return out
}
