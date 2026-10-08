// The permission catalogue. Code checks permissions, never role names, so
// organisations can later build custom roles from these same keys.
// The Permission table is synced from this list (see syncPermissions).
export const PERMISSIONS = {
  "dashboard.view": "View the organisation dashboard",

  "students.view": "View students",
  "students.create": "Add students",
  "students.update": "Edit students",
  "students.delete": "Remove students",

  "teachers.view": "View teachers",
  "teachers.create": "Add teachers",
  "teachers.update": "Edit teachers",
  "teachers.delete": "Remove teachers",

  "academics.view": "View classes, subjects and programmes",

  "courses.view": "View LMS courses",
  "courses.create": "Create LMS courses",
  "courses.update": "Edit LMS courses",
  "courses.delete": "Delete LMS courses",

  "assignments.view": "View assignments",
  "assignments.create": "Create assignments",
  "assignments.update": "Edit assignments",
  "assignments.delete": "Delete assignments",
  "assignments.grade": "Grade assignments",

  "attendance.view": "View attendance",
  "attendance.create": "Record attendance",
  "attendance.update": "Correct attendance",

  "exams.view": "View exams and results",
  "exams.create": "Create exams",
  "exams.update": "Edit exams",
  "exams.grade": "Enter and publish marks",

  "finance.view": "View fees and payments",
  "finance.create": "Create invoices and record payments",
  "finance.update": "Edit invoices and payments",

  "reports.view": "View reports and analytics",

  // Modules not built yet: only view access for now. Add create/update/
  // delete keys when each module is built.
  "staff.view": "View non-teaching staff",
  "parents.view": "View parents and guardians",
  "classes.view": "View classes and sections",
  "subjects.view": "View subjects and courses",
  "quizzes.view": "View quizzes and assessments",
  "results.view": "View grades and results",
  "communication.view": "Use messaging and announcements",
  "events.view": "View events and the calendar",
  "documents.view": "View documents",
  "library.view": "View the library",
  "transport.view": "View transport",
  "hostel.view": "View hostel",
  "notifications.view": "View notifications",
  "ai.use": "Use AI features",
  "settings.view": "View organisation settings",
  "audit.view": "View security and audit logs",
  "subscription.view": "View subscription and usage",

  "organization.view": "View the organisation profile",
  "organization.update": "Edit the organisation profile",

  "members.view": "View organisation members",
  "members.create": "Invite members",
  "members.update": "Change members' roles",
  "members.delete": "Remove members",

  "roles.view": "View roles",
  "roles.create": "Create roles",
  "roles.update": "Edit roles and their permissions",
  "roles.delete": "Delete roles",
} as const

export type PermissionKey = keyof typeof PERMISSIONS

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[]

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.hasOwn(PERMISSIONS, value)
}

type DefaultRole = {
  slug: string
  name: string
  description: string
  permissions: readonly PermissionKey[]
}

const all = PERMISSION_KEYS

// Roles every new organisation starts with. Organisations can edit these
// later; they are only a starting point.
export const DEFAULT_ROLES = [
  {
    slug: "owner",
    name: "Owner",
    description: "Full control of the organisation.",
    permissions: all,
  },
  {
    slug: "admin",
    name: "Organization Admin",
    description: "Runs the organisation day to day. Cannot change roles.",
    permissions: all.filter(
      (key) => !key.startsWith("roles.") || key === "roles.view"
    ),
  },
  {
    slug: "teacher",
    name: "Teacher",
    description: "Teaches classes, runs courses, records attendance and marks.",
    permissions: [
      "dashboard.view",
      "students.view",
      "teachers.view",
      "academics.view",
      "courses.view",
      "courses.create",
      "courses.update",
      "assignments.view",
      "assignments.create",
      "assignments.update",
      "assignments.delete",
      "assignments.grade",
      "attendance.view",
      "attendance.create",
      "attendance.update",
      "exams.view",
      "exams.create",
      "exams.update",
      "exams.grade",
      "classes.view",
      "subjects.view",
      "quizzes.view",
      "results.view",
      "communication.view",
      "events.view",
      "documents.view",
      "library.view",
      "notifications.view",
      "ai.use",
    ],
  },
  {
    // Students see their own records; record-level scoping (only *my*
    // attendance) belongs in each module's service, not in permissions.
    slug: "student",
    name: "Student",
    description: "Learns, submits work and sees their own results.",
    permissions: [
      "dashboard.view",
      "academics.view",
      "courses.view",
      "assignments.view",
      "attendance.view",
      "exams.view",
      "subjects.view",
      "quizzes.view",
      "results.view",
      "communication.view",
      "events.view",
      "documents.view",
      "library.view",
      "transport.view",
      "hostel.view",
      "notifications.view",
      "ai.use",
    ],
  },
  {
    // No students.view: parents must only ever see their own children,
    // which modules enforce through a guardian relation.
    slug: "parent",
    name: "Parent",
    description: "Follows their children's progress, attendance and fees.",
    permissions: [
      "dashboard.view",
      "attendance.view",
      "exams.view",
      "finance.view",
      "results.view",
      "communication.view",
      "events.view",
      "transport.view",
      "notifications.view",
    ],
  },
  {
    slug: "staff",
    name: "Staff",
    description: "Non-teaching staff: office, accounts and administration.",
    permissions: [
      "dashboard.view",
      "students.view",
      "teachers.view",
      "academics.view",
      "attendance.view",
      "finance.view",
      "finance.create",
      "finance.update",
      "reports.view",
      "members.view",
      "staff.view",
      "parents.view",
      "classes.view",
      "communication.view",
      "events.view",
      "documents.view",
      "library.view",
      "transport.view",
      "hostel.view",
      "notifications.view",
    ],
  },
] as const satisfies readonly DefaultRole[]

export type DefaultRoleSlug = (typeof DEFAULT_ROLES)[number]["slug"]

export const OWNER_ROLE_SLUG = "owner" satisfies DefaultRoleSlug
