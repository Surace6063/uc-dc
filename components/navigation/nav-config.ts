import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  AwardIcon,
  BadgePercentIcon,
  BarChart3Icon,
  BedDoubleIcon,
  BellIcon,
  BookMarkedIcon,
  BriefcaseIcon,
  Building2Icon,
  BusIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarRangeIcon,
  CircleAlertIcon,
  ClipboardListIcon,
  CreditCardIcon,
  FilePenLineIcon,
  FileStackIcon,
  FileWarningIcon,
  HandCoinsIcon,
  FolderOpenIcon,
  GraduationCapIcon,
  HeartHandshakeIcon,
  HistoryIcon,
  HouseHeartIcon,
  LayoutDashboardIcon,
  LayersIcon,
  LayoutGridIcon,
  LibraryBigIcon,
  LibraryIcon,
  ListChecksIcon,
  MegaphoneIcon,
  MessagesSquareIcon,
  MonitorPlayIcon,
  NotebookPenIcon,
  PenLineIcon,
  PresentationIcon,
  ReceiptIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TagsIcon,
  UserCheckIcon,
  UserCogIcon,
  UserRoundIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

import { isAdministrative } from "@/lib/authorization/administrative"
import type { PermissionKey } from "@/lib/authorization/permissions"

// Sidebar navigation for the shared dashboard layout. One layout, several
// configurations (management, teacher, student, finance); which one a user
// gets is decided on the server (lib/navigation/resolve-nav.ts).
//
// Every href must be an existing page (tests/navigation.unit.test.ts checks).
// `permission` mirrors the page's own server-side check. The sidebar
// currently shows every link (FILTER_NAV_BY_PERMISSION); pages still refuse
// access on the server, so hiding links is presentation only.

type Permission = PermissionKey | readonly PermissionKey[]

export type NavSubItem = {
  title: string
  href: string
  permission?: Permission
}

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  permission?: Permission
  // Shown to users linked to a guardian profile, whatever their role (a
  // teacher can also be a parent). The page checks the link on the server.
  guardianOnly?: true
  // Sub-pages, shown as an expandable group.
  items?: NavSubItem[]
}

export type NavGroup = { label: string; items: NavItem[] }

export type NavKind = "management" | "teacher" | "student" | "finance"

export type NavConfig = {
  kind: NavKind
  // Sidebar section label, e.g. "Teacher portal".
  label: string
  groups: NavGroup[]
}

// Off for this phase: every configured link is shown.
export const FILTER_NAV_BY_PERMISSION = false

const dashboard: NavItem = { title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon, permission: "dashboard.view" }
const myChildren: NavItem = { title: "My Children", href: "/dashboard/family", icon: HouseHeartIcon, guardianOnly: true }

const studentsItem: NavItem = {
  title: "Students",
  href: "/dashboard/students",
  icon: GraduationCapIcon,
  permission: "students.view",
  items: [
    { title: "All students", href: "/dashboard/students", permission: "students.view" },
    { title: "New admission", href: "/dashboard/students/new", permission: "students.create" },
    { title: "Import", href: "/dashboard/students/import", permission: "students.import" },
  ],
}

const attendanceItem: NavItem = {
  title: "Attendance",
  href: "/dashboard/attendance",
  icon: CalendarCheckIcon,
  permission: "attendance.view",
  items: [
    { title: "Overview", href: "/dashboard/attendance", permission: "attendance.view" },
    { title: "Take attendance", href: "/dashboard/attendance/take", permission: ["attendance.create", "attendance.manage"] },
    { title: "Registers", href: "/dashboard/attendance/sessions", permission: ["attendance.create", "attendance.view_all"] },
    { title: "Records", href: "/dashboard/attendance/records", permission: ["attendance.create", "attendance.view_all"] },
    { title: "Reports", href: "/dashboard/attendance/reports", permission: ["attendance.view_all", "attendance.manage"] },
    { title: "Corrections", href: "/dashboard/attendance/corrections", permission: ["attendance.update", "attendance.approve"] },
    { title: "Staff attendance", href: "/dashboard/attendance/staff", permission: ["attendance.staff.view", "attendance.staff.manage"] },
    { title: "Import", href: "/dashboard/attendance/import", permission: "attendance.manage" },
    { title: "Settings", href: "/dashboard/attendance/settings", permission: "attendance.configure" },
  ],
}

