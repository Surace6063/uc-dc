"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react"

import { useCan } from "@/components/shared/session-provider"
import { Pill, tone } from "@/components/shared/status-pill"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StatusPill } from "@/features/classes/components/classes-list"
import { OccupancyBar } from "@/features/classes/components/occupancy"
import { Roster, type PromotionStructure } from "@/features/classes/components/roster"
import { SectionDialog, useSectionArchive } from "@/features/classes/components/section-dialog"
import {
  ClassTeacherCard,
  SubjectTeachersPanel,
  type Subjects,
  type Teachers,
} from "@/features/classes/components/teacher-panels"
import { MEDIUM_LABELS, SHIFT_LABELS } from "@/features/classes/constants"
import { ENROLLMENT_STATUS_LABELS } from "@/features/students/constants"
import { teacherName } from "@/features/teachers/constants"
import { useUrlFilters } from "@/hooks/use-url-filters"
import { GROUPING_LABELS } from "@/lib/education/presets"
import type { EnrollmentStatus } from "@/lib/generated/prisma/enums"
import type { AcademicYearOption, ClassDetailData, ClassHistory } from "@/services/classes/class-service"

type Section = ClassDetailData["academicClass"]["sections"][number]
type Enrollment = ClassDetailData["enrollments"][number]

const TABS = ["overview", "sections", "students", "teachers", "history"] as const

