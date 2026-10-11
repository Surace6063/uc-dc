"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon, UserRoundCheckIcon, UserRoundXIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import type { z } from "zod"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { applyServerErrors, SelectField, TextField } from "@/components/shared/form-fields"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { FormDialog } from "@/features/academics/components/structure-kit"
import {
  addSubjectTeacherAction,
  endTeachingAssignmentAction,
  setClassTeacherAction,
} from "@/features/classes/actions"
import { classTeacherSchema, subjectTeacherSchema } from "@/features/classes/schemas"
import { teacherName } from "@/features/teachers/constants"
import type { ClassDetailData, listAssignableTeachers } from "@/services/classes/class-service"

type Assignment = ClassDetailData["assignments"][number]
type Section = ClassDetailData["academicClass"]["sections"][number]
export type Teachers = Awaited<ReturnType<typeof listAssignableTeachers>>
// Subjects offered to the class in the selected year.
export type Subjects = { id: string; name: string; code: string }[]

const today = () => new Date().toISOString().slice(0, 10)

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })

// Ends a teaching assignment after confirmation (kept in the teacher's history).
function useEndAssignment() {
  const router = useRouter()
  const [target, setTarget] = React.useState<{ id: string; title: string } | null>(null)
  const dialog = (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => !open && setTarget(null)}
      title={target?.title ?? ""}
      description="The assignment ends today and stays in the teacher's assignment history."
      confirmLabel="End assignment"
      destructive
      onConfirm={async () => {
        if (!target) return
        const result = await endTeachingAssignmentAction(target.id, { endDate: today(), endReason: "Ended from the class page" })
        if (!result.ok) {
          toast.add({ title: "Couldn't end the assignment", description: result.error, type: "error" })
          return false
        }
        toast.add({ title: "Assignment ended", type: "success" })
        router.refresh()
      }}
    />
  )
  return { confirmEnd: setTarget, dialog }
}

// --------------------------------------------------------- class teacher

// The class teacher (कक्षा शिक्षक) of one section, or of a class without
// sections, for the selected year.
export function ClassTeacherCard({
  classId,
  sectionId,
  yearId,
  assignment,
  teachers,
  canManage,
}: {
  classId: string
  sectionId: string | null
  yearId: string
  assignment: Assignment | undefined
  teachers: Teachers | null
  canManage: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const end = useEndAssignment()
  return (
    <Card className="gap-3 p-4">
      <p className="text-sm text-muted-foreground">Class teacher</p>
      {assignment ? (
        <div>
          <Link href={`/dashboard/teachers/${assignment.teacher.id}`} className="font-medium hover:underline">
            {teacherName(assignment.teacher)}
          </Link>
          <p className="text-xs text-muted-foreground">
            Since {formatDate(assignment.startDate)}
            {assignment.teacher.phone ? ` · ${assignment.teacher.phone}` : ""}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not assigned for this year.</p>
      )}
      {canManage && teachers && (
        <div className="mt-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <UserRoundCheckIcon data-icon="inline-start" />
            {assignment ? "Change" : "Assign"}
          </Button>
          {assignment && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => end.confirmEnd({ id: assignment.id, title: `Remove ${teacherName(assignment.teacher)} as class teacher?` })}
            >
              <UserRoundXIcon data-icon="inline-start" />
              Remove
            </Button>
          )}
        </div>
      )}
      {open && teachers && (
        <ClassTeacherDialog
          onClose={() => setOpen(false)}
          classId={classId}
          sectionId={sectionId}
          yearId={yearId}
          teachers={teachers}
          currentTeacherId={assignment?.teacher.id ?? null}
        />
      )}
      {end.dialog}
    </Card>
  )
}

function ClassTeacherDialog({
  onClose,
  classId,
  sectionId,
  yearId,
  teachers,
  currentTeacherId,
}: {
  onClose: () => void
  classId: string
  sectionId: string | null
  yearId: string
  teachers: Teachers
  currentTeacherId: string | null
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof classTeacherSchema>, unknown, z.output<typeof classTeacherSchema>>({
    resolver: zodResolver(classTeacherSchema),
    defaultValues: { academicYearId: yearId, classId, sectionId: sectionId ?? "", teacherId: "", startDate: today() },
  })

  const submit = form.handleSubmit(async (values) => {
    const result = await setClassTeacherAction(values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: "Class teacher assigned", type: "success" })
    onClose()
    router.refresh()
  })

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={currentTeacherId ? "Change class teacher" : "Assign class teacher"}
      description={
        currentTeacherId
          ? "The current class teacher's assignment ends on the start date below and stays in their history."
          : "The class teacher (कक्षा शिक्षक) looks after attendance, guardians and report cards for this class."
      }
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
      submitLabel="Assign"
    >
      <SelectField
        control={form.control}
        name="teacherId"
        label="Teacher"
        required
        placeholder="Choose a teacher"
        options={teachers
          .filter((t) => t.id !== currentTeacherId)
          .map((t) => ({ value: t.id, label: `${teacherName(t)} (${t.employeeId})` }))}
      />
      <TextField control={form.control} name="startDate" label="Start date" type="date" required />
    </FormDialog>
  )
}