const examsItem: NavItem = {
  title: "Examinations",
  href: "/dashboard/exams",
  icon: ClipboardListIcon,
  permission: "exams.view",
  items: [
    { title: "All examinations", href: "/dashboard/exams", permission: "exams.view" },
    { title: "New examination", href: "/dashboard/exams/new", permission: "exams.create" },
    { title: "Marks entry", href: "/dashboard/exams/marks", permission: ["exams.grade", "exams.marks.manage"] },
    { title: "Review & approval", href: "/dashboard/exams/review", permission: ["exams.review", "exams.approve"] },
    { title: "Result analytics", href: "/dashboard/exams/analytics", permission: "results.view_all" },
    { title: "Import marks", href: "/dashboard/exams/import", permission: ["exams.grade", "exams.marks.manage"] },
    { title: "Settings", href: "/dashboard/exams/settings", permission: "exams.configure" },
  ],
}

const results: NavItem = { title: "Grades & Results", href: "/dashboard/results", icon: AwardIcon, permission: "results.view" }
const lms: NavItem = { title: "LMS", href: "/dashboard/lms", icon: MonitorPlayIcon, permission: "courses.view" }
const assignments: NavItem = { title: "Assignments", href: "/dashboard/assignments", icon: FilePenLineIcon, permission: "assignments.view" }
const quizzes: NavItem = { title: "Quizzes & Assessments", href: "/dashboard/quizzes", icon: ListChecksIcon, permission: "quizzes.view" }
// Finance pages (finance staff: create, update or reports permission).
const FIN_STAFF: Permission = ["finance.create", "finance.update", "finance.reports"]
const finance: NavItem = {
  title: "Fees & Finance",
  href: "/dashboard/finance",
  icon: WalletIcon,
  permission: FIN_STAFF,
  items: [
    { title: "Overview", href: "/dashboard/finance", permission: FIN_STAFF },
    { title: "Fee collection", href: "/dashboard/finance/collect", permission: "finance.create" },
    { title: "Fee structures", href: "/dashboard/finance/structures", permission: FIN_STAFF },
    { title: "Student fees", href: "/dashboard/finance/assignments", permission: FIN_STAFF },
    { title: "Outstanding fees", href: "/dashboard/finance/outstanding", permission: FIN_STAFF },
    { title: "Payment history", href: "/dashboard/finance/payments", permission: FIN_STAFF },
    { title: "Discounts & scholarships", href: "/dashboard/finance/concessions", permission: FIN_STAFF },
    { title: "Expenses", href: "/dashboard/finance/expenses", permission: FIN_STAFF },
    { title: "Income", href: "/dashboard/finance/income", permission: FIN_STAFF },
    { title: "Transactions", href: "/dashboard/finance/transactions", permission: FIN_STAFF },
    { title: "Categories", href: "/dashboard/finance/categories", permission: FIN_STAFF },
    { title: "Reports", href: "/dashboard/finance/reports/collection", permission: "finance.reports" },
  ],
}
const communication: NavItem = { title: "Communication", href: "/dashboard/communication", icon: MessagesSquareIcon, permission: "communication.view" }
const notifications: NavItem = { title: "Notifications", href: "/dashboard/notifications", icon: BellIcon, permission: "notifications.view" }
const events: NavItem = { title: "Events & Calendar", href: "/dashboard/events", icon: CalendarDaysIcon, permission: "events.view" }
const documents: NavItem = { title: "Documents", href: "/dashboard/documents", icon: FolderOpenIcon, permission: "documents.view" }
const library: NavItem = { title: "Library", href: "/dashboard/library", icon: LibraryBigIcon, permission: "library.view" }
const reports: NavItem = { title: "Reports & Analytics", href: "/dashboard/reports", icon: BarChart3Icon, permission: "reports.view" }

