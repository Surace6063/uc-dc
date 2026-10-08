"use client"

import * as React from "react"
import {
  AnimatePresence,
  type MotionValue,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react"

import {
  AssignmentVisual,
  AttendanceVisual,
  FeesVisual,
  LessonVisual,
  MarksVisual,
  ParentVisual,
} from "@/components/landing/day-visuals"
import { Reveal } from "@/components/landing/motion"
import { SectionHeading } from "@/components/landing/section-heading"
import { cn } from "@/lib/utils"

type Scene = {
  minutes: number
  title: string
  kind: "Management" | "LMS" | "Communication"
  module: string
  body: string
  visual: React.ReactNode
}

const scenes: Scene[] = [
  {
    minutes: 7 * 60,
    title: "The gate opens",
    kind: "Management",
    module: "Attendance",
    body: "Teachers mark attendance in seconds from their phones. Parents of absent students hear about it before first period starts.",
    visual: <AttendanceVisual />,
  },
  {
    minutes: 8 * 60 + 30,
    title: "First period begins",
    kind: "LMS",
    module: "Lessons & live classes",
    body: "The lesson runs in class and online at once. Notes, videos and slides stay in the course for anyone who missed it.",
    visual: <LessonVisual />,
  },
  {
    minutes: 11 * 60,
    title: "Homework comes in",
    kind: "LMS",
    module: "Assignments & quizzes",
    body: "Submissions arrive in one place with timestamps. Quizzes grade themselves, and feedback goes back the same day.",
    visual: <AssignmentVisual />,
  },
  {
    minutes: 13 * 60 + 30,
    title: "Marks go in",
    kind: "Management",
    module: "Exams & report cards",
    body: "Subject teachers enter marks and the system does the arithmetic: GPA, ranks and printable report cards in your format.",
    visual: <MarksVisual />,
  },
  {
    minutes: 15 * 60 + 30,
    title: "Accounts close",
    kind: "Management",
    module: "Fees & accounts",
    body: "Every payment has a receipt, every due has a reminder, and the day's collection is reconciled before staff go home.",
    visual: <FeesVisual />,
  },
  {
    minutes: 19 * 60,
    title: "Parents check in",
    kind: "Communication",
    module: "Parent portal",
    body: "At home, parents see the whole day: attendance, homework, results and fees, with no phone calls to the office.",
    visual: <ParentVisual />,
  },
]

const progressStops = scenes.map((_, i) => i / scenes.length).concat(1)
const minuteStops = scenes.map((s) => s.minutes).concat(20 * 60)

function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

const kindStyles: Record<Scene["kind"], string> = {
  Management: "bg-primary/10 text-primary",
  LMS: "bg-lms/10 text-lms",
  Communication: "bg-highlight text-amber-900 dark:text-amber-100",
}

export function SchoolDay() {
  const ref = React.useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 55%", "end 55%"],
  })

  const minutes = useTransform(scrollYProgress, progressStops, minuteStops)
  const hourRotate = useTransform(minutes, (m) => (m / 60) * 30)
  const minuteRotate = useTransform(minutes, (m) => (m % 60) * 6)

  const sky = useTransform(
    scrollYProgress,
    [0, 0.15, 0.45, 0.68, 0.84, 1],
    ["#f6c7a1", "#bde3f6", "#8fcdf2", "#f3c785", "#b98fc4", "#1d2347"]
  )
  const sunX = useTransform(scrollYProgress, [0, 0.82], ["10%", "90%"])
  const sunY = useTransform(
    scrollYProgress,
    (p) => `${72 - Math.sin(Math.min(p / 0.82, 1) * Math.PI) * 50}%`
  )
  const sunOpacity = useTransform(scrollYProgress, [0.76, 0.86], [1, 0])
  const nightOpacity = useTransform(scrollYProgress, [0.82, 0.95], [0, 1])
  const fill = useTransform(scrollYProgress, [0, 1], [0, 1])

  const [active, setActive] = React.useState(0)
  const [clock, setClock] = React.useState(formatTime(scenes[0].minutes))

  useMotionValueEvent(minutes, "change", (m) => {
    const label = formatTime(Math.floor(m / 5) * 5)
    setClock((prev) => (prev === label ? prev : label))
  })
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const i = Math.min(scenes.length - 1, Math.max(0, Math.floor(p * scenes.length)))
    setActive((prev) => (prev === i ? prev : i))
  })

  return (
    <section id="day" className="scroll-mt-16 py-24 sm:py-32">
      <div className="px-4 sm:px-6">
        <SectionHeading
          eyebrow="scroll through a school day"
          title={
            <>
              From the first bell to bedtime, <em>all in one place.</em>
            </>
          }
          description="Management and learning aren't two separate products here. Watch one ordinary day move through the system."
        />
      </div>

      <div
        ref={ref}
        className="mx-auto mt-16 grid max-w-6xl gap-12 px-4 sm:px-6 lg:mt-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
      >
        {/* Sticky sky + clock */}
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <div className="overflow-hidden rounded-3xl border bg-card shadow-xl shadow-black/5">
              <motion.div
                aria-hidden
                className="relative h-56 overflow-hidden"
                style={{ backgroundColor: sky }}
              >
                <motion.div className="absolute inset-0" style={{ opacity: nightOpacity }}>
                  {[
                    [12, 20], [28, 12], [44, 28], [62, 14], [76, 24], [88, 10], [20, 40], [70, 42],
                  ].map(([x, y]) => (
                    <span
                      key={`${x}-${y}`}
                      className="absolute size-1 rounded-full bg-white"
                      style={{ left: `${x}%`, top: `${y}%` }}
                    />
                  ))}
                  <span className="absolute top-[18%] right-[16%] size-9 rounded-full bg-[#f4f1de] shadow-[0_0_30px_#f4f1de80]" />
                </motion.div>
                <motion.span
                  className="absolute size-12 -translate-1/2 rounded-full bg-amber-300 shadow-[0_0_60px_20px_rgb(252_211_77/0.5)]"
                  style={{ left: sunX, top: sunY, opacity: sunOpacity }}
                />
                <SchoolSilhouette nightOpacity={nightOpacity} />
              </motion.div>

              <div className="flex items-center gap-6 p-6">
                <div className="relative size-24 shrink-0 rounded-full border-4 border-foreground/80 bg-paper">
                  {Array.from({ length: 12 }, (_, i) => (
                    <span
                      key={i}
                      className="absolute top-1 left-1/2 h-[calc(100%-0.5rem)] w-0.5 -translate-x-1/2"
                      style={{ rotate: `${i * 30}deg` }}
                    >
                      <span className={cn("block w-full bg-foreground/60", i % 3 ? "h-1.5" : "h-2.5")} />
                    </span>
                  ))}
                  <motion.span
                    className="absolute bottom-1/2 left-[calc(50%-2px)] h-[26%] w-1 origin-bottom rounded-full bg-foreground"
                    style={{ rotate: hourRotate }}
                  />
                  <motion.span
                    className="absolute bottom-1/2 left-[calc(50%-1px)] h-[38%] w-0.5 origin-bottom rounded-full bg-primary"
                    style={{ rotate: minuteRotate }}
                  />
                  <span className="absolute top-1/2 left-1/2 size-2 -translate-1/2 rounded-full bg-primary" />
                </div>

                <div className="min-w-0">
                  <p className="font-display text-6xl leading-none tabular-nums">{clock}</p>
                  <div className="relative mt-2 h-7 overflow-hidden">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.p
                        key={active}
                        className="font-hand text-2xl text-primary"
                        initial={{ y: 24, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -24, opacity: 0 }}
                        transition={{ duration: 0.35 }}
                      >
                        {scenes[active].title.toLowerCase()}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <div className="relative border-t px-6 py-5">
                <div className="absolute top-8 bottom-8 left-[33px] w-px bg-border" />
                <motion.div
                  className="absolute top-8 bottom-8 left-[33px] w-px origin-top bg-primary"
                  style={{ scaleY: fill }}
                />
                <ol className="relative space-y-2.5">
                  {scenes.map((scene, i) => (
                    <li key={scene.title} className="flex items-center gap-4 text-sm">
                      <span
                        className={cn(
                          "size-3 rounded-full border-2 transition-colors",
                          i <= active ? "border-primary bg-primary" : "border-border bg-card"
                        )}
                      />
                      <span className="w-12 font-mono text-xs text-muted-foreground">
                        {formatTime(scene.minutes)}
                      </span>
                      <span className={cn("transition-colors", i === active ? "font-medium" : "text-muted-foreground")}>
                        {scene.module}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Scenes */}
        <div>
          {scenes.map((scene) => (
            <article
              key={scene.title}
              className="flex flex-col justify-center py-10 first:pt-0 lg:min-h-[78vh] lg:py-0"
            >
              <Reveal>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border bg-card px-3 py-1 font-mono text-sm">
                    {formatTime(scene.minutes)}
                  </span>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", kindStyles[scene.kind])}>
                    {scene.kind} · {scene.module}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl">
                  {scene.title}
                </h3>
                <p className="mt-3 max-w-lg text-lg leading-relaxed text-muted-foreground">
                  {scene.body}
                </p>
              </Reveal>
              <Reveal delay={0.15} className="mt-8">
                {scene.visual}
              </Reveal>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function SchoolSilhouette({
  nightOpacity,
}: {
  nightOpacity: MotionValue<number>
}) {
  return (
    <svg viewBox="0 0 400 120" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-28 w-full">
      <path d="M0 96 Q100 80 200 92 T400 88 V120 H0Z" fill="#00000026" />
      <g fill="#1f2937">
        {/* Main building with pitched roof */}
        <path d="M120 120V70l80-34 80 34v50z" />
        <rect x="88" y="78" width="40" height="42" />
        <rect x="272" y="78" width="40" height="42" />
        {/* Flag */}
        <rect x="199" y="8" width="2" height="30" />
        <path d="M201 9l14 6-14 7z" fill="#dc2626" />
      </g>
      {/* Windows light up at night */}
      <motion.g fill="#fcd34d" style={{ opacity: nightOpacity }}>
        {[140, 168, 220, 248].map((x) => (
          <rect key={x} x={x} y="76" width="12" height="12" rx="1" />
        ))}
        {[96, 112, 280, 296].map((x) => (
          <rect key={x} x={x} y="88" width="8" height="10" rx="1" />
        ))}
      </motion.g>
      <g fill="#ffffff26">
        {[140, 168, 220, 248].map((x) => (
          <rect key={x} x={x} y="76" width="12" height="12" rx="1" />
        ))}
      </g>
      <rect x="190" y="96" width="20" height="24" fill="#111827" />
    </svg>
  )
}