export function YearSelect({ years, yearId }: { years: AcademicYearOption[]; yearId: string | null }) {
  const { setParams } = useUrlFilters()
  if (years.length === 0) return null
  return (
    <NativeSelect value={yearId ?? ""} onChange={(e) => setParams({ year: e.target.value })} aria-label="Academic year">
      {years.map((y) => (
        <NativeSelectOption key={y.id} value={y.id}>
          {y.name}
          {y.isCurrent ? " (current)" : ""}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

export function countStudents(enrollments: Enrollment[]) {
  const active = enrollments.filter((e) => e.status === "ACTIVE")
  return {
    total: active.length,
    girls: active.filter((e) => e.student.gender === "FEMALE").length,
    boys: active.filter((e) => e.student.gender === "MALE").length,
    onHold: enrollments.length - active.length,
  }
}

export function sectionDetails(s: Pick<Section, "shift" | "medium" | "room">) {
  return [s.shift && `${SHIFT_LABELS[s.shift]} shift`, s.medium && `${MEDIUM_LABELS[s.medium]} medium`, s.room && `Room ${s.room}`]
    .filter(Boolean)
    .join(" · ")
}

export function NoYear() {
  return (
    <Empty className="rounded-xl border border-dashed py-12">
      <EmptyHeader>
        <EmptyTitle>No academic year</EmptyTitle>
        <EmptyDescription>
          Add an academic year (e.g. 2082/83) under{" "}
          <Link href="/dashboard/academics?tab=years" className="underline underline-offset-2">
            Education structure
          </Link>{" "}
          to place students and teachers.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function ClassDetail({
  detail,
  history,
  years,
  yearId,
  structure,
  subjects,
  teachers,
  canSeeStudents,
  canAssignTeachers,
}: {
  detail: ClassDetailData
  history: ClassHistory
  years: AcademicYearOption[]
  yearId: string | null
  structure: PromotionStructure
  subjects: Subjects
  teachers: Teachers | null
  canSeeStudents: boolean
  canAssignTeachers: boolean
}) {
  const { searchParams, setParams, pending } = useUrlFilters()
  const { academicClass, enrollments, assignments } = detail
  const requestedTab = searchParams.get("tab") ?? ""
  const tab = (TABS as readonly string[]).includes(requestedTab) ? requestedTab : "overview"
  const year = years.find((y) => y.id === yearId)
  const readOnly = !year || year.status === "ARCHIVED"
  const sectionParam = searchParams.get("section") ?? ""
  const scope = sectionParam === "none" || academicClass.sections.some((s) => s.id === sectionParam) ? sectionParam : ""
  const sectionHref = (id: string) =>
    `/dashboard/classes/${academicClass.id}/sections/${id}${yearId ? `?year=${yearId}` : ""}`
  const canManageTeachers = canAssignTeachers && !readOnly && !academicClass.archivedAt
  const liveSections = academicClass.sections.filter((s) => !s.archivedAt)

  return (
    <div className="flex flex-col gap-6" aria-busy={pending}>
      {academicClass.archivedAt && (
        <p className={`rounded-lg px-3 py-2 text-sm ${tone.muted}`}>
          This class is archived. Its history is kept, but it takes no new students or teachers.
        </p>
      )}
      {year?.status === "ARCHIVED" && (
        <p className={`rounded-lg px-3 py-2 text-sm ${tone.muted}`}>
          {year.name} is archived; its placements can be viewed but not changed.
        </p>
      )}

      <Tabs value={tab} onValueChange={(value) => setParams({ tab: value === "overview" ? null : String(value) })}>
        <div className="overflow-x-auto">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sections">Sections ({liveSections.length})</TabsTrigger>
            {canSeeStudents && <TabsTrigger value="students">Students ({enrollments.length})</TabsTrigger>}
            <TabsTrigger value="teachers">Teachers</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-5 flex flex-col gap-6">
          <Overview detail={detail} yearName={year?.name ?? null} canSeeStudents={canSeeStudents} sectionHref={sectionHref} />
        </TabsContent>

        <TabsContent value="sections" className="mt-5">
          <SectionsPanel detail={detail} sectionHref={sectionHref} canSeeStudents={canSeeStudents} />
        </TabsContent>

        {canSeeStudents && (
          <TabsContent value="students" className="mt-5">
            {yearId ? (
              <Roster
                key={`${yearId}:${scope}`}
                detail={detail}
                yearId={yearId}
                years={years}
                scope={scope}
                onScopeChange={(value) => setParams({ section: value || null })}
                readOnly={readOnly}
                structure={structure}
              />
            ) : (
              <NoYear />
            )}
          </TabsContent>
        )}

        <TabsContent value="teachers" className="mt-5 flex flex-col gap-6">
          {yearId ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(liveSections.length ? liveSections : [null]).map((s) => (
                  <div key={s?.id ?? "class"} className="grid gap-1.5">
                    <p className="text-sm font-medium">{s ? `Section ${s.name}` : academicClass.name}</p>
                    <ClassTeacherCard
                      classId={academicClass.id}
                      sectionId={s?.id ?? null}
                      yearId={yearId}
                      assignment={assignments.find((a) => a.role === "CLASS_TEACHER" && a.sectionId === (s?.id ?? null))}
                      teachers={teachers}
                      canManage={canManageTeachers}
                    />
                  </div>
                ))}
              </div>
              <SubjectTeachersPanel
                classId={academicClass.id}
                yearId={yearId}
                sections={academicClass.sections}
                assignments={assignments}
                teachers={teachers}
                subjects={subjects}
                canManage={canManageTeachers}
              />
            </>
          ) : (
            <NoYear />
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-5">
          <HistoryPanel history={history} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

// ---------------------------------------------------------------- overview

function Overview({
  detail,
  yearName,
  canSeeStudents,
  sectionHref,
}: {
  detail: ClassDetailData
  yearName: string | null
  canSeeStudents: boolean
  sectionHref: (id: string) => string
}) {
  const { academicClass: c, enrollments, assignments } = detail
  const sections = c.sections.filter((s) => !s.archivedAt)
  const counts = countStudents(enrollments)
  const capacity = c.capacity ?? (sections.reduce((n, s) => n + (s.capacity ?? 0), 0) || null)
  const slots = sections.length || 1
  const withTeacher = sections.length
    ? sections.filter((s) => assignments.some((a) => a.role === "CLASS_TEACHER" && a.sectionId === s.id)).length
    : assignments.some((a) => a.role === "CLASS_TEACHER" && a.sectionId === null)
      ? 1
      : 0
  const unsectioned = enrollments.filter((e) => e.sectionId === null).length

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canSeeStudents && (
          <Card className="gap-1 p-4">
            <p className="text-sm text-muted-foreground">Students{yearName ? ` · ${yearName}` : ""}</p>
            <p className="text-2xl font-semibold tabular-nums">{counts.total}</p>
            <p className="text-xs text-muted-foreground">
              {counts.girls} girls · {counts.boys} boys{counts.onHold ? ` · ${counts.onHold} on hold` : ""}
            </p>
          </Card>
        )}
        <Card className="gap-2 p-4">
          <p className="text-sm text-muted-foreground">Seats</p>
          {canSeeStudents ? (
            <OccupancyBar enrolled={counts.total} capacity={capacity} />
          ) : (
            <p className="text-2xl font-semibold tabular-nums">{capacity ?? "—"}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {c.capacity ? "Class capacity" : sections.length ? "Sum of section capacities" : "No capacity set"}
          </p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-sm text-muted-foreground">Sections</p>
          <p className="text-2xl font-semibold tabular-nums">{sections.length || "None"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {sections.map((s) => s.name).join(", ") || "Not divided into sections"}
          </p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-sm text-muted-foreground">Class teachers</p>
          <p className="text-2xl font-semibold tabular-nums">
            {withTeacher}/{slots}
          </p>
          <p className="text-xs text-muted-foreground">{sections.length ? "Sections with a class teacher" : "Assigned"}</p>
        </Card>
      </div>

      <Card className="gap-4 p-5">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Class details</h2>
          <StatusPill isActive={c.isActive} archivedAt={c.archivedAt} />
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Education level" value={c.educationLevel.name} />
          <Field label="Program" value={c.program ? `${c.program.name} (${c.program.code})` : null} />
          <Field label="Code" value={c.code} />
          <Field label="Nepali name" value={c.localName} />
          <Field label="Type" value={GROUPING_LABELS[c.kind]} />
          <Field label="Order" value={c.sequence} />
          <Field label="Class capacity" value={c.capacity} />
          <Field label="Description" value={c.description} />
        </dl>
      </Card>

      {sections.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((s) => {
            const sc = countStudents(enrollments.filter((e) => e.sectionId === s.id))
            const teacher = assignments.find((a) => a.role === "CLASS_TEACHER" && a.sectionId === s.id)
            return (
              <Link
                key={s.id}
                href={sectionHref(s.id)}
                className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">Section {s.name}</p>
                    <p className="text-xs text-muted-foreground">{sectionDetails(s) || "No shift, medium or room set"}</p>
                  </div>
                  {!s.isActive && <Pill className={tone.amber}>Inactive</Pill>}
                </div>
                <p className="text-sm">
                  {teacher ? (
                    <>
                      <span className="text-muted-foreground">Class teacher: </span>
                      {teacherName(teacher.teacher)}
                    </>
                  ) : (
                    <span className="text-muted-foreground">No class teacher</span>
                  )}
                </p>
                {canSeeStudents && (
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {sc.girls} girls · {sc.boys} boys
                    </span>
                    <div className="w-28">
                      <OccupancyBar enrolled={sc.total} capacity={s.capacity} />
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
      {canSeeStudents && sections.length > 0 && unsectioned > 0 && (
        <p className={`rounded-lg px-3 py-2 text-sm ${tone.amber}`}>
          {unsectioned} student{unsectioned === 1 ? " is" : "s are"} in this class without a section. On the Students
          tab, choose “No section”, select them and use Move.
        </p>
      )}
    </>
  )
}

// ---------------------------------------------------------------- sections

function SectionsPanel({
  detail,
  sectionHref,
  canSeeStudents,
}: {
  detail: ClassDetailData
  sectionHref: (id: string) => string
  canSeeStudents: boolean
}) {
  const { academicClass: c, enrollments, assignments } = detail
  const canManage = useCan("classes.manage") && !c.archivedAt
  const [editing, setEditing] = React.useState<Section | "new" | null>(null)
  const archive = useSectionArchive()
  const nextSortOrder = c.sections.reduce((max, s) => Math.max(max, s.sortOrder), -10) + 10

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="font-semibold">Sections</h2>
          <p className="text-xs text-muted-foreground">
            Optional. A section belongs to this class across years; students are placed in it for each year.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            Add section
          </Button>
        )}
      </div>
      {c.sections.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">This class isn&apos;t divided into sections.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Section</TableHead>
                <TableHead>Shift · medium · room</TableHead>
                <TableHead>Class teacher</TableHead>
                {canSeeStudents && <TableHead className="w-44">Seats</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="w-12 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.sections.map((s) => {
                const teacher = assignments.find((a) => a.role === "CLASS_TEACHER" && a.sectionId === s.id)
                const count = countStudents(enrollments.filter((e) => e.sectionId === s.id))
                return (
                  <TableRow key={s.id} className={s.archivedAt ? "opacity-70" : undefined}>
                    <TableCell className="pl-4">
                      <Link href={sectionHref(s.id)} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                      {s.code && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{s.code}</span>}
                    </TableCell>
                    <TableCell className="text-sm">{sectionDetails(s) || "—"}</TableCell>
                    <TableCell>
                      {teacher ? (
                        teacherName(teacher.teacher)
                      ) : (
                        <span className="text-xs text-muted-foreground">Not assigned</span>
                      )}
                    </TableCell>
                    {canSeeStudents && (
                      <TableCell>
                        <OccupancyBar enrolled={count.total} capacity={s.capacity} />
                      </TableCell>
                    )}
                    <TableCell>
                      <StatusPill isActive={s.isActive} archivedAt={s.archivedAt} />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for section ${s.name}`} />}
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem render={<Link href={sectionHref(s.id)} />}>
                            <EyeIcon />
                            Open
                          </DropdownMenuItem>
                          {canManage && !s.archivedAt && (
                            <DropdownMenuItem onClick={() => setEditing(s)}>
                              <PencilIcon />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {canManage && (
                            <DropdownMenuItem onClick={() => archive.ask(s)}>
                              {s.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                              {s.archivedAt ? "Restore" : "Archive"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {editing && (
        <SectionDialog
          classId={c.id}
          section={editing === "new" ? null : editing}
          nextSortOrder={nextSortOrder}
          onClose={() => setEditing(null)}
        />
      )}
      {archive.dialog}
    </Card>
  )
}

// ----------------------------------------------------------------- history

const HISTORY_COLUMNS: EnrollmentStatus[] = ["ACTIVE", "PROMOTED", "DETAINED", "COMPLETED", "TRANSFERRED", "WITHDRAWN"]

function HistoryPanel({ history }: { history: ClassHistory }) {
  if (history.length === 0) {
    return (
      <Empty className="rounded-xl border border-dashed py-12">
        <EmptyHeader>
          <EmptyTitle>No history yet</EmptyTitle>
          <EmptyDescription>Years appear here once students are enrolled or class teachers are assigned.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">Academic-year history</h2>
        <p className="text-xs text-muted-foreground">
          Placements are closed, never overwritten, so each year keeps who was here and how they left.
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">Year</TableHead>
              <TableHead className="text-right">Students</TableHead>
              {HISTORY_COLUMNS.map((s) => (
                <TableHead key={s} className="text-right">
                  {ENROLLMENT_STATUS_LABELS[s]}
                </TableHead>
              ))}
              <TableHead className="pr-4">Class teachers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((y) => (
              <TableRow key={y.id}>
                <TableCell className="pl-4 font-medium whitespace-nowrap">
                  {y.name}
                  {y.isCurrent && <span className="ml-1.5 text-xs text-muted-foreground">(current)</span>}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{y.total}</TableCell>
                {HISTORY_COLUMNS.map((s) => (
                  <TableCell key={s} className="text-right text-muted-foreground tabular-nums">
                    {y.byStatus[s] ?? "—"}
                  </TableCell>
                ))}
                <TableCell className="pr-4 text-sm">
                  {y.classTeachers.length === 0
                    ? "—"
                    : y.classTeachers.map((t, i) => (
                        <span key={i} className="block whitespace-nowrap">
                          {teacherName(t.teacher)}
                          {t.section ? ` (${t.section.name})` : ""}
                          {t.status !== "ACTIVE" && t.endDate ? (
                            <span className="text-xs text-muted-foreground"> until {t.endDate}</span>
                          ) : null}
                        </span>
                      ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}