const timetable: NavItem = { title: "Class Timetable", href: "/dashboard/timetable", icon: CalendarClockIcon, permission: "classes.view" }
const lessonPlans: NavItem = { title: "Lesson Plans", href: "/dashboard/lesson-plans", icon: NotebookPenIcon, permission: "courses.view" }
const materials: NavItem = { title: "Teaching Materials", href: "/dashboard/materials", icon: FileStackIcon, permission: "courses.view" }
const notices: NavItem = { title: "Notices", href: "/dashboard/notices", icon: MegaphoneIcon, permission: ["communication.view", "notices.manage"] }

const MANAGEMENT_NAV: NavConfig = {
  kind: "management",
  label: "Management",
  groups: [
    { label: "Overview", items: [dashboard, myChildren] },
    {
      label: "Organization",
      items: [
        { title: "Organization", href: "/dashboard/organization", icon: Building2Icon, permission: "organization.view" },
        { title: "Users & Access", href: "/dashboard/users", icon: UserCogIcon, permission: "members.view" },
        { title: "Roles & Permissions", href: "/dashboard/roles", icon: ShieldCheckIcon, permission: "roles.view" },
      ],
    },
    {
      label: "People",
      items: [
        studentsItem,
        {
          title: "Teachers",
          href: "/dashboard/teachers",
          icon: PresentationIcon,
          permission: "teachers.view",
          items: [
            { title: "All teachers", href: "/dashboard/teachers", permission: "teachers.view" },
            { title: "Add teacher", href: "/dashboard/teachers/new", permission: "teachers.create" },
            { title: "Import", href: "/dashboard/teachers/import", permission: "teachers.import" },
          ],
        },
        {
          title: "Staff",
          href: "/dashboard/staff",
          icon: BriefcaseIcon,
          permission: ["staff.view", "staff.view_department"],
          items: [
            { title: "All staff", href: "/dashboard/staff", permission: ["staff.view", "staff.view_department"] },
            { title: "Add staff", href: "/dashboard/staff/new", permission: "staff.create" },
            { title: "Import", href: "/dashboard/staff/import", permission: "staff.import" },
          ],
        },
        {
          title: "Parents",
          href: "/dashboard/parents",
          icon: HeartHandshakeIcon,
          permission: "parents.view",
          items: [
            { title: "All parents", href: "/dashboard/parents", permission: "parents.view" },
            { title: "Import", href: "/dashboard/parents/import", permission: "parents.import" },
          ],
        },
      ],
    },
    {
      label: "Academics",
      items: [
        { title: "Education Structure", href: "/dashboard/academics", icon: LibraryIcon, permission: "academics.view" },
        { title: "Classes & Sections", href: "/dashboard/classes", icon: LayoutGridIcon, permission: "classes.view" },
        { title: "Subjects & Courses", href: "/dashboard/subjects", icon: BookMarkedIcon, permission: "subjects.view" },
        timetable,
        attendanceItem,
      ],
    },
    { label: "Learning", items: [lessonPlans, materials, assignments, lms, quizzes] },
    { label: "Exams & Results", items: [examsItem, results] },
    { label: "Finance", items: [finance] },
    { label: "Communication", items: [notices, communication, notifications, events, documents] },
    {
      label: "Campus Services",
      items: [
        library,
        { title: "Transport", href: "/dashboard/transport", icon: BusIcon, permission: "transport.view" },
        { title: "Hostel", href: "/dashboard/hostel", icon: BedDoubleIcon, permission: "hostel.view" },
      ],
    },
    {
      label: "Insights",
      items: [reports, { title: "AI Features", href: "/dashboard/ai", icon: SparklesIcon, permission: "ai.use" }],
    },
    {
      label: "Administration",
      items: [
        { title: "Settings", href: "/dashboard/settings", icon: SettingsIcon, permission: "settings.view" },
        { title: "Security & Audit", href: "/dashboard/security", icon: ShieldAlertIcon, permission: "audit.view" },
        { title: "Subscription & Usage", href: "/dashboard/subscription", icon: CreditCardIcon, permission: "subscription.view" },
      ],
    },
  ],
}


