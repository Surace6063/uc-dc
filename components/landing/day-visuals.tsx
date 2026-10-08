"use client"

import {
  BellIcon,
  CheckIcon,
  FileTextIcon,
  LeafIcon,
  PlayIcon,
  ReceiptIcon,
  XIcon,
} from "lucide-react"
import { motion, type Variants } from "motion/react"

import { CountUp, Stamp, ease } from "@/components/landing/motion"
import { cn } from "@/lib/utils"

// Small product illustrations for each scene of "A day at school".

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
}

const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
}

const viewport = { once: true, margin: "-60px" }

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-5 shadow-xl shadow-black/5", className)}>
      {children}
    </div>
  )
}

const absent = new Set([4, 13, 27])

export function AttendanceVisual() {
  return (
    <Frame>
      <div className="flex items-baseline justify-between">
        <p className="font-medium">Grade 9 &apos;B&apos; · Seat plan</p>
        <p className="font-mono text-xs text-muted-foreground">07:42</p>
      </div>
      <motion.div
        className="mt-4 grid grid-cols-10 gap-1.5"
        variants={{ show: { transition: { staggerChildren: 0.025 } } }}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
      >
        {Array.from({ length: 30 }, (_, i) => (
          <motion.div
            key={i}
            variants={{
              hidden: { opacity: 0, scale: 0.3 },
              show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 400, damping: 20 } },
            }}
            className={cn(
              "flex aspect-square items-center justify-center rounded-md",
              absent.has(i)
                ? "bg-destructive/15 text-destructive"
                : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            )}
          >
            {absent.has(i) ? <XIcon className="size-3" /> : <CheckIcon className="size-3" />}
          </motion.div>
        ))}
      </motion.div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
        <span>
          <b className="text-lg">27</b>/30 present
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <BellIcon className="size-4" /> 3 parents notified
        </span>
      </div>
    </Frame>
  )
}

export function LessonVisual() {
  return (
    <Frame className="p-0">
      <div className="relative flex aspect-[16/8] items-center justify-center overflow-hidden rounded-t-2xl bg-linear-to-br from-emerald-600 to-teal-900">
        <LeafIcon className="absolute -right-6 -bottom-8 size-48 text-white/10" />
        <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-xs font-semibold text-white">
          <motion.span
            className="size-2 rounded-full bg-red-500"
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          LIVE · 32 joined
        </span>
        <span className="relative flex size-14 items-center justify-center rounded-full bg-white text-emerald-800">
          <motion.span
            className="absolute inset-0 rounded-full bg-white"
            animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
          <PlayIcon className="relative size-5 translate-x-0.5 fill-current" />
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="font-medium">Chapter 4 · Photosynthesis</p>
          <p className="text-sm text-muted-foreground">Science · Grade 9 · Ms. Karki</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          Attendance auto-captured
        </span>
      </div>
    </Frame>
  )
}

const submissions = [
  { name: "Anisha Rai", status: "Graded · A", tone: "good" },
  { name: "Bibek Thapa", status: "Submitted 10:52", tone: "neutral" },
  { name: "Sita Gurung", status: "Submitted 10:47", tone: "neutral" },
  { name: "Prakash Magar", status: "Late", tone: "warn" },
]

export function AssignmentVisual() {
  const done = 23
  const total = 30

  return (
    <Frame className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="relative mx-auto size-28">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r="42" className="fill-none stroke-muted" strokeWidth="10" />
          <motion.circle
            cx="50"
            cy="50"
            r="42"
            className="fill-none stroke-lms"
            strokeWidth="10"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: done / total }}
            viewport={viewport}
            transition={{ duration: 1.4, ease }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold">
            <CountUp to={done} />
          </span>
          <span className="text-xs text-muted-foreground">of {total} in</span>
        </div>
      </div>
      <motion.ul className="space-y-2" variants={container} initial="hidden" whileInView="show" viewport={viewport}>
        {submissions.map((s) => (
          <motion.li key={s.name} variants={rise} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <FileTextIcon className="size-4 text-muted-foreground" />
              {s.name}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                s.tone === "good" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                s.tone === "neutral" && "bg-lms/10 text-lms",
                s.tone === "warn" && "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              )}
            >
              {s.status}
            </span>
          </motion.li>
        ))}
      </motion.ul>
    </Frame>
  )
}

