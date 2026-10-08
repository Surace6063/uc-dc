"use client"

import { ArrowRightIcon, MailIcon, PhoneIcon } from "lucide-react"
import { motion } from "motion/react"

import { Scribble } from "@/components/landing/motion"
import { site } from "@/components/landing/site"
import { Button } from "@/components/ui/button"

export function Chalkboard() {
  return (
    <section id="demo" className="scroll-mt-16 px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-5xl">
        {/* Board in a wooden frame */}
        <div className="relative isolate overflow-hidden rounded-[1.75rem] border-14 border-wood bg-board px-6 py-16 text-center text-chalk shadow-2xl shadow-black/20 sm:px-12 sm:py-20">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_20%_30%,rgb(255_255_255/0.07),transparent_45%),radial-gradient(ellipse_at_80%_70%,rgb(255_255_255/0.05),transparent_40%),radial-gradient(ellipse_at_60%_10%,rgb(255_255_255/0.04),transparent_35%)]"
          />

          <p className="font-mono text-xs tracking-[0.3em] text-chalk/60 uppercase">
            Today&apos;s lesson
          </p>

          {/* Written across the board, left to right. The trigger sits on an
              unclipped wrapper: a fully clipped element never counts as in view. */}
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }}>
            <motion.h2
              className="relative mx-auto mt-4 inline-block font-hand text-6xl leading-none sm:text-8xl"
              variants={{
                hidden: { clipPath: "inset(0 100% 0 0)" },
                show: { clipPath: "inset(0 0% 0 0)", transition: { duration: 1.6, ease: "linear" } },
              }}
            >
              Class is in session.
            </motion.h2>
          </motion.div>
          <div className="relative mx-auto h-4 max-w-md">
            <Scribble variant="underline" delay={1.6} strokeWidth={4} className="inset-0 size-full text-chalk/80" />
          </div>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-chalk/80">
            Book a 30-minute demo. We&apos;ll set up a sample of your institution
            and walk your team through a full day on {site.name}.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="h-12 rounded-full bg-chalk px-7 text-base text-board hover:bg-chalk/90"
              nativeButton={false}
              render={<a href={`mailto:${site.email}?subject=Demo%20request`} />}
            >
              Book a free demo
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-x-8 gap-y-2 text-sm text-chalk/70 sm:flex-row">
            <a href={`mailto:${site.email}`} className="flex items-center gap-2 hover:text-chalk">
              <MailIcon className="size-4" />
              {site.email}
            </a>
            <a href={`tel:${site.phone.replace(/[^+\d]/g, "")}`} className="flex items-center gap-2 hover:text-chalk">
              <PhoneIcon className="size-4" />
              {site.phone}
            </a>
          </div>
        </div>

        {/* Chalk ledge */}
        <div aria-hidden className="relative mx-6 h-4 rounded-b-lg bg-wood shadow-lg">
          <span className="absolute -top-1.5 left-[18%] h-2.5 w-12 rounded-full bg-chalk" />
          <span className="absolute -top-1.5 left-[26%] h-2.5 w-8 rotate-6 rounded-full bg-pink-200" />
          <span className="absolute -top-3 right-[20%] h-4 w-20 rounded-sm bg-[linear-gradient(to_bottom,#57534e_0_55%,#e7e5e4_55%)]" />
        </div>
      </div>
    </section>
  )
}