// Teaching staff: their own classes, timetable, registers, marks and work.
const TEACHER_NAV: NavConfig = {
  kind: "teacher",
  label: "Teacher portal",
  groups: [
    { label: "Overview", items: [dashboard, myChildren] },
    {
      label: "Teaching",
      items: [
        { title: "My Classes", href: "/dashboard/teaching/classes", icon: LayoutGridIcon, permission: "classes.view" },
        { title: "My Subjects", href: "/dashboard/teaching/subjects", icon: BookMarkedIcon, permission: "subjects.view" },
        timetable,
        lessonPlans,
        materials,
      ],
    },
    {
      label: "Attendance",
      items: [
        { title: "Take Attendance", href: "/dashboard/attendance/take", icon: CalendarCheckIcon, permission: ["attendance.create", "attendance.manage"] },
        { title: "Attendance History", href: "/dashboard/attendance/sessions", icon: HistoryIcon, permission: ["attendance.create", "attendance.view_all"] },
      ],
    },
    {
      label: "Assessment",
      items: [
        { ...assignments, title: "Assignments" },
        { title: "Examinations", href: "/dashboard/teaching/exams", icon: ClipboardListIcon, permission: "exams.view" },
        { title: "Marks Entry", href: "/dashboard/exams/marks", icon: PenLineIcon, permission: ["exams.grade", "exams.marks.manage"] },
        { title: "Results", href: "/dashboard/teaching/results", icon: AwardIcon, permission: "results.view" },
      ],
    },
    {
      label: "Communication",
      items: [notices, { title: "Messages", href: "/dashboard/communication", icon: MessagesSquareIcon, permission: "communication.view" }],
    },
    {
      label: "Account",
      items: [
        { title: "My Profile", href: "/dashboard/profile", icon: UserRoundIcon, permission: "dashboard.view" },
        { title: "My Attendance", href: "/dashboard/attendance/me", icon: UserCheckIcon, permission: "attendance.view" },
        { title: "Settings", href: "/dashboard/account", icon: SettingsIcon, permission: "dashboard.view" },
      ],
    },
  ],
}

// Students: their own class, studies, results, attendance and records.
const STUDENT_NAV: NavConfig = {
  kind: "student",
  label: "Student portal",
  groups: [
    { label: "Overview", items: [dashboard] },
    {
      label: "Academics",
      items: [
        { title: "My Classes", href: "/dashboard/student/classes", icon: LayoutGridIcon, permission: "academics.view" },
        { title: "My Subjects", href: "/dashboard/student/subjects", icon: BookMarkedIcon, permission: "subjects.view" },
        { title: "Class Timetable", href: "/dashboard/student/timetable", icon: CalendarClockIcon, permission: "academics.view" },
        { title: "Lesson Materials", href: "/dashboard/student/materials", icon: FileStackIcon, permission: "courses.view" },
        { title: "Assignments", href: "/dashboard/student/assignments", icon: FilePenLineIcon, permission: "assignments.view" },
      ],
    },
    {
      label: "Examinations",
      items: [
        { title: "Examination Schedule", href: "/dashboard/student/exams", icon: ClipboardListIcon, permission: "exams.view" },
        { title: "My Marks", href: "/dashboard/student/marks", icon: PenLineIcon, permission: "results.view" },
        { title: "My Results", href: "/dashboard/results", icon: AwardIcon, permission: "results.view" },
      ],
    },
    {
      label: "Attendance",
      items: [{ title: "My Attendance", href: "/dashboard/attendance/me", icon: CalendarCheckIcon, permission: "attendance.view" }],
    },
    {
      label: "Finance",
      items: [
        { title: "My Fees", href: "/dashboard/student/fees", icon: WalletIcon, permission: "dashboard.view" },
        { title: "Payment History", href: "/dashboard/student/payments", icon: ReceiptIcon, permission: "dashboard.view" },
      ],
    },
    {
      label: "Communication",
      items: [notices, { title: "Messages", href: "/dashboard/communication", icon: MessagesSquareIcon, permission: "communication.view" }],
    },
    {
      label: "Account",
      items: [
        { title: "My Profile", href: "/dashboard/student/profile", icon: UserRoundIcon, permission: "dashboard.view" },
        { title: "My Documents", href: "/dashboard/student/documents", icon: FolderOpenIcon, permission: "dashboard.view" },
        { title: "Settings", href: "/dashboard/account", icon: SettingsIcon, permission: "dashboard.view" },
      ],
    },
  ],
}

