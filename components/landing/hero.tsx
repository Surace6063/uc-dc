import { ArrowDownIcon, ArrowRightIcon } from "lucide-react"

import { HeroCollage } from "@/components/landing/hero-collage"
import { Reveal, Scribble, Word } from "@/components/landing/motion"
import { site } from "@/components/landing/site"
import { Button } from "@/components/ui/button"

const lineOne = ["Every", "bell,", "every", "lesson,", "every", "report", "card"]

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Exercise-book page: ruled lines, double red margin, punched holes. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-ruled" />
      <div
        aria-hidden
        className="absolute inset-y-0 left-6 -z-10 w-[5px] border-x border-margin sm:left-14"
      />
      <div aria-hidden className="absolute inset-y-0 left-1.5 -z-10 hidden flex-col justify-around sm:left-4 sm:flex">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-4 rounded-full bg-foreground/10 shadow-[inset_0_2px_3px_rgb(0_0_0/0.2)]"
          />
        ))}
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 py-16 pr-4 pl-12 sm:py-24 sm:pr-6 sm:pl-24 lg:grid-cols-[1.15fr_1fr] lg:pl-20">
        <div>
          <Reveal y={10} className="relative inline-block">
            <p className="-rotate-3 font-hand text-2xl text-primary sm:text-3xl">
              for schools &amp; colleges
            </p>
            <Scribble
              variant="arrow"
              animateOnMount
              delay={0.9}
              className="top-6 -right-14 size-12 rotate-12 text-primary"
            />
          </Reveal>

          <h1 className="mt-4 font-display text-[2.75rem] leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
            {lineOne.map((word, i) => (
              <span key={i}>
                <Word delay={0.1 + i * 0.06}>{word}</Word>{" "}
              </span>
            ))}
            <Word delay={0.55}>
              <span className="text-muted-foreground">—</span>
            </Word>{" "}
            <Word delay={0.6}>on</Word>{" "}
            <span className="relative inline-block">
              <Word delay={0.66}>
                <em className="text-primary">one</em>
              </Word>
              <Scribble
                variant="circle"
                animateOnMount
                delay={1.2}
                className="-inset-x-4 -inset-y-1 text-primary sm:-inset-x-6"
              />
            </span>{" "}
            <Word delay={0.72}>platform.</Word>
          </h1>

          <Reveal delay={0.9}>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
              {site.name} puts school management and a full learning platform
              in one place, so attendance, classes, homework, exams and fees
              finally talk to each other.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Button
                size="lg"
                className="h-12 rounded-full px-7 text-base shadow-lg shadow-primary/25"
                nativeButton={false}
                render={<a href="#demo" />}
              >
                Book a free demo
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
              <a
                href="#day"
                className="group relative flex items-center gap-2 font-hand text-2xl"
              >
                take the tour
                <ArrowDownIcon className="size-4 transition-transform group-hover:translate-y-1" />
                <Scribble
                  variant="underline"
                  delay={1.6}
                  animateOnMount
                  className="-bottom-1.5 left-0 h-2 w-full text-primary/60"
                />
              </a>
            </div>

            <p className="mt-10 font-mono text-xs tracking-wider text-muted-foreground uppercase">
              BS &amp; AD calendars · GPA &amp; % grading · any device
            </p>
          </Reveal>
        </div>

        <HeroCollage />
      </div>
    </section>
  )
}
