import {
  CalendarDaysIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"

export type NavSubItem = {
  title: string
  href: string
}

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  items?: NavSubItem[]
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
    ],
  },
  {
    label: "Academics",
    items: [
      {
        title: "Examination",
        href: "/dashboard/exams",
        icon: ClipboardListIcon,
        items: [
          { title: "Exam List", href: "/dashboard/exams" },
          { title: "Import Historical Exams", href: "/dashboard/exams/import" },
          { title: "Exam Schedule", href: "/dashboard/exams/schedule" },
          { title: "Assign Mark", href: "/dashboard/exams/marks" },
          {
            title: "Report Card Templates",
            href: "/dashboard/exams/report-cards",
          },
        ],
      },
      {
        title: "Grievance",
        href: "/dashboard/grievance",
        icon: TriangleAlertIcon,
      },
      {
        title: "Event",
        href: "/dashboard/events",
        icon: CalendarDaysIcon,
      },
    ],
  },
]

export const navItems = navGroups.flatMap((group) => group.items)

// TODO: replace with the signed-in user and the active academic year.
export const currentUser = {
  name: "Krishna Pandey",
  email: "krishnapandey@united.edu.np",
}

export const academicYear = { ad: 2026, bs: 2083 }
