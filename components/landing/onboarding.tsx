"use client"

import { motion, type Variants } from "motion/react"

import { SectionHeading } from "@/components/landing/section-heading"

const steps = [
  { title: "Walk us through your institution", note: "classes, faculties, fee heads" },
  { title: "Hand over your spreadsheets", note: "we import students, staff & past results" },
  { title: "Train the staff", note: "hands-on sessions at your campus" },
  { title: "Send logins to students & parents", note: "and you're live!" },
]

const list: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.7, delayChildren: 0.4 } },
}

const tick: Variants = {
  hidden: { pathLength: 0 },
  show: { pathLength: 1, transition: { duration: 0.35, ease: "easeOut" } },
}

const strike: Variants = {
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: { duration: 0.4, ease: "easeInOut", delay: 0.3 } },
}

export function Onboarding() {
  return (
    <section className="border-y bg-card py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <SectionHeading
          align="left"
          eyebrow="getting started"
          title={
            <>
              Go live without <em>closing a single class.</em>
            </>
          }
          description="Our onboarding team does the heavy lifting: setting up your structure, importing your data and training your staff, so the switch happens between bells."
        />

        {/* A notebook page with a to-do list that ticks itself off. */}
        <div className="relative -rotate-1 rounded-lg border bg-paper bg-ruled py-8 pr-6 pl-16 shadow-xl shadow-black/5">
          <span aria-hidden className="absolute inset-y-0 left-10 w-px bg-margin" />
          <p className="font-hand text-3xl leading-8 text-primary">Go-live checklist</p>
          <motion.ul
            className="mt-8"
            variants={list}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
          >
            {steps.map((step) => (
              <motion.li key={step.title} variants={list} className="flex gap-4 pb-8">
                <svg viewBox="0 0 24 24" className="mt-1 size-6 shrink-0" aria-hidden>
                  <rect x="2" y="2" width="20" height="20" rx="4" className="fill-card stroke-foreground/60" strokeWidth="2" />
                  <motion.path
                    d="M6 12.5l4 4 8-9"
                    className="fill-none stroke-primary"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    variants={tick}
                  />
                </svg>
                <div>
                  <p className="relative inline-block font-hand text-2xl leading-8">
                    {step.title}
                    <motion.span
                      aria-hidden
                      className="absolute top-1/2 left-0 h-0.5 w-full origin-left -rotate-1 bg-primary/70"
                      variants={strike}
                    />
                  </p>
                  <p className="text-sm text-muted-foreground">{step.note}</p>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </div>
    </section>
  )
}
