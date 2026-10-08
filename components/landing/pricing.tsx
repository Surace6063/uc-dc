"use client"

import { motion } from "motion/react"

import { Stamp, ease } from "@/components/landing/motion"
import { SectionHeading } from "@/components/landing/section-heading"
import { site } from "@/components/landing/site"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// TODO: placeholder plans and prices; replace with real pricing.
const plans = [
  {
    no: "0001",
    name: "Essentials",
    price: "Rs 40",
    unit: "per student / month",
    description: "Core management for schools getting off paper.",
    items: [
      "Student information system",
      "Attendance & timetable",
      "Exams & report cards",
      "Notices & events",
      "Email support",
    ],
    cta: "Start with Essentials",
    featured: false,
  },
  {
    no: "0002",
    name: "Complete",
    price: "Rs 70",
    unit: "per student / month",
    description: "The full management suite plus the LMS.",
    items: [
      "Everything in Essentials",
      "Fees, accounts & online payments",
      "Courses, assignments & quizzes",
      "Live classes",
      "Parent & student portal",
      "Priority support",
    ],
    cta: "Book a demo",
    featured: true,
  },
  {
    no: "0003",
    name: "Enterprise",
    price: "Custom",
    unit: "for colleges & groups",
    description: "Multi-campus institutions with advanced needs.",
    items: [
      "Everything in Complete",
      "Multiple campuses, one account",
      "HR, payroll, library & transport",
      "Custom report card formats",
      "Dedicated onboarding manager",
    ],
    cta: "Contact sales",
    featured: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-16 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="fee structure"
          title={
            <>
              Pricing as clear as <em>a fee receipt.</em>
            </>
          }
          description="Pay per enrolled student. No setup fee, and data migration is included on every plan."
        />

        <div className="mt-16 grid items-start gap-8 lg:grid-cols-3">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              className={cn("relative drop-shadow-xl", plan.featured && "lg:-mt-6")}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
            >
              {/* Receipt "prints" from the top down. */}
              <motion.div
                variants={{
                  hidden: { clipPath: "inset(0 0 100% 0)" },
                  show: { clipPath: "inset(0 0 0% 0)", transition: { duration: 1.3, ease, delay: i * 0.2 } },
                }}
                className={cn(
                  "relative receipt-edge bg-card px-6 pt-6 pb-10 font-mono text-sm",
                  plan.featured && "bg-[color-mix(in_oklch,var(--card),var(--primary)_6%)]"
                )}
              >
                <div className="text-center text-xs tracking-widest text-muted-foreground uppercase">
                  <p>{site.name}</p>
                  <p>Receipt No. {plan.no}</p>
                </div>

                <p className="mt-6 text-center font-display text-4xl tracking-normal">{plan.name}</p>
                <p className="mt-1 text-center font-sans text-sm text-muted-foreground">{plan.description}</p>

                <div className="my-5 border-t-2 border-dashed" />

                <ul className="space-y-2">
                  {plan.items.map((item) => (
                    <li key={item} className="flex items-end gap-2">
                      <span>{item}</span>
                      <span aria-hidden className="mb-1 flex-1 border-b border-dotted border-foreground/40" />
                      <span className="text-primary">✓</span>
                    </li>
                  ))}
                </ul>

                <div className="my-5 border-t-2 border-dashed" />

                <div className="flex items-baseline justify-between">
                  <span className="text-xs tracking-widest uppercase">Total</span>
                  <span className="font-sans text-3xl font-semibold">{plan.price}</span>
                </div>
                <p className="text-right text-xs text-muted-foreground">{plan.unit}</p>

                <Button
                  size="lg"
                  variant={plan.featured ? "default" : "outline"}
                  className="mt-6 h-11 w-full rounded-full font-sans"
                  nativeButton={false}
                  render={<a href="#demo" />}
                >
                  {plan.cta}
                </Button>

                <p className="mt-6 text-center text-[10px] tracking-widest text-muted-foreground uppercase">
                  *** Thank you ***
                </p>
              </motion.div>

              {/* Outside the clipped receipt so the stamp can overhang the edge. */}
              {plan.featured && (
                <Stamp className="absolute top-28 -right-4 bg-card/60 text-primary" delay={1.4} rotate={14}>
                  Most popular
                </Stamp>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