// Accounts and finance staff.
const FINANCE_NAV: NavConfig = {
  kind: "finance",
  label: "Finance",
  groups: [
    { label: "Overview", items: [dashboard] },
    {
      label: "Student Finance",
      items: [
        { title: "Fee Structure", href: "/dashboard/finance/structures", icon: LayersIcon, permission: FIN_STAFF },
        { title: "Student Fee Assignments", href: "/dashboard/finance/assignments", icon: ClipboardListIcon, permission: FIN_STAFF },
        { title: "Fee Collection", href: "/dashboard/finance/collect", icon: HandCoinsIcon, permission: "finance.create" },
        { title: "Outstanding Fees", href: "/dashboard/finance/outstanding", icon: CircleAlertIcon, permission: FIN_STAFF },
        { title: "Payment History", href: "/dashboard/finance/payments", icon: ReceiptIcon, permission: FIN_STAFF },
        { title: "Discounts and Scholarships", href: "/dashboard/finance/concessions", icon: BadgePercentIcon, permission: FIN_STAFF },
      ],
    },
    {
      label: "Accounting",
      items: [
        { title: "Expenses", href: "/dashboard/finance/expenses", icon: ArrowUpRightIcon, permission: FIN_STAFF },
        { title: "Income", href: "/dashboard/finance/income", icon: ArrowDownLeftIcon, permission: FIN_STAFF },
        { title: "Financial Transactions", href: "/dashboard/finance/transactions", icon: ArrowLeftRightIcon, permission: FIN_STAFF },
        { title: "Financial Categories", href: "/dashboard/finance/categories", icon: TagsIcon, permission: FIN_STAFF },
      ],
    },
    {
      label: "Reports",
      items: [
        { title: "Fee Collection Report", href: "/dashboard/finance/reports/collection", icon: BarChart3Icon, permission: "finance.reports" },
        { title: "Outstanding Balance Report", href: "/dashboard/finance/reports/outstanding", icon: FileWarningIcon, permission: "finance.reports" },
        { title: "Daily Collection Report", href: "/dashboard/finance/reports/daily", icon: CalendarDaysIcon, permission: "finance.reports" },
        { title: "Monthly Financial Report", href: "/dashboard/finance/reports/monthly", icon: CalendarRangeIcon, permission: "finance.reports" },
      ],
    },
    {
      label: "Account",
      items: [
        { title: "My Profile", href: "/dashboard/profile", icon: UserRoundIcon, permission: "dashboard.view" },
        { title: "Settings", href: "/dashboard/account", icon: SettingsIcon, permission: "dashboard.view" },
      ],
    },
  ],
}

export const NAV_CONFIGS: Record<NavKind, NavConfig> = {
  management: MANAGEMENT_NAV,
  teacher: TEACHER_NAV,
  student: STUDENT_NAV,
  finance: FINANCE_NAV,
}

// ------------------------------------------------------------ helpers

const allows = (permissions: readonly PermissionKey[], permission?: Permission) =>
  !permission || (typeof permission === "string" ? permissions.includes(permission) : permission.some((p) => permissions.includes(p)))

