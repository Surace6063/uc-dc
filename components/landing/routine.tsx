"use client"

import {
  BellRingIcon,
  BookMarkedIcon,
  BriefcaseIcon,
  BusIcon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  FileBarChartIcon,
  GraduationCapIcon,
  LibraryIcon,
  MonitorPlayIcon,
  UserPlusIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import { motion } from "motion/react"

import { SectionHeading } from "@/components/landing/section-heading"
import { cn } from "@/lib/utils"

type Kind = "Management" | "LMS" | "Communication"

type Period = { icon: LucideIcon; title: string; description: string; kind: Kind }

// Modules laid out like a weekly class routine (Sunday–Friday school week).
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]

const periods: { label: string; time: string; cells: Period[] }[] = [
  {
    label: "I",
    time: "10:00",
    cells: [
      { icon: UserPlusIcon, title: "Admissions", description: "Online forms, entrance tests, enrolment", kind: "Management" },
      { icon: ClipboardCheckIcon, title: "Attendance", description: "Daily & period-wise, instant alerts", kind: "Management" },
      { icon: BookMarkedIcon, title: "Courses", description: "Lessons, videos, notes & files", kind: "LMS" },
      { icon: FileBarChartIcon, title: "Exams", description: "Mark entry, GPA & report cards", kind: "Management" },
      { icon: GraduationCapIcon, title: "Assignments", description: "Submissions, quizzes & feedback", kind: "LMS" },
      { icon: WalletIcon, title: "Fees", description: "Billing, receipts & reminders", kind: "Management" },
    ],
  },
  {
    label: "II",
    time: "11:00",
    cells: [
      { icon: CalendarClockIcon, title: "Timetable", description: "Clash-free routines for every section", kind: "Management" },
      { icon: MonitorPlayIcon, title: "Live classes", description: "Virtual classes with auto attendance", kind: "LMS" },
      { icon: BriefcaseIcon, title: "HR & payroll", description: "Staff records, leave & salary", kind: "Management" },
      { icon: BellRingIcon, title: "Notices", description: "Announcements, events & grievances", kind: "Communication" },
      { icon: LibraryIcon, title: "Library", description: "Catalogue, issue, return & fines", kind: "Management" },
      { icon: BusIcon, title: "Transport", description: "Routes, stops & bus fees", kind: "Management" },
    ],
  },
]

const kindStyles: Record<Kind, { cell: string; icon: string; dot: string }> = {
  Management: { cell: "border-primary/25 bg-primary/[0.06] hover:bg-primary/10", icon: "text-primary", dot: "bg-primary" },
  LMS: { cell: "border-lms/30 bg-lms/[0.06] hover:bg-lms/10", icon: "text-lms", dot: "bg-lms" },
  Communication: { cell: "border-amber-400/50 bg-highlight/50 hover:bg-highlight/70", icon: "text-amber-700 dark:text-amber-300", dot: "bg-amber-400" },
}

function Cell({ period, day, index }: { period: Period; day: string; index: number }) {
  const styles = kindStyles[period.kind]
  const Icon = period.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, rotate: index % 2 ? 1.5 : -1.5 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ type: "spring", stiffness: 160, damping: 18, delay: (index % 6) * 0.07 }}
      whileHover={{ y: -4, rotate: index % 2 ? 1 : -1 }}
      className={cn("group relative rounded-xl border p-4 transition-colors", styles.cell)}
    >
      <p className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase md:hidden">
        {day}
      </p>
      <Icon className={cn("size-5", styles.icon)} />
      <h3 className="mt-3 font-semibold">{period.title}</h3>
      <p className="mt-1 text-sm leading-snug text-muted-foreground">{period.description}</p>
    </motion.div>
  )
}

export function Routine() {
  return (
    <section id="routine" className="scroll-mt-16 border-y bg-card py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="the modules"
          title={
            <>
              Twelve modules, <em>one routine.</em>
            </>
          }
          description="Switch on what you need today and add the rest when you're ready. Every module shares the same students, staff and academic calendar."
        />

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          {(Object.keys(kindStyles) as Kind[]).map((kind) => (
            <span key={kind} className="flex items-center gap-2">
              <span className={cn("size-2.5 rounded-full", kindStyles[kind].dot)} />
              {kind}
            </span>
          ))}
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-[3.5rem_repeat(6,minmax(0,1fr))]">
          {/* Day header */}
          <div className="hidden md:block" />
          {days.map((day) => (
            <p
              key={day}
              className="hidden pb-1 text-center font-mono text-xs tracking-widest text-muted-foreground uppercase md:block"
            >
              {day}
            </p>
          ))}

          {periods.map((period, p) => (
            <div key={period.label} className="contents">
              {p === 1 && (
                <div className="col-span-2 flex items-center gap-4 py-3 md:col-span-7">
                  <span className="h-px flex-1 border-t border-dashed" />
                  <span className="-rotate-1 text-center font-hand text-2xl text-primary">
                    tiffin break: every module shares one database
                  </span>
                  <span className="h-px flex-1 border-t border-dashed" />
                </div>
              )}
              <div className="hidden flex-col items-center justify-center rounded-xl border border-dashed text-center md:flex">
                <span className="font-display text-2xl">{period.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{period.time}</span>
              </div>
              {period.cells.map((cell, i) => (
                <Cell key={cell.title} period={cell} day={days[i]} index={i} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
