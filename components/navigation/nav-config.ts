import {
  AwardIcon,
  BarChart3Icon,
  BedDoubleIcon,
  BellIcon,
  BookMarkedIcon,
  BriefcaseIcon,
  Building2Icon,
  BusIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  CreditCardIcon,
  FilePenLineIcon,
  FolderOpenIcon,
  GraduationCapIcon,
  HeartHandshakeIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  LibraryBigIcon,
  LibraryIcon,
  ListChecksIcon,
  MessagesSquareIcon,
  MonitorPlayIcon,
  PresentationIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserCogIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

import type { PermissionKey } from "@/lib/authorization/permissions"

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  // Shown only to users whose role has this permission. The page itself
  // checks the same permission on the server.
  permission: PermissionKey
}

export type NavGroup = { label: string; items: NavItem[] }

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon, permission: "dashboard.view" },
    ],
  },
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
      { title: "Students", href: "/dashboard/students", icon: GraduationCapIcon, permission: "students.view" },
      { title: "Teachers", href: "/dashboard/teachers", icon: PresentationIcon, permission: "teachers.view" },
      { title: "Staff", href: "/dashboard/staff", icon: BriefcaseIcon, permission: "staff.view" },
      { title: "Parents", href: "/dashboard/parents", icon: HeartHandshakeIcon, permission: "parents.view" },
    ],
  },
  {
    label: "Academics",
    items: [
      { title: "Academics", href: "/dashboard/academics", icon: LibraryIcon, permission: "academics.view" },
      { title: "Classes & Sections", href: "/dashboard/classes", icon: LayoutGridIcon, permission: "classes.view" },
      { title: "Subjects & Courses", href: "/dashboard/subjects", icon: BookMarkedIcon, permission: "subjects.view" },
      { title: "Attendance", href: "/dashboard/attendance", icon: CalendarCheckIcon, permission: "attendance.view" },
    ],
  },
  {
    label: "Learning",
    items: [
      { title: "LMS", href: "/dashboard/lms", icon: MonitorPlayIcon, permission: "courses.view" },
      { title: "Assignments", href: "/dashboard/assignments", icon: FilePenLineIcon, permission: "assignments.view" },
      { title: "Quizzes & Assessments", href: "/dashboard/quizzes", icon: ListChecksIcon, permission: "quizzes.view" },
    ],
  },
  {
    label: "Exams & Results",
    items: [
      { title: "Examinations", href: "/dashboard/exams", icon: ClipboardListIcon, permission: "exams.view" },
      { title: "Grades & Results", href: "/dashboard/results", icon: AwardIcon, permission: "results.view" },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Fees & Finance", href: "/dashboard/finance", icon: WalletIcon, permission: "finance.view" },
    ],
  },
  {
    label: "Communication",
    items: [
      { title: "Communication", href: "/dashboard/communication", icon: MessagesSquareIcon, permission: "communication.view" },
      { title: "Notifications", href: "/dashboard/notifications", icon: BellIcon, permission: "notifications.view" },
      { title: "Events & Calendar", href: "/dashboard/events", icon: CalendarDaysIcon, permission: "events.view" },
      { title: "Documents", href: "/dashboard/documents", icon: FolderOpenIcon, permission: "documents.view" },
    ],
  },
  {
    label: "Campus Services",
    items: [
      { title: "Library", href: "/dashboard/library", icon: LibraryBigIcon, permission: "library.view" },
      { title: "Transport", href: "/dashboard/transport", icon: BusIcon, permission: "transport.view" },
      { title: "Hostel", href: "/dashboard/hostel", icon: BedDoubleIcon, permission: "hostel.view" },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Reports & Analytics", href: "/dashboard/reports", icon: BarChart3Icon, permission: "reports.view" },
      { title: "AI Features", href: "/dashboard/ai", icon: SparklesIcon, permission: "ai.use" },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Settings", href: "/dashboard/settings", icon: SettingsIcon, permission: "settings.view" },
      { title: "Security & Audit", href: "/dashboard/security", icon: ShieldAlertIcon, permission: "audit.view" },
      { title: "Subscription & Usage", href: "/dashboard/subscription", icon: CreditCardIcon, permission: "subscription.view" },
    ],
  },
]

export function visibleNavGroups(permissions: readonly PermissionKey[]): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => permissions.includes(item.permission)),
    }))
    .filter((group) => group.items.length > 0)
}

// TODO: load the organisation's active academic year.
export const academicYear = { ad: 2026, bs: 2083 }
