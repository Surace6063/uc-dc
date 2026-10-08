"use client"

import * as React from "react"
import {
  BackpackIcon,
  HeartHandshakeIcon,
  PresentationIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react"
import { motion, useMotionValue, useSpring, useTransform } from "motion/react"

import { SectionHeading } from "@/components/landing/section-heading"
import { site } from "@/components/landing/site"
import { cn } from "@/lib/utils"

type Role = {
  icon: LucideIcon
  title: string
  card: string
  band: string
  sees: string
  does: string
}

const roles: Role[] = [
  {
    icon: ShieldCheckIcon,
    title: "Administrator",
    card: "Staff ID",
    band: "bg-primary",
    sees: "Enrolment, attendance, results and collections across every class and campus.",
    does: "Configures sessions, approves admissions, signs off reports.",
  },
  {
    icon: PresentationIcon,
    title: "Teacher",
    card: "Staff ID",
    band: "bg-lms",
    sees: "Their classes, routines, students and pending work.",
    does: "Takes attendance, enters marks, runs lessons and grades assignments.",
  },
  {
    icon: BackpackIcon,
    title: "Student",
    card: "Student ID",
    band: "bg-emerald-600",
    sees: "Courses, homework, routines, results and notices.",
    does: "Joins classes, submits work and takes quizzes from any phone.",
  },
  {
    icon: HeartHandshakeIcon,
    title: "Parent",
    card: "Guardian ID",
    band: "bg-amber-500",
    sees: "Attendance, progress and fee dues for each child.",
    does: "Pays fees, reads notices and messages teachers.",
  },
]

const segments = [
  { title: "Schools", text: "Pre-primary to Grade 12, sections and houses." },
  { title: "Colleges", text: "Semester or annual systems, faculties and programs." },
  { title: "Multi-campus groups", text: "Many branches, one account, consolidated reports." },
]

function IdCard({ role, index }: { role: Role; index: number }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [12, -12]), { stiffness: 220, damping: 18 })
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-12, 12]), { stiffness: 220, damping: 18 })
  const Icon = role.icon

  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    x.set((event.clientX - rect.left) / rect.width - 0.5)
    y.set((event.clientY - rect.top) / rect.height - 0.5)
  }

  function handleLeave() {
    x.set(0)
    y.set(0)
  }

  return (
    // Drops in and swings on its lanyard like a pendulum.
    <motion.div
      className="flex flex-col items-center"
      style={{ originY: 0 }}
      initial={{ y: -80, rotate: index % 2 ? 16 : -16, opacity: 0 }}
      whileInView={{ y: 0, rotate: 0, opacity: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ type: "spring", stiffness: 70, damping: 6, mass: 1.2, delay: index * 0.12 }}
    >
      <div className={cn("h-16 w-4 opacity-80", role.band)} />
      <div className="-mt-1 h-4 w-7 rounded-sm border-2 border-muted-foreground/40 bg-muted" />
      <motion.div
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        style={{ rotateX, rotateY, transformPerspective: 900 }}
        className="-mt-1 w-full max-w-64 overflow-hidden rounded-2xl border bg-card shadow-xl shadow-black/10"
      >
        <div className={cn("relative px-5 pt-6 pb-12 text-white", role.band)}>
          <span className="absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-black/25" />
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase opacity-80">{site.name}</p>
          <p className="font-mono text-xs font-semibold tracking-widest uppercase">{role.card}</p>
        </div>
        <div className="px-5 pb-5">
          <span className="relative -mt-9 flex size-16 items-center justify-center rounded-xl border-4 border-card bg-muted">
            <Icon className="size-7" />
          </span>
          <p className="mt-3 font-display text-3xl leading-none">{role.title}</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">Sees</dt>
              <dd className="mt-0.5 leading-snug">{role.sees}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">Does</dt>
              <dd className="mt-0.5 leading-snug">{role.does}</dd>
            </div>
          </dl>
          <div className="mt-5 flex items-end justify-between gap-3 border-t border-dashed pt-3">
            <span
              aria-hidden
              className="h-7 flex-1 bg-[repeating-linear-gradient(90deg,var(--foreground)_0_2px,transparent_2px_4px,var(--foreground)_4px_5px,transparent_5px_8px)] opacity-70"
            />
            <span className="font-mono text-[10px] text-muted-foreground">VALID 2083 BS</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function IdCards() {
  return (
    <section id="roles" className="scroll-mt-16 overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="who it's for"
          title={
            <>
              One campus, <em>four kinds of ID card.</em>
            </>
          }
          description="Everyone signs in to a view made for their role, with only the tools and data they should see."
        />

        <div className="mt-16 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((role, i) => (
            <IdCard key={role.title} role={role} index={i} />
          ))}
        </div>

        <div className="mt-20 grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-3">
          {segments.map((segment) => (
            <div key={segment.title} className="bg-paper p-6">
              <p className="font-display text-2xl">{segment.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{segment.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