// The groups to show. Guardian-only links follow the guardian link (data,
// not permissions); permission filtering is applied only when switched on.
export function visibleNavGroups(
  config: NavConfig,
  permissions: readonly PermissionKey[],
  options: { guardian?: boolean; filterByPermission?: boolean } = {}
): NavGroup[] {
  const filter = options.filterByPermission ?? FILTER_NAV_BY_PERMISSION
  return config.groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => (item.guardianOnly ? options.guardian === true : !filter || allows(permissions, item.permission)))
        .map((item) => (filter && item.items ? { ...item, items: item.items.filter((sub) => allows(permissions, sub.permission)) } : item)),
    }))
    .filter((group) => group.items.length > 0)
}

const matches = (pathname: string, href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`))

// The single most specific link for the current path, so a parent and its
// sub-page aren't both highlighted (e.g. Attendance vs. Take attendance).
export function activeHref(pathname: string, groups: NavGroup[]): string | null {
  let best: string | null = null
  for (const group of groups) {
    for (const item of group.items) {
      for (const href of [item.href, ...(item.items?.map((s) => s.href) ?? [])]) {
        if (matches(pathname, href) && (!best || href.length > best.length)) best = href
      }
    }
  }
  return best
}

export type NavDestination = { title: string; href: string; group: string; icon: LucideIcon; parent?: string }

// Every destination, flattened, for search. Sub-pages carry their parent.
export function navDestinations(groups: NavGroup[]): NavDestination[] {
  return groups.flatMap((group) =>
    group.items.flatMap((item) => {
      const subs = (item.items ?? []).filter((s) => s.href !== item.href)
      return [
        { title: item.title, href: item.href, group: group.label, icon: item.icon },
        ...subs.map((s) => ({ title: s.title, href: s.href, group: group.label, icon: item.icon, parent: item.title })),
      ]
    })
  )
}

// Titles for known paths across every configuration, for breadcrumbs.
const TITLES = new Map<string, string>()
for (const config of Object.values(NAV_CONFIGS)) {
  for (const group of config.groups) {
    for (const item of group.items) {
      if (!TITLES.has(item.href)) TITLES.set(item.href, item.title)
      for (const sub of item.items ?? []) {
        // A sub-page that is the parent's own page keeps the parent's title.
        if (sub.href !== item.href && !TITLES.has(sub.href)) TITLES.set(sub.href, sub.title)
      }
    }
  }
}

const SEGMENT_LABELS: Record<string, string> = { new: "New", edit: "Edit", import: "Import", settings: "Settings" }
const looksLikeId = (segment: string) => /^[0-9a-f-]{16,}$/i.test(segment) || /^\d+$/.test(segment)

export type Crumb = { label: string; href?: string }

// Breadcrumbs from the URL alone: known pages by their navigation title,
// IDs as "Details". Pages can supply better labels through PageHeader.
export function trailForPath(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean)
  if (segments[0] !== "dashboard") return []
  const crumbs: Crumb[] = [{ label: "Dashboard", href: "/dashboard" }]
  for (let i = 1; i < segments.length; i++) {
    const href = `/${segments.slice(0, i + 1).join("/")}`
    const segment = segments[i]
    const last = i === segments.length - 1
    const known = TITLES.get(href) ?? SEGMENT_LABELS[segment] ?? (looksLikeId(segment) ? "Details" : null)
    // Folders that only group pages (/dashboard/student, /dashboard/finance/
    // reports) aren't pages, so they get no crumb (and no broken link).
    if (!known && !last) continue
    crumbs.push({ label: known ?? segment.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), href })
  }
  return crumbs
}

// ------------------------------------------------------------ choosing a configuration

// Interim rule until the role-based dashboards land: a linked student or
// teacher profile picks that portal, finance-only roles get the finance
// one, everyone else the management navigation. Decided on the server.
export function navKindFor(input: { permissions: readonly PermissionKey[]; studentProfile: boolean; teacherProfile: boolean }): NavKind {
  if (isAdministrative(input.permissions)) return "management"
  if (input.studentProfile) return "student"
  if (input.teacherProfile) return "teacher"
  if (input.permissions.includes("finance.create") || input.permissions.includes("finance.update")) return "finance"
  return "management"
}
