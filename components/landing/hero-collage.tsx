"use client"

import * as React from "react"
import { CheckIcon, PlayIcon, XIcon } from "lucide-react"
import { motion, useScroll, useTransform, type MotionValue } from "motion/react"

import { Stamp } from "@/components/landing/motion"
import { cn } from "@/lib/utils"

// Paperwork scattered on a desk: register, report card, lesson, sticky note.
const register = [
  { name: "Aarav Shrestha", present: true },
  { name: "Sita Gurung", present: true },
  { name: "Bibek Thapa", present: false },
  { name: "Anisha Rai", present: true },
  { name: "Prakash Magar", present: true },
]

const grades = [
  { subject: "English", grade: "A+" },
  { subject: "Mathematics", grade: "A" },
  { subject: "Science", grade: "A+" },
  { subject: "Social Studies", grade: "B+" },
]

function Paper({
  children,
  className,
  rotate,
  delay,
  float,
  y,
}: {
  children: React.ReactNode
  className?: string
  rotate: number
  delay: number
  float: number
  y: MotionValue<number>
}) {
  return (
    <motion.div className={cn("absolute", className)} style={{ y }}>
      <motion.div
        initial={{ opacity: 0, y: 60, rotate: rotate - 10 }}
        animate={{ opacity: 1, y: 0, rotate }}
        transition={{ type: "spring", stiffness: 90, damping: 14, delay }}
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: float, repeat: Infinity, ease: "easeInOut" }}
          whileHover={{ scale: 1.03, rotate: 0, zIndex: 10 }}
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

export function HeroCollage() {
  const ref = React.useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  })
  const slow = useTransform(scrollYProgress, [0, 1], [0, -40])
  const medium = useTransform(scrollYProgress, [0, 1], [0, -90])
  const fast = useTransform(scrollYProgress, [0, 1], [0, -150])

  return (
    <div ref={ref} aria-hidden className="relative mx-auto h-[460px] w-full max-w-[480px] sm:h-[520px]">
      {/* Attendance register */}
      <Paper className="top-0 left-0 z-10 w-[56%]" rotate={-4} delay={0.3} float={6} y={slow}>
        <div className="rounded-xl border bg-card p-4 shadow-xl shadow-black/5">
          <div className="flex items-baseline justify-between border-b border-dashed pb-2">
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              Attendance · 9 &apos;B&apos;
            </p>
            <p className="font-hand text-base text-primary">Asoj 22</p>
          </div>
          <ul className="mt-2 space-y-1.5">
            {register.map((student, i) => (
              <li key={student.name} className="flex items-center justify-between text-sm">
                <span>{student.name}</span>
                <motion.span
                  initial={{ scale: 0, rotate: -40 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15, delay: 1 + i * 0.18 }}
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full",
                    student.present
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-destructive/15 text-destructive"
                  )}
                >
                  {student.present ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
                </motion.span>
              </li>
            ))}
          </ul>
        </div>
      </Paper>

      {/* Report card */}
      <Paper className="top-[12%] right-0 w-[50%]" rotate={5} delay={0.5} float={7} y={medium}>
        <div className="relative rounded-xl border bg-card p-4 shadow-xl shadow-black/5">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            Progress report
          </p>
          <p className="font-display text-xl">First Terminal</p>
          <ul className="mt-2 divide-y divide-dashed text-sm">
            {grades.map((row) => (
              <li key={row.subject} className="flex justify-between py-1">
                <span className="text-muted-foreground">{row.subject}</span>
                <span className="font-semibold">{row.grade}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between border-t pt-2 text-sm font-semibold">
            GPA <span>3.75</span>
          </p>
          <Stamp className="absolute -right-3 -bottom-4 bg-card/40 text-primary" delay={2} rotate={-14}>
            Promoted
          </Stamp>
        </div>
      </Paper>

      {/* Lesson */}
      <Paper className="bottom-[4%] left-[6%] z-20 w-[62%]" rotate={2} delay={0.7} float={6.5} y={fast}>
        <div className="overflow-hidden rounded-xl border bg-card shadow-2xl shadow-black/10">
          <div className="relative flex aspect-video items-center justify-center bg-linear-to-br from-emerald-600 to-teal-900">
            <span className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-semibold text-white">
              <motion.span
                className="size-1.5 rounded-full bg-red-500"
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
              LIVE
            </span>
            <span className="relative flex size-11 items-center justify-center rounded-full bg-white text-emerald-800">
              <motion.span
                className="absolute inset-0 rounded-full bg-white"
                animate={{ scale: [1, 1.7], opacity: [0.6, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
              />
              <PlayIcon className="relative size-4 translate-x-px fill-current" />
            </span>
          </div>
          <div className="p-3">
            <p className="text-sm font-medium">Ch. 4 · Photosynthesis</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: "68%" }}
                transition={{ duration: 1.6, ease: "easeOut", delay: 1.4 }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">26 of 38 students watched</p>
          </div>
        </div>
      </Paper>

      {/* Sticky note */}
      <Paper className="right-[2%] bottom-[10%] z-30 w-[40%]" rotate={-7} delay={0.9} float={5} y={medium}>
        <div className="relative bg-highlight p-4 pt-5 font-hand text-xl leading-6 text-amber-950 shadow-lg dark:text-amber-50">
          <span className="absolute -top-2.5 left-1/2 h-5 w-14 -translate-x-1/2 rotate-2 bg-white/60 shadow-sm dark:bg-white/20" />
          Fee reminder sent to 84 parents ✓
        </div>
      </Paper>
    </div>
  )
}