const marks = [
  { subject: "English", marks: 86 },
  { subject: "Mathematics", marks: 92 },
  { subject: "Science", marks: 78 },
  { subject: "Nepali", marks: 81 },
]

export function MarksVisual() {
  return (
    <Frame className="relative">
      <div className="flex items-baseline justify-between">
        <p className="font-medium">Mark entry · First Terminal</p>
        <p className="font-mono text-xs text-muted-foreground">Grade 10</p>
      </div>
      <table className="mt-3 w-full text-sm">
        <tbody className="divide-y divide-dashed">
          {marks.map((row) => (
            <tr key={row.subject}>
              <td className="py-2 text-muted-foreground">{row.subject}</td>
              <td className="py-2 text-right font-mono font-semibold">
                <CountUp to={row.marks} />
                <span className="text-muted-foreground">/100</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
        <span>
          Report cards generated: <b>412</b>
        </span>
        <span className="font-semibold">
          GPA <CountUp to={3.65} decimals={2} />
        </span>
      </div>
      <Stamp className="absolute top-4 right-24 text-primary" delay={0.8} rotate={-10}>
        Verified
      </Stamp>
    </Frame>
  )
}

const receipts = [
  { id: "#4821", who: "Grade 6 · Term fee", amount: "12,500" },
  { id: "#4822", who: "BBS I · Semester fee", amount: "28,000" },
  { id: "#4823", who: "Grade 11 · Transport", amount: "4,200" },
]

export function FeesVisual() {
  return (
    <Frame>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Term collection</p>
          <p className="font-display text-5xl">
            <CountUp to={78} />%
          </p>
        </div>
        <p className="text-right text-sm text-muted-foreground">
          Rs 3.2L pending
          <br />
          84 reminders sent
        </p>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-[repeating-linear-gradient(45deg,var(--primary)_0_8px,color-mix(in_oklch,var(--primary),white_20%)_8px_16px)]"
          initial={{ width: 0 }}
          whileInView={{ width: "78%" }}
          viewport={viewport}
          transition={{ duration: 1.6, ease }}
        />
      </div>
      <motion.ul className="mt-4 space-y-2" variants={container} initial="hidden" whileInView="show" viewport={viewport}>
        {receipts.map((r) => (
          <motion.li key={r.id} variants={rise} className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <ReceiptIcon className="size-4 text-primary" />
              <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
              {r.who}
            </span>
            <span className="font-mono font-semibold">Rs {r.amount}</span>
          </motion.li>
        ))}
      </motion.ul>
    </Frame>
  )
}

const notifications = [
  { title: "Attendance", body: "Aarav was present today.", time: "07:42" },
  { title: "Homework graded", body: "Science assignment: A", time: "16:10" },
  { title: "Fee received", body: "Term fee Rs 12,500. Thank you!", time: "15:22" },
]

export function ParentVisual() {
  return (
    <div className="mx-auto w-64 rounded-[2.5rem] border-[7px] border-foreground/90 bg-paper p-3 shadow-2xl">
      <div className="mx-auto h-5 w-20 rounded-full bg-foreground/90" />
      <p className="mt-6 text-center font-display text-5xl">19:04</p>
      <p className="text-center text-xs text-muted-foreground">Kartik 4, Tuesday</p>
      <motion.ul
        className="mt-6 space-y-2 pb-4"
        variants={{ show: { transition: { staggerChildren: 0.35, delayChildren: 0.3 } } }}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
      >
        {notifications.map((n) => (
          <motion.li
            key={n.title}
            variants={{
              hidden: { opacity: 0, y: -20, scale: 0.95 },
              show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 22 } },
            }}
            className="rounded-2xl bg-card/90 p-3 text-xs shadow-md ring-1 ring-black/5"
          >
            <div className="flex justify-between">
              <span className="font-semibold">{n.title}</span>
              <span className="text-muted-foreground">{n.time}</span>
            </div>
            <p className="mt-0.5 text-muted-foreground">{n.body}</p>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  )
}
