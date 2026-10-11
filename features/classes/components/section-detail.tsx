"use client"

import * as React from "react"
import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon } from "lucide-react"

import { useCan } from "@/components/shared/session-provider"
import { tone } from "@/components/shared/status-pill"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { NoYear, countStudents } from "@/features/classes/components/class-detail"
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
import type { AcademicYearOption, ClassDetailData } from "@/services/classes/class-service"

// One section in one academic year: details, class teacher, seats, roster
// and subject teachers. Uses the class's data narrowed to the section.
export function SectionDetail({
  detail,
  sectionId,
  years,
  yearId,
  structure,
  subjects,
  teachers,
  canSeeStudents,
  canAssignTeachers,
}: {
  detail: ClassDetailData
  sectionId: string
  years: AcademicYearOption[]
  yearId: string | null
  structure: PromotionStructure
  subjects: Subjects
  teachers: Teachers | null
  canSeeStudents: boolean
  canAssignTeachers: boolean
}) {
  const { academicClass, enrollments, assignments } = detail
  const section = academicClass.sections.find((s) => s.id === sectionId)!
  const canManage = useCan("classes.manage") && !academicClass.archivedAt
  const [editing, setEditing] = React.useState(false)
  const archive = useSectionArchive()
  const year = years.find((y) => y.id === yearId)
  const readOnly = !year || year.status === "ARCHIVED"
  const counts = countStudents(enrollments.filter((e) => e.sectionId === sectionId))
  const nextSortOrder = academicClass.sections.reduce((max, s) => Math.max(max, s.sortOrder), -10) + 10

  return (
    <div className="flex flex-col gap-6">
      {(section.archivedAt || academicClass.archivedAt) && (
        <p className={`rounded-lg px-3 py-2 text-sm ${tone.muted}`}>
          This {section.archivedAt ? "section" : "class"} is archived. Its history is kept, but it takes no new students.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {yearId ? (
          <ClassTeacherCard
            classId={academicClass.id}
            sectionId={section.id}
            yearId={yearId}
            assignment={assignments.find((a) => a.role === "CLASS_TEACHER" && a.sectionId === section.id)}
            teachers={teachers}
            canManage={canAssignTeachers && !readOnly && !section.archivedAt && !academicClass.archivedAt}
          />
        ) : (
          <Card className="p-4 text-sm text-muted-foreground">No academic year.</Card>
        )}

        <Card className="gap-2 p-4">
          <p className="text-sm text-muted-foreground">Students{year ? ` · ${year.name}` : ""}</p>
          {canSeeStudents ? (
            <>
              <p className="text-2xl font-semibold tabular-nums">{counts.total}</p>
              <p className="text-xs text-muted-foreground">
                {counts.girls} girls · {counts.boys} boys{counts.onHold ? ` · ${counts.onHold} on hold` : ""}
              </p>
              <OccupancyBar enrolled={counts.total} capacity={section.capacity} />
            </>
          ) : (
            <p className="text-sm">Capacity {section.capacity ?? "not set"}</p>
          )}
        </Card>

        <Card className="gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">Section details</p>
              <StatusPill isActive={section.isActive} archivedAt={section.archivedAt} />
            </div>
            {canManage && (
              <div className="flex gap-1">
                {!section.archivedAt && (
                  <Button size="icon-sm" variant="ghost" aria-label="Edit section" onClick={() => setEditing(true)}>
                    <PencilIcon />
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={section.archivedAt ? "Restore section" : "Archive section"}
                  onClick={() => archive.ask(section)}
                >
                  {section.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                </Button>
              </div>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Code</dt>
            <dd>{section.code ?? "—"}</dd>
            <dt className="text-muted-foreground">Shift</dt>
            <dd>{section.shift ? SHIFT_LABELS[section.shift] : "—"}</dd>
            <dt className="text-muted-foreground">Medium</dt>
            <dd>{section.medium ? MEDIUM_LABELS[section.medium] : "—"}</dd>
            <dt className="text-muted-foreground">Room</dt>
            <dd>{section.room ?? "—"}</dd>
            <dt className="text-muted-foreground">Capacity</dt>
            <dd>{section.capacity ?? "—"}</dd>
          </dl>
          {section.description && <p className="text-sm text-muted-foreground">{section.description}</p>}
        </Card>
      </div>

      {yearId ? (
        <>
          {canSeeStudents && (
            <Roster
              key={yearId}
              detail={detail}
              yearId={yearId}
              years={years}
              scope={section.id}
              readOnly={readOnly}
              structure={structure}
            />
          )}
          <SubjectTeachersPanel
            classId={academicClass.id}
            yearId={yearId}
            sections={academicClass.sections}
            sectionId={section.id}
            assignments={assignments}
            teachers={teachers}
            subjects={subjects}
            canManage={canAssignTeachers && !readOnly && !section.archivedAt && !academicClass.archivedAt}
          />
        </>
      ) : (
        <NoYear />
      )}

      {editing && (
        <SectionDialog
          classId={academicClass.id}
          section={section}
          nextSortOrder={nextSortOrder}
          onClose={() => setEditing(false)}
        />
      )}
      {archive.dialog}
    </div>
  )
}