// ------------------------------------------------------- subject teachers

// Subject teachers of a class: class-wide ones and, unless a section is
// given, those of every section.
export function SubjectTeachersPanel({
  classId,
  yearId,
  sections,
  sectionId,
  assignments,
  teachers,
  subjects,
  canManage,
}: {
  classId: string
  yearId: string
  sections: Section[]
  // A section page: only class-wide and that section's assignments.
  sectionId?: string
  assignments: Assignment[]
  teachers: Teachers | null
  subjects: Subjects
  canManage: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const end = useEndAssignment()
  const rows = assignments.filter(
    (a) => a.role !== "CLASS_TEACHER" && (!sectionId || a.sectionId === null || a.sectionId === sectionId)
  )
  const sectionName = (id: string | null) => (id ? sections.find((s) => s.id === id)?.name : null)
  const available = subjects

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="font-semibold">Subject teachers</h2>
        {canManage && teachers && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Assign
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          No subject teachers assigned for this year.
          {available.length === 0 && (
            <>
              {" "}This class has no subjects for this year yet; add them under{" "}
              <Link href={`/dashboard/subjects/class-subjects?year=${yearId}&class=${classId}`} className="underline underline-offset-2">
                Class subjects
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Subject</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Periods/week</TableHead>
                <TableHead>Since</TableHead>
                {canManage && <TableHead className="w-24 pr-4" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="pl-4 font-medium">
                    {a.subject?.name ?? (a.role === "CO_TEACHER" ? "Co-teacher" : "Teaching")}
                    {a.subject?.code && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{a.subject.code}</span>}
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/teachers/${a.teacher.id}`} className="hover:underline">
                      {teacherName(a.teacher)}
                    </Link>
                  </TableCell>
                  <TableCell>{sectionName(a.sectionId) ? `Section ${sectionName(a.sectionId)}` : "Whole class"}</TableCell>
                  <TableCell className="tabular-nums">{a.weeklyPeriods ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(a.startDate)}</TableCell>
                  {canManage && (
                    <TableCell className="pr-4 text-right">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          end.confirmEnd({
                            id: a.id,
                            title: `End ${teacherName(a.teacher)}'s ${a.subject?.name ?? "teaching"} assignment?`,
                          })
                        }
                      >
                        End
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {open && teachers && (
        <SubjectTeacherDialog
          onClose={() => setOpen(false)}
          classId={classId}
          yearId={yearId}
          sections={sections}
          sectionId={sectionId ?? ""}
          teachers={teachers}
          subjects={available}
        />
      )}
      {end.dialog}
    </Card>
  )
}

function SubjectTeacherDialog({
  onClose,
  classId,
  yearId,
  sections,
  sectionId,
  teachers,
  subjects,
}: {
  onClose: () => void
  classId: string
  yearId: string
  sections: Section[]
  sectionId: string
  teachers: Teachers
  subjects: Subjects
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<z.input<typeof subjectTeacherSchema>, unknown, z.output<typeof subjectTeacherSchema>>({
    resolver: zodResolver(subjectTeacherSchema),
    defaultValues: {
      academicYearId: yearId,
      classId,
      sectionId,
      teacherId: "",
      subjectId: "",
      weeklyPeriods: "",
      startDate: today(),
    },
  })

  const submit = form.handleSubmit(async (values) => {
    const result = await addSubjectTeacherAction(values)
    if (!result.ok) {
      setError(applyServerErrors(form, result))
      return
    }
    toast.add({ title: "Subject teacher assigned", type: "success" })
    onClose()
    router.refresh()
  })

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Assign a subject teacher"
      description="Recorded as a teaching assignment for this academic year; it also appears on the teacher's profile."
      pending={form.formState.isSubmitting}
      error={error}
      onSubmit={submit}
      submitLabel="Assign"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="subjectId"
          label="Subject"
          required
          placeholder={subjects.length ? "Choose a subject" : "No subjects offered this year"}
          options={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
        />
        <SelectField
          control={form.control}
          name="teacherId"
          label="Teacher"
          required
          placeholder="Choose a teacher"
          options={teachers.map((t) => ({ value: t.id, label: `${teacherName(t)} (${t.employeeId})` }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {sections.length > 0 && (
          <SelectField
            control={form.control}
            name="sectionId"
            label="Section"
            placeholder="Whole class"
            options={sections
              .filter((s) => s.isActive && !s.archivedAt)
              .map((s) => ({ value: s.id, label: `Section ${s.name}` }))}
          />
        )}
        <TextField control={form.control} name="weeklyPeriods" label="Periods per week" type="number" min={0} max={60} />
        <TextField control={form.control} name="startDate" label="Start date" type="date" required />
      </div>
    </FormDialog>
  )
}
