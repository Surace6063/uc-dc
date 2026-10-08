"use client"

import * as React from "react"
import { animate, motion, MotionConfig, useInView } from "motion/react"

import { cn } from "@/lib/utils"

export const ease = [0.22, 1, 0.36, 1] as const

// Honour the visitor's reduced-motion setting across the whole page.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  y?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, ease, delay }}
    >
      {children}
    </motion.div>
  )
}

// A word that slides up from behind a mask on page load.
export function Word({
  children,
  delay = 0,
}: {
  children: React.ReactNode
  delay?: number
}) {
  return (
    <span className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-bottom">
      <motion.span
        className="inline-block"
        initial={{ y: "110%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.9, ease, delay }}
      >
        {children}
      </motion.span>
    </span>
  )
}

const scribbles = {
  circle: {
    viewBox: "0 0 200 80",
    d: "M150 8C110 -2 30 4 12 30c-14 22 30 44 96 42 60-2 92-22 86-40C188 12 140 6 90 10",
  },
  underline: {
    viewBox: "0 0 200 20",
    d: "M4 14c40-8 90-10 130-6 20 2 40 4 62-2",
  },
  arrow: {
    viewBox: "0 0 80 80",
    d: "M10 8c30 4 52 22 56 56M66 64l-14-6M66 64l4-15",
  },
}

// Hand-drawn red-pen mark that draws itself when scrolled into view.
export function Scribble({
  variant,
  className,
  delay = 0,
  animateOnMount = false,
  strokeWidth = 3,
}: {
  variant: keyof typeof scribbles
  className?: string
  delay?: number
  animateOnMount?: boolean
  strokeWidth?: number
}) {
  const { viewBox, d } = scribbles[variant]
  const drawn = { pathLength: 1, opacity: 1 }

  return (
    <svg
      aria-hidden
      viewBox={viewBox}
      fill="none"
      preserveAspectRatio="none"
      className={cn("pointer-events-none absolute overflow-visible", className)}
    >
      <motion.path
        d={d}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={animateOnMount ? drawn : undefined}
        whileInView={animateOnMount ? undefined : drawn}
        viewport={{ once: true }}
        transition={{ duration: 1.1, ease: "easeInOut", delay }}
      />
    </svg>
  )
}

// Rubber stamp that slams onto the page.
export function Stamp({
  children,
  className,
  delay = 0,
  rotate = -12,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  rotate?: number
}) {
  return (
    <motion.div
      aria-hidden
      className={cn(
        "pointer-events-none rounded-md border-[3px] border-current px-2.5 py-1 font-mono text-xs font-bold tracking-[0.2em] uppercase opacity-90 mix-blend-multiply dark:mix-blend-screen",
        className
      )}
      initial={{ scale: 2.4, opacity: 0, rotate: rotate - 20 }}
      whileInView={{ scale: 1, opacity: 0.9, rotate }}
      viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 420, damping: 18, delay }}
    >
      {children}
    </motion.div>
  )
}

// Counts up to a number when it scrolls into view.
export function CountUp({
  to,
  decimals = 0,
  duration = 1.6,
}: {
  to: number
  decimals?: number
  duration?: number
}) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })

  React.useEffect(() => {
    if (!inView || !ref.current) return
    const node = ref.current
    const controls = animate(0, to, {
      duration,
      ease,
      onUpdate: (value) => {
        node.textContent = value.toLocaleString("en-IN", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      },
    })
    return () => controls.stop()
  }, [inView, to, decimals, duration])

  return (
    <span ref={ref} className="tabular-nums">
      {(0).toFixed(decimals)}
    </span>
  )
}
