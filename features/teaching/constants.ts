import type {
  ClassAssignmentStatus,
  LessonPlanStatus,
  MaterialKind,
  NoticeAudience,
  SubmissionStatus,
} from "@/lib/generated/prisma/enums"

// Labels and limits for the teaching workspace: timetable, lesson plans,
// teaching materials, class assignments and notices.

// 0 = Sunday … 6 = Saturday. Nepali institutions usually teach Sunday to
// Friday; Saturday is shown only when it has periods.
export const WEEKDAYS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
] as const

export const SCHOOL_WEEK = [0, 1, 2, 3, 4, 5] as const

export const weekdayLabel = (day: number) => WEEKDAYS.find((d) => d.value === day)?.label ?? "—"

export const LESSON_PLAN_STATUS_LABELS: Record<LessonPlanStatus, string> = {
  DRAFT: "Draft",
  PLANNED: "Planned",
  DELIVERED: "Delivered",
}

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  FILE: "File",
  LINK: "Link",
}

export const CLASS_ASSIGNMENT_STATUS_LABELS: Record<ClassAssignmentStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CLOSED: "Closed",
}

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  SUBMITTED: "Awaiting review",
  REVIEWED: "Reviewed",
  RETURNED: "Returned for changes",
}

export const NOTICE_AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  EVERYONE: "Everyone",
  STAFF: "Teachers & staff",
  STUDENTS: "All students",
  PARENTS: "All parents",
  CLASS: "One class",
}

// Files teachers upload (materials) and that are attached to submissions.
// Types are checked from the file's content, not its name.
// Under the proxy's 10 MB request limit, leaving room for the form.
export const MATERIAL_MAX_BYTES = 8 * 1024 * 1024
export const MATERIAL_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const

// "Grade 10 · A · Mathematics"
export function placeLabel(p: { class?: { name: string } | null; section?: { name: string } | null; subject?: { name: string } | null }) {
  return [p.class?.name, p.section && `Section ${p.section.name}`, p.subject?.name].filter(Boolean).join(" · ")
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return ""
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
