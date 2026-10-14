import { z } from "zod"

import { minutesOf } from "@/features/attendance/constants"
import { LessonPlanStatus, NoticeAudience } from "@/lib/generated/prisma/enums"
import { dateString, optionalDate, optionalDecimal, optionalId, optionalText, requiredId, requiredText } from "@/lib/validation"

// Shared by the teaching forms (client) and services (server re-validates).

const time = (message: string) => z.string(message).regex(/^([01]\d|2[0-3]):[0-5]\d$/, message)

// Where something belongs: a class (or one section) in an academic year,
// usually in a subject.
const place = {
  academicYearId: requiredId("Choose the academic year."),
  classId: requiredId("Choose the class."),
  sectionId: optionalId,
}

const subjectPlace = { ...place, subjectId: requiredId("Choose the subject.") }

// ------------------------------------------------------------ timetable

export const timetableSlotSchema = z
  .object({
    ...place,
    subjectId: optionalId,
    // Set by coordinators; a teacher's own periods are always theirs.
    teacherId: optionalId,
    dayOfWeek: z.coerce.number("Choose the day.").int().min(0, "Choose the day.").max(6, "Choose the day."),
    startTime: time("Enter the start time as HH:MM."),
    endTime: time("Enter the end time as HH:MM."),
    room: optionalText(40),
    note: optionalText(200),
  })
  .refine((v) => minutesOf(v.endTime) > minutesOf(v.startTime), { path: ["endTime"], message: "The period must end after it starts." })

// ------------------------------------------------------------ lesson plans

export const lessonPlanSchema = z.object({
  ...subjectPlace,
  title: requiredText("Enter a title for the lesson.", 150),
  topic: optionalText(150),
  plannedDate: dateString("Choose the date of the lesson."),
  periods: z.coerce.number().int("Enter a whole number.").min(1, "At least one period.").max(20, "At most 20 periods."),
  objectives: optionalText(4000),
  activities: optionalText(4000),
  resources: optionalText(2000),
  assessment: optionalText(2000),
  status: z.enum(LessonPlanStatus),
  reflection: optionalText(4000),
})

// ------------------------------------------------------------ materials

const yes = z.union([z.boolean(), z.enum(["true", "false", "on", "off", ""])]).transform((v) => v === true || v === "true" || v === "on")

export const materialSchema = z
  .object({
    ...subjectPlace,
    title: requiredText("Enter a title.", 150),
    description: optionalText(1000),
    kind: z.enum(["FILE", "LINK"]),
    url: optionalText(1000),
    sharedWithStudents: yes,
  })
  .superRefine((v, ctx) => {
    if (v.kind !== "LINK") return
    const parsed = v.url ? z.url({ protocol: /^https?$/ }).safeParse(v.url) : null
    if (!parsed?.success) ctx.addIssue({ code: "custom", path: ["url"], message: "Enter a web address starting with http:// or https://." })
  })

// ------------------------------------------------------------ class assignments

export const classAssignmentSchema = z.object({
  ...subjectPlace,
  title: requiredText("Enter a title.", 150),
  instructions: optionalText(5000),
  dueDate: dateString("Choose the due date."),
  dueTime: time("Enter the due time as HH:MM."),
  maxMarks: optionalDecimal(0.5, 1000),
  status: z.enum(["DRAFT", "PUBLISHED"]),
})

// Work handed in on paper, recorded by the teacher.
export const recordSubmissionSchema = z.object({
  studentId: requiredId("Choose the student."),
  submittedOn: optionalDate,
  content: optionalText(5000),
})

export const reviewSubmissionSchema = z.object({
  status: z.enum(["REVIEWED", "RETURNED"]),
  marks: optionalDecimal(0, 1000),
  feedback: optionalText(2000),
})

// ------------------------------------------------------------ notices

export const noticeSchema = z
  .object({
    title: requiredText("Enter a title.", 150),
    body: requiredText("Write the notice.", 5000),
    audience: z.enum(NoticeAudience),
    academicYearId: optionalId,
    classId: optionalId,
    sectionId: optionalId,
    pinned: yes,
    expiresOn: optionalDate,
  })
  .refine((v) => v.audience !== "CLASS" || v.classId, { path: ["classId"], message: "Choose the class." })

export type TimetableSlotInput = z.input<typeof timetableSlotSchema>
export type LessonPlanInput = z.input<typeof lessonPlanSchema>
export type MaterialInput = z.input<typeof materialSchema>
export type ClassAssignmentInput = z.input<typeof classAssignmentSchema>
export type NoticeInput = z.input<typeof noticeSchema>
